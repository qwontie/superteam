import { CladdProvider } from "@cladd-ui/react";
import { ClientProvider } from "@solana/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { queryClient } from "@/lib/query-client";
import { createAppClient } from "@/lib/solana";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(createAppClient);

  return (
    <CladdProvider theme="dark">
      <QueryClientProvider client={queryClient}>
        <ClientProvider client={client}>{children}</ClientProvider>
      </QueryClientProvider>
    </CladdProvider>
  );
}
