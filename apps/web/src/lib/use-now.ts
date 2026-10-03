import { useSyncExternalStore } from "react";

const TICK_MS = 1000;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let current = Math.floor(Date.now() / TICK_MS);

const tick = () => {
  const next = Math.floor(Date.now() / TICK_MS);
  if (next === current) {
    return;
  }
  current = next;
  for (const listener of listeners) {
    listener();
  }
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  if (timer === null) {
    tick();
    timer = setInterval(tick, TICK_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
};

const snapshot = () => current;

export const useNow = () => useSyncExternalStore(subscribe, snapshot, snapshot);
