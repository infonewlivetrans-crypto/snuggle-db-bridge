import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { ArrowLeftRight, Plus, Send, Truck, CheckCircle2, XCircle, History } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/warehouse-transfers")({
  head: () => ({
    meta: [
      { title: "Перемещения — Радиус Трек" },
      { name: "description", content: "Перемещения товара между складами" },
    ],
  }),
  component: WarehouseTransfersPage,
});

type TransferStatus =
  | "draft"
  | "awaiting_send"
  | "in_transit"
  | "arrived"
  | "accepted"
  | "cancelled";

const STATUS_LABEL: Record<TransferStatus, string> = {
  draft: "Черновик",
  awaiting_send: "Ожидает отправки",
  in_transit: "В пути",
  arrived: "Прибыло",
  accepted: "Принято",
  cancelled: "Отменено",
};

const STATUS_STYLE: Record<TransferStatus, string> = {
  draft: "border-slate-300 bg-slate-100 text-slate-900",
  awaiting_send: "border-amber-300 bg-amber-100 text-amber-900",
  in_transit: "border-blue-300 bg-blue-100 text-blue-900",
  arrived: "border-purple-300 bg-purple-100 text-purple-900",
  accepted: "border-green-300 bg-green-100 text-green-900",
  cancelled: "border-zinc-300 bg-zinc-100 text-zinc-900",
};

type Transfer = {
  id: string;
  transfer_number: string;
  source_warehouse_id: string;
  destination_warehouse_id: string;
  product_id: string;
  qty: number;
  status: TransferStatus;
  sent_at: string | null;
  arrived_at: string | null;
  accepted_at: string | null;
  comment: string | null;
  created_by: string | null;
  in_transit_id: string | null;
  created_at: string;
};

type Warehouse = { id: string; name: string };
type Product = { id: string; name: string; sku: string | null; unit: string | null };

function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function generateTransferNumber() {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rnd = Math.floor(1000 + Math.random() * 9000);
  return `ПЕР-${ymd}-${rnd}`;
}

function WarehouseTransfersPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<TransferStatus | "all">("all");
  const [createOpen, setCreateOpen] = useState(false);

  const { data: transfers = [], isLoading } = useQuery({
    queryKey: ["stock-transfers"],
    queryFn: async () => {
      const { data, error } = await db
        .from("stock_transfers")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Transfer[];
    },
  });

  const { data: warehouses = [] } = useQuery({
    queryKey: ["warehouses-min"],
    queryFn: async () => {
      const { data, error } = await db.from("warehouses").select("id, name").order("name");
      if (error) throw error;
      return (data ?? []) as Warehouse[];
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products-min"],
    queryFn: async () => {
      const { data, error } = await db
        .from("products")
        .select("id, name, sku, unit")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Product[];
    },
  });

  const whMap = useMemo(() => {
    const m = new Map<string, Warehouse>();
    warehouses.forEach((w) => m.set(w.id, w));
    return m;
  }, [warehouses]);

  const prodMap = useMemo(() => {
    const m = new Map<string, Product>();
    products.forEach((p) => m.set(p.id, p));
    return m;
  }, [products]);

  const filtered = useMemo(() => {
    if (statusFilter === "all") return transfers;
    return transfers.filter((t) => t.status === statusFilter);
  }, [transfers, statusFilter]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["stock-transfers"] });
  };

  // Send transfer: create supply_in_transit, log movement (outbound from source)
  const sendTransfer = async (t: Transfer) => {
    try {
      // 1) Create in-transit record at destination
      const { data: inTransit, error: itErr } = await db
        .from("supply_in_transit")
        .insert({
          product_id: t.product_id,
          destination_warehouse_id: t.destination_warehouse_id,
          source_type: "warehouse",
          source_warehouse_id: t.source_warehouse_id,
          source_name: whMap.get(t.source_warehouse_id)?.name ?? null,
          qty: t.qty,
          status: "in_transit",
        })
        .select()
        .single();
      if (itErr) throw itErr;

      // 2) Decrease available at source via outbound movement
      const { error: mvErr } = await db.from("stock_movements").insert({
        product_id: t.product_id,
        warehouse_id: t.source_warehouse_id,
        movement_type: "transfer",
        qty: -Number(t.qty),
        reason: "transfer_sent",
        comment: `Перемещение ${t.transfer_number} → ${whMap.get(t.destination_warehouse_id)?.name ?? "склад"}`,
        created_by: t.created_by,
      });
      if (mvErr) throw mvErr;

      // 3) Update transfer
      const { error: upErr } = await db
        .from("stock_transfers")
        .update({
          status: "in_transit",
          sent_at: new Date().toISOString(),
          in_transit_id: inTransit?.id ?? null,
        })
        .eq("id", t.id);
      if (upErr) throw upErr;

      toast.success("Перемещение отправлено");
      refresh();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Ошибка: ${msg}`);
    }
  };

  const markArrived = async (t: Transfer) => {
    try {
      const { error } = await db
        .from("stock_transfers")
        .update({ status: "arrived", arrived_at: new Date().toISOString() })
        .eq("id", t.id);
      if (error) throw error;
      toast.success("Отмечено: прибыло");
      refresh();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Ошибка: ${msg}`);
    }
  };

  // Accept: remove in-transit, increase available at destination, log inbound
  const acceptTransfer = async (t: Transfer) => {
    try {
      // 1) Remove in-transit record
      if (t.in_transit_id) {
        const { error: delErr } = await db
          .from("supply_in_transit")
          .delete()
          .eq("id", t.in_transit_id);
        if (delErr) throw delErr;
      }

      // 2) Increase available at destination via inbound movement
      const { error: mvErr } = await db.from("stock_movements").insert({
        product_id: t.product_id,
        warehouse_id: t.destination_warehouse_id,
        movement_type: "transfer",
        qty: Number(t.qty),
        reason: "transfer_accepted",
        comment: `Перемещение ${t.transfer_number} ← ${whMap.get(t.source_warehouse_id)?.name ?? "склад"}`,
        created_by: t.created_by,
      });
      if (mvErr) throw mvErr;

      // 3) Update transfer
      const { error: upErr } = await db
        .from("stock_transfers")
        .update({
          status: "accepted",
          accepted_at: new Date().toISOString(),
          arrived_at: t.arrived_at ?? new Date().toISOString(),
        })
        .eq("id", t.id);
      if (upErr) throw upErr;

      toast.success("Перемещение принято");
      refresh();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Ошибка: ${msg}`);
    }
  };

  const cancelTransfer = async (t: Transfer) => {
    try {
      // If already in transit, return goods back: remove in-transit, return inbound to source
      if ((t.status === "in_transit" || t.status === "arrived") && t.in_transit_id) {
        await db.from("supply_in_transit").delete().eq("id", t.in_transit_id);
        await db.from("stock_movements").insert({
          product_id: t.product_id,
          warehouse_id: t.source_warehouse_id,
          movement_type: "transfer",
          qty: Number(t.qty),
          reason: "transfer_cancelled_return",
          comment: `Отмена перемещения ${t.transfer_number}`,
          created_by: t.created_by,
        });
      }
      const { error } = await db
        .from("stock_transfers")
        .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
        .eq("id", t.id);
      if (error) throw error;
      toast.success("Перемещение отменено");
      refresh();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Ошибка: ${msg}`);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
              <ArrowLeftRight className="h-6 w-6" />
              Перемещения
            </h1>
            <p className="text-sm text-muted-foreground">
              Ручное перемещение товара между складами
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link to="/warehouse-movements" search={{ productId: undefined }}>
                <History className="mr-2 h-4 w-4" />
                Журнал движения
              </Link>
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Новое перемещение
            </Button>
          </div>
        </div>

        <Card className="mb-4">
          <CardContent className="flex flex-wrap items-center gap-3 py-4">
            <div className="text-sm text-muted-foreground">Статус:</div>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as TransferStatus | "all")}
            >
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все</SelectItem>
                {(Object.keys(STATUS_LABEL) as TransferStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="ml-auto text-sm text-muted-foreground">
              Всего: {filtered.length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Номер</TableHead>
                  <TableHead>Откуда</TableHead>
                  <TableHead>Куда</TableHead>
                  <TableHead>Товар</TableHead>
                  <TableHead className="text-right">Кол-во</TableHead>
                  <TableHead>Отправка</TableHead>
                  <TableHead>Прибытие</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Комментарий</TableHead>
                  <TableHead className="text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={10} className="py-8 text-center text-muted-foreground">
                      Загрузка…
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="py-8 text-center text-muted-foreground">
                      Перемещений пока нет
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((t) => {
                    const product = prodMap.get(t.product_id);
                    return (
                      <TableRow key={t.id}>
                        <TableCell className="font-mono text-xs">{t.transfer_number}</TableCell>
                        <TableCell>{whMap.get(t.source_warehouse_id)?.name ?? "—"}</TableCell>
                        <TableCell>{whMap.get(t.destination_warehouse_id)?.name ?? "—"}</TableCell>
                        <TableCell>
                          <div className="font-medium">{product?.name ?? "—"}</div>
                          {product?.sku && (
                            <div className="text-xs text-muted-foreground">{product.sku}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {Number(t.qty)} {product?.unit ?? ""}
                        </TableCell>
                        <TableCell className="text-xs">{fmtDateTime(t.sent_at)}</TableCell>
                        <TableCell className="text-xs">{fmtDateTime(t.arrived_at)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={STATUS_STYLE[t.status]}>
                            {STATUS_LABEL[t.status]}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">
                          {t.comment ?? ""}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {(t.status === "draft" || t.status === "awaiting_send") && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => sendTransfer(t)}
                              >
                                <Send className="mr-1 h-3 w-3" />
                                Отправить
                              </Button>
                            )}
                            {t.status === "in_transit" && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => markArrived(t)}
                              >
                                <Truck className="mr-1 h-3 w-3" />
                                Прибыло
                              </Button>
                            )}
                            {(t.status === "in_transit" || t.status === "arrived") && (
                              <Button size="sm" onClick={() => acceptTransfer(t)}>
                                <CheckCircle2 className="mr-1 h-3 w-3" />
                                Принять
                              </Button>
                            )}
                            {t.status !== "accepted" && t.status !== "cancelled" && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => cancelTransfer(t)}
                              >
                                <XCircle className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>

      <CreateTransferDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        warehouses={warehouses}
        products={products}
        onCreated={refresh}
      />
    </div>
  );
}

function CreateTransferDialog({
  open,
  onOpenChange,
  warehouses,
  products,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  warehouses: Warehouse[];
  products: Product[];
  onCreated: () => void;
}) {
  const [sourceId, setSourceId] = useState<string>("");
  const [destId, setDestId] = useState<string>("");
  const [productId, setProductId] = useState<string>("");
  const [qty, setQty] = useState<string>("1");
  const [comment, setComment] = useState<string>("");
  const [createdBy, setCreatedBy] = useState<string>("");
  const [sendNow, setSendNow] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setSourceId("");
    setDestId("");
    setProductId("");
    setQty("1");
    setComment("");
    setCreatedBy("");
    setSendNow(true);
  };

  const submit = async () => {
    if (!sourceId || !destId || !productId) {
      toast.error("Заполните склады и товар");
      return;
    }
    if (sourceId === destId) {
      toast.error("Склад отправления и назначения должны различаться");
      return;
    }
    const qtyNum = Number(qty);
    if (!qtyNum || qtyNum <= 0) {
      toast.error("Количество должно быть больше 0");
      return;
    }
    setSubmitting(true);
    try {
      const number = generateTransferNumber();
      const sourceName = warehouses.find((w) => w.id === sourceId)?.name ?? null;
      const destName = warehouses.find((w) => w.id === destId)?.name ?? null;

      const { data: created, error } = await db
        .from("stock_transfers")
        .insert({
          transfer_number: number,
          source_warehouse_id: sourceId,
          destination_warehouse_id: destId,
          product_id: productId,
          qty: qtyNum,
          status: sendNow ? "in_transit" : "draft",
          comment: comment || null,
          created_by: createdBy || null,
          sent_at: sendNow ? new Date().toISOString() : null,
        })
        .select()
        .single();
      if (error) throw error;

      if (sendNow && created) {
        // Create supply_in_transit
        const { data: inTransit } = await db
          .from("supply_in_transit")
          .insert({
            product_id: productId,
            destination_warehouse_id: destId,
            source_type: "warehouse",
            source_warehouse_id: sourceId,
            source_name: sourceName,
            qty: qtyNum,
            status: "in_transit",
          })
          .select()
          .single();

        // Log outbound movement at source
        await db.from("stock_movements").insert({
          product_id: productId,
          warehouse_id: sourceId,
          movement_type: "transfer",
          qty: -qtyNum,
          reason: "transfer_sent",
          comment: `Перемещение ${number} → ${destName ?? "склад"}`,
          created_by: createdBy || null,
        });

        if (inTransit?.id) {
          await db
            .from("stock_transfers")
            .update({ in_transit_id: inTransit.id })
            .eq("id", created.id);
        }
      }

      toast.success(sendNow ? "Перемещение создано и отправлено" : "Черновик создан");
      reset();
      onCreated();
      onOpenChange(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Ошибка: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Новое перемещение</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Откуда</label>
              <Select value={sourceId} onValueChange={setSourceId}>
                <SelectTrigger>
                  <SelectValue placeholder="Склад отправления" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Куда</label>
              <Select value={destId} onValueChange={setDestId}>
                <SelectTrigger>
                  <SelectValue placeholder="Склад назначения" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Товар</label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger>
                <SelectValue placeholder="Выберите товар" />
              </SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} {p.sku ? `(${p.sku})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Количество</label>
              <Input
                type="number"
                min={0}
                step="any"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Кто создал</label>
              <Input
                value={createdBy}
                onChange={(e) => setCreatedBy(e.target.value)}
                placeholder="ФИО"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Комментарий</label>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={sendNow}
              onChange={(e) => setSendNow(e.target.checked)}
              className="h-4 w-4"
            />
            Сразу отправить (списать с склада отправления, добавить «в пути»)
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Отмена
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? "Создание…" : "Создать"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
