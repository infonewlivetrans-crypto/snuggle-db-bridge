import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Clock, Truck, PackageOpen, PackageCheck, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useState } from "react";

export type PointTimes = {
  dp_planned_arrival_at: string | null;
  dp_actual_arrival_at: string | null;
  dp_unload_started_at: string | null;
  dp_unload_finished_at: string | null;
  dp_finished_at: string | null;
};

type Props = {
  routePointId: string;
  times: PointTimes;
};

function toLocalDT(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function diffMinutes(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000);
}

function fmtMin(min: number | null): string {
  if (min == null) return "—";
  if (min < 0) return `−${fmtMin(-min)}`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h} ч ${m} мин` : `${m} мин`;
}

export function PointTimeTracker({ routePointId, times }: Props) {
  const qc = useQueryClient();
  const [planned, setPlanned] = useState(toLocalDT(times.dp_planned_arrival_at));

  useEffect(() => {
    setPlanned(toLocalDT(times.dp_planned_arrival_at));
  }, [routePointId, times.dp_planned_arrival_at]);

  const update = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { error } = await (
        supabase.from("route_points") as unknown as {
          update: (p: Record<string, unknown>) => {
            eq: (c: string, v: string) => Promise<{ error: Error | null }>;
          };
        }
      )
        .update(payload)
        .eq("id", routePointId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["delivery-route-points"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const stamp = (field: keyof PointTimes) => {
    update.mutate({ [field]: new Date().toISOString() });
  };

  const savePlanned = () => {
    update.mutate({
      dp_planned_arrival_at: planned ? new Date(planned).toISOString() : null,
    });
    toast.success("Плановое время сохранено");
  };

  const unloadDuration = diffMinutes(times.dp_unload_started_at, times.dp_unload_finished_at);
  const lateMin = diffMinutes(times.dp_planned_arrival_at, times.dp_actual_arrival_at);
  const isLate = lateMin != null && lateMin > 0;

  return (
    <div className="space-y-3 rounded-md border border-border bg-muted/20 p-3">
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Время по точке</span>
      </div>

      {/* Плановое время */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[180px]">
          <div className="mb-1 text-xs text-muted-foreground">Плановое прибытие</div>
          <Input
            type="datetime-local"
            value={planned}
            onChange={(e) => setPlanned(e.target.value)}
            className="h-8"
          />
        </div>
        <Button size="sm" variant="outline" className="h-8" onClick={savePlanned}>
          Сохранить
        </Button>
      </div>

      {/* Кнопки фиксации */}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={times.dp_actual_arrival_at ? "outline" : "default"}
          className="h-8 gap-1"
          onClick={() => stamp("dp_actual_arrival_at")}
        >
          <Truck className="h-3.5 w-3.5" />
          Прибыл
        </Button>
        <Button
          size="sm"
          variant={times.dp_unload_started_at ? "outline" : "default"}
          className="h-8 gap-1"
          onClick={() => stamp("dp_unload_started_at")}
        >
          <PackageOpen className="h-3.5 w-3.5" />
          Начал разгрузку
        </Button>
        <Button
          size="sm"
          variant={times.dp_unload_finished_at ? "outline" : "default"}
          className="h-8 gap-1"
          onClick={() => stamp("dp_unload_finished_at")}
        >
          <PackageCheck className="h-3.5 w-3.5" />
          Завершил разгрузку
        </Button>
        <Button
          size="sm"
          variant={times.dp_finished_at ? "outline" : "default"}
          className="h-8 gap-1"
          onClick={() => stamp("dp_finished_at")}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          Завершил точку
        </Button>
      </div>

      {/* Отображение времён */}
      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
        <TimeRow label="План. прибытие" value={fmtTime(times.dp_planned_arrival_at)} />
        <TimeRow
          label="Факт. прибытие"
          value={fmtTime(times.dp_actual_arrival_at)}
          highlight={isLate ? "red" : undefined}
        />
        <TimeRow label="Начало разгрузки" value={fmtTime(times.dp_unload_started_at)} />
        <TimeRow label="Конец разгрузки" value={fmtTime(times.dp_unload_finished_at)} />
        <TimeRow label="Завершение точки" value={fmtTime(times.dp_finished_at)} />
        <TimeRow label="Длительность разгрузки" value={fmtMin(unloadDuration)} />
      </div>

      {isLate && (
        <div className="flex items-center gap-1.5 rounded-md border border-red-500/30 bg-red-500/5 px-2 py-1.5 text-xs text-red-700 dark:text-red-300">
          <AlertTriangle className="h-3.5 w-3.5" />
          Опоздание: {fmtMin(lateMin)}
        </div>
      )}
    </div>
  );
}

function TimeRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: "red";
}) {
  const cls =
    highlight === "red"
      ? "text-red-700 dark:text-red-300 font-medium"
      : "text-foreground";
  return (
    <div className="rounded border border-border bg-card px-2 py-1.5">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-0.5 font-mono ${cls}`}>{value}</div>
    </div>
  );
}
