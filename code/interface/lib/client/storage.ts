"use client";
/** Tiny localStorage helpers. Everything is best-effort: storage may be unavailable. */
import { useCallback, useEffect, useState } from "react";

export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota or privacy mode */
  }
}

/**
 * useState that mirrors to localStorage. Stored data is untrusted (older versions, manual edits):
 * `sanitize` must turn whatever was stored into a valid value, dropping malformed entries.
 */
export function useStoredState<T>(key: string, fallback: T, sanitize: (raw: unknown) => T) {
  const [value, setValue] = useState<T>(fallback);

  useEffect(() => {
    const load = () => {
      try {
        return sanitize(readJson<unknown>(key, fallback));
      } catch {
        return fallback;
      }
    };
    setValue(load());
    const onChange = (e: Event) => {
      if ((e as CustomEvent<string>).detail === key) setValue(load());
    };
    window.addEventListener("pp-storage", onChange);
    return () => window.removeEventListener("pp-storage", onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const update = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        writeJson(key, resolved);
        return resolved;
      });
    },
    [key],
  );

  return [value, update] as const;
}
