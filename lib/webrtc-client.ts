// Browser-side signaling and peer setup for the control center.
//
// Transport is SSE down / fetch up (see app/api/control/signal). Viewers
// initiate: the control wall or a participant station discovers the room
// cameras it wants and offers to each; the camera attaches its stream and
// answers. That way the side that knows which rooms it wants drives the
// connection, and a camera never needs to track its audience.
//
// Lab machines share a LAN, so host ICE candidates are normally enough and no
// STUN/TURN server is required. NEXT_PUBLIC_STUN_URL can add one; if room
// machines ever land on different subnets a TURN server becomes necessary,
// which STUN alone will not solve.

export type DeviceKind = "camera" | "station" | "control";

export interface RemoteDevice {
  id: string;
  kind: DeviceKind;
  roomIndex: number | null;
  participantId: string | null;
  label: string;
}

interface SignalMessage {
  id: number;
  from: string;
  payload: unknown;
}

function iceServers(): RTCIceServer[] {
  const stun = process.env.NEXT_PUBLIC_STUN_URL;
  return stun ? [{ urls: stun }] : [];
}

const HEARTBEAT_MS = 10_000;

/**
 * Registers this tab as a device on a session and carries signaling for it.
 * One instance per page.
 */
export class SignalingClient {
  readonly slotId: string;
  private deviceId: string | null = null;
  private source: EventSource | null = null;
  private lastId = 0;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private handlers = new Set<(msg: SignalMessage) => void>();
  private closed = false;

  constructor(slotId: string) {
    this.slotId = slotId;
  }

  get id(): string | null {
    return this.deviceId;
  }

  async register(
    kind: DeviceKind,
    options: { roomIndex?: number; label?: string } = {}
  ): Promise<string> {
    const response = await fetch("/api/control/devices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slotId: this.slotId,
        kind,
        roomIndex: options.roomIndex ?? null,
        label: options.label ?? "",
      }),
    });
    if (!response.ok) throw new Error(await response.text());

    const { deviceId } = (await response.json()) as { deviceId: string };
    this.deviceId = deviceId;
    this.openStream();

    this.heartbeat = setInterval(() => {
      void fetch("/api/control/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotId: this.slotId, deviceId }),
      }).catch(() => {
        // A missed heartbeat is recoverable; the next one re-lists us.
      });
    }, HEARTBEAT_MS);

    return deviceId;
  }

  /** The server closes long streams deliberately; reopen until we're done. */
  private openStream(): void {
    if (this.closed || !this.deviceId) return;
    const url = `/api/control/signal/stream?slotId=${encodeURIComponent(
      this.slotId
    )}&deviceId=${encodeURIComponent(this.deviceId)}&since=${this.lastId}`;

    const source = new EventSource(url);
    this.source = source;

    source.addEventListener("signal", (event) => {
      const msg = JSON.parse((event as MessageEvent).data) as SignalMessage;
      this.lastId = Math.max(this.lastId, msg.id);
      for (const handler of this.handlers) handler(msg);
    });

    source.addEventListener("reconnect", () => {
      source.close();
      this.openStream();
    });

    source.onerror = () => {
      // EventSource retries on its own, but the server may have closed us at
      // the stream cap; a fresh one picks up from lastId either way.
      source.close();
      if (!this.closed) setTimeout(() => this.openStream(), 1000);
    };
  }

  onSignal(handler: (msg: SignalMessage) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async send(toDevice: string, payload: unknown): Promise<void> {
    if (!this.deviceId) throw new Error("Not registered");
    await fetch("/api/control/signal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slotId: this.slotId,
        fromDevice: this.deviceId,
        toDevice,
        payload,
      }),
    });
  }

  async listDevices(): Promise<RemoteDevice[]> {
    const response = await fetch(
      `/api/control/devices?slotId=${encodeURIComponent(this.slotId)}`
    );
    if (!response.ok) return [];
    const { devices } = (await response.json()) as { devices: RemoteDevice[] };
    return devices;
  }

  /**
   * Best-effort deregistration. A tab that is torn down (crash, machine
   * sleeping, network drop) never gets to run this, so the server also sweeps
   * devices that stop heartbeating — this just makes a clean exit immediate.
   */
  close(): void {
    this.closed = true;
    this.source?.close();
    if (this.heartbeat) clearInterval(this.heartbeat);
    if (this.deviceId) {
      void fetch(
        `/api/control/devices?slotId=${encodeURIComponent(
          this.slotId
        )}&deviceId=${encodeURIComponent(this.deviceId)}`,
        { method: "DELETE", keepalive: true }
      ).catch(() => {
        // Nothing to do — the stale sweep will collect us.
      });
    }
  }
}

