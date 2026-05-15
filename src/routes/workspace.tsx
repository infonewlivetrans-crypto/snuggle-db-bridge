import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { apiGetAuth } from "@/lib/api-client";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Truck,
  ClipboardList,
  BarChart3,
  User,
  Bell,
  FileText,
  QrCode,
  Wallet,
  PackageX,
  AlertTriangle,
  Route as RouteIcon,
  CheckCircle2,
  PlayCircle,
} from "lucide-react";

export const Route = createFileRoute("/workspace")({
  head: () => ({
    meta: [
      { title: "Рабочий стол — Радиус Трек" },
      { name: "description", content: "Стартовая страница с выбором роли" },
    ],
  }),
  component: WorkspacePage,
});

type Role = "driver" | "manager" | "logist" | "director";

const ROLES: { id: Role; label: string; icon: typeof User; description: string }[] = [
  { id: "driver", label: "Водитель", icon: Truck, description: "Мои маршруты и точки" },
  { id: "manager", label: "Менеджер", icon: User, description: "Уведомления и отчёты" },
  { id: "logist", label: "Логист", icon: ClipboardList, description: "Контроль маршрутов" },
  { id: "director", label: "Руководитель", icon: BarChart3, description: "Сводный отчёт" },
];

function WorkspacePage() {
  const [role, setRole] = useState<Role>("manager");

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Рабочий стол
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Выберите роль, чтобы увидеть свои задачи
          </p>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {ROLES.map((r) => {
            const Icon = r.icon;
            const active = role === r.id;
            return (
              <button
                key={r.id}
                onClick={() => setRole(r.id)}
                className={`rounded-lg border p-4 text-left transition-colors ${
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card hover:bg-secondary"
                }`}
              >
                <Icon className="mb-2 h-5 w-5" />
                <div className="text-sm font-semibold">{r.label}</div>
                <div
                  className={`mt-0.5 text-xs ${
                    active ? "text-primary-foreground/80" : "text-muted-foreground"
                  }`}
                >
                  {r.description}
                </div>
              </button>
            );
          })}
        </div>

        {role === "driver" && <DriverPanel />}
        {role === "manager" && <ManagerPanel />}
        {role === "logist" && <LogistPanel />}
        {role === "director" && <DirectorPanel />}
      </main>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

function StatTile({
  label,
  value,
  icon: Icon,
  to,
  tone = "default",
}: {
  label: string;
  value: number | string;
  icon: typeof User;
  to: string;
  tone?: "default" | "warning" | "success" | "danger";
}) {
  const toneClass =
    tone === "warning"
      ? "border-amber-300 bg-amber-50 text-amber-900"
      : tone === "success"
      ? "border-emerald-300 bg-emerald-50 text-emerald-900"
      : tone === "danger"
      ? "border-red-300 bg-red-50 text-red-900"
      : "border-border bg-card text-foreground";
  return (
    <Link
      to={to}
      className={`flex items-center justify-between rounded-lg border p-4 transition-colors hover:opacity-90 ${toneClass}`}
    >
      <div className="min-w-0">
        <div className="text-xs font-medium uppercase tracking-wider opacity-80">
          {label}
        </div>
        <div className="mt-1 text-2xl font-bold">{value}</div>
      </div>
      <Icon className="h-6 w-6 shrink-0 opacity-70" />
    </Link>
  );
}

type DriverRoute = {
  id: string;
  route_number: string;
  route_date: string;
  status: string;
  assigned_driver: string | null;
  assigned_vehicle: string | null;
};
type DriverSummary = {
  list: DriverRoute[];
  active: DriverRoute | null;
  pendingPoints: number;
};

function DriverPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ["workspace", "driver"],
    queryFn: () => apiGetAuth<DriverSummary>("/api/workspace/summary?role=driver"),
  });

  return (
    <>
      <Section title="Сводка">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatTile
            label="Мои маршруты"
            value={isLoading ? "—" : data?.list.length ?? 0}
            icon={RouteIcon}
            to="/driver"
          />
          <StatTile
            label="Активный маршрут"
            value={data?.active ? data.active.route_number : "—"}
            icon={PlayCircle}
            to={data?.active ? `/driver/${data.active.id}` : "/driver"}
            tone={data?.active ? "success" : "default"}
          />
          <StatTile
            label="Незавершённые точки"
            value={isLoading ? "—" : data?.pendingPoints ?? 0}
            icon={AlertTriangle}
            to={data?.active ? `/driver/${data.active.id}` : "/driver"}
            tone={(data?.pendingPoints ?? 0) > 0 ? "warning" : "default"}
          />
        </div>
      </Section>

      <Section title="Мои маршруты">
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Загрузка…</div>
        ) : (data?.list ?? []).length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Нет выданных маршрутов
          </div>
        ) : (
          <div className="space-y-2">
            {data!.list.map((r) => (
              <Link
                key={r.id}
                to="/driver/$deliveryRouteId"
                params={{ deliveryRouteId: r.id }}
                className="flex items-center justify-between rounded-lg border border-border bg-card p-3 hover:bg-secondary"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold">№ {r.route_number}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.route_date} · {r.assigned_driver ?? "—"} · {r.assigned_vehicle ?? "—"}
                  </div>
                </div>
                <Badge variant="outline">
                  {r.status === "in_progress" ? "В работе" : "Выдан"}
                </Badge>
              </Link>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}

type ManagerSummary = {
  newNotifs: number;
  qrOrders: number;
  mismatch: number;
  returns: number;
  problems: number;
};

function ManagerPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ["workspace", "manager"],
    queryFn: () => apiGetAuth<ManagerSummary>("/api/workspace/summary?role=manager"),
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });

  return (
    <Section title="Сводка">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile
          label="Новые уведомления"
          value={isLoading ? "—" : data?.newNotifs ?? 0}
          icon={Bell}
          to="/notifications"
          tone={(data?.newNotifs ?? 0) > 0 ? "warning" : "default"}
        />
        <StatTile label="Отчёты по маршрутам" value={"›"} icon={FileText} to="/route-reports" />
        <StatTile
          label="Заказы с QR"
          value={isLoading ? "—" : data?.qrOrders ?? 0}
          icon={QrCode}
          to="/"
        />
        <StatTile
          label="Расхождения по оплате"
          value={isLoading ? "—" : data?.mismatch ?? 0}
          icon={Wallet}
          to="/notifications"
          tone={(data?.mismatch ?? 0) > 0 ? "danger" : "default"}
        />
        <StatTile
          label="Возвраты на склад"
          value={isLoading ? "—" : data?.returns ?? 0}
          icon={PackageX}
          to="/notifications"
        />
        <StatTile
          label="Проблемы"
          value={isLoading ? "—" : data?.problems ?? 0}
          icon={AlertTriangle}
          to="/logist"
          tone={(data?.problems ?? 0) > 0 ? "warning" : "default"}
        />
      </div>
    </Section>
  );
}

