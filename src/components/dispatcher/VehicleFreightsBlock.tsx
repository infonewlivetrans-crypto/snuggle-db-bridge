import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ExternalLink, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { freightsApi } from "@/lib/dispatcher/api";
import { FREIGHT_STATUS_LABELS } from "@/lib/dispatcher/statuses";

const fmt = (n: number | null | undefined) =>
  n == null ? "—" : Number(n).toLocaleString("ru-RU");
const fmtDate = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleDateString("ru-RU") : "—";

export function VehicleFreightsBlock({ vehicleId }: { vehicleId: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["vehicle-freights", vehicleId],
    queryFn: () =>
      freightsApi.list({ vehicle_id: vehicleId, exclude_archived: 1, limit: 50 }),
  });

  const archiveMut = useMutation({
    mutationFn: (id: string) =>
      freightsApi.update(id, { dispatcher_status: "archived" }),
    onSuccess: () => {
      toast.success("Груз убран из подбора");
      qc.invalidateQueries({ queryKey: ["vehicle-freights", vehicleId] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Ошибка"),
  });

  const rows = data?.rows ?? [];

  return (
    <div className="rounded-lg border border-border bg-card/40 p-3">
      <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <span>Найденные грузы под эту машину</span>
        <Badge variant="outline">{rows.length}</Badge>
      </div>
      {isLoading ? (
        <div className="text-xs text-muted-foreground">Загрузка…</div>
      ) : rows.length === 0 ? (
        <div className="text-xs text-muted-foreground">Пока ничего не добавлено</div>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const status = r.dispatcher_status as keyof typeof FREIGHT_STATUS_LABELS;
            return (
              <li key={r.id} className="rounded border border-border bg-background p-2 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-foreground">
                      {(r.loading_city ?? "—") + " → " + (r.unloading_city ?? "—")}
                    </div>
                    <div className="mt-0.5 text-muted-foreground">
                      {fmtDate(r.loading_date)} · {r.cargo_name ?? "—"} · {fmt(r.rate)} ₽
                    </div>
                    <div className="mt-0.5">
                      <Badge variant="secondary" className="text-[10px]">
                        {FREIGHT_STATUS_LABELS[status] ?? r.dispatcher_status ?? "—"}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Button
                      asChild
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2"
                    >
                      <a href={`/dispatcher/freights?id=${r.id}`} target="_blank" rel="noreferrer">
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2"
                      onClick={() => archiveMut.mutate(r.id)}
                      disabled={archiveMut.isPending}
                      title="В архив"
                    >
                      <Archive className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Button size="sm" variant="outline" className="mt-2 w-full" disabled title="Следующий этап">
        Собрать предложение рейса (следующий этап)
      </Button>
    </div>
  );
}
