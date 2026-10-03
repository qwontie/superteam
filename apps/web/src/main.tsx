import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Providers } from "@/components/providers";
import { NotFound, RouteError } from "@/components/shell/route-error";
import { routeTree } from "./routeTree.gen";
import "./styles.css";

const router = createRouter({
  defaultErrorComponent: RouteError,
  defaultNotFoundComponent: NotFound,
  defaultPreload: "intent",
  routeTree,
  scrollRestoration: true,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element #root is missing from index.html");
}

createRoot(rootElement).render(
  <StrictMode>
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  </StrictMode>
);
