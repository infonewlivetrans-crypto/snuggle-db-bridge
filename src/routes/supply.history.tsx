import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchListViaApi } from "@/lib/api-client";
import { AppHeader } from "@/components/AppHeader";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { History } from "lucide-react";

export const Route = createFileRoute("/supply/history")({
  head: () => ({
    meta: [
      { title: "История операций — Снабжение" },
      { name: "description", content: "Журнал заявок и движения остатков" },
    ],
  }),
  component: SupplyHistoryPage,
});

type StatusEvent = {
  kind: "status";
  id: string;
  at: string;
  actor: string | null;
  from_status: string | null;
  to_status: string;
  comment: string | null;
  request_id: string;
  request_number?: string;
};

type MovementEvent = {
  kind: "movement";
  id: string;
  at: string;
  actor: string | null;
  movement_type: string;
  qty: number;
  reason: string | null;
  comment: string | null;
  product_id: string;
  warehouse_id: string;
};

type Event = StatusEvent | MovementEvent;

const STATUS_LABEL: Record<string, string> = {
  draft: "Черновик",
  pending: "На согласовании",
  confirmed: "Подтверждена",
  in_transit: "В пути",
  partially_received: "Частично получена",
  received: "Получена",
  cancelled: "Отменена",
};

const MOVEMENT_LABEL: Record<string, string> = {
  inbound: "Приёмка",
  outbound: "Списание",
  adjustment: "Корректировка",
  transfer: "Перемещение",
  writeoff: "Списание (брак)",
  return: "Возврат",
  reserve: "Резервирование",
  reservation_release: "Снятие резерва",
  reservation_consume: "Списание из резерва",
  shipment: "Отгрузка",
};

function SupplyHistoryPage() {
  const { data: statusHistory } = useQuery({
    queryKey: ["supply-history-status"],
    queryFn: async () => {
      const { data, error } = await db
        .from("supply_request_status_history")
        .select("id, supply_request_id, from_status, to_status, changed_at, changed_by, comment")
        .order("changed_at", { ascending: false })
        .limit(150);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        supply_request_id: string;
        from_status: string | null;
        to_status: string;
        changed_at: string;
        changed_by: string | null;
        comment: string | null;
      }>;
    },
  });

  const { data: movements } = useQuery({
    queryKey: ["supply-history-movements"],
    queryFn: async () => {
      const { data, error } = await db
        .from("stock_movements")
        .select("id, product_id, warehouse_id, movement_type, qty, reason, comment, created_at, created_by")
        .order("created_at", { ascending: false })
        .limit(150);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        product_id: string;
        warehouse_id: string;
        movement_type: string;
        qty: number;
        reason: string | null;
        comment: string | null;
        created_at: string;
        created_by: string | null;
      }>;
    },
  });

  const requestIds = useMemo(
    () => Array.from(new Set((statusHistory ?? []).map((s) => s.supply_request_id))),
    [statusHistory],
  );

  const { data: requests } = useQuery({
    queryKey: ["supply-history-requests", requestIds],
    enabled: requestIds.length > 0,
    queryFn: async () => {
      const { data, error } = await db
        .from("supply_requests")
        .select("id, request_number")
        .in("id", requestIds);
      if (error) throw error;
      return (data ?? []) as { id: string; request_number: string }[];
    },
  });

  const { data: products } = useQuery({
    queryKey: ["products-history"],
    queryFn: async () => {
      const { data, error } = await db.from("products").select("id, name, sku");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; sku: string | null }[];
    },
  });
  const { data: warehouses } = useQuery({
    queryKey: ["warehouses-history"],
    queryFn: async () => {
      const { data, error } = await db.from("warehouses").select("id, name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const requestMap = useMemo(
    () => new Map((requests ?? []).map((r) => [r.id, r.request_number])),
    [requests],
  );
  const productMap = useMemo(
    () => new Map((products ?? []).map((p) => [p.id, p])),
    [products],
  );
  const whMap = useMemo(
    () => new Map((warehouses ?? []).map((w) => [w.id, w.name])),
    [warehouses],
  );

  const events: Event[] = useMemo(() => {
    const list: Event[] = [];
    (statusHistory ?? []).forEach((s) =>
      list.push({
        kind: "status",
        id: s.id,
        at: s.changed_at,
        actor: s.changed_by,
        from_status: s.from_status,
        to_status: s.to_status,
        comment: s.comment,
        request_id: s.supply_request_id,
      }),
    );
    (movements ?? []).forEach((m) =>
      list.push({
        kind: "movement",
        id: m.id,
        at: m.created_at,
        actor: m.created_by,
        movement_type: m.movement_type,
        qty: Number(m.qty),
        reason: m.reason,
        comment: m.comment,
        product_id: m.product_id,
        warehouse_id: m.warehouse_id,
      }),
    );
    list.sort((a, b) => +new Date(b.at) - +new Date(a.at));
    return list.slice(0, 250);
  }, [statusHistory, movements]);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
            <History className="h-6 w-6 text-primary" />
            История операций снабжения
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            События по заявкам и движениям остатков (последние 250)
          </p>
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Дата и время</TableHead>
                <TableHead>Тип</TableHead>
                <TableHead>Объект</TableHead>
                <TableHead>Изменение</TableHead>
                <TableHead>Пользователь</TableHead>
                <TableHead>Комментарий</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">Записей нет</TableCell></TableRow>
              ) : (
                events.map((e) => (
                  <TableRow key={`${e.kind}-${e.id}`}>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {new Date(e.at).toLocaleString("ru-RU")}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {e.kind === "status" ? "Заявка" : "Движение"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {e.kind === "status" ? (
                        <span className="font-mono text-xs">
                          {requestMap.get(e.request_id) ?? e.request_id.slice(0, 8)}
                        </span>
                      ) : (
                        <div>
                          <div className="font-medium">{productMap.get(e.product_id)?.name ?? "—"}</div>
                          <div className="text-xs text-muted-foreground">
                            {whMap.get(e.warehouse_id) ?? "—"}
                          </div>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {e.kind === "status" ? (
                        <span>
                          {e.from_status ? (STATUS_LABEL[e.from_status] ?? e.from_status) : "—"}
                          {" → "}
                          <strong>{STATUS_LABEL[e.to_status] ?? e.to_status}</strong>
                        </span>
                      ) : (
                        <span>
                          {MOVEMENT_LABEL[e.movement_type] ?? e.movement_type}:{" "}
                          <span className={e.qty >= 0 ? "text-green-700" : "text-red-700"}>
                            {e.qty >= 0 ? "+" : ""}{Number(e.qty).toLocaleString("ru-RU")}
                          </span>
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {e.actor ?? "—"}
                    </TableCell>
                    <TableCell className="max-w-[300px] truncate text-sm text-muted-foreground">
                      {e.comment ?? (e.kind === "movement" ? e.reason ?? "" : "")}
                    </TableCell>
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
