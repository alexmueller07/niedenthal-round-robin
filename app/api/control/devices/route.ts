// Device registry: a browser tab claims a role for a session (room camera,
// participant station, or the control center) and heartbeats to stay listed.
// Peers discover each other by listing devices, then talk over WebRTC.

import { canActAsDevice, checkSlotAccess, denied } from "@/lib/control-guard";
import {
  getDevice,
  heartbeatDevice,
  listLiveDevices,
  registerDevice,
  removeDevice,
  sweepStaleDevices,
} from "@/lib/db";
import type { DeviceKind } from "@/lib/types";

const KINDS: DeviceKind[] = ["camera", "station", "control"];

export async function POST(request: Request) {
  let body: {
    slotId?: string;
    kind?: string;
    roomIndex?: number | null;
    label?: string;
    deviceId?: string;
  };
  try {
    body = await request.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const slotId = String(body.slotId ?? "");
  if (!slotId) return new Response("slotId is required", { status: 400 });

  const access = await checkSlotAccess(slotId);
  if (!access.ok) return denied(access);

  // Heartbeat for an already-registered device. Keeping someone else's device
  // listed as live would let a spoofer hold a seat in the registry, so the
  // heartbeat is owner-only too.
  if (body.deviceId) {
    const deviceId = String(body.deviceId);
    if (!(await canActAsDevice(access, slotId, deviceId))) {
      return new Response("Forbidden", { status: 403 });
    }
    await heartbeatDevice(deviceId);
    return Response.json({ deviceId });
  }

  const kind = String(body.kind ?? "") as DeviceKind;
  if (!KINDS.includes(kind)) return new Response("Invalid kind", { status: 400 });

  // Only an RA may present a machine as a room camera or as the control
  // center; a participant's browser can only ever be their own station.
  if (access.role === "participant" && kind !== "station") {
    return new Response("Forbidden", { status: 403 });
  }

  const device = await registerDevice({
    slotId,
    kind,
    roomIndex:
      body.roomIndex === null || body.roomIndex === undefined
        ? null
        : Math.max(1, Math.floor(Number(body.roomIndex))),
    participantId: access.role === "participant" ? access.participantId : null,
    label: String(body.label ?? "").slice(0, 80),
  });

  // Opportunistic cleanup — tabs rarely get to say goodbye.
  await sweepStaleDevices();

  return Response.json({ deviceId: device.id });
}

export async function GET(request: Request) {
  const slotId = new URL(request.url).searchParams.get("slotId") ?? "";
  if (!slotId) return new Response("slotId is required", { status: 400 });

  const access = await checkSlotAccess(slotId);
  if (!access.ok) return denied(access);

  // The full registry includes every camera's device id, which is exactly
  // what a spoofer needs to intercept its signaling. Only the control wall
  // (admin) discovers peers; a participant sees just their own devices.
  const devices = await listLiveDevices(slotId);
  const visible =
    access.role === "admin"
      ? devices
      : devices.filter((d) => d.participantId === access.participantId);
  return Response.json({
    devices: visible.map((d) => ({
      id: d.id,
      kind: d.kind,
      roomIndex: d.roomIndex,
      participantId: d.participantId,
      label: d.label,
    })),
  });
}

export async function DELETE(request: Request) {
  const params = new URL(request.url).searchParams;
  const slotId = params.get("slotId") ?? "";
  const deviceId = params.get("deviceId") ?? "";
  if (!slotId || !deviceId) return new Response("Bad request", { status: 400 });

  const access = await checkSlotAccess(slotId);
  if (!access.ok) return denied(access);

  // Deregistering someone else's camera would silently kill its feed, so
  // deletion is owner-only (admins may remove any of the slot's devices).
  const device = await getDevice(deviceId);
  if (!device || device.slotId !== slotId) {
    // Already gone — a clean close() races the stale sweep all the time.
    return new Response(null, { status: 204 });
  }
  if (access.role !== "admin" && device.participantId !== access.participantId) {
    return new Response("Forbidden", { status: 403 });
  }

  await removeDevice(deviceId);
  return new Response(null, { status: 204 });
}
