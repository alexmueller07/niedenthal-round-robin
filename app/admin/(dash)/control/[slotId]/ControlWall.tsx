"use client";

// The live wall: every conversation room's camera in one place, plus what has
// been captured so far and where each participant is.
//
// Cameras are discovered rather than configured - each room kiosk registers
// itself, and this subscribes to whatever is live. A room with no tile means
// nobody has opened that room's page yet, which is exactly the thing an RA
// needs to notice before a conversation starts.

import { useEffect, useRef, useState } from "react";
import { connectToCamera, SignalingClient, type RemoteDevice } from "@/lib/webrtc-client";

interface CaptureCell {
  round: number;
  roomIndex: number;
  names: string;
  status: "missing" | "recording" | "uploading" | "stored" | "failed";
}

interface ControlWallProps {
  slotId: string;
  roomCount: number;
  currentRound: number;
  totalRounds: number;
  /** Who the rotation puts in each room this round. */
  roomLabels: Array<{ roomIndex: number; names: string | null }>;
  capture: CaptureCell[];
  rounds: number[];
}

const STATUS_STYLE: Record<CaptureCell["status"], { chip: string; label: string }> = {
  missing: { chip: "bg-stone-100 text-stone-500", label: "—" },
  recording: { chip: "bg-red-100 text-red-800", label: "recording" },
  uploading: { chip: "bg-amber-100 text-amber-800", label: "uploading" },
  stored: { chip: "bg-green-100 text-green-800", label: "saved ✓" },
  failed: { chip: "bg-badger-soft text-badger", label: "failed" },
};

export default function ControlWall({
  slotId,
  roomCount,
  currentRound,
  totalRounds,
  roomLabels,
  capture,
  rounds,
}: ControlWallProps) {
  const [cameras, setCameras] = useState<RemoteDevice[]>([]);
  const [streams, setStreams] = useState<Record<string, MediaStream>>({});
  const [connecting, setConnecting] = useState(true);

  const signalingRef = useRef<SignalingClient | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());

  useEffect(() => {
    const signaling = new SignalingClient(slotId);
    signalingRef.current = signaling;
    // Bind the peer map for this effect run so cleanup tears down exactly the
    // connections this run opened.
    const peers = peersRef.current;
    let cancelled = false;
    let discover: ReturnType<typeof setInterval> | null = null;

    (async () => {
      await signaling.register("control", { label: "Control center" });
      if (cancelled) return;
      setConnecting(false);

      const sweep = async () => {
        const devices = await signaling.listDevices();
        if (cancelled) return;
        const live = devices.filter((d) => d.kind === "camera");
        setCameras(live);

        // Connect to any camera we haven't already got a peer for.
        for (const camera of live) {
          if (peers.has(camera.id)) continue;
          const pc = connectToCamera(signaling, camera.id, (stream) => {
            setStreams((prev) => ({ ...prev, [camera.id]: stream }));
          });
          peers.set(camera.id, pc);
        }

        // Drop peers whose camera has gone away.
        const liveIds = new Set(live.map((c) => c.id));
        for (const [id, pc] of peers) {
          if (!liveIds.has(id)) {
            pc.close();
            peers.delete(id);
            setStreams((prev) => {
              const next = { ...prev };
              delete next[id];
              return next;
            });
          }
        }
      };

      await sweep();
      discover = setInterval(() => void sweep(), 5000);
    })();

    return () => {
      cancelled = true;
      if (discover) clearInterval(discover);
      for (const pc of peers.values()) pc.close();
      peers.clear();
      signaling.close();
    };
  }, [slotId]);

  const cameraByRoom = new Map(
    cameras.filter((c) => c.roomIndex !== null).map((c) => [c.roomIndex as number, c])
  );

  const captureAt = (round: number, roomIndex: number) =>
    capture.find((c) => c.round === round && c.roomIndex === roomIndex);

  return (
    <div className="space-y-8">
      {/* Live room wall */}
      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold">Conversation rooms</h2>
          <p className="text-sm text-ink-soft">
            {connecting
              ? "connecting…"
              : `${cameras.length} of ${roomCount} room${roomCount === 1 ? "" : "s"} online`}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: roomCount }, (_, i) => i + 1).map((roomIndex) => {
            const camera = cameraByRoom.get(roomIndex);
            const stream = camera ? streams[camera.id] : undefined;
            const label = roomLabels.find((r) => r.roomIndex === roomIndex);
            const cell = captureAt(currentRound, roomIndex);
            return (
              <div key={roomIndex} className="card overflow-hidden">
                <div className="flex items-center justify-between border-b border-line bg-stone-50 px-3 py-2">
                  <span className="text-sm font-bold">Room {roomIndex}</span>
                  {cell && (
                    <span className={`chip ${STATUS_STYLE[cell.status].chip}`}>
                      {STATUS_STYLE[cell.status].label}
                    </span>
                  )}
                </div>
                <div className="relative aspect-video bg-stone-900">
                  {stream ? (
                    <RoomVideo stream={stream} />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center text-xs text-stone-400">
                      <span>no camera connected</span>
                      <a
                        href={`/room/${slotId}/${roomIndex}`}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-full border border-stone-600 px-3 py-1 font-semibold text-stone-300 hover:bg-stone-800"
                      >
                        Open room {roomIndex} →
                      </a>
                    </div>
                  )}
                </div>
                <div className="px-3 py-2 text-sm">
                  {label?.names ? (
                    <span className="font-medium">{label.names}</span>
                  ) : (
                    <span className="text-stone-400">empty this round</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Capture coverage */}
      <section>
        <h2 className="mb-1 text-lg font-bold">Captured so far</h2>
        <p className="mb-3 text-sm text-ink-soft">
          One recording per room per round. Anything not saved here is a conversation
          the rating task won&apos;t have.
        </p>
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="p-3 font-semibold">Round</th>
                {Array.from({ length: roomCount }, (_, i) => (
                  <th key={i} className="p-3 font-semibold">
                    Room {i + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rounds.map((round) => (
                <tr key={round} className={round === currentRound ? "bg-badger-soft/40" : ""}>
                  <td className="p-3 font-medium">
                    {round}
                    {round === currentRound && (
                      <span className="ml-2 text-xs font-semibold text-badger">live</span>
                    )}
                  </td>
                  {Array.from({ length: roomCount }, (_, i) => {
                    const cell = captureAt(round, i + 1);
                    return (
                      <td key={i} className="p-3">
                        {cell ? (
                          <>
                            <span className={`chip ${STATUS_STYLE[cell.status].chip}`}>
                              {STATUS_STYLE[cell.status].label}
                            </span>
                            <span className="mt-1 block text-xs text-ink-soft">
                              {cell.names}
                            </span>
                          </>
                        ) : (
                          <span className="text-stone-300">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-stone-500">
          Round {currentRound} of {totalRounds}. Advance rounds from the session console.
        </p>
      </section>
    </div>
  );
}

/** Small wrapper so each tile can attach its own MediaStream imperatively. */
function RoomVideo({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) {
      ref.current.srcObject = stream;
    }
  }, [stream]);
  return (
    <video ref={ref} autoPlay muted playsInline className="h-full w-full object-cover" />
  );
}
