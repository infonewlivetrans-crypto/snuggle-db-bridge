import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { FileText, Download, Truck, Package, RotateCcw, AlertTriangle } from "lucide-react";
import * as XLSX from "xlsx";

export const Route = createFileRoute("/warehouse-report")({
  head: () => ({
    meta: [
      { title: "Отчёт склада — Радиус Трек" },
      { name: "description", content: "Простой отчёт склада за день: итоги и события." },
    ],
  }),
  component: WarehouseReportPage,
});

type EventType =
  | "vehicle_arrived"
  | "loading_started"
  | "loading_finished"
  | "vehicle_departed"
  | "return_arrived"
  | "return_accepted"
  | "inbound_arrived"
  | "inbound_accepted"
  | "problem";

const EVENT_LABEL: Record<EventType, string> = {
  vehicle_arrived: "Машина прибыла",
  loading_started: "Начата загрузка",
  loading_finished: "Загрузка завершена",
  vehicle_departed: "Машина уехала",
  return_arrived: "Возврат прибыл",
  return_accepted: "Возврат принят",
  inbound_arrived: "Поступление прибыло",
  inbound_accepted: "Товар принят",
  problem: "Проблема",
};

const EVENT_TONE: Record<EventType, string> = {
  vehicle_arrived: "bg-blue-100 text-blue-900 border-blue-200",
  loading_started: "bg-amber-100 text-amber-900 border-amber-200",
  loading_finished: "bg-indigo-100 text-indigo-900 border-indigo-200",
  vehicle_departed: "bg-emerald-100 text-emerald-900 border-emerald-200",
  return_arrived: "bg-orange-100 text-orange-900 border-orange-200",
  return_accepted: "bg-purple-100 text-purple-900 border-purple-200",
  inbound_arrived: "bg-cyan-100 text-cyan-900 border-cyan-200",
  inbound_accepted: "bg-teal-100 text-teal-900 border-teal-200",
  problem: "bg-destructive/10 text-destructive border-destructive/30",
};

