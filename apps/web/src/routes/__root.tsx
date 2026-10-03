import { createRootRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/shell/app-shell";
import { NotFound, RouteError } from "@/components/shell/route-error";

function RootLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

export const Route = createRootRoute({
  component: RootLayout,
  errorComponent: RouteError,
  notFoundComponent: NotFound,
});
