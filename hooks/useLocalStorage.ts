"use client";

import { useState, useEffect } from "react";

export function useLocalStorage<T>(key: string, initialValue: T) {
  // Always initialize with initialValue to perfectly match the server render state
  const [state, setState] = useState<T>(initialValue);
  const [isMounted, setIsMounted] = useState(false);

  // 1. Run exactly once on mount to pull local storage data safely into the browser
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const item = window.localStorage.getItem(key);
        if (item) {
          setState(JSON.parse(item));
        }
      } catch (error) {
        console.error(`Error reading localStorage key "${key}":`, error);
      }
      setIsMounted(true); // Signal that we are safely inside the client
    }
  }, [key]);

  // 2. Continually persist changes into storage whenever state alters
  useEffect(() => {
    if (isMounted && typeof window !== "undefined") {
      try {
        window.localStorage.setItem(key, JSON.stringify(state));
      } catch (error) {
        console.error(`Error setting localStorage key "${key}":`, error);
      }
    }
  }, [key, state, isMounted]);

  return [state, setState, isMounted] as const;
}
