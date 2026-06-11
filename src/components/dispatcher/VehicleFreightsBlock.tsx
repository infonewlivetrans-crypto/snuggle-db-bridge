import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ExternalLink, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { freightsApi } from "@/lib/dispatcher/api";
import { FREIGHT_STATUS_LABELS, FREIGHT_INACTIVE_STATUSES } from "@/lib/dispatcher/statuses";
import type { FreightStatus } from "@/lib/dispatcher/statuses";
import { BuildOfferDialog } from "./BuildOfferDialog";

const INACTIVE = FREIGHT_INACTIVE_STATUSES as readonly string[];

const QUICK_ACTIONS: Array<{ status: FreightStatus; label: string; comment: string }> = [
  { status: "taken_by_other", label: "Груз уже забрали", comment: "Груз уже забрали" },
  { status: "not_actual", label: "Неактуален", comment: "Груз неактуален" },
  { status: "no_answer", label: "Нет ответа", comment: "Заказчик не отвечает" },
  { status: "bad_rate", label: "Не подходит ставка", comment: "Не подходит ставка" },
  { status: "suspicious", label: "Сомнительный груз", comment: "Сомнительный груз" },
];


const fmt = (n: number | null | undefined) =>
  n == null ? "—" : Number(n).toLocaleString("ru-RU");
const fmtDate = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleDateString("ru-RU") : "—";

interface Props {
  vehicleId: string;
  carrierExtId?: string | null;
  driverExtId?: string | null;
}

export function VehicleFreightsBlock({ vehicleId, carrierExtId, driverExtId }: Props) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [offerOpen, setOfferOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["vehicle-freights", vehicleId],
    queryFn: () =>
      freightsApi.list({ vehicle_id: vehicleId, exclude_archived: 1, limit: 50 }),
  });

  const statusMut = useMutation({
    mutationFn: ({
      id,
      status,
      comment,
    }: {
      id: string;
      status: FreightStatus;
      comment?: string;
    }) => {
      const payload: Record<string, unknown> = { dispatcher_status: status };
      if (comment) payload.comment = comment;
      return freightsApi.update(id, payload);
    },
    onSuccess: (_d, vars) => {
      const label = FREIGHT_STATUS_LABELS[vars.status] ?? "Обновлено";
      toast.success(`Отмечено: ${label}`);
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(vars.id);
        return next;
      });
      qc.invalidateQueries({ queryKey: ["vehicle-freights", vehicleId] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Ошибка"),
  });

  const rows = data?.rows ?? [];
  const selectableRows = useMemo(
    () =>
      rows.filter(
        (r) =>
          !r.carrier_request_id &&
          !INACTIVE.includes(String(r.dispatcher_status ?? "")) &&
          !["offered", "booked"].includes(String(r.dispatcher_status ?? "")),
      ),
    [rows],
  );

  const selectedFreights = useMemo(
    () => selectableRows.filter((r) => selected.has(r.id)),
    [selectableRows, selected],
  );

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const canBuildOffer =
    selectedFreights.length > 0 && !!carrierExtId;

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
            const isOffered = !!r.carrier_request_id;
            const blocked =
              isOffered ||
              ["archived", "cancelled", "rejected", "not_suitable", "offered", "booked"].includes(
                String(r.dispatcher_status ?? ""),
              );
            return (
              <li
                key={r.id}
                className="rounded border border-border bg-background p-2 text-xs"
              >
                <div className="flex items-start gap-2">
                  <div className="pt-0.5">
                    <Checkbox
                      checked={selected.has(r.id)}
                      onCheckedChange={() => !blocked && toggle(r.id)}
                      disabled={blocked}
                      aria-label="Выбрать груз"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-foreground">
                      {(r.loading_city ?? "—") + " → " + (r.unloading_city ?? "—")}
                    </div>
                    <div className="mt-0.5 text-muted-foreground">
                      {fmtDate(r.loading_date)} · {r.cargo_name ?? "—"} ·{" "}
                      {fmt(r.rate)} ₽
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      <Badge variant="secondary" className="text-[10px]">
                        {FREIGHT_STATUS_LABELS[status] ?? r.dispatcher_status ?? "—"}
                      </Badge>
                      {isOffered ? (
                        <Badge variant="outline" className="text-[10px]">
                          Уже предложен
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Button asChild size="sm" variant="ghost" className="h-7 px-2">
                      <a
                        href={`/dispatcher/freights?id=${r.id}`}
                        target="_blank"
                        rel="noreferrer"
                      >
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
      <Button
        size="sm"
        variant="default"
        className="mt-2 w-full"
        disabled={!canBuildOffer}
        onClick={() => setOfferOpen(true)}
        title={
          !carrierExtId
            ? "Транспорт не привязан к перевозчику"
            : selectedFreights.length === 0
              ? "Выберите хотя бы один груз"
              : undefined
        }
      >
        Собрать предложение рейса
        {selectedFreights.length > 0 ? ` (${selectedFreights.length})` : ""}
      </Button>

      {carrierExtId ? (
        <BuildOfferDialog
          open={offerOpen}
          onOpenChange={setOfferOpen}
          vehicleId={vehicleId}
          carrierExtId={carrierExtId}
          driverExtId={driverExtId ?? null}
          freights={selectedFreights}
        />
      ) : null}
    </div>
  );
}
