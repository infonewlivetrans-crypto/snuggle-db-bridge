import { createRouter, useRouter } from "@tanstack/react-router";
import { QueryClient } from "@tanstack/react-query";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { persistQueryClient } from "@tanstack/react-query-persist-client";
import { routeTree } from "./routeTree.gen";
import { RouteSkeleton } from "./components/RouteSkeleton";
import { APP_CLIENT_VERSION } from "./lib/system-settings";
import { isPersistableQueryKey } from "./lib/queryCache";

function DefaultErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-8 w-8 text-destructive"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          An unexpected error occurred. Please try again.
        </p>
        {import.meta.env.DEV && error.message && (
          <pre className="mt-4 max-h-40 overflow-auto rounded-md bg-muted p-3 text-left font-mono text-xs text-destructive">
            {error.message}
          </pre>
        )}
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Свежесть данных 60с — повторное открытие/возврат к экрану не дёргает сеть зря.
        staleTime: 60_000,
        // gcTime >= maxAge персистера, иначе GC чистит до восстановления.
        gcTime: 24 * 60 * 60_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: "always",
        retry: 1,
      },
    },
  });

  // Сохраняем кэш React Query в localStorage (только в браузере, не в SSR).
  // buster = APP_CLIENT_VERSION — при новой версии старый кэш отбрасывается.
  if (typeof window !== "undefined") {
    try {
      const persister = createSyncStoragePersister({
        storage: window.localStorage,
        key: "rt-query-cache-v1",
        throttleTime: 1000,
      });
      persistQueryClient({
        queryClient,
        persister,
        maxAge: 24 * 60 * 60_000,
        buster: APP_CLIENT_VERSION,
        dehydrateOptions: {
          shouldDehydrateQuery: (q) =>
            q.state.status === "success" && isPersistableQueryKey(q.queryKey),
        },
      });
    } catch {
      // localStorage недоступен (приватный режим, квота) — работаем без персиста.
    }
  }

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    defaultPreloadDelay: 30,
    defaultPendingComponent: RouteSkeleton,
    defaultPendingMs: 50,
    defaultPendingMinMs: 200,
    defaultErrorComponent: DefaultErrorComponent,
  });

  return router;
};
