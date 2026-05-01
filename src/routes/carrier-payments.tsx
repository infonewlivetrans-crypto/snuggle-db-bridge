import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Wallet, Hash, Calendar, ChevronRight, AlertTriangle } from "lucide-react";
import {
  PAYOUT_STATUS_LABELS,
  PAYOUT_STATUS_STYLES,
  isOverdue,
  type CarrierPayoutStatus,
} from "@/components/CarrierPayoutBlock";

export const Route = createFileRoute("/carrier-payments")({
  head: () => ({
    meta: [
      { title: "Оплаты перевозчикам — Радиус Трек" },
      { name: "description", content: "Контроль оплат перевозчикам по рейсам" },
    ],
  }),
  component: CarrierPaymentsPage,
});

const FILTERS: Array<{ key: CarrierPayoutStatus | "all" | "overdue"; label: string }> = [
  { key: "all", label: "Все" },
  { key: "to_pay", label: "К оплате" },
  { key: "scheduled", label: "Запланировано" },
  { key: "partially_paid", label: "Частично" },
  { key: "paid", label: "Оплачено" },
  { key: "cancelled", label: "Отменено" },
  { key: "overdue", label: "Просроченные" },
];

type Row = {
  id: string;
  route_number: string;
  route_date: string;
  driver_name: string | null;
  carrier_id: string | null;
  vehicle_id: string | null;
  carrier_cost: number | null;
  carrier_payout_status: CarrierPayoutStatus | null;
  carrier_payout_scheduled_date: string | null;
  carrier_payout_paid_amount: number | null;
  carrier_payout_paid_at: string | null;
  carrier_payout_comment: string | null;
};

type Carrier = { id: string; company_name: string };
type Vehicle = { id: string; brand: string | null; model: string | null; license_plate: string | null };

