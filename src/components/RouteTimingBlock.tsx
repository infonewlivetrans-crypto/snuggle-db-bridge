import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Clock, Gauge, Timer, Route as RouteIcon, Save, Calculator } from "lucide-react";

type Props = {
  routeId: string;
  totalDistanceKm: number;
  totalDurationMinutes: number;
  avgSpeedKmh: number;
  defaultServiceMinutes: number;
  pointsCount: number;
  plannedDepartureAt: string | null;
};

function fmtHm(min: number) {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r} мин`;
  return `${h} ч ${r} мин`;
}

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function RouteTimingBlock(props: Props) {
  const qc = useQueryClient();

  const [speed, setSpeed] = useState<string>(String(props.avgSpeedKmh ?? 35));
  const [service, setService] = useState<string>(String(props.defaultServiceMinutes ?? 20));
  const [departure, setDeparture] = useState<string>(toLocalInput(props.plannedDepartureAt));

  useEffect(() => {
    setSpeed(String(props.avgSpeedKmh ?? 35));
    setService(String(props.defaultServiceMinutes ?? 20));
    setDeparture(toLocalInput(props.plannedDepartureAt));
  }, [props.avgSpeedKmh, props.defaultServiceMinutes, props.plannedDepartureAt]);

  const driveMinutes = props.avgSpeedKmh > 0
    ? Math.round((Number(props.totalDistanceKm) / Number(props.avgSpeedKmh)) * 60)
    : 0;
  const unloadMinutes = props.pointsCount * Number(props.defaultServiceMinutes ?? 0);

  const dirty =
    Number(speed) !== Number(props.avgSpeedKmh) ||
    Number(service) !== Number(props.defaultServiceMinutes) ||
    toLocalInput(props.plannedDepartureAt) !== departure;

  const save = useMutation({
    mutationFn: async () => {
      const sp = Number(speed);
      const sv = Number(service);
      if (!Number.isFinite(sp) || sp <= 0) throw new Error("Скорость должна быть > 0");
      if (!Number.isFinite(sv) || sv < 0) throw new Error("Время разгрузки должно быть ≥ 0");
      const { error } = await supabase
        .from("routes")
        .update({
          avg_speed_kmh: sp,
          default_service_minutes: sv,
          planned_departure_at: departure ? new Date(departure).toISOString() : null,
        })
        .eq("id", props.routeId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Параметры маршрута обновлены, время пересчитано");
      qc.invalidateQueries({ queryKey: ["route", props.routeId] });
      qc.invalidateQueries({ queryKey: ["route-points", props.routeId] });
    },
    onError: (e: Error) => toast.error(e.message ?? "Не удалось сохранить"),
  });

  return (
    <div className="mb-4 overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-secondary/40 px-4 py-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Calculator className="h-4 w-4 text-primary" />
          Расстояние и время
        </div>
        <span className="text-xs text-muted-foreground">
          Простой расчёт: расстояние ÷ скорость + разгрузка
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 p-4 text-sm sm:grid-cols-4">
        <div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <RouteIcon className="h-3 w-3" /> Общее расстояние
          </div>
          <div className="font-semibold text-foreground">
            {Number(props.totalDistanceKm).toFixed(1)} км
          </div>
        </div>
        <div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Timer className="h-3 w-3" /> В пути
          </div>
          <div className="font-semibold text-foreground">{fmtHm(driveMinutes)}</div>
        </div>
        <div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" /> На разгрузку
          </div>
          <div className="font-semibold text-foreground">{fmtHm(unloadMinutes)}</div>
          <div className="text-xs text-muted-foreground">
            {props.pointsCount} × {props.defaultServiceMinutes} мин
          </div>
        </div>
        <div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Timer className="h-3 w-3" /> Всего по маршруту
          </div>
          <div className="font-semibold text-foreground">
            {fmtHm(props.totalDurationMinutes || driveMinutes + unloadMinutes)}
          </div>
        </div>
      </div>

      <div className="grid gap-3 border-t border-border p-4 sm:grid-cols-3">
        <div className="space-y-1">
          <Label className="text-xs">
            <Clock className="mr-1 inline h-3 w-3" /> Время начала маршрута
          </Label>
          <Input
            type="datetime-local"
            value={departure}
            onChange={(e) => setDeparture(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">
            <Gauge className="mr-1 inline h-3 w-3" /> Средняя скорость, км/ч
          </Label>
          <Input
            type="number"
            min="1"
            step="1"
            value={speed}
            onChange={(e) => setSpeed(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">
            <Timer className="mr-1 inline h-3 w-3" /> Среднее время разгрузки на точку, мин
          </Label>
          <Input
            type="number"
            min="0"
            step="1"
            value={service}
            onChange={(e) => setService(e.target.value)}
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border bg-secondary/20 px-4 py-2">
        <Button
          size="sm"
          onClick={() => save.mutate()}
          disabled={!dirty || save.isPending}
          className="gap-1.5"
        >
          <Save className="h-3.5 w-3.5" />
          Сохранить и пересчитать
        </Button>
      </div>
    </div>
  );
}