/**
 * Viewer side: offer to a camera device and hand back its stream when it
 * arrives. Caller owns closing the returned connection.
 */
export function connectToCamera(
  signaling: SignalingClient,
  cameraDeviceId: string,
  onStream: (stream: MediaStream) => void
): RTCPeerConnection {
  const pc = new RTCPeerConnection({ iceServers: iceServers() });

  // Receive-only: the control wall and stations never send video back.
  pc.addTransceiver("video", { direction: "recvonly" });
  pc.addTransceiver("audio", { direction: "recvonly" });

  pc.ontrack = (event) => {
    if (event.streams[0]) onStream(event.streams[0]);
  };

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      void signaling.send(cameraDeviceId, {
        type: "ice",
        candidate: event.candidate.toJSON(),
      });
    }
  };

  const unsubscribe = signaling.onSignal(async (msg) => {
    if (msg.from !== cameraDeviceId) return;
    const payload = msg.payload as { type?: string; sdp?: string; candidate?: unknown };

    if (payload.type === "answer" && payload.sdp) {
      await pc.setRemoteDescription({ type: "answer", sdp: payload.sdp });
    } else if (payload.type === "ice" && payload.candidate) {
      try {
        await pc.addIceCandidate(payload.candidate as RTCIceCandidateInit);
      } catch {
        // Candidates can arrive before the remote description; harmless.
      }
    }
  });

  pc.addEventListener("connectionstatechange", () => {
    if (pc.connectionState === "closed" || pc.connectionState === "failed") unsubscribe();
  });

  void (async () => {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await signaling.send(cameraDeviceId, { type: "offer", sdp: offer.sdp });
  })();

  return pc;
}

/**
 * Camera side: answer whoever offers, attaching the local stream. Returns a
 * teardown that closes every viewer connection.
 */
export function publishCamera(
  signaling: SignalingClient,
  stream: MediaStream
): () => void {
  const peers = new Map<string, RTCPeerConnection>();

  const unsubscribe = signaling.onSignal(async (msg) => {
    const payload = msg.payload as { type?: string; sdp?: string; candidate?: unknown };

    if (payload.type === "offer" && payload.sdp) {
      // A viewer reloading sends a fresh offer; drop the stale peer first.
      peers.get(msg.from)?.close();

      const pc = new RTCPeerConnection({ iceServers: iceServers() });
      peers.set(msg.from, pc);

      for (const track of stream.getTracks()) pc.addTrack(track, stream);

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          void signaling.send(msg.from, {
            type: "ice",
            candidate: event.candidate.toJSON(),
          });
        }
      };

      await pc.setRemoteDescription({ type: "offer", sdp: payload.sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await signaling.send(msg.from, { type: "answer", sdp: answer.sdp });
      return;
    }

    if (payload.type === "ice" && payload.candidate) {
      try {
        await peers.get(msg.from)?.addIceCandidate(payload.candidate as RTCIceCandidateInit);
      } catch {
        // See above — ordering is not guaranteed.
      }
    }
  });

  return () => {
    unsubscribe();
    for (const pc of peers.values()) pc.close();
    peers.clear();
  };
}
