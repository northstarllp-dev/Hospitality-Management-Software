"use client";

import { useEffect } from "react";

const SELECTABLE = new Set([
  "text",
  "number",
  "email",
  "tel",
  "url",
  "search",
  "password",
  "date",
]);

/**
 * On focus, select existing input value so typing replaces it
 * instead of appending (especially important for number fields).
 */
export default function SelectOnFocus() {
  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      const el = e.target;
      if (!(el instanceof HTMLInputElement)) return;
      const type = (el.type || "text").toLowerCase();
      if (!SELECTABLE.has(type)) return;
      // Defer so the browser finishes focusing before select()
      requestAnimationFrame(() => {
        try {
          el.select();
        } catch {
          // some input types (e.g. date on some browsers) may not support select
        }
      });
    };

    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, []);

  return null;
}
