import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchListViaApi } from "@/lib/api-client";
import { CACHE_TIMES } from "@/lib/queryCache";
import { AppHeader } from "@/components/AppHeader";
import { LoadingFallback } from "@/components/LoadingFallback";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import {
  STATUS_LABELS,
  STATUS_STYLES,
  STATUS_ORDER,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_STYLES,
  type OrderStatus,
  type PaymentStatus,
} from "@/lib/orders";
import { Search, Sparkles, FileText } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/orders/")({
  head: () => ({
    meta: [
      { title: "Заказы и клиенты — Радиус Трек" },
      {
        name: "description",
        content:
          "Сводная таблица заказов: клиент, маршрут, перевозчик, водитель, транспорт, статус, оплата, документы.",
      },
    ],
  }),
  component: OrdersPage,
});

type OrderRow = {
  id: string;
  order_number: string;
  status: OrderStatus;
  payment_status: PaymentStatus | null;
  amount_due: number | null;
  delivery_cost: number | null;
  goods_amount: number | null;
  total_weight_kg: number | null;
  total_volume_m3: number | null;
  destination_city: string | null;
  delivery_address: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  created_at: string;
  updated_at: string;
  // joined
  route?: {
    id: string;
    route_number: string;
    route_date: string;
    driver_name: string | null;
    status: string;
    organization: string | null;
    transport_kind: string | null;
    warehouse?: { id: string; name: string; city: string | null } | null;
    carrier?: { id: string; company_name: string } | null;
    driver?: { id: string; full_name: string; phone: string | null } | null;
    vehicle?: {
      id: string;
      plate_number: string;
      brand: string | null;
      model: string | null;
    } | null;
  } | null;
};

function fmtMoney(v: number | null | undefined) {
  if (v === null || v === undefined) return "—";
  return `${Number(v).toLocaleString("ru-RU")} ₽`;
}

const DEMO_ROWS: OrderRow[] = [
  demo("RT-D001", "ready_for_delivery", "ООО «Маркет Плюс»", "Москва → Казань", "Сергей Воронов", "А101АА77", 182000, "not_paid", 5800),
  demo("RT-D002", "delivering", "ТД «Дон-Опт»", "Краснодар → Ростов-на-Дону", "Олег Тарасов", "Р701РР23", 225000, "paid", 9200),
  demo("RT-D003", "in_progress", "ООО «УралМаркет»", "Самара → Екатеринбург", "Виктор Чернов", "С301СС63", 520000, "not_paid", 21800),
  demo("RT-D004", "delivered", "ООО «НеваТорг»", "Санкт-Петербург → Нижний Новгород", "Виктор Соколов", "Х801ХХ78", 128000, "paid", 6900),
  demo("RT-D005", "new", "ООО «Маркет Плюс»", "Воронеж → Москва", "Антон Лебедев", "В201ВВ78", 74000, "not_paid", 4100),
];

function demo(
  num: string,
  status: OrderStatus,
  client: string,
  route: string,
  driver: string,
  plate: string,
  amount: number,
  pay: PaymentStatus,
  delivery: number,
): OrderRow {
  const [from, to] = route.split(" → ");
  return {
    id: num,
    order_number: num,
    status,
    payment_status: pay,
    amount_due: amount,
    delivery_cost: delivery,
    goods_amount: amount,
    total_weight_kg: 600,
    total_volume_m3: 3,
    destination_city: to,
    delivery_address: `${to}, демо-адрес`,
    contact_name: client,
    contact_phone: "+7 000 000-00-00",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    route: {
      id: num,
      route_number: `M-DEMO-${num.slice(-3)}`,
      route_date: new Date().toISOString().slice(0, 10),
      driver_name: driver,
      status: "in_progress",
      organization: "ООО «РадиусТрек»",
      transport_kind: "Фура 20 т",
      warehouse: { id: "w1", name: `Склад ${from}`, city: from },
      carrier: { id: "c1", company_name: "ООО «РадиусЛогистик» (демо)" },
      driver: { id: "d1", full_name: driver, phone: "+7 000 000-00-00" },
      vehicle: { id: "v1", plate_number: plate, brand: "MAN", model: "TGS" },
    },
  };
}

function OrdersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [routeFilter, setRouteFilter] = useState<string>("all");
  const [pageSize, setPageSize] = useState(20);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["orders-overview", pageSize],
    queryFn: async (): Promise<OrderRow[]> => {
      // Подтянем заказы вместе с маршрутом, на котором они стоят (через route_points)
      const { data: orders, error } = await supabase
        .from("orders")
        .select(
          `
          id, order_number, status, payment_status, amount_due, delivery_cost, goods_amount,
          total_weight_kg, total_volume_m3, destination_city, delivery_address,
          contact_name, contact_phone, created_at, updated_at
          `,
        )
        .order("created_at", { ascending: false })
        .limit(pageSize);
      if (error) throw error;

      const ids = (orders ?? []).map((o) => o.id);
      let routeMap = new Map<string, OrderRow["route"]>();
      if (ids.length > 0) {
        const { data: pts } = await supabase
          .from("route_points")
          .select(
            `
            order_id,
            route:route_id (
              id, route_number, route_date, driver_name, status, organization, transport_kind,
              warehouse:warehouse_id ( id, name, city ),
              carrier:carrier_id ( id, company_name ),
              driver:driver_id ( id, full_name, phone ),
              vehicle:vehicle_id ( id, plate_number, brand, model )
            )
            `,
          )
          .in("order_id", ids);
        for (const p of pts ?? []) {
          if (p.order_id && p.route && !routeMap.has(p.order_id)) {
            routeMap.set(p.order_id, p.route as OrderRow["route"]);
          }
        }
      }

      return (orders ?? []).map((o) => ({
        ...(o as OrderRow),
        route: routeMap.get(o.id) ?? null,
      }));
    },
    staleTime: CACHE_TIMES.BUSINESS,
    placeholderData: (prev) => prev,
  });

  const isDemo = !isLoading && (data?.length ?? 0) === 0;
  const rows = isDemo ? DEMO_ROWS : data ?? [];

  const clients = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.contact_name) set.add(r.contact_name);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ru"));
  }, [rows]);

  const routesOpts = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) {
      if (r.route?.route_number) {
        const from = r.route.warehouse?.city ?? "—";
        const to = r.destination_city ?? "—";
        map.set(r.route.route_number, `${r.route.route_number} · ${from} → ${to}`);
      }
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (clientFilter !== "all" && r.contact_name !== clientFilter) return false;
      if (routeFilter !== "all" && r.route?.route_number !== routeFilter) return false;
      if (!q) return true;
      const hay = [
        r.order_number,
        r.contact_name,
        r.delivery_address,
        r.destination_city,
        r.route?.route_number,
        r.route?.driver_name,
        r.route?.carrier?.company_name,
        r.route?.vehicle?.plate_number,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search, statusFilter, clientFilter, routeFilter]);

  const setStatus = useMutation({
    mutationFn: async ({ id, next }: { id: string; next: OrderStatus }) => {
      const { error } = await supabase.from("orders").update({ status: next }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Статус обновлён");
      qc.invalidateQueries({ queryKey: ["orders-overview"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const totalAmount = filtered.reduce((s, r) => s + Number(r.amount_due ?? r.goods_amount ?? 0), 0);
  const paidCount = filtered.filter((r) => r.payment_status === "paid").length;
  const inDeliveryCount = filtered.filter(
    (r) => r.status === "delivering" || r.status === "in_progress",
  ).length;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto w-full max-w-[1440px] px-3 py-6 sm:px-4 lg:px-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Заказы и клиенты</h1>
            <p className="text-sm text-muted-foreground">
              Сводная таблица: клиент, маршрут, перевозчик, водитель, транспорт, оплата.
            </p>
          </div>
          {isDemo ? (
            <Badge
              variant="outline"
              className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-200"
            >
              <Sparkles className="mr-1 h-3.5 w-3.5" />
              Демо-данные
            </Badge>
          ) : null}
        </div>

        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">
                Заказов в выдаче
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-bold text-foreground">{filtered.length}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">
                В пути / в работе
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-bold text-foreground">{inDeliveryCount}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">
                Сумма к оплате
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-bold text-foreground">
              {fmtMoney(totalAmount)}
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                оплачено: {paidCount}
              </span>
            </CardContent>
          </Card>
        </div>

        <Card className="mb-4">
          <CardContent className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Номер, клиент, адрес, машина…"
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Статус" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все статусы</SelectItem>
                {STATUS_ORDER.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={clientFilter} onValueChange={setClientFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Клиент" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все клиенты</SelectItem>
                {clients.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={routeFilter} onValueChange={setRouteFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Маршрут" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все маршруты</SelectItem>
                {routesOpts.map(([num, label]) => (
                  <SelectItem key={num} value={num}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[110px]">№ заказа</TableHead>
                    <TableHead>Клиент / контакт</TableHead>
                    <TableHead>Маршрут</TableHead>
                    <TableHead>Груз</TableHead>
                    <TableHead>Перевозчик / водитель / ТС</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead className="text-right">Ставка</TableHead>
                    <TableHead>Оплата</TableHead>
                    <TableHead>Даты</TableHead>
                    <TableHead className="text-center">Док-ты</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={10} className="py-6">
                        <LoadingFallback onRefresh={() => refetch()} />
                      </TableCell>
                    </TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="py-10 text-center text-sm text-muted-foreground">
                        Нет заказов под фильтры
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((r) => {
                      const from = r.route?.warehouse?.city ?? "—";
                      const to = r.destination_city ?? "—";
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="font-mono text-xs">
                            {isDemo ? (
                              <span className="font-semibold">{r.order_number}</span>
                            ) : (
                              <Link
                                to="/"
                                search={{ orderId: r.id }}
                                className="font-semibold text-primary hover:underline"
                              >
                                {r.order_number}
                              </Link>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="font-medium text-foreground">{r.contact_name ?? "—"}</div>
                            <div className="text-xs text-muted-foreground">{r.contact_phone ?? ""}</div>
                            <div className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                              {r.delivery_address ?? ""}
                            </div>
                          </TableCell>
                          <TableCell>
                            {r.route ? (
                              <div className="space-y-0.5">
                                <div className="text-xs font-mono text-muted-foreground">
                                  {r.route.route_number}
                                </div>
                                <div className="text-sm font-medium text-foreground">
                                  {from} → {to}
                                </div>
                              </div>
                            ) : (
                              <span className="text-sm text-muted-foreground">— не назначен —</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm">
                            <div>
                              {r.total_weight_kg ? `${Number(r.total_weight_kg).toLocaleString("ru-RU")} кг` : "—"}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {r.total_volume_m3 ? `${Number(r.total_volume_m3).toLocaleString("ru-RU")} м³` : ""}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">
                            <div className="font-medium text-foreground">
                              {r.route?.carrier?.company_name ?? "—"}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {r.route?.driver?.full_name ?? r.route?.driver_name ?? ""}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {r.route?.vehicle
                                ? `${r.route.vehicle.plate_number}${r.route.vehicle.brand ? ` · ${r.route.vehicle.brand}` : ""}`
                                : ""}
                            </div>
                          </TableCell>
                          <TableCell>
                            {isDemo ? (
                              <Badge variant="outline" className={STATUS_STYLES[r.status]}>
                                {STATUS_LABELS[r.status]}
                              </Badge>
                            ) : (
                              <Select
                                value={r.status}
                                onValueChange={(v) =>
                                  setStatus.mutate({ id: r.id, next: v as OrderStatus })
                                }
                              >
                                <SelectTrigger className="h-8 w-[180px] text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {STATUS_ORDER.map((s) => (
                                    <SelectItem key={s} value={s}>
                                      {STATUS_LABELS[s]}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            <div className="font-semibold text-foreground">
                              {fmtMoney(r.amount_due ?? r.goods_amount)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              доставка: {fmtMoney(r.delivery_cost)}
                            </div>
                          </TableCell>
                          <TableCell>
                            {r.payment_status ? (
                              <Badge variant="outline" className={PAYMENT_STATUS_STYLES[r.payment_status]}>
                                {PAYMENT_STATUS_LABELS[r.payment_status]}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                            <div>загр.: {r.route?.route_date ?? "—"}</div>
                            <div>обн.: {new Date(r.updated_at).toLocaleDateString("ru-RU")}</div>
                          </TableCell>
                          <TableCell className="text-center">
                            <FileText className="mx-auto h-4 w-4 text-muted-foreground" aria-hidden />
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
            {!isLoading && (data?.length ?? 0) >= pageSize && (
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  onClick={() => setPageSize((n) => n + 50)}
                  className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
                >
                  Показать ещё
                </button>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
