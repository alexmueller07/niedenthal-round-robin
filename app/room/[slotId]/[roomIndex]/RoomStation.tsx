"use client";

// Conversation-room kiosk. Runs on the machine in each room: publishes the
// webcam to the control center and records the conversation.
//
// Randy's problem was RAs hovering in rooms to start and stop recordings, and
// not knowing when participants are about to start talking. So the flow is:
// seat the participants, hit Arm once, walk out. A visible countdown starts
// the recording, and it stops itself at the conversation length - nobody has
// to come back. The control center can also start and stop remotely.

import { useCallback, useEffect, useRef, useState } from "react";
import { publishCamera, SignalingClient } from "@/lib/webrtc-client";

type Phase = "idle" | "armed" | "recording" | "uploading" | "done" | "error";

interface RoomStationProps {
  slotId: string;
  roomIndex: number;
  round: number;
  /** Names of the pair the rotation puts in this room this round. */
  pair: { a: string; b: string } | null;
  conversationMinutes: number;
  sessionLabel: string;
}

/** Countdown after arming, so the RA can leave before recording starts. */
const ARM_SECONDS = 10;
/** How often MediaRecorder hands us a blob to upload. */
const CHUNK_MS = 5000;

function mmss(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** First container the browser will actually give us. */
function pickMimeType(): string {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  for (const type of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return "video/webm";
}

export default function RoomStation({
  slotId,
  roomIndex,
  round,
  pair,
  conversationMinutes,
  sessionLabel,
}: RoomStationProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [published, setPublished] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingIdRef = useRef<string | null>(null);
  const startedAtRef = useRef<number>(0);

  const conversationSeconds = Math.max(60, conversationMinutes * 60);

  // Camera + publish to the control center. One grab serves both the live feed
  // and the recorder.
  useEffect(() => {
    let stopPublishing: (() => void) | null = null;
    let signaling: SignalingClient | null = null;
    let cancelled = false;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;

        signaling = new SignalingClient(slotId);
        await signaling.register("camera", {
          roomIndex,
          label: `Room ${roomIndex}`,
        });
        stopPublishing = publishCamera(signaling, stream);
        if (!cancelled) setPublished(true);
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error && e.name === "NotAllowedError"
              ? "Camera and microphone access was blocked. Allow it in the browser, then reload."
              : "Couldn't start the camera. Check that no other app is using it, then reload."
          );
          setPhase("error");
        }
      }
    })();

    return () => {
      cancelled = true;
      stopPublishing?.();
      signaling?.close();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [slotId, roomIndex]);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    recorder.stop();
  }, []);

  const startRecording = useCallback(async () => {
    const stream = streamRef.current;
    if (!stream) return;

    setError(null);
    const mimeType = pickMimeType();

    try {
      const response = await fetch("/api/recordings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotId, roomIndex, round, mimeType }),
      });
      if (!response.ok) {
        const text = await response.text();
        setError(text || "Couldn't open a recording.");
        setPhase("error");
        return;
      }
      const opened = (await response.json()) as { id: string; unassigned: boolean };
      recordingIdRef.current = opened.id;

      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;

      recorder.ondataavailable = async (event) => {
        if (event.data.size === 0 || !recordingIdRef.current) return;
        try {
          await fetch(`/api/recordings/${recordingIdRef.current}/chunk`, {
            method: "POST",
            headers: { "Content-Type": "application/octet-stream" },
            body: event.data,
          });
        } catch {
          // Keep recording — a dropped chunk is better than aborting the take.
          // Close() reports the shortfall, and the control center shows it.
          setError("A chunk failed to upload — check the recording drive.");
        }
      };

      recorder.onstop = async () => {
        setPhase("uploading");
        const id = recordingIdRef.current;
        recordingIdRef.current = null;
        if (!id) return;
        try {
          const res = await fetch(`/api/recordings/${id}/close`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ durationMs: Date.now() - startedAtRef.current }),
          });
          const result = (await res.json()) as { status: string };
          if (result.status === "stored") {
            setPhase("done");
          } else {
            setError("Nothing was written to the drive — tell an RA before the next round.");
            setPhase("error");
          }
        } catch {
          setError("Couldn't finalize the recording. Tell an RA before the next round.");
          setPhase("error");
        }
      };

      startedAtRef.current = Date.now();
      setElapsed(0);
      recorder.start(CHUNK_MS);
      setPhase("recording");
    } catch {
      setError("Couldn't start recording.");
      setPhase("error");
    }
  }, [slotId, roomIndex, round]);

  // Arming countdown. Driven off wall-clock rather than a decrementing tick so
  // a throttled background tab can't stretch the delay the RA is relying on.
  useEffect(() => {
    if (phase !== "armed") return;
    const armedAt = Date.now();
    const t = setInterval(() => {
      const left = ARM_SECONDS - Math.floor((Date.now() - armedAt) / 1000);
      if (left <= 0) {
        clearInterval(t);
        void startRecording();
      } else {
        setCountdown(left);
      }
    }, 250);
    return () => clearInterval(t);
  }, [phase, startRecording]);

  // Elapsed timer + auto-stop at the conversation length.
  useEffect(() => {
    if (phase !== "recording") return;
    const t = setInterval(() => {
      const seconds = Math.floor((Date.now() - startedAtRef.current) / 1000);
      setElapsed(seconds);
      if (seconds >= conversationSeconds) stopRecording();
    }, 250);
    return () => clearInterval(t);
  }, [phase, conversationSeconds, stopRecording]);

  const arm = () => {
    setError(null);
    setCountdown(ARM_SECONDS);
    setPhase("armed");
  };

  const remaining = Math.max(0, conversationSeconds - elapsed);
  const isRecording = phase === "recording";

  return (
    <div className="min-h-screen bg-stone-950 text-white">
      <div className="mx-auto max-w-4xl px-6 py-8">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-black tracking-tight">Room {roomIndex}</h1>
            <p className="text-sm text-stone-400">
              {sessionLabel} · round {round}
            </p>
          </div>
          <span
            className={`chip ${
              published ? "bg-green-500/20 text-green-300" : "bg-stone-700 text-stone-300"
            }`}
          >
            {published ? "● camera live" : "connecting…"}
          </span>
        </header>

        {pair ? (
          <p className="mb-4 text-lg">
            <span className="font-bold">{pair.a}</span>
            <span className="mx-2 text-stone-500">&amp;</span>
            <span className="font-bold">{pair.b}</span>
          </p>
        ) : (
          <p className="mb-4 text-lg text-amber-300">
            Nobody is assigned to this room for round {round}.
          </p>
        )}

        <div className="relative overflow-hidden rounded-2xl bg-black">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="aspect-video w-full object-cover"
          />

          {phase === "armed" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70">
              <p className="text-sm uppercase tracking-widest text-stone-300">
                Recording starts in
              </p>
              <p className="text-8xl font-black tabular-nums">{countdown}</p>
              <p className="mt-2 text-sm text-stone-400">You can leave the room now.</p>
            </div>
          )}

          {isRecording && (
            <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-red-600 px-3 py-1.5 text-sm font-bold">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-white" />
              REC {mmss(elapsed)}
            </div>
          )}
        </div>

        {isRecording && (
          <div className="mt-4">
            <div className="flex justify-between text-sm text-stone-400">
              <span>Conversation</span>
              <span className="tabular-nums">{mmss(remaining)} left</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-stone-800">
              <div
                className="h-full rounded-full bg-red-500 transition-all"
                style={{ width: `${Math.min(100, (elapsed / conversationSeconds) * 100)}%` }}
              />
            </div>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          {phase === "idle" && (
            <button
              type="button"
              onClick={arm}
              disabled={!published}
              className="rounded-full bg-red-600 px-8 py-4 text-lg font-bold transition-colors hover:bg-red-500 disabled:opacity-40"
            >
              Participants seated — arm recording
            </button>
          )}
          {phase === "armed" && (
            <button
              type="button"
              onClick={() => {
                setPhase("idle");
                setCountdown(0);
              }}
              className="rounded-full border border-stone-600 px-6 py-3 font-semibold hover:bg-stone-800"
            >
              Cancel
            </button>
          )}
          {isRecording && (
            <button
              type="button"
              onClick={stopRecording}
              className="rounded-full border border-stone-600 px-6 py-3 font-semibold hover:bg-stone-800"
            >
              Stop now
            </button>
          )}
          {(phase === "done" || phase === "error") && (
            <button
              type="button"
              onClick={() => {
                setPhase("idle");
                setError(null);
              }}
              className="rounded-full bg-stone-800 px-6 py-3 font-semibold hover:bg-stone-700"
            >
              Ready for the next round
            </button>
          )}
        </div>

        {phase === "uploading" && (
          <p className="mt-4 text-sm text-stone-400">Finishing the upload…</p>
        )}
        {phase === "done" && (
          <p className="mt-4 rounded-xl bg-green-500/15 px-4 py-3 text-sm font-medium text-green-300">
            Saved. It will load automatically on the participants&apos; rating screens.
          </p>
        )}
        {error && (
          <p className="mt-4 rounded-xl bg-red-500/15 px-4 py-3 text-sm font-medium text-red-300">
            {error}
          </p>
        )}

        <p className="mt-8 text-xs text-stone-500">
          Recording stops on its own after {conversationMinutes} minutes. The control
          center can also start and stop this room remotely.
        </p>
      </div>
    </div>
  );
}
