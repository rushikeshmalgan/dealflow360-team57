import { describe, expect, it } from "vitest";

import { parseRoomName, roomName } from "@/realtime/rooms";

describe("roomName", () => {
  it("builds a kind:id room string", () => {
    expect(roomName("quotation", "abc-123")).toBe("quotation:abc-123");
  });
});

describe("parseRoomName", () => {
  it("parses every supported room pattern", () => {
    expect(parseRoomName("user:u1")).toEqual({ kind: "user", id: "u1" });
    expect(parseRoomName("role:MANAGER")).toEqual({ kind: "role", id: "MANAGER" });
    expect(parseRoomName("quotation:q1")).toEqual({ kind: "quotation", id: "q1" });
    expect(parseRoomName("customer:c1")).toEqual({ kind: "customer", id: "c1" });
    expect(parseRoomName("warehouse:w1")).toEqual({ kind: "warehouse", id: "w1" });
    expect(parseRoomName("document:d1")).toEqual({ kind: "document", id: "d1" });
  });

  it("rejects an unknown kind so a client can't join arbitrary rooms", () => {
    expect(parseRoomName("admin:everything")).toBeNull();
  });

  it("rejects a room with no id", () => {
    expect(parseRoomName("user:")).toBeNull();
    expect(parseRoomName("user")).toBeNull();
  });

  it("rejects an id smuggling a second segment", () => {
    expect(parseRoomName("user:1:2")).toBeNull();
  });

  it("rejects an oversized id", () => {
    expect(parseRoomName(`user:${"x".repeat(201)}`)).toBeNull();
  });
});
