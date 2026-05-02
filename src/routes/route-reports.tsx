import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { LoadingFallback } from "@/components/LoadingFallback";
import { FileText, Truck, CheckCircle2, XCircle, RotateCcw, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/route-reports")({
  head: () => ({
    meta: [
      { title: "Отчёты по маршрутам — Радиус Трек" },
      { name: "description", content: "Сводные отчёты по завершённым маршрутам доставки" },
    ],
  }),
  component: RouteReportsPage,
});

type ReportPayload = {
  delivery_route_id: string;
  route_number: string;
  route_date: string;
  driver: string | null;
  vehicle: string | null;
  totals: {
    total: number;
    delivered: number;
    not_delivered: number;
    returned: number;
    amount_due: number;
    amount_received: number;
    amount_diff: number;
  };
};

type Notif = {
  id: string;
  created_at: string;
  payload: ReportPayload;
};

const fmt = (n: number | null | undefined) => (n ?? 0).toLocaleString("ru-RU");

function RouteReportsPage() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["route-completed-reports-list"],
    queryFn: async (): Promise<Notif[]> => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, created_at, payload")
        .eq("kind", "route_completed_report")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as Notif[];
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 py-4 sm:py-6">
        <div className="mb-4 flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold sm:text-2xl">Отчёты по маршрутам</h1>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Сводные отчёты формируются автоматически после завершения маршрута водителем.
        </p>

        {isLoading ? (
          <LoadingFallback onRefresh={() => refetch()} />
        ) : !data || data.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-6 text-center text-muted-foreground">
            Завершённых маршрутов пока нет
          </div>
        ) : (
          <div className="space-y-3">
            {data.map((n) => {
              const p = n.payload;
              const t = p.totals;
              return (
                <Link
                  key={n.id}
                  to="/delivery-routes/$deliveryRouteId"
                  params={{ deliveryRouteId: p.delivery_route_id }}
                  className="block rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 font-semibold">
                        <Truck className="h-4 w-4 text-muted-foreground" />
                        {p.route_number}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {new Date(p.route_date).toLocaleDateString("ru-RU")}
                        {p.driver ? ` · ${p.driver}` : ""}
                        {p.vehicle ? ` · ${p.vehicle}` : ""}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                    <Stat label="Всего" value={String(t.total)} />
                    <Stat
                      label="Доставлено"
                      value={String(t.delivered)}
                      icon={<CheckCircle2 className="h-3 w-3 text-emerald-600" />}
                    />
                    <Stat
                      label="Не доставлено"
                      value={String(t.not_delivered)}
                      icon={<XCircle className="h-3 w-3 text-red-600" />}
                    />
                    <Stat
                      label="Возврат"
                      value={String(t.returned)}
                      icon={<RotateCcw className="h-3 w-3 text-orange-600" />}
                    />
                  </div>

                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>К получению: {fmt(t.amount_due)}</span>
                    <span>Получено: {fmt(t.amount_received)}</span>
                    {t.amount_diff !== 0 && (
                      <span className="text-red-600">
                        Расхождение: {(t.amount_diff > 0 ? "+" : "") + fmt(t.amount_diff)}
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded border border-border bg-muted/30 px-2 py-1.5">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}
