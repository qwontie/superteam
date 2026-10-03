import type { Transition } from "motion/react";

export const SNAP: Transition = {
  damping: 34,
  mass: 0.8,
  stiffness: 520,
  type: "spring",
};

export const SETTLE: Transition = {
  damping: 30,
  stiffness: 260,
  type: "spring",
};

export const FLOOD: Transition = {
  duration: 0.7,
  ease: [0.16, 1, 0.3, 1],
};

export const QUICK: Transition = {
  duration: 0.2,
  ease: [0.16, 1, 0.3, 1],
};

export const FLIGHT: Transition = {
  damping: 26,
  mass: 1,
  stiffness: 120,
  type: "spring",
};