type ReportEvent = {
  id: string;
  at: string; // ISO
  type: EventType;
  vehicle: string | null;
  driver: string | null;
  reference: string | null; // маршрут / заказ / поступление
  status: string | null;
  comment: string | null;
  actor: string | null;
  warehouse_id: string | null;
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function dayBoundaries(date: string) {
  const start = new Date(date + "T00:00:00");
  const end = new Date(date + "T23:59:59.999");
  return { fromIso: start.toISOString(), toIso: end.toISOString() };
}

function WarehouseReportPage() {
  const [date, setDate] = useState<string>(todayISO());
  const [warehouseId, setWarehouseId] = useState<string>("all");
  const [eventType, setEventType] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: warehouses } = useQuery({
    queryKey: ["wh-report-warehouses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses")
        .select("id,name,city")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Отгрузки на дату (по event_date)
  const { data: dockEvents } = useQuery({
    queryKey: ["wh-report-dock", date],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouse_dock_events")
        .select("*")
        .eq("event_date", date);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { fromIso, toIso } = dayBoundaries(date);

  // Возвраты: route_points с wh_return_* в течение дня
  const { data: returnPoints } = useQuery({
    queryKey: ["wh-report-returns", date],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("route_points")
        .select(
          "id, route_id, order_id, wh_return_status, wh_return_arrived_at, wh_return_accepted_at, wh_return_accepted_by, wh_return_status_changed_by, wh_return_status_changed_at, wh_return_comment, dp_return_warehouse_id",
        )
        .or(
          `and(wh_return_arrived_at.gte.${fromIso},wh_return_arrived_at.lte.${toIso}),and(wh_return_accepted_at.gte.${fromIso},wh_return_accepted_at.lte.${toIso})`,
        );
      if (error) throw error;
      return data ?? [];
    },
  });

  // Поступления: создание/прибытие/приёмка в течение дня
  const { data: inbounds } = useQuery({
    queryKey: ["wh-report-inbound", date],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inbound_shipments")
        .select("*")
        .or(
          `and(arrived_at.gte.${fromIso},arrived_at.lte.${toIso}),and(accepted_at.gte.${fromIso},accepted_at.lte.${toIso}),and(expected_at.gte.${fromIso},expected_at.lte.${toIso})`,
        );
      if (error) throw error;
      return data ?? [];
    },
  });

  // Связанные заказы для возвратов (для номера заказа)
  const returnOrderIds = useMemo(
    () => Array.from(new Set((returnPoints ?? []).map((p) => p.order_id).filter(Boolean) as string[])),
    [returnPoints],
  );
  const { data: returnOrders } = useQuery({
    queryKey: ["wh-report-return-orders", returnOrderIds],
    enabled: returnOrderIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_number")
        .in("id", returnOrderIds);
      if (error) throw error;
      return data ?? [];
    },
  });
  const orderNumberById = useMemo(
    () => Object.fromEntries((returnOrders ?? []).map((o) => [o.id, o.order_number])),
    [returnOrders],
  );

  // Имена складов
  const whById = useMemo(
    () =>
      Object.fromEntries(
        (warehouses ?? []).map((w) => [w.id, [w.name, w.city].filter(Boolean).join(" · ")]),
      ),
    [warehouses],
  );

  // === Сборка событий ===
  const events: ReportEvent[] = useMemo(() => {
    const out: ReportEvent[] = [];

    // 1. Отгрузки (warehouse_dock_events)
    for (const e of dockEvents ?? []) {
      const base = {
        vehicle: e.vehicle_plate ?? null,
        driver: e.driver_name ?? null,
        reference: e.route_number ? `Маршрут №${e.route_number}` : null,
        comment: e.comment ?? null,
        actor: null,
        warehouse_id: e.warehouse_id ?? null,
      };
      if (e.arrived_at)
        out.push({
          id: `${e.id}-arr`,
          at: e.arrived_at,
          type: "vehicle_arrived",
          status: "Прибыла",
          ...base,
        });
      if (e.loading_started_at)
        out.push({
          id: `${e.id}-ldst`,
          at: e.loading_started_at,
          type: "loading_started",
          status: "Загрузка",
          ...base,
        });
      if (e.loaded_at)
        out.push({
          id: `${e.id}-ld`,
          at: e.loaded_at,
          type: "loading_finished",
          status: "Загружена",
          ...base,
        });
      if (e.departed_at)
        out.push({
          id: `${e.id}-dep`,
          at: e.departed_at,
          type: "vehicle_departed",
          status: "Уехала",
          ...base,
        });
    }

    // 2. Возвраты
    for (const p of returnPoints ?? []) {
      const orderRef = p.order_id ? `Заказ ${orderNumberById[p.order_id] ?? p.order_id.slice(0, 6)}` : null;
      const wid = p.dp_return_warehouse_id ?? null;
      if (p.wh_return_arrived_at) {
        out.push({
          id: `${p.id}-ret-arr`,
          at: p.wh_return_arrived_at,
          type: "return_arrived",
          vehicle: null,
          driver: null,
          reference: orderRef,
          status: "Прибыл на склад",
          comment: p.wh_return_comment ?? null,
          actor: p.wh_return_status_changed_by ?? null,
          warehouse_id: wid,
        });
      }
      if (p.wh_return_accepted_at) {
        out.push({
          id: `${p.id}-ret-acc`,
          at: p.wh_return_accepted_at,
          type: "return_accepted",
          vehicle: null,
          driver: null,
          reference: orderRef,
          status: "Принят складом",
          comment: p.wh_return_comment ?? null,
          actor: p.wh_return_accepted_by ?? null,
          warehouse_id: wid,
        });
      }
    }

    // 3. Поступления
    for (const s of inbounds ?? []) {
      const ref = s.shipment_number ? `Поступление ${s.shipment_number}` : null;
      const base = {
        vehicle: s.vehicle_plate ?? null,
        driver: s.driver_name ?? null,
        reference: ref,
        warehouse_id: s.destination_warehouse_id ?? null,
      };
      if (s.arrived_at) {
        out.push({
          id: `${s.id}-in-arr`,
          at: s.arrived_at,
          type: "inbound_arrived",
          status: "Прибыло",
          comment: s.comment ?? null,
          actor: null,
          ...base,
        });
      }
      if (s.accepted_at) {
        out.push({
          id: `${s.id}-in-acc`,
          at: s.accepted_at,
          type: "inbound_accepted",
          status: "Принято",
          comment: s.warehouse_comment ?? s.comment ?? null,
          actor: s.accepted_by ?? null,
          ...base,
        });
      }
      if (s.status === "problem" && s.problem_reason) {
        out.push({
          id: `${s.id}-in-prob`,
          at: s.updated_at ?? s.arrived_at ?? s.expected_at ?? new Date().toISOString(),
          type: "problem",
          status: "Проблема",
          comment: [s.problem_reason, s.problem_comment].filter(Boolean).join(" — ") || null,
          actor: null,
          ...base,
        });
      }
    }

    return out.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [dockEvents, returnPoints, inbounds, orderNumberById]);

  // === Итоги ===
  const stats = useMemo(() => {
    const dock = (dockEvents ?? []).filter(
      (e) => warehouseId === "all" || e.warehouse_id === warehouseId,
    );
    const expectedTotal = dock.length;
    const arrived = dock.filter((e) => !!e.arrived_at).length;
    const loaded = dock.filter((e) => !!e.loaded_at).length;
    const departed = dock.filter((e) => !!e.departed_at).length;

    const rps = (returnPoints ?? []).filter(
      (p) => warehouseId === "all" || p.dp_return_warehouse_id === warehouseId,
    );
    const returnsExpected = rps.length;
    const returnsAccepted = rps.filter((p) => !!p.wh_return_accepted_at).length;

    const ins = (inbounds ?? []).filter(
      (s) => warehouseId === "all" || s.destination_warehouse_id === warehouseId,
    );
    const inboundExpected = ins.length;
    const inboundAccepted = ins.filter((s) => !!s.accepted_at).length;
    const problems = ins.filter((s) => s.status === "problem").length;

    return {
      expectedTotal,
      arrived,
      loaded,
      departed,
      returnsExpected,
      returnsAccepted,
      inboundExpected,
      inboundAccepted,
      problems,
    };
  }, [dockEvents, returnPoints, inbounds, warehouseId]);

  // === Фильтрация таблицы ===
  const filtered = useMemo(() => {
    return events.filter((e) => {
      if (warehouseId !== "all" && e.warehouse_id !== warehouseId) return false;
      if (eventType !== "all" && e.type !== eventType) return false;
      if (statusFilter !== "all" && e.status !== statusFilter) return false;
      return true;
    });
  }, [events, warehouseId, eventType, statusFilter]);

  const allStatuses = useMemo(
    () => Array.from(new Set(events.map((e) => e.status).filter(Boolean) as string[])).sort(),
    [events],
  );

  const downloadXlsx = () => {
    const rows = filtered.map((e) => ({
      "Дата и время": fmtDateTime(e.at),
      "Тип события": EVENT_LABEL[e.type],
      Машина: e.vehicle ?? "",
      Водитель: e.driver ?? "",
      "Маршрут / заказ": e.reference ?? "",
      Статус: e.status ?? "",
      Комментарий: e.comment ?? "",
      "Кто отметил": e.actor ?? "",
      Склад: e.warehouse_id ? whById[e.warehouse_id] ?? "" : "",
    }));

    const summary = [
      { Показатель: "Всего машин ожидалось", Значение: stats.expectedTotal },
      { Показатель: "Прибыло", Значение: stats.arrived },
      { Показатель: "Загружено", Значение: stats.loaded },
      { Показатель: "Уехало", Значение: stats.departed },
      { Показатель: "Возвратов ожидалось", Значение: stats.returnsExpected },
      { Показатель: "Возвратов принято", Значение: stats.returnsAccepted },
      { Показатель: "Поступлений ожидалось", Значение: stats.inboundExpected },
      { Показатель: "Поступлений принято", Значение: stats.inboundAccepted },
      { Показатель: "Проблем", Значение: stats.problems },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), "Итоги");
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        rows.length > 0
          ? rows
          : [
              {
                "Дата и время": "",
                "Тип события": "",
                Машина: "",
                Водитель: "",
                "Маршрут / заказ": "",
                Статус: "",
                Комментарий: "",
                "Кто отметил": "",
                Склад: "",
              },
            ],
      ),
      "События",
    );
    const whName = warehouseId === "all" ? "все" : (whById[warehouseId] ?? "склад").replace(/[^\wа-яА-Я0-9-]+/g, "_");
    XLSX.writeFile(wb, `warehouse-report_${date}_${whName}.xlsx`);
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            <h1 className="text-2xl font-semibold">Отчёт склада</h1>
          </div>
          <Button onClick={downloadXlsx}>
            <Download className="mr-2 h-4 w-4" />
            Скачать отчёт Excel
          </Button>
        </div>

        {/* Фильтры */}
        <div className="mb-6 flex flex-wrap items-end gap-3">
          <div>
            <Label className="mb-1 block text-xs text-muted-foreground">Дата</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-44"
            />
          </div>
          <div>
            <Label className="mb-1 block text-xs text-muted-foreground">Склад</Label>
            <Select value={warehouseId} onValueChange={setWarehouseId}>
              <SelectTrigger className="w-[240px]">
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
          <div>
            <Label className="mb-1 block text-xs text-muted-foreground">Тип события</Label>
            <Select value={eventType} onValueChange={setEventType}>
              <SelectTrigger className="w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все типы</SelectItem>
                {(Object.keys(EVENT_LABEL) as EventType[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {EVENT_LABEL[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1 block text-xs text-muted-foreground">Статус</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все статусы</SelectItem>
                {allStatuses.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Итоги */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard icon={Truck} label="Машин ожидалось" value={stats.expectedTotal} />
          <StatCard icon={Truck} label="Прибыло" value={stats.arrived} tone="blue" />
          <StatCard icon={Package} label="Загружено" value={stats.loaded} tone="indigo" />
          <StatCard icon={Truck} label="Уехало" value={stats.departed} tone="emerald" />
          <StatCard icon={RotateCcw} label="Возвратов ожидалось" value={stats.returnsExpected} tone="orange" />
          <StatCard icon={RotateCcw} label="Возвратов принято" value={stats.returnsAccepted} tone="purple" />
          <StatCard icon={Package} label="Поступлений ожидалось" value={stats.inboundExpected} tone="cyan" />
          <StatCard icon={Package} label="Поступлений принято" value={stats.inboundAccepted} tone="teal" />
          <StatCard icon={AlertTriangle} label="Проблем" value={stats.problems} tone="destructive" />
        </div>

        {/* Таблица событий */}
        <div className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">Дата и время</TableHead>
                <TableHead>Тип события</TableHead>
                <TableHead>Машина</TableHead>
                <TableHead>Водитель</TableHead>
                <TableHead>Маршрут / заказ</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Комментарий</TableHead>
                <TableHead>Кто отметил</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                    Событий нет
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap text-sm">{fmtDateTime(e.at)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={EVENT_TONE[e.type]}>
                        {EVENT_LABEL[e.type]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{e.vehicle ?? "—"}</TableCell>
                    <TableCell className="text-sm">{e.driver ?? "—"}</TableCell>
                    <TableCell className="text-sm">{e.reference ?? "—"}</TableCell>
                    <TableCell className="text-sm">{e.status ?? "—"}</TableCell>
                    <TableCell className="max-w-[260px] text-sm text-muted-foreground">
                      {e.comment ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm">{e.actor ?? "—"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </main>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  tone?: "blue" | "indigo" | "emerald" | "orange" | "purple" | "cyan" | "teal" | "destructive";
}) {
  const toneCls =
    tone === "blue"
      ? "text-blue-700 dark:text-blue-300"
      : tone === "indigo"
        ? "text-indigo-700 dark:text-indigo-300"
        : tone === "emerald"
          ? "text-emerald-700 dark:text-emerald-300"
          : tone === "orange"
            ? "text-orange-700 dark:text-orange-300"
            : tone === "purple"
              ? "text-purple-700 dark:text-purple-300"
              : tone === "cyan"
                ? "text-cyan-700 dark:text-cyan-300"
                : tone === "teal"
                  ? "text-teal-700 dark:text-teal-300"
                  : tone === "destructive"
                    ? "text-destructive"
                    : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold ${toneCls}`}>{value}</div>
    </div>
  );
}
