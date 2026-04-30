import { Outlet, Link, createRootRouteWithContext, HeadContent, Scripts } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { AppVersionGate } from "@/components/AppVersionGate";
import { SettingsProvider } from "@/lib/settings-provider";
import { AuthProvider } from "@/lib/auth/auth-context";
import { AuthGate } from "@/components/auth/AuthGate";
import { PostLoginRedirect } from "@/components/auth/PostLoginRedirect";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ErrorState } from "@/components/ErrorState";
import { useEffect } from "react";
import { reportError } from "@/lib/errorReporter";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Страница не найдена</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Запрашиваемая страница не существует или была перемещена.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            search={{ orderId: undefined }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            На главную
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Радиус Трек — Управление логистикой" },
      { name: "description", content: "Платформа управления заказами и логистикой Радиус Трек" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ({ error, reset }) => (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <ErrorState error={error} section="router" action="render" onRetry={reset} />
      </div>
    </div>
  ),
});

function GlobalErrorListener() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      void reportError(e.error ?? e.message, { section: "window", action: "error", severity: "error" });
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      void reportError(e.reason, { section: "window", action: "unhandled_rejection", severity: "error" });
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SettingsProvider>
          <GlobalErrorListener />
          <PostLoginRedirect />
          <AuthGate>
            <ErrorBoundary section="app">
              <Outlet />
            </ErrorBoundary>
          </AuthGate>
          <AppVersionGate />
          <Toaster />
        </SettingsProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
