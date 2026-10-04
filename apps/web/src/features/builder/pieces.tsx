import type { DraggableSyntheticListeners } from "@dnd-kit/core";
import type { PointerEventHandler } from "react";

export const pointerDown = (listeners: DraggableSyntheticListeners) =>
  listeners?.onPointerDown as PointerEventHandler<HTMLElement> | undefined;
