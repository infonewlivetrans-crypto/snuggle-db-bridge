import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { AppHeader } from "@/components/AppHeader";
import { Input } from "@/components/ui/input";
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
import { ArrowLeftRight, Search, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/supply/transfers")({
  head: () => ({
    meta: [
      { title: "Перемещения — Снабжение" },
      { name: "description", content: "Перемещения товаров между складами" },
    ],
  }),
  component: SupplyTransfersPage,
});

type Transfer = {
  id: string;
  transfer_number: string;
  status: string;
  qty: number;
  comment: string | null;
  created_at: string;
  sent_at: string | null;
  arrived_at: string | null;
  accepted_at: string | null;
  product_id: string;
  source_warehouse_id: string;
  destination_warehouse_id: string;
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Черновик",
  awaiting_send: "Подтверждено",
  in_transit: "В пути",
  arrived: "Прибыло",
  accepted: "Получено",
  cancelled: "Отменено",
};

const STATUS_STYLE: Record<string, string> = {
  draft: "border-muted bg-muted text-muted-foreground",
  awaiting_send: "border-blue-300 bg-blue-100 text-blue-900",
  in_transit: "border-amber-300 bg-amber-100 text-amber-900",
  arrived: "border-indigo-300 bg-indigo-100 text-indigo-900",
  accepted: "border-green-300 bg-green-100 text-green-900",
  cancelled: "border-red-300 bg-red-100 text-red-900",
};

function SupplyTransfersPage() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");

  const { data: transfers, isLoading } = useQuery({
    queryKey: ["supply-transfers"],
    queryFn: async (): Promise<Transfer[]> => {
      const { data, error } = await db
        .from("stock_transfers")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Transfer[];
    },
  });

  const { data: products } = useQuery({
    queryKey: ["products-min"],
    queryFn: async () => {
      const { data, error } = await db.from("products").select("id, name, sku");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; sku: string | null }[];
    },
  });
  const { data: warehouses } = useQuery({
    queryKey: ["warehouses-min-tr"],
    queryFn: async () => {
      const { data, error } = await db.from("warehouses").select("id, name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const productMap = useMemo(
    () => new Map((products ?? []).map((p) => [p.id, p])),
    [products],
  );
  const whMap = useMemo(
    () => new Map((warehouses ?? []).map((w) => [w.id, w.name])),
    [warehouses],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (transfers ?? []).filter((t) => {
      if (status !== "all" && t.status !== status) return false;
      if (!q) return true;
      const p = productMap.get(t.product_id);
      return (
        t.transfer_number.toLowerCase().includes(q) ||
        (p?.name ?? "").toLowerCase().includes(q) ||
        (p?.sku ?? "").toLowerCase().includes(q)
      );
    });
  }, [transfers, query, status, productMap]);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
              <ArrowLeftRight className="h-6 w-6 text-primary" />
              Перемещения между складами
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Сводка по перемещениям. Управление — на странице склада.
            </p>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link to="/warehouse-transfers">
              <ExternalLink className="mr-2 h-4 w-4" />
              Управлять перемещениями
            </Link>
          </Button>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Поиск по номеру, товару или артикулу"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Статус" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все статусы</SelectItem>
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Номер</TableHead>
                <TableHead>Товар</TableHead>
                <TableHead>Откуда</TableHead>
                <TableHead>Куда</TableHead>
                <TableHead className="text-right">Количество</TableHead>
                <TableHead>Создано</TableHead>
                <TableHead>Статус</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">Загрузка…</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">Перемещений нет</TableCell></TableRow>
              ) : (
                filtered.map((t) => {
                  const p = productMap.get(t.product_id);
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="font-mono text-xs">{t.transfer_number}</TableCell>
                      <TableCell>
                        <div className="font-medium">{p?.name ?? "—"}</div>
                        {p?.sku && <div className="font-mono text-xs text-muted-foreground">{p.sku}</div>}
                      </TableCell>
                      <TableCell className="text-sm">{whMap.get(t.source_warehouse_id) ?? "—"}</TableCell>
                      <TableCell className="text-sm">{whMap.get(t.destination_warehouse_id) ?? "—"}</TableCell>
                      <TableCell className="text-right font-mono">{Number(t.qty).toLocaleString("ru-RU")}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        <span suppressHydrationWarning>{new Date(t.created_at).toLocaleString("ru-RU")}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={STATUS_STYLE[t.status] ?? ""}>
                          {STATUS_LABEL[t.status] ?? t.status}
                        </Badge>
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
