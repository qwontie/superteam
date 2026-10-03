"use client";

import { CladdProvider } from "@cladd-ui/react";
import { ClientProvider } from "@solana/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { createAppClient } from "@/lib/solana";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [client] = useState(createAppClient);

  return (
    <CladdProvider theme="dark">
      <QueryClientProvider client={queryClient}>
        <ClientProvider client={client}>{children}</ClientProvider>
      </QueryClientProvider>
    </CladdProvider>
  );
}
