"use client";

// CONVERSATION DASHBOARD — PROTOTYPE / CONCEPT DEMO.
//
// Demonstrates the vision from the notes: pipe conversation-room cameras to a
// participant's rating station. This runs entirely in the browser off one
// webcam (mirrored to three "rooms") so it can be shown in a meeting with no
// backend. Production would use real per-room cameras + WebRTC signaling (and
// likely DuckSoup) — see the note at the bottom of the page.

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

const ROOMS = [1, 2, 3] as const;

export default function ConversationDemoPage() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [routedRoom, setRoutedRoom] = useState<number>(1);
  const [rating, setRating] = useState(0); // -100..100
  const [trace, setTrace] = useState<number[]>([]);

  const roomRefs = useRef<Array<HTMLVideoElement | null>>([]);
  const stationRef = useRef<HTMLVideoElement | null>(null);

  const enableCamera = async () => {
    setError(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      setStream(s);
    } catch {
      setError(
        "Couldn't access a camera. Allow camera access, or this browser/device has none."
      );
    }
  };

  // Attach the (one demo) stream to every room tile and the rating station.
  useEffect(() => {
    if (!stream) return;
    for (const v of roomRefs.current) {
      if (v && v.srcObject !== stream) v.srcObject = stream;
    }
    if (stationRef.current) stationRef.current.srcObject = stream;
    return () => {
      // no-op; stream stopped on unmount below
    };
  }, [stream, routedRoom]);

  useEffect(() => {
    return () => {
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [stream]);

  const onRate = (e: ReactPointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = (e.clientX - rect.left) / rect.width; // 0..1
    const value = Math.round((frac * 2 - 1) * 100); // -100..100
    setRating(value);
    setTrace((prev) => [...prev.slice(-119), value]);
  };

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Conversation Dashboard</h1>
            <span className="chip bg-amber-100 text-amber-800">Prototype</span>
          </div>
          <p className="mt-1 text-sm text-ink-soft">
            Route conversation-room cameras to a participant&apos;s rating station.
          </p>
        </div>
        {!stream ? (
          <button onClick={enableCamera} className="btn-primary">
            Enable camera to demo
          </button>
        ) : (
          <span className="chip bg-green-100 text-green-800">● Live</span>
        )}
      </header>

      {error && (
        <p className="mb-6 rounded-xl bg-badger-soft px-4 py-2.5 text-sm text-badger">{error}</p>
      )}

      {/* Conversation rooms */}
      <section className="mb-8">
        <h2 className="mb-3 text-lg font-bold">Conversation rooms</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {ROOMS.map((room, i) => {
            const routed = routedRoom === room;
            return (
              <button
                key={room}
                type="button"
                onClick={() => setRoutedRoom(room)}
                className={`card overflow-hidden text-left transition-all ${
                  routed ? "ring-2 ring-badger" : "hover:shadow-md"
                }`}
              >
                <div className="flex items-center justify-between border-b border-line bg-stone-50 px-3 py-2">
                  <span className="text-sm font-bold">Room {room}</span>
                  {routed && <span className="chip bg-badger text-white">routing →</span>}
                </div>
                <div className="relative aspect-video bg-stone-900">
                  <video
                    ref={(el) => {
                      roomRefs.current[i] = el;
                    }}
                    autoPlay
                    muted
                    playsInline
                    className="h-full w-full object-cover"
                  />
                  {!stream && (
                    <div className="absolute inset-0 flex items-center justify-center text-xs text-stone-400">
                      camera offline
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-stone-400">
          Demo uses one webcam mirrored to three rooms. Tap a room to route it to the
          participant station.
        </p>
      </section>

      {/* Participant rating station */}
      <section>
        <h2 className="mb-3 text-lg font-bold">Participant rating station</h2>
        <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-line bg-stone-50 px-3 py-2 text-sm">
              <span className="font-bold">Now showing: Room {routedRoom}</span>
              <span className="text-ink-soft">move across the video to rate</span>
            </div>
            <div
              onPointerMove={onRate}
              className="relative aspect-video cursor-crosshair touch-none bg-stone-900"
            >
              <video
                ref={stationRef}
                autoPlay
                muted
                playsInline
                className="h-full w-full object-cover"
              />
              {/* rating marker */}
              <div
                className="pointer-events-none absolute inset-y-0 w-0.5 bg-badger"
                style={{ left: `${((rating + 100) / 200) * 100}%` }}
              />
              <div className="pointer-events-none absolute left-3 top-3 rounded-lg bg-black/60 px-2 py-1 text-xs font-semibold text-white">
                Valence {rating > 0 ? `+${rating}` : rating}
              </div>
            </div>
          </div>

          <div className="card p-4">
            <p className="text-sm font-semibold">Continuous rating</p>
            <p className="mt-1 text-xs text-ink-soft">
              This is the PPS rating mechanic — mouse position sampled as the participant
              watches. Here it&apos;s wired straight to the routed room feed.
            </p>
            <div className="mt-3">
              <p className="text-4xl font-bold tabular-nums">
                {rating > 0 ? `+${rating}` : rating}
              </p>
              <p className="text-xs text-ink-soft">negative ← → positive</p>
            </div>
            {/* mini trace */}
            <div className="mt-4 flex h-16 items-center gap-px overflow-hidden rounded-lg bg-stone-50 p-1">
              {trace.map((v, i) => (
                <div
                  key={i}
                  className="w-1 shrink-0 rounded-full bg-badger/70"
                  style={{ height: `${Math.max(4, Math.abs(v) * 0.6)}%` }}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      <p className="mt-8 rounded-xl border border-dashed border-line p-4 text-xs text-ink-soft">
        <strong>Prototype note:</strong> this runs off one local webcam to show the flow —
        room camera → participant screen → continuous rating. Production needs a real
        camera per room and WebRTC signaling to move those feeds between machines (this is
        where DuckSoup fits). Built to demo the concept and gather feedback, not to run a
        study.
      </p>
    </main>
  );
}
