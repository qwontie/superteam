"use client";

import { useClient } from "@solana/react";
import type { AppClient } from "./solana";

export function useAppClient() {
  return useClient<AppClient>();
}
