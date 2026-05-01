import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Coins, Hash, Calendar, ChevronRight } from "lucide-react";
import {
  type CarrierPaymentStatus,
} from "@/components/CarrierPaymentBlock";

export const Route = createFileRoute("/carrier-payments")({
  head: () => ({
    meta: [
      { title: "Расчёты с перевозчиками — Радиус Трек" },
      { name: "description", content: "Сводка по расчётам и статусам оплаты перевозчиков" },
    ],
  }),
  component: CarrierPaymentsPage,
});

const STATUS_LABELS: Record<CarrierPaymentStatus, string> = {
  not_calculated: "Не рассчитано",
  calculated: "Рассчитано",
  review: "На проверке",
  approved: "Подтверждено",
  to_pay: "К оплате",
};

const STATUS_STYLES: Record<CarrierPaymentStatus, string> = {
  not_calculated: "bg-slate-100 text-slate-900 border-slate-200",
  calculated: "bg-blue-100 text-blue-900 border-blue-200",
  review: "bg-amber-100 text-amber-900 border-amber-200",
  approved: "bg-emerald-100 text-emerald-900 border-emerald-200",
  to_pay: "bg-violet-100 text-violet-900 border-violet-200",
};

const FILTERS: Array<{ key: CarrierPaymentStatus | "all"; label: string }> = [
  { key: "all", label: "Все" },
  { key: "calculated", label: "Рассчитано" },
  { key: "review", label: "На проверке" },
  { key: "approved", label: "Подтверждено" },
  { key: "to_pay", label: "К оплате" },
];

type Row = {
  id: string;
  route_number: string;
  route_date: string;
  status: string;
  carrier_id: string | null;
  carrier_cost: number | null;
  carrier_payment_status: CarrierPaymentStatus;
  points_count: number | null;
  total_distance_km: number | null;
};

type Carrier = { id: string; name: string };

function CarrierPaymentsPage() {
  const [filter, setFilter] = useState<CarrierPaymentStatus | "all">("all");

  const { data: rows, isLoading } = useQuery({
    queryKey: ["carrier-payments", filter],
    queryFn: async (): Promise<Row[]> => {
      let q = supabase
        .from("routes")
        .select(
          "id, route_number, route_date, status, carrier_id, carrier_cost, carrier_payment_status, points_count, total_distance_km",
        )
        .not("carrier_id", "is", null)
        .order("route_date", { ascending: false })
        .limit(200);
      if (filter !== "all") q = q.eq("carrier_payment_status", filter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const carrierIds = useMemo(
    () => Array.from(new Set((rows ?? []).map((r) => r.carrier_id).filter(Boolean) as string[])),
    [rows],
  );

  const { data: carriers } = useQuery({
    enabled: carrierIds.length > 0,
    queryKey: ["carrier-payments-carriers", carrierIds.join(",")],
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase
        .from("carriers")
        .select("id, name")
        .in("id", carrierIds);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const c of (data ?? []) as Carrier[]) map[c.id] = c.name;
      return map;
    },
  });

  const totals = useMemo(() => {
    const t = { count: 0, sum: 0, toPay: 0 };
    for (const r of rows ?? []) {
      t.count += 1;
      t.sum += Number(r.carrier_cost ?? 0);
      if (r.carrier_payment_status === "to_pay") t.toPay += Number(r.carrier_cost ?? 0);
    }
    return t;
  }, [rows]);

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-3">
          <Coins className="h-5 w-5 text-primary" />
          <span className="font-semibold">Расчёты с перевозчиками</span>
        </div>
      </div>

      <main className="mx-auto max-w-5xl space-y-4 px-4 py-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Всего рейсов</div>
              <div className="mt-1 text-2xl font-semibold">{totals.count}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Сумма по рейсам</div>
              <div className="mt-1 text-2xl font-semibold">{fmtMoney(totals.sum)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">К оплате</div>
              <div className="mt-1 text-2xl font-semibold text-violet-700">
                {fmtMoney(totals.toPay)}
              </div>
            </CardContent>
          </Card>
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
            {rows.map((r) => (
              <Link
                key={r.id}
                to="/routes/$routeId"
                params={{ routeId: r.id }}
                className="block"
              >
                <Card className="transition hover:border-primary/50 hover:shadow-sm">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Hash className="h-4 w-4 text-muted-foreground" />
                        {r.route_number}
                      </CardTitle>
                      <Badge
                        variant="outline"
                        className={STATUS_STYLES[r.carrier_payment_status]}
                      >
                        {STATUS_LABELS[r.carrier_payment_status]}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-x-3 gap-y-1 pb-3 text-sm sm:grid-cols-4">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5" />
                      {new Date(r.route_date).toLocaleDateString("ru-RU")}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Перевозчик: </span>
                      {r.carrier_id ? carriers?.[r.carrier_id] ?? "—" : "—"}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Точек: </span>
                      {r.points_count ?? 0} • {r.total_distance_km ?? 0} км
                    </div>
                    <div className="font-semibold">
                      {fmtMoney(r.carrier_cost)}
                      <ChevronRight className="ml-1 inline h-3.5 w-3.5 text-primary" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
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
