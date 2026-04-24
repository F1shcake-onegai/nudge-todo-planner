"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";

/**
 * Close a floating panel when the user clicks outside its ref or presses Escape.
 * Pass `enabled=false` to skip registering listeners (e.g. when closed).
 */
export function useClickOutside(
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
  enabled = true,
) {
  useEffect(() => {
    if (!enabled) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [ref, onClose, enabled]);
}

/**
 * Touch-and-hold gesture. Fires `onLongPress(clientX, clientY)` after `ms`
 * of steady contact; cancels if the finger moves more than
 * `moveThresholdPx` or lifts early. After firing, swallows the synthesized
 * mousedown that follows touchend (capture-phase), so downstream
 * `useClickOutside` listeners don't immediately close whatever the
 * long-press opened.
 *
 * Spread the returned props on the target element alongside its existing
 * `onContextMenu` handler; desktop right-click keeps working unchanged.
 */
export function useLongPress(
  onLongPress: (x: number, y: number) => void,
  { ms = 500, moveThresholdPx = 10 }: { ms?: number; moveThresholdPx?: number } = {},
) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);

  const cancel = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    start.current = null;
  }, []);

  useEffect(() => () => cancel(), [cancel]);

  return {
    onTouchStart: (e: React.TouchEvent) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      start.current = { x: t.clientX, y: t.clientY };
      timer.current = setTimeout(() => {
        timer.current = null;
        if (!start.current) return;
        const { x, y } = start.current;
        onLongPress(x, y);
        const swallow = (ev: MouseEvent) => {
          ev.stopPropagation();
          ev.preventDefault();
          window.removeEventListener("mousedown", swallow, true);
          clearTimeout(swallowTimeout);
        };
        window.addEventListener("mousedown", swallow, true);
        const swallowTimeout = setTimeout(() => {
          window.removeEventListener("mousedown", swallow, true);
        }, 500);
      }, ms);
    },
    onTouchMove: (e: React.TouchEvent) => {
      if (!start.current || !timer.current) return;
      const t = e.touches[0];
      const dx = t.clientX - start.current.x;
      const dy = t.clientY - start.current.y;
      if (dx * dx + dy * dy > moveThresholdPx * moveThresholdPx) cancel();
    },
    onTouchEnd: cancel,
    onTouchCancel: cancel,
  };
}
