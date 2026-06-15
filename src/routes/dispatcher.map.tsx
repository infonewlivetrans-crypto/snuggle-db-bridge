import { createFileRoute } from "@tanstack/react-router";
import { DispatcherShell } from "@/components/dispatcher/DispatcherShell";
import { FreeVehiclesBlock } from "@/components/dispatcher/FreeVehiclesBlock";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export const Route = createFileRoute("/dispatcher/map")({
  component: DispatcherMapPage,
});

function DispatcherMapPage() {
  return (
    <DispatcherShell>
      <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6">
        <div className="mb-4">
          <h1 className="text-2xl font-bold tracking-tight">Карта машин</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Свободные грузовики на карте России. Кликните по машине для подробностей.
          </p>
        </div>
        <ErrorBoundary section="dispatcher-map">
          <FreeVehiclesBlock />
        </ErrorBoundary>
      </div>
    </DispatcherShell>
  );
}
