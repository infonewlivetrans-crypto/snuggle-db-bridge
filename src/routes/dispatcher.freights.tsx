import { createFileRoute } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";

export const Route = createFileRoute("/dispatcher/freights")({
  component: () => (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto w-full max-w-[1280px] px-4 py-6">
        <h1 className="text-2xl font-bold">Найденные грузы</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Раздел в разработке. Этап 1 — каркас, CRUD будет на этапе 3.
        </p>
      </main>
    </div>
  ),
});
