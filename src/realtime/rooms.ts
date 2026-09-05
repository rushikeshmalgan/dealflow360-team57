/**
 * Server-authorized room patterns (TAD SS23). A room name is always `"<kind>:<id>"`; the id is
 * client-supplied (it just says which resource), but whether a given actor may join it is
 * always decided server-side in authorization.ts from the Clerk-resolved actor - never from
 * anything the client asserts.
 */
export const ROOM_KINDS = ["user", "role", "quotation", "customer", "warehouse", "document"] as const;
export type RoomKind = (typeof ROOM_KINDS)[number];

export type ParsedRoom = { kind: RoomKind; id: string };

export function roomName(kind: RoomKind, id: string): string {
  return `${kind}:${id}`;
}

/**
 * Parses and validates a client-supplied room string against the known patterns. Returns null
 * for anything else (unknown kind, empty id, or an id smuggling a second ":" segment) so callers
 * can reject arbitrary room access instead of joining whatever string a client sends.
 */
export function parseRoomName(room: string): ParsedRoom | null {
  const separatorIndex = room.indexOf(":");
  if (separatorIndex <= 0 || separatorIndex === room.length - 1) return null;

  const kind = room.slice(0, separatorIndex);
  const id = room.slice(separatorIndex + 1);

  if (!(ROOM_KINDS as readonly string[]).includes(kind)) return null;
  if (id.includes(":") || id.length > 200) return null;

  return { kind: kind as RoomKind, id };
}