type LogistSummary = {
  today: number;
  inProgress: number;
  completed: number;
  problems: number;
};

function LogistPanel() {
  const today = new Date().toISOString().slice(0, 10);
  const { data, isLoading } = useQuery({
    queryKey: ["workspace", "logist", today],
    queryFn: () =>
      apiGetAuth<LogistSummary>(`/api/workspace/summary?role=logist&date=${today}`),
  });

  return (
    <Section title="Сводка">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label="Маршруты на сегодня"
          value={isLoading ? "—" : data?.today ?? 0}
          icon={RouteIcon}
          to="/logist"
        />
        <StatTile
          label="В работе"
          value={isLoading ? "—" : data?.inProgress ?? 0}
          icon={PlayCircle}
          to="/logist"
        />
        <StatTile
          label="Завершены"
          value={isLoading ? "—" : data?.completed ?? 0}
          icon={CheckCircle2}
          to="/logist"
          tone="success"
        />
        <StatTile
          label="Проблемные доставки"
          value={isLoading ? "—" : data?.problems ?? 0}
          icon={AlertTriangle}
          to="/logist"
          tone={(data?.problems ?? 0) > 0 ? "warning" : "default"}
        />
      </div>
    </Section>
  );
}

type DirectorSummary = {
  due: number;
  recv: number;
  returns: number;
  problems: number;
};

function DirectorPanel() {
  const [enabled, setEnabled] = useState(false);
  const { data, isLoading, isFetching } = useQuery({
    enabled,
    queryKey: ["workspace", "director"],
    queryFn: () => apiGetAuth<DirectorSummary>("/api/workspace/summary?role=director"),
    staleTime: 5 * 60_000,
  });

  const fmt = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 0 });

  return (
    <Section title="Сводка за 30 дней">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Общий отчёт" value={"›"} icon={BarChart3} to="/director" />
        <StatTile
          label="Сумма к получению"
          value={isLoading ? "—" : fmt(data?.due ?? 0)}
          icon={Wallet}
          to="/director"
        />
        <StatTile
          label="Фактически получено"
          value={isLoading ? "—" : fmt(data?.recv ?? 0)}
          icon={Wallet}
          to="/director"
          tone="success"
        />
        <StatTile
          label="Возвраты"
          value={isLoading ? "—" : data?.returns ?? 0}
          icon={PackageX}
          to="/director"
        />
        <StatTile
          label="Проблемы"
          value={isLoading ? "—" : data?.problems ?? 0}
          icon={AlertTriangle}
          to="/director"
          tone={(data?.problems ?? 0) > 0 ? "warning" : "default"}
        />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link to="/director">
          <Button variant="outline" size="sm">Открыть отчёт руководителя</Button>
        </Link>
        {!enabled && (
          <Button size="sm" onClick={() => setEnabled(true)}>
            Загрузить сводку за 30 дней
          </Button>
        )}
        {enabled && (
          <span className="text-xs text-muted-foreground self-center">
            {isFetching ? "Обновление…" : isLoading ? "Загрузка…" : "Готово"}
          </span>
        )}
      </div>
    </Section>
  );
}
