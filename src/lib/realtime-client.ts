import { io, type Socket } from "socket.io-client";

import type { ClientToServerEvents, ServerToClientEvents } from "@/realtime/types";

export type RealtimeSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
export type GetToken = () => Promise<string | null | undefined>;

let socket: RealtimeSocket | undefined;

/**
 * One shared Socket.IO connection for the whole app (TAD SS23: rooms/delivery are per-connection
 * and transient - there's no reason for more than one). `getToken` is re-invoked before every
 * (re)connection attempt via socket.io-client's function form of `auth`
 * (https://socket.io/docs/v4/client-options/#auth), so a freshly-refreshed Clerk session token
 * is always sent - including after a reconnect, never a stale one captured at first connect.
 */
export function getRealtimeSocket(getToken: GetToken): RealtimeSocket {
  if (socket) return socket;

  socket = io({
    path: "/socket.io/",
    auth: (callback) => {
      getToken()
        .then((token) => callback({ token }))
        .catch(() => callback({ token: null }));
    },
  });

  return socket;
}

/** Test/teardown only - forces the next getRealtimeSocket() call to create a fresh connection. */
export function resetRealtimeSocketForTests(): void {
  socket?.disconnect();
  socket = undefined;
}
