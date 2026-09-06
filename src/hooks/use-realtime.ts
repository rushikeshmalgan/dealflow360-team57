"use client";

import { useEffect, useRef } from "react";

import { getRealtimeSocket, type RealtimeSocket } from "@/lib/realtime-client";
import type { RealtimeEventName, RealtimeEventPayload } from "@/realtime/events";
import type { RoomJoinAck } from "@/realtime/types";

/**
 * Reusable client-side realtime layer (TAD SS23/§7). The one rule every hook here enforces:
 * a Socket.IO payload is never the source of truth - it only ever tells the caller *that*
 * something changed, so the caller can refetch the authoritative REST resource.
 */

/** The shared, session-cookie-authenticated Socket.IO connection for the whole app. */
export function useRealtimeSocket(): RealtimeSocket {
  const socketRef = useRef<RealtimeSocket | null>(null);
  if (!socketRef.current) {
    socketRef.current = getRealtimeSocket();
  }
  return socketRef.current;
}

/**
 * Subscribes to one realtime event while mounted. Use `onEvent` to trigger a REST refetch -
 * never to render the payload directly as authoritative state.
 */
export function useRealtimeEvent<E extends RealtimeEventName>(
  event: E,
  onEvent: (payload: RealtimeEventPayload<E>) => void,
): void {
  const socket = useRealtimeSocket();
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    const listener = (payload: RealtimeEventPayload<E>) => handlerRef.current(payload);
    // Same generic-vs-mapped-type limitation as emit.ts - cast the functions themselves so
    // generic inference on a type parameter `E` never collapses the listener type to `never`.
    const on = socket.on as (event: string, listener: (payload: RealtimeEventPayload<E>) => void) => unknown;
    const off = socket.off as (event: string, listener: (payload: RealtimeEventPayload<E>) => void) => unknown;
    on(event, listener);
    return () => {
      off(event, listener);
    };
  }, [socket, event]);
}

/**
 * Joins a server-authorized room while mounted, leaves on unmount or when `room` changes.
 * `onDenied` fires if the server rejects the join (unknown pattern or not authorized) - the
 * caller decides what to show (e.g. fall back to a plain REST poll for that resource).
 */
export function useRealtimeRoom(room: string | null, onDenied?: (reason: string) => void): void {
  const socket = useRealtimeSocket();
  const onDeniedRef = useRef(onDenied);
  onDeniedRef.current = onDenied;

  useEffect(() => {
    if (!room) return;
    let cancelled = false;

    socket.emit("room:join", { room }, (ack: RoomJoinAck) => {
      if (!cancelled && !ack.ok) onDeniedRef.current?.(ack.message);
    });

    return () => {
      cancelled = true;
      socket.emit("room:leave", { room }, () => {});
    };
  }, [socket, room]);
}

/**
 * Fires `onReconnect` on every (re)connection, including the first one. Socket.IO defaults to
 * at-most-once delivery (TAD §5), so a client that was ever disconnected must refetch
 * authoritative state instead of assuming missed events were delivered - this is the hook that
 * lets a component do that refetch.
 */
export function useRealtimeReconnect(onReconnect: () => void): void {
  const socket = useRealtimeSocket();
  const handlerRef = useRef(onReconnect);
  handlerRef.current = onReconnect;

  useEffect(() => {
    const listener = () => handlerRef.current();
    socket.on("connect", listener);
    return () => {
      socket.off("connect", listener);
    };
  }, [socket]);
}
