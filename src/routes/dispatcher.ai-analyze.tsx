import { createFileRoute } from "@tanstack/react-router";
import { DispatcherShell } from "@/components/dispatcher/DispatcherShell";

export const Route = createFileRoute("/dispatcher/ai-analyze")({
  component: () => (
    <DispatcherShell>
      <main className="mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-6">
        <h1 className="text-2xl font-bold tracking-tight">ИИ-анализ груза</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Раздел в разработке. ИИ-парсер и подбор машин — этап 4.
        </p>
      </main>
    </DispatcherShell>
  ),
});