function CarrierPaymentsPage() {
  const [filter, setFilter] = useState<CarrierPayoutStatus | "all" | "overdue">("all");

  const { data: rows, isLoading } = useQuery({
    queryKey: ["carrier-payments", filter],
    queryFn: async (): Promise<Row[]> => {
      let q = supabase
        .from("routes")
        .select(
          "id, route_number, route_date, driver_name, carrier_id, vehicle_id, carrier_cost, carrier_payout_status, carrier_payout_scheduled_date, carrier_payout_paid_amount, carrier_payout_paid_at, carrier_payout_comment",
        )
        .not("carrier_payout_status", "is", null)
        .order("carrier_payout_scheduled_date", { ascending: true, nullsFirst: false })
        .order("route_date", { ascending: false })
        .limit(300);
      if (filter !== "all" && filter !== "overdue") {
        q = q.eq("carrier_payout_status", filter);
      }
      const { data, error } = await q;
      if (error) throw error;
      let result = (data ?? []) as unknown as Row[];
      if (filter === "overdue") {
        result = result.filter((r) => isOverdue(r.carrier_payout_status, r.carrier_payout_scheduled_date));
      }
      return result;
    },
  });

  const carrierIds = useMemo(
    () => Array.from(new Set((rows ?? []).map((r) => r.carrier_id).filter(Boolean) as string[])),
    [rows],
  );
  const vehicleIds = useMemo(
    () => Array.from(new Set((rows ?? []).map((r) => r.vehicle_id).filter(Boolean) as string[])),
    [rows],
  );

  const { data: carriers } = useQuery({
    enabled: carrierIds.length > 0,
    queryKey: ["carrier-payments-carriers", carrierIds.join(",")],
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase
        .from("carriers")
        .select("id, company_name")
        .in("id", carrierIds);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const c of (data ?? []) as Carrier[]) map[c.id] = c.company_name;
      return map;
    },
  });

  const { data: vehicles } = useQuery({
    enabled: vehicleIds.length > 0,
    queryKey: ["carrier-payments-vehicles", vehicleIds.join(",")],
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase
        .from("vehicles")
        .select("id, brand, model, license_plate")
        .in("id", vehicleIds);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const v of (data ?? []) as Vehicle[]) {
        map[v.id] = [v.brand, v.model, v.license_plate].filter(Boolean).join(" ");
      }
      return map;
    },
  });

  // Stats — query unfiltered to get accurate totals
  const { data: stats } = useQuery({
    queryKey: ["carrier-payments-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("routes")
        .select(
          "carrier_cost, carrier_payout_status, carrier_payout_scheduled_date, carrier_payout_paid_amount",
        )
        .not("carrier_payout_status", "is", null)
        .limit(1000);
      if (error) throw error;
      const items = (data ?? []) as Array<{
        carrier_cost: number | null;
        carrier_payout_status: CarrierPayoutStatus | null;
        carrier_payout_scheduled_date: string | null;
        carrier_payout_paid_amount: number | null;
      }>;
      let toPay = 0,
        paid = 0,
        pending = 0,
        overdueSum = 0,
        overdueCount = 0;
      for (const r of items) {
        const cost = Number(r.carrier_cost ?? 0);
        const paidAmt = Number(r.carrier_payout_paid_amount ?? 0);
        if (r.carrier_payout_status === "paid") paid += paidAmt || cost;
        else if (r.carrier_payout_status === "partially_paid") {
          paid += paidAmt;
          pending += Math.max(0, cost - paidAmt);
        } else if (r.carrier_payout_status === "to_pay") toPay += cost;
        else if (r.carrier_payout_status === "scheduled") pending += cost;
        if (isOverdue(r.carrier_payout_status, r.carrier_payout_scheduled_date)) {
          overdueSum += Math.max(0, cost - paidAmt);
          overdueCount += 1;
        }
      }
      return { toPay, paid, pending, overdueSum, overdueCount };
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-3">
          <Wallet className="h-5 w-5 text-primary" />
          <span className="font-semibold">Оплаты перевозчикам</span>
        </div>
      </div>

      <main className="mx-auto max-w-5xl space-y-4 px-4 py-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="К оплате" value={stats?.toPay ?? 0} tone="violet" />
          <StatCard label="В ожидании" value={stats?.pending ?? 0} tone="blue" />
          <StatCard label="Оплачено" value={stats?.paid ?? 0} tone="emerald" />
          <StatCard
            label={`Просрочено${stats?.overdueCount ? ` (${stats.overdueCount})` : ""}`}
            value={stats?.overdueSum ?? 0}
            tone="red"
          />
        </div>

        <div className="inline-flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                filter === f.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="text-muted-foreground">Загрузка…</div>
        ) : !rows || rows.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground">
              Нет рейсов в этом разделе
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => {
              const overdue = isOverdue(r.carrier_payout_status, r.carrier_payout_scheduled_date);
              const status = r.carrier_payout_status ?? "to_pay";
              return (
                <Link
                  key={r.id}
                  to="/routes/$routeId"
                  params={{ routeId: r.id }}
                  className="block"
                >
                  <Card
                    className={`transition hover:shadow-sm ${
                      overdue ? "border-destructive/50" : "hover:border-primary/50"
                    }`}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="flex items-center gap-2 text-base">
                          <Hash className="h-4 w-4 text-muted-foreground" />
                          {r.route_number}
                        </CardTitle>
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          {overdue && (
                            <Badge variant="destructive" className="gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              Просрочено
                            </Badge>
                          )}
                          <Badge variant="outline" className={PAYOUT_STATUS_STYLES[status]}>
                            {PAYOUT_STATUS_LABELS[status]}
                          </Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 gap-x-3 gap-y-1 pb-3 text-sm sm:grid-cols-4">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Calendar className="h-3.5 w-3.5" />
                        {new Date(r.route_date).toLocaleDateString("ru-RU")}
                      </div>
                      <div className="truncate">
                        <span className="text-muted-foreground">Перевозчик: </span>
                        {r.carrier_id ? carriers?.[r.carrier_id] ?? "—" : "—"}
                      </div>
                      <div className="truncate">
                        <span className="text-muted-foreground">Водитель: </span>
                        {r.driver_name ?? "—"}
                      </div>
                      <div className="truncate">
                        <span className="text-muted-foreground">Машина: </span>
                        {r.vehicle_id ? vehicles?.[r.vehicle_id] ?? "—" : "—"}
                      </div>
                      <div>
                        <span className="text-muted-foreground">План оплаты: </span>
                        {r.carrier_payout_scheduled_date
                          ? new Date(r.carrier_payout_scheduled_date).toLocaleDateString("ru-RU")
                          : "—"}
                      </div>
                      <div className="sm:col-span-2 truncate">
                        <span className="text-muted-foreground">Комментарий: </span>
                        {r.carrier_payout_comment || "—"}
                      </div>
                      <div className="text-right font-semibold">
                        {fmtMoney(r.carrier_cost)}
                        <ChevronRight className="ml-1 inline h-3.5 w-3.5 text-primary" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "violet" | "blue" | "emerald" | "red";
}) {
  const toneClass =
    tone === "violet"
      ? "text-violet-700"
      : tone === "blue"
      ? "text-blue-700"
      : tone === "emerald"
      ? "text-emerald-700"
      : "text-destructive";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`mt-1 text-xl font-semibold ${toneClass}`}>{fmtMoney(value)}</div>
      </CardContent>
    </Card>
  );
}

function fmtMoney(v: number | null | undefined): string {
  if (v == null) return "—";
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(Number(v));
}
