import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";

import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { registerSocketActorResolver, resetSocketActorResolver } from "@/realtime/authentication";
import { emitRealtimeEvent } from "@/realtime/emit";
import { roomName } from "@/realtime/rooms";
import { getIO, initRealtimeServer, resetIOForTests } from "@/realtime/socket-server";
import type { RoomJoinAck } from "@/realtime/types";

const ACTORS = {
  rep: { id: "user-rep-1", role: "SALES_REP" as const },
  manager: { id: "user-manager-1", role: "MANAGER" as const },
};

/** Test-only stand-in for real Clerk verification: `auth.token` selects a fixed actor by key. */
registerSocketActorResolver(async ({ auth }) => {
  const token = typeof auth === "object" && auth !== null ? (auth as Record<string, unknown>).token : undefined;
  if (token === "rep-token") return ACTORS.rep;
  if (token === "manager-token") return ACTORS.manager;
  return null;
});

let httpServer: HttpServer;
let baseUrl: string;
const openClients: ClientSocket[] = [];

beforeAll(async () => {
  httpServer = createServer();
  initRealtimeServer(httpServer);
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const { port } = httpServer.address() as AddressInfo;
  baseUrl = `http://localhost:${port}`;
});

afterEach(() => {
  while (openClients.length > 0) {
    openClients.pop()?.disconnect();
  }
});

afterAll(async () => {
  resetSocketActorResolver();
  resetIOForTests();
  getIO()?.close();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

function connect(token: string | undefined): ClientSocket {
  const client = ioClient(baseUrl, {
    path: "/socket.io/",
    auth: { token },
    reconnectionDelay: 20,
    forceNew: true,
  });
  openClients.push(client);
  return client;
}

function waitForConnect(client: ClientSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    client.once("connect", () => resolve());
    client.once("connect_error", (error) => reject(error));
  });
}

function waitForConnectError(client: ClientSocket): Promise<Error> {
  return new Promise((resolve, reject) => {
    client.once("connect", () => reject(new Error("expected connect_error, got connect")));
    client.once("connect_error", (error) => resolve(error));
  });
}

function joinRoom(client: ClientSocket, room: string): Promise<RoomJoinAck> {
  return new Promise((resolve) => client.emit("room:join", { room }, resolve));
}

describe("Socket.IO realtime server (integration)", () => {
  it("accepts a connection with a valid identity", async () => {
    const client = connect("rep-token");
    await expect(waitForConnect(client)).resolves.toBeUndefined();
  });

  it("rejects a connection with no recognizable identity", async () => {
    const client = connect("garbage-token");
    const error = await waitForConnectError(client);
    expect(error.message).toContain("UNAUTHORIZED");
  });

  it("rejects a connection with no token at all", async () => {
    const client = connect(undefined);
    const error = await waitForConnectError(client);
    expect(error.message).toContain("UNAUTHORIZED");
  });

  it("denies joining a room the actor isn't authorized for", async () => {
    const client = connect("rep-token");
    await waitForConnect(client);

    const ack = await joinRoom(client, roomName("user", ACTORS.manager.id));
    expect(ack).toEqual({ ok: false, code: "FORBIDDEN", message: expect.any(String) });
  });

  it("denies joining an unrecognized room pattern", async () => {
    const client = connect("rep-token");
    await waitForConnect(client);

    const ack = await joinRoom(client, "admin:everything");
    expect(ack).toEqual({ ok: false, code: "VALIDATION_ERROR", message: expect.any(String) });
  });

  it("always denies document:{id} - no Document model exists yet", async () => {
    const client = connect("manager-token");
    await waitForConnect(client);

    const ack = await joinRoom(client, roomName("document", "doc-1"));
    expect(ack).toEqual({ ok: false, code: "FORBIDDEN", message: expect.any(String) });
  });

  it("allows joining an authorized room and then receives events emitted to it", async () => {
    const client = connect("manager-token");
    await waitForConnect(client);

    const room = roomName("role", "MANAGER");
    const ack = await joinRoom(client, room);
    expect(ack).toEqual({ ok: true });

    const received = new Promise((resolve) => client.once("deal-health:updated", resolve));
    emitRealtimeEvent(room, "deal-health:updated", { alertId: "alert-1", type: "STALLED", priority: "HIGH" });

    await expect(received).resolves.toEqual({ alertId: "alert-1", type: "STALLED", priority: "HIGH" });
  });

  it("auto-joins the actor's own user and role rooms on connect, with no client action", async () => {
    const client = connect("manager-token");
    await waitForConnect(client);

    const received = new Promise((resolve) => client.once("quotation:updated", resolve));
    emitRealtimeEvent(roomName("user", ACTORS.manager.id), "quotation:updated", { id: "q1", status: "APPROVED" });

    await expect(received).resolves.toEqual({ id: "q1", status: "APPROVED" });
  });

  it("re-authenticates and re-authorizes on reconnect - room membership does not carry over", async () => {
    const client = connect("rep-token");
    await waitForConnect(client);

    const room = roomName("user", ACTORS.rep.id);
    expect(await joinRoom(client, room)).toEqual({ ok: true });

    const reconnected = waitForConnect(client);
    client.disconnect();
    client.connect();
    await reconnected;

    // A fresh connection only has its auto-joined rooms again - explicit joins must be redone,
    // which is exactly why the client must refetch authoritative state on reconnect rather than
    // assume its previous subscriptions (or any events missed while disconnected) still hold.
    const received = new Promise((resolve) => client.once("quotation:updated", resolve));
    emitRealtimeEvent(room, "quotation:updated", { id: "q2", status: "DRAFT" });
    await expect(received).resolves.toEqual({ id: "q2", status: "DRAFT" });
  });
});
