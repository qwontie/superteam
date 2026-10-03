import { useSyncExternalStore } from "react";

const QUERY = "(min-width: 1024px)";

const subscribe = (listener: () => void) => {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
};

const snapshot = () => window.matchMedia(QUERY).matches;

export const useWide = () => useSyncExternalStore(subscribe, snapshot);
