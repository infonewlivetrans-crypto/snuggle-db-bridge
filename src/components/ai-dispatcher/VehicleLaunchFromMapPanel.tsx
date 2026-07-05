// Экран запуска AI-поиска с параметрами машины (или нескольких машин),
// пришедшими из карты/списка машин. Ничего не запускает автоматически —
// диспетчер жмёт «Начать поиск» и подтверждает предупреждение о дублях.

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueries } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle, ChevronRight, MapPin, Search, Truck } from "lucide-react";
import { apiGetAuth, apiPost } from "@/lib/api-client";

interface VehicleSnapshotResponse {
  snapshot: {
    vehicle_id: string | null;
    vehicle_kind: string | null;
    body_type: string | null;
    loading_types: string[] | null;
    capacity: {
      payload_kg: number | null;
      volume_m3: number | null;
      length_m: number | null;
      width_m: number | null;
      height_m: number | null;
    };
    position: { current_city: string | null; home_city: string | null };
    ready_to_cities: string[] | null;
    ready_date: string | null;
    driver: { full_name: string | null };
    carrier: { name: string | null };
    dispatcher_comment: string | null;
  };
  missing_fields: string[];
  active_tasks: Array<{
    id: string;
    status: string;
    search_mode: string;
    destination_city: string | null;
    created_at: string;
  }>;
}

const MISSING_LABELS: Record<string, string> = {
  vehicle_kind: "Тип ТС",
  body_type: "Тип кузова",
  "capacity.payload_kg": "Грузоподъёмность",
  "position.current_city_or_home_city": "Город подачи",
};

function fmtT(kg: number | null): string {
  if (kg == null) return "—";
  return `${(kg / 1000).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} т`;
}

export interface VehicleLaunchPanelProps {
  vehicleIds: string[];
  source: string | null;
  onCreated: (taskId: string) => void;
}

