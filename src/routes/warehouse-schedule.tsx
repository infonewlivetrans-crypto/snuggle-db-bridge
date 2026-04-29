import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ClipboardList, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/warehouse-schedule")({
  head: () => ({
    meta: [
      { title: "График отгрузок — Радиус Трек" },
      { name: "description", content: "График отгрузок по складу с проверкой рабочего времени." },
    ],
  }),
  component: WarehouseSchedulePage,
});

type DayCfg = { enabled: boolean; open: string; close: string };
type WorkingHours = Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", DayCfg>;
type Break = { label: string; start: string; end: string };

const DAY_KEYS: (keyof WorkingHours)[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

const STATUS_LABEL: Record<string, string> = {
  planned: "Запланирован",
  pending_approval: "На согласовании",
  approved: "Согласован",
  issued: "Выдан водителю",
  in_progress: "В пути",
  completed: "Завершён",
  cancelled: "Отменён",
};

function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function formatTime(iso: string | null | undefined, fallback?: string | null) {
  if (iso) {
    const d = new Date(iso);
    return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  }
  if (fallback) return fallback.slice(0, 5);
  return "—";
}

function timeToMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function isOutsideWorkingTime(
  isoOrTime: string | null | undefined,
  fallbackTime: string | null | undefined,
  date: string,
  hours?: WorkingHours | null,
  breaks?: Break[] | null,
): boolean {
  if (!hours) return false;
  let h: number, m: number, dow: number;
  if (isoOrTime) {
    const d = new Date(isoOrTime);
    h = d.getHours();
    m = d.getMinutes();
    dow = d.getDay();
  } else if (fallbackTime) {
    [h, m] = fallbackTime.split(":").map(Number);
    dow = new Date(date + "T00:00:00").getDay();
  } else {
    return false;
  }
  const dayKey = DAY_KEYS[dow];
  const cfg = hours[dayKey];
  if (!cfg || !cfg.enabled) return true;
  const minutes = h * 60 + m;
  if (minutes < timeToMinutes(cfg.open) || minutes > timeToMinutes(cfg.close)) return true;
  if (breaks) {
    for (const b of breaks) {
      if (minutes >= timeToMinutes(b.start) && minutes < timeToMinutes(b.end)) return true;
    }
  }
  return false;
}

function WarehouseSchedulePage() {
  const [date, setDate] = useState<string>(todayISO());
  const [warehouseId, setWarehouseId] = useState<string>("all");

  const { data: warehouses } = useQuery({
    queryKey: ["warehouses-for-schedule"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses")
        .select("id,name,city,working_hours,breaks")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: routes, isLoading } = useQuery({
    queryKey: ["warehouse-schedule", date, warehouseId],
    queryFn: async () => {
      let q = supabase
        .from("routes")
        .select(
          "id,route_number,route_date,planned_departure_at,departure_time,status,driver_name,driver_id,vehicle_id,warehouse_id,destination_warehouse_id,comment,request_type",
        )
        .eq("route_date", date)
        .order("planned_departure_at", { ascending: true, nullsFirst: false });
      if (warehouseId !== "all") q = q.eq("warehouse_id", warehouseId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const driverIds = useMemo(
    () => Array.from(new Set((routes ?? []).map((r) => r.driver_id).filter(Boolean) as string[])),
    [routes],
  );
  const vehicleIds = useMemo(
    () => Array.from(new Set((routes ?? []).map((r) => r.vehicle_id).filter(Boolean) as string[])),
    [routes],
  );
  const destIds = useMemo(
    () =>
      Array.from(
        new Set((routes ?? []).map((r) => r.destination_warehouse_id).filter(Boolean) as string[]),
      ),
    [routes],
  );

  const { data: drivers } = useQuery({
    queryKey: ["sched-drivers", driverIds],
    enabled: driverIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("drivers").select("id,full_name").in("id", driverIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: vehicles } = useQuery({
    queryKey: ["sched-vehicles", vehicleIds],
    enabled: vehicleIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicles")
        .select("id,plate_number,brand,model")
        .in("id", vehicleIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: destWh } = useQuery({
    queryKey: ["sched-dest-wh", destIds],
    enabled: destIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("warehouses").select("id,name,city").in("id", destIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const driverById = useMemo(
    () => Object.fromEntries((drivers ?? []).map((d) => [d.id, d.full_name])),
    [drivers],
  );
  const vehicleById = useMemo(
    () =>
      Object.fromEntries(
        (vehicles ?? []).map((v) => [
          v.id,
          [v.brand, v.model].filter(Boolean).join(" ") + (v.plate_number ? ` · ${v.plate_number}` : ""),
        ]),
      ),
    [vehicles],
  );
  const destNameById = useMemo(
    () =>
      Object.fromEntries(
        (destWh ?? []).map((w) => [w.id, [w.name, w.city].filter(Boolean).join(" · ")]),
      ),
    [destWh],
  );
  const whById = useMemo(
    () => Object.fromEntries((warehouses ?? []).map((w) => [w.id, w])),
    [warehouses],
  );

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-2">
          <ClipboardList className="h-5 w-5" />
          <h1 className="text-2xl font-semibold">График отгрузок</h1>
        </div>

        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div>
            <Label className="mb-1 block text-xs text-muted-foreground">Дата</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
          </div>
          <div>
            <Label className="mb-1 block text-xs text-muted-foreground">Склад</Label>
            <Select value={warehouseId} onValueChange={setWarehouseId}>
              <SelectTrigger className="w-[260px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все склады</SelectItem>
                {(warehouses ?? []).map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name} {w.city ? `· ${w.city}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Дата</TableHead>
                <TableHead>Время</TableHead>
                <TableHead>Направление</TableHead>
                <TableHead>Маршрут</TableHead>
                <TableHead>Водитель</TableHead>
                <TableHead>Машина</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Комментарий</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                    Загрузка…
                  </TableCell>
                </TableRow>
              ) : (routes ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                    Отгрузок на выбранную дату нет
                  </TableCell>
                </TableRow>
              ) : (
                (routes ?? []).map((r) => {
                  const wh = r.warehouse_id ? (whById[r.warehouse_id] as any) : null;
                  const outside = isOutsideWorkingTime(
                    r.planned_departure_at,
                    r.departure_time,
                    r.route_date,
                    wh?.working_hours as WorkingHours | undefined,
                    wh?.breaks as Break[] | undefined,
                  );
                  const direction =
                    r.request_type !== "client_delivery" && r.destination_warehouse_id
                      ? `→ ${destNameById[r.destination_warehouse_id] ?? "Склад"}`
                      : "Доставка клиентам";
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap">{r.route_date}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span>{formatTime(r.planned_departure_at, r.departure_time)}</span>
                          {outside && (
                            <Badge variant="destructive" className="gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              вне раб. времени
                            </Badge>
                          )}
                        </div>
                        {outside && (
                          <div className="mt-1 text-xs text-destructive">
                            Отгрузка вне рабочего времени склада
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{wh ? `${wh.name}` : "—"}</div>
                        <div className="text-xs text-muted-foreground">{direction}</div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{r.route_number}</TableCell>
                      <TableCell>
                        {(r.driver_id && driverById[r.driver_id]) || r.driver_name || "—"}
                      </TableCell>
                      <TableCell>{(r.vehicle_id && vehicleById[r.vehicle_id]) || "—"}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {STATUS_LABEL[r.status as string] ?? r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[260px] text-sm text-muted-foreground">
                        {r.comment || "—"}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </main>
    </div>
  );
}
