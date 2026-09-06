import { io, type Socket } from "socket.io-client";

import type { ClientToServerEvents, ServerToClientEvents } from "@/realtime/types";

export type RealtimeSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: RealtimeSocket | undefined;

/**
 * One shared Socket.IO connection for the whole app (TAD SS23: rooms/delivery are per-connection
 * and transient - there's no reason for more than one). The `df_session` cookie is httpOnly, so
 * client JS never reads or forwards it explicitly — the browser attaches it automatically to this
 * same-origin handshake, and the server (src/realtime/authentication.ts) reads it off the raw
 * Cookie header.
 */
export function getRealtimeSocket(): RealtimeSocket {
  if (socket) return socket;

  socket = io({
    path: "/socket.io/",
    withCredentials: true,
  });

  return socket;
}

/** Test/teardown only - forces the next getRealtimeSocket() call to create a fresh connection. */
export function resetRealtimeSocketForTests(): void {
  socket?.disconnect();
  socket = undefined;
}
