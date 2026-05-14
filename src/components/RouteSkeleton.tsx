import { Skeleton } from "@/components/ui/skeleton";

/**
 * Унифицированный скелетон для лениво загружаемых страниц.
 * Используется как `defaultPendingComponent` роутера.
 */
export function RouteSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      {/* Шапка */}
      <div className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <Skeleton className="h-8 w-40" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-8 rounded-full" />
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <Skeleton className="mb-2 h-8 w-64" />
        <Skeleton className="mb-6 h-4 w-96" />

        {/* KPI / фильтры */}
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>

        {/* Таблица */}
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <Skeleton className="h-10 w-full rounded-none" />
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-none border-t border-border" />
          ))}
        </div>
      </main>
    </div>
  );
}
