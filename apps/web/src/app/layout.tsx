import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  description: "Trustless deals on Solana without intermediaries",
  title: "Pact",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html className="dark" lang="en">
      <body className="cladd-color-neutral min-h-screen bg-cladd-bg text-cladd-fg antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
