// Device registry: a browser tab claims a role for a session (room camera,
// participant station, or the control center) and heartbeats to stay listed.
// Peers discover each other by listing devices, then talk over WebRTC.

import { checkSlotAccess, denied } from "@/lib/control-guard";
import {
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

  // Heartbeat for an already-registered device.
  if (body.deviceId) {
    await heartbeatDevice(String(body.deviceId));
    return Response.json({ deviceId: body.deviceId });
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

  const devices = await listLiveDevices(slotId);
  return Response.json({
    devices: devices.map((d) => ({
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

  await removeDevice(deviceId);
  return new Response(null, { status: 204 });
}
