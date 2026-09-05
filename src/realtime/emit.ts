import { getIO } from "./socket-server";
import { parseRealtimeEventPayload, type RealtimeEventName, type RealtimeEventPayload } from "./events";

/**
 * Emits a realtime event to a room. Call this AFTER a PostgreSQL transaction has committed
 * (TAD SS5/§24A: "business operation -> PostgreSQL transaction -> commit -> emit Socket.IO
 * event") - never from inside one. This function never throws: an invalid payload is logged and
 * dropped rather than emitted, and a missing/unavailable Socket.IO server is logged and skipped.
 * Either way, the caller's already-committed business transaction is unaffected - queue/realtime
 * failures must never look like a business failure (TAD SS45/SS50).
 */
export function emitRealtimeEvent<E extends RealtimeEventName>(
  room: string,
  event: E,
  payload: RealtimeEventPayload<E>,
): void {
  let validated: RealtimeEventPayload<E>;
  try {
    validated = parseRealtimeEventPayload(event, payload);
  } catch (error) {
    console.error("[realtime] refusing to emit invalid payload", { room, event, error });
    return;
  }

  const io = getIO();
  if (!io) {
    console.warn("[realtime] socket.io not initialized; dropping event", { room, event });
    return;
  }

  try {
    // socket.io's emit<Ev>(...) infers Ev from a generic `event`, which collapses the mapped
    // ServerToClientEvents type to `never` here - cast the function itself rather than its args
    // so generic inference never kicks in. `validated` is still the Zod-checked shape for this
    // exact `event`, so this is a TS-limitation cast, not a runtime type hole.
    (io.to(room).emit as (event: string, payload: unknown) => boolean)(event, validated);
  } catch (error) {
    console.error("[realtime] emit failed", { room, event, error });
  }
}
