import type { Server as HttpServer } from "node:http";

import { Server as SocketIOServer, type Socket } from "socket.io";
import { z } from "zod";

import { resolveSocketActor } from "./authentication";
import { authorizeRoomJoin } from "./authorization";
import { parseRoomName, roomName } from "./rooms";
import type {
  ClientToServerEvents,
  InterServerEvents,
  RealtimeSocketData,
  RoomJoinAck,
  ServerToClientEvents,
} from "./types";

export type RealtimeIO = SocketIOServer<ClientToServerEvents, ServerToClientEvents, InterServerEvents, RealtimeSocketData>;
type RealtimeSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, RealtimeSocketData>;

let io: RealtimeIO | undefined;

const joinPayloadSchema = z.object({ room: z.string().min(1).max(200) });

/**
 * Attaches Socket.IO to the app's HTTP server (single instance, in-memory adapter - TAD SS23:
 * "Redis is already present for BullMQ, but Socket.IO keeps its in-memory adapter for the
 * single-instance MVP"). Call once, from server.ts.
 */
export function initRealtimeServer(httpServer: HttpServer): RealtimeIO {
  const server: RealtimeIO = new SocketIOServer(httpServer, {
    path: "/socket.io/",
  });

  // Runs once per connection attempt, before "connection" - rejects unauthenticated sockets
  // entirely rather than letting them connect and fail room joins one by one.
  server.use(async (socket, next) => {
    const actor = await resolveSocketActor({ auth: socket.handshake.auth, headers: socket.handshake.headers });
    if (!actor) {
      next(new Error("UNAUTHORIZED"));
      return;
    }
    socket.data.actor = actor;
    next();
  });

  server.on("connection", (socket: RealtimeSocket) => {
    const actor = socket.data.actor;

    // Always-authorized personal channels - safe to auto-join since they only ever depend on
    // the server-resolved actor, never on client input.
    socket.join(roomName("user", actor.id));
    if (actor.role !== "CUSTOMER") {
      socket.join(roomName("role", actor.role));
    }

    socket.on("room:join", (payload, callback) => {
      void tryJoin(socket, payload).then(callback);
    });

    socket.on("room:leave", (payload, callback) => {
      callback(tryLeave(socket, payload));
    });
  });

  io = server;
  return server;
}

async function tryJoin(socket: RealtimeSocket, payload: unknown): Promise<RoomJoinAck> {
  const parsedPayload = joinPayloadSchema.safeParse(payload);
  if (!parsedPayload.success) {
    return { ok: false, code: "VALIDATION_ERROR", message: "A room name is required" };
  }

  const room = parsedPayload.data.room;
  const parsedRoom = parseRoomName(room);
  if (!parsedRoom) {
    return { ok: false, code: "VALIDATION_ERROR", message: `"${room}" is not a recognized room pattern` };
  }

  const allowed = await authorizeRoomJoin(socket.data.actor, parsedRoom);
  if (!allowed) {
    return { ok: false, code: "FORBIDDEN", message: "You do not have access to this room" };
  }

  await socket.join(room);
  return { ok: true };
}

function tryLeave(socket: RealtimeSocket, payload: unknown): RoomJoinAck {
  const parsedPayload = joinPayloadSchema.safeParse(payload);
  if (!parsedPayload.success) {
    return { ok: false, code: "VALIDATION_ERROR", message: "A room name is required" };
  }
  socket.leave(parsedPayload.data.room);
  return { ok: true };
}

/** Undefined until initRealtimeServer() has run, or if it failed to start (see server.ts). */
export function getIO(): RealtimeIO | undefined {
  return io;
}

/** Test-only: lets integration tests reset the module-level singleton between server instances. */
export function resetIOForTests(): void {
  io = undefined;
}