export function VehicleLaunchFromMapPanel({ vehicleIds, source, onCreated }: VehicleLaunchPanelProps) {
  const navigate = useNavigate();
  const queries = useQueries({
    queries: vehicleIds.map((id) => ({
      queryKey: ["ai-disp-vehicle-snapshot", id],
      queryFn: () => apiGetAuth<VehicleSnapshotResponse>(
        `/api/dispatcher/ai-dispatcher/vehicle-snapshot/${id}`),
      staleTime: 60_000,
    })),
  });

  const isMulti = vehicleIds.length > 1;
  const loading = queries.some((q) => q.isLoading);
  const snapshots = queries.map((q) => q.data ?? null);
  const anyMissing = snapshots.some((s) => s && s.missing_fields.length > 0);
  const anyActive = snapshots.some((s) => s && s.active_tasks.length > 0);

  const [destination, setDestination] = useState("");
  const [targetPrice, setTargetPrice] = useState<string>("");
  const [targetPricePerKm, setTargetPricePerKm] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const activeConflicts = useMemo(
    () =>
      snapshots
        .flatMap((s, i) => (s ? s.active_tasks.map((t) => ({ vehicleId: vehicleIds[i], task: t })) : [])),
    [snapshots, vehicleIds],
  );

  const startSingle = useMutation({
    mutationFn: async () => {
      const s = snapshots[0];
      if (!s) throw new Error("Нет данных о машине");
      const payload = {
        search_mode: "main_load",
        vehicle_source: "existing_vehicle",
        vehicle_id: s.snapshot.vehicle_id,
        start_city: s.snapshot.position.current_city ?? s.snapshot.position.home_city,
        destination_city: destination || null,
        vehicle_params_json: s.snapshot,
        target_total_price: targetPrice ? Number(targetPrice) : null,
        target_price_per_km: targetPricePerKm ? Number(targetPricePerKm) : null,
        notes: notes || null,
      };
      const res = await apiPost<{ row: { id: string } }>(
        "/api/dispatcher/ai-dispatcher/tasks", payload);
      return res.row.id;
    },
    onSuccess: (id) => { toast.success("Задача создана"); onCreated(id); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Ошибка"),
  });

  const startMulti = useMutation({
    mutationFn: async () => {
      const vehicles = snapshots
        .filter((s): s is VehicleSnapshotResponse => Boolean(s))
        .map((s) => ({
          vehicle_id: s.snapshot.vehicle_id,
          start_city: s.snapshot.position.current_city ?? s.snapshot.position.home_city,
          destination_city: destination || null,
          vehicle_params_json: s.snapshot,
        }));
      if (vehicles.length === 0) throw new Error("Нет доступных машин");
      const res = await apiPost<{ group_id: string; task_ids: string[] }>(
        "/api/dispatcher/ai-dispatcher/multi-vehicle/start",
        { vehicles, refresh_interval_seconds: 60 });
      return res;
    },
    onSuccess: (r) => {
      toast.success(`Запущено задач: ${r.task_ids.length}`);
      if (r.task_ids[0]) onCreated(r.task_ids[0]);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Ошибка"),
  });

  const submit = () => {
    if (activeConflicts.length > 0) { setConfirmOpen(true); return; }
    if (isMulti) startMulti.mutate(); else startSingle.mutate();
  };
  const confirmAndStart = () => {
    setConfirmOpen(false);
    if (isMulti) startMulti.mutate(); else startSingle.mutate();
  };

  if (loading) {
    return <Card className="p-6 text-sm text-muted-foreground">Загружаем параметры машин…</Card>;
  }

  return (
    <Card className="p-4 border-primary/40">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Truck className="h-4 w-4 text-primary" />
          Запуск AI-поиска
          {source ? <Badge variant="outline" className="text-[10px]">{source}</Badge> : null}
          <Badge variant="secondary" className="text-[10px]">
            {isMulti ? `Машин: ${vehicleIds.length}` : "1 машина"}
          </Badge>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => navigate({ to: "/dispatcher/ai-dispatcher", search: {} as never })}
        >
          Отмена
        </Button>
      </div>

      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
        {snapshots.map((s, i) => (
          <VehicleSnapshotRow key={vehicleIds[i]} id={vehicleIds[i]} data={s} />
        ))}
      </div>

      {anyMissing && (
        <div className="mt-3 rounded border border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs">
          <div className="flex items-center gap-1 text-amber-900 dark:text-amber-100 font-medium">
            <AlertTriangle className="h-3.5 w-3.5" /> Не хватает данных
          </div>
          <div className="mt-1 text-amber-900/80 dark:text-amber-100/80">
            Snapshot задачи будет неполным. Заполните карточку машины отдельно, чтобы фильтры
            подставлялись корректно в следующий раз.
          </div>
        </div>
      )}

      {anyActive && (
        <div className="mt-3 rounded border border-orange-300/60 bg-orange-50 dark:bg-orange-950/30 px-3 py-2 text-xs">
          <div className="flex items-center gap-1 text-orange-900 dark:text-orange-100 font-medium">
            <AlertTriangle className="h-3.5 w-3.5" /> Для части машин уже идёт поиск
          </div>
          <ul className="mt-1 space-y-0.5 text-orange-900/80 dark:text-orange-100/80">
            {activeConflicts.map(({ vehicleId, task }) => (
              <li key={`${vehicleId}-${task.id}`} className="flex items-center gap-1">
                <ChevronRight className="h-3 w-3" />
                <Link
                  to="/dispatcher/ai-dispatcher"
                  search={{} as never}
                  className="underline"
                  onClick={() => onCreated(task.id)}
                >
                  Открыть существующую задачу ({task.status})
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
        <div>
          <Label className="text-xs">Направление (город выгрузки)</Label>
          <Input className="h-8" value={destination} onChange={(e) => setDestination(e.target.value)}
            placeholder="например, Москва" />
        </div>
        <div>
          <Label className="text-xs">Целевая ставка ₽</Label>
          <Input className="h-8" type="number" value={targetPrice}
            onChange={(e) => setTargetPrice(e.target.value)} placeholder="0" />
        </div>
        <div>
          <Label className="text-xs">Цель ₽/км</Label>
          <Input className="h-8" type="number" value={targetPricePerKm}
            onChange={(e) => setTargetPricePerKm(e.target.value)} placeholder="0" />
        </div>
        <div className="sm:col-span-2">
          <Label className="text-xs">Заметки</Label>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <Button
          size="sm"
          disabled={startSingle.isPending || startMulti.isPending}
          onClick={submit}
        >
          <Search className="h-3.5 w-3.5 mr-1" />
          {isMulti ? `Начать поиск для ${vehicleIds.length} машин` : "Начать поиск"}
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Активный поиск уже существует</AlertDialogTitle>
            <AlertDialogDescription>
              Для части выбранных машин уже идут задачи поиска. Создать ещё одну параллельную задачу?
              Старые задачи не будут остановлены автоматически.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={confirmAndStart}>Создать новую</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function VehicleSnapshotRow({ id, data }: { id: string; data: VehicleSnapshotResponse | null }) {
  if (!data) {
    return (
      <div className="rounded border border-destructive/40 bg-destructive/5 px-2 py-1.5 text-xs">
        Машина {id.slice(0, 8)} — не найдена или недоступна
      </div>
    );
  }
  const s = data.snapshot;
  const city = s.position.current_city ?? s.position.home_city ?? "—";
  return (
    <div className="rounded border border-border bg-card px-2 py-1.5 text-xs">
      <div className="flex items-center justify-between gap-2">
        <div className="font-medium truncate">
          {s.vehicle_kind ?? "ТС"} · {s.body_type ?? "—"} · {fmtT(s.capacity.payload_kg)}
        </div>
        {data.active_tasks.length > 0 && (
          <Badge variant="destructive" className="text-[10px]">Активный поиск</Badge>
        )}
      </div>
      <div className="mt-0.5 flex items-center gap-1 text-muted-foreground">
        <MapPin className="h-3 w-3" />
        {city}
        {s.ready_to_cities?.length ? ` → ${s.ready_to_cities.slice(0, 3).join(", ")}` : ""}
      </div>
      {data.missing_fields.length > 0 && (
        <div className="mt-0.5 text-amber-700 dark:text-amber-300">
          Не хватает: {data.missing_fields.map((f) => MISSING_LABELS[f] ?? f).join(", ")}
        </div>
      )}
    </div>
  );
}
