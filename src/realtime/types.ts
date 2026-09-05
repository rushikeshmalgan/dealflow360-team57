import type { Actor } from "@/modules/shared/domain/actor";

import type { RealtimeEventName, RealtimeEventPayload } from "./events";

export type RoomJoinAck = { ok: true } | { ok: false; code: string; message: string };

/** Events the client sends to the server. */
export type ClientToServerEvents = {
  "room:join": (payload: { room: string }, callback: (ack: RoomJoinAck) => void) => void;
  "room:leave": (payload: { room: string }, callback: (ack: RoomJoinAck) => void) => void;
};

/** Events the server sends to the client - one entry per src/realtime/events.ts contract. */
export type ServerToClientEvents = {
  [E in RealtimeEventName]: (payload: RealtimeEventPayload<E>) => void;
};

export type InterServerEvents = Record<string, never>;

/** Per-connection state attached during the auth handshake (server.use middleware). */
export type RealtimeSocketData = { actor: Actor };
