"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * WAI-ARIA APG dialog pattern for hand-rolled modals (ones not already built
 * on Radix Dialog, which provides this natively): traps Tab/Shift+Tab focus
 * inside the modal, moves focus in on open, restores it to whatever was
 * focused before on close, and calls `onClose` for Escape.
 *
 * Usage: attach the returned ref to the modal's outer container and spread
 * `role="dialog" aria-modal="true"` on the same element.
 */
export function useFocusTrap<T extends HTMLElement>(active: boolean, onClose?: () => void) {
  const containerRef = useRef<T | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  // Holds the latest onClose without making the setup effect below re-run on
  // every render — most callers pass an inline arrow/closure that gets a new
  // identity each render (e.g. `() => setShowModal(false)`), which would
  // otherwise re-trigger initial-focus every time the modal's own state
  // changes (such as each keystroke in a field inside it).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;

    const focusables = () => Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    const first = focusables()[0];
    (first ?? container).focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && onCloseRef.current) {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;

      const items = focusables();
      if (items.length === 0) return;
      const firstItem = items[0];
      const lastItem = items[items.length - 1];

      if (e.shiftKey && document.activeElement === firstItem) {
        e.preventDefault();
        lastItem.focus();
      } else if (!e.shiftKey && document.activeElement === lastItem) {
        e.preventDefault();
        firstItem.focus();
      }
    }

    container.addEventListener("keydown", handleKeyDown);
    return () => {
      container.removeEventListener("keydown", handleKeyDown);
      previouslyFocusedRef.current?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onClose is
    // read via onCloseRef (kept fresh above) precisely so it's excluded here.
  }, [active]);

  return containerRef;
}
