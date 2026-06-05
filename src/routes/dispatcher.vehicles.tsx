import { createFileRoute } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";

export const Route = createFileRoute("/dispatcher/vehicles")({
  component: () => (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto w-full max-w-[1280px] px-4 py-6">
        <h1 className="text-2xl font-bold">Транспорт (AI-диспетчер)</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Раздел в разработке. CRUD — этап 2.
        </p>
      </main>
    </div>
  ),
});
