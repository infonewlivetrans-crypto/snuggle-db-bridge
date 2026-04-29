import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { uploadPublicFile } from "@/lib/uploads";
import {
  PackageCheck,
  Truck,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  User as UserIcon,
  Image as ImageIcon,
  MessageSquare,
  Plus,
  Trash2,
  PlayCircle,
} from "lucide-react";

export const Route = createFileRoute("/warehouse-inbound")({
  head: () => ({
    meta: [
      { title: "Приём товара — Радиус Трек" },
      { name: "description", content: "Приём ожидаемых поступлений товара на склад." },
    ],
  }),
  component: WarehouseInboundPage,
});

type InboundStatus = "expected" | "arrived" | "receiving" | "accepted" | "problem";
type SourceType = "factory" | "other_warehouse" | "return";

const STATUS_LABELS: Record<InboundStatus, string> = {
  expected: "Ожидается",
  arrived: "Прибыло",
  receiving: "Приёмка",
  accepted: "Принято",
  problem: "Проблема",
};

const STATUS_VARIANTS: Record<InboundStatus, "default" | "secondary" | "destructive" | "outline"> = {
  expected: "outline",
  arrived: "secondary",
  receiving: "secondary",
  accepted: "default",
  problem: "destructive",
};

const SOURCE_LABELS: Record<SourceType, string> = {
  factory: "Завод",
  other_warehouse: "Другой склад",
  return: "Возврат",
};

function fmt(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const INBOUND_BUCKET = "route-point-photos"; // переиспользуем существующий публичный bucket

function WarehouseInboundPage() {
  const qc = useQueryClient();
  const [warehouseId, setWarehouseId] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [openId, setOpenId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [problemOpen, setProblemOpen] = useState(false);
  const [acceptedBy, setAcceptedBy] = useState("Кладовщик");
  const [warehouseComment, setWarehouseComment] = useState("");

  const { data: warehouses } = useQuery({
    queryKey: ["wh-inbound-warehouses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("warehouses").select("id,name,city").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: shipments, isLoading } = useQuery({
    queryKey: ["wh-inbound", warehouseId, statusFilter],
    queryFn: async () => {
      let q = supabase
        .from("inbound_shipments" as any)
        .select("*")
        .order("expected_at", { ascending: true, nullsFirst: false });
      if (warehouseId !== "all") q = q.eq("destination_warehouse_id", warehouseId);
      if (statusFilter === "active") {
        q = q.in("status", ["expected", "arrived", "receiving", "problem"]);
      } else if (statusFilter !== "all") {
        q = q.eq("status", statusFilter);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const shipmentIds = useMemo(() => (shipments ?? []).map((s) => s.id), [shipments]);

  const { data: items } = useQuery({
    queryKey: ["wh-inbound-items", shipmentIds],
    enabled: shipmentIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inbound_shipment_items" as any)
        .select("*")
        .in("shipment_id", shipmentIds);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const itemsByShipment = useMemo(() => {
    const m: Record<string, any[]> = {};
    for (const it of items ?? []) {
      (m[it.shipment_id] ??= []).push(it);
    }
    return m;
  }, [items]);

  const warehouseById = useMemo(
    () => Object.fromEntries((warehouses ?? []).map((w) => [w.id, w])),
    [warehouses],
  );

  const updateStatus = useMutation({
    mutationFn: async (args: {
      id: string;
      status: InboundStatus;
      patch?: Record<string, any>;
    }) => {
      const now = new Date().toISOString();
      const patch: Record<string, any> = { status: args.status, ...args.patch };
      if (args.status === "arrived" && !patch.arrived_at) patch.arrived_at = now;
      if (args.status === "receiving" && !patch.receiving_started_at) patch.receiving_started_at = now;
      if (args.status === "accepted") {
        patch.accepted_at = now;
        patch.accepted_by = acceptedBy || "Кладовщик";
        if (warehouseComment.trim()) patch.warehouse_comment = warehouseComment.trim();
      }
      const { error } = await supabase.from("inbound_shipments" as any).update(patch).eq("id", args.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Статус обновлён");
      qc.invalidateQueries({ queryKey: ["wh-inbound"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Ошибка"),
  });

  const open = openId ? (shipments ?? []).find((s) => s.id === openId) : null;
  const openItems = open ? itemsByShipment[open.id] ?? [] : [];

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <PackageCheck className="h-5 w-5" />
            <h1 className="text-2xl font-semibold">Приём товара</h1>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Новое поступление
          </Button>
        </div>

        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div>
            <Label className="mb-1 block text-xs text-muted-foreground">Склад приёма</Label>
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
          <div>
            <Label className="mb-1 block text-xs text-muted-foreground">Статус</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Активные</SelectItem>
                <SelectItem value="all">Все</SelectItem>
                <SelectItem value="expected">Ожидаются</SelectItem>
                <SelectItem value="arrived">Прибыли</SelectItem>
                <SelectItem value="receiving">Приёмка</SelectItem>
                <SelectItem value="accepted">Принято</SelectItem>
                <SelectItem value="problem">Проблема</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="ml-auto">
            <Label className="mb-1 block text-xs text-muted-foreground">Кто принимает</Label>
            <Input
              value={acceptedBy}
              onChange={(e) => setAcceptedBy(e.target.value)}
              className="w-[220px]"
              placeholder="Кладовщик / ФИО"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            Загрузка…
          </div>
        ) : (shipments ?? []).length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            Нет ожидаемых поступлений
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {(shipments ?? []).map((s) => {
              const status = s.status as InboundStatus;
              const its = itemsByShipment[s.id] ?? [];
              const wh = s.destination_warehouse_id ? warehouseById[s.destination_warehouse_id] : null;
              const docs = Array.isArray(s.docs_photo_urls) ? s.docs_photo_urls : [];
              return (
                <div
                  key={s.id}
                  className="cursor-pointer rounded-lg border border-border bg-card p-4 transition-colors hover:border-foreground/30"
                  onClick={() => {
                    setOpenId(s.id);
                    setWarehouseComment(s.warehouse_comment ?? "");
                  }}
                >
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div>
                      <div className="font-mono text-sm font-semibold">{s.shipment_number}</div>
                      <div className="text-xs text-muted-foreground">
                        {SOURCE_LABELS[s.source_type as SourceType] ?? s.source_type}
                        {s.source_name ? ` · ${s.source_name}` : ""}
                      </div>
                    </div>
                    <Badge variant={STATUS_VARIANTS[status]}>{STATUS_LABELS[status]}</Badge>
                  </div>
                  <div className="space-y-1 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <PackageCheck className="h-3.5 w-3.5" />
                      Склад: {wh?.name ?? "—"}
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5" />
                      Прибытие: {fmt(s.expected_at)}
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Truck className="h-3.5 w-3.5" />
                      {s.vehicle_plate ?? "—"}
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <UserIcon className="h-3.5 w-3.5" />
                      {s.driver_name ?? "—"}
                    </div>
                    {its.length > 0 && (
                      <div className="text-xs text-muted-foreground">Позиций: {its.length}</div>
                    )}
                    {docs.length > 0 && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <ImageIcon className="h-3.5 w-3.5" />
                        Документы: {docs.length}
                      </div>
                    )}
                    {s.comment && (
                      <div className="flex items-start gap-2 text-muted-foreground">
                        <MessageSquare className="mt-0.5 h-3.5 w-3.5" />
                        <span className="line-clamp-2">{s.comment}</span>
                      </div>
                    )}
                    {status === "accepted" && (
                      <div className="mt-2 rounded-md bg-secondary p-2 text-xs">
                        Принято: {s.accepted_by ?? "—"} · {fmt(s.accepted_at)}
                      </div>
                    )}
                    {status === "problem" && s.problem_reason && (
                      <div className="mt-2 rounded-md bg-destructive/10 p-2 text-xs text-destructive">
                        Проблема: {s.problem_reason}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Карточка поступления */}
        <Dialog open={!!openId} onOpenChange={(v) => !v && setOpenId(null)}>
          <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
            {open && (
              <>
                <DialogHeader>
                  <DialogTitle>Поступление {open.shipment_number}</DialogTitle>
                  <DialogDescription>
                    {SOURCE_LABELS[open.source_type as SourceType]}
                    {open.source_name ? ` · ${open.source_name}` : ""}
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <div className="text-xs text-muted-foreground">Склад приёма</div>
                      <div>
                        {open.destination_warehouse_id
                          ? warehouseById[open.destination_warehouse_id]?.name ?? "—"
                          : "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Прибытие</div>
                      <div>{fmt(open.expected_at)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Машина</div>
                      <div>{open.vehicle_plate ?? "—"}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Водитель</div>
                      <div>
                        {open.driver_name ?? "—"}
                        {open.driver_phone ? ` · ${open.driver_phone}` : ""}
                      </div>
                    </div>
                  </div>

                  {open.comment && (
                    <div className="rounded-md bg-secondary p-3 text-sm">
                      <div className="text-xs text-muted-foreground">Комментарий</div>
                      <div>{open.comment}</div>
                    </div>
                  )}

                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="text-sm font-semibold">Список товаров</h3>
                    </div>
                    {openItems.length === 0 ? (
                      <div className="rounded-md border border-border p-3 text-sm text-muted-foreground">
                        Позиции не указаны
                      </div>
                    ) : (
                      <div className="overflow-x-auto rounded-md border border-border">
                        <table className="w-full text-sm">
                          <thead className="bg-secondary text-xs">
                            <tr>
                              <th className="px-3 py-2 text-left">Товар</th>
                              <th className="px-3 py-2 text-left">Артикул</th>
                              <th className="px-3 py-2 text-right">Ожидается</th>
                              <th className="px-3 py-2 text-right">Принято</th>
                              <th className="px-3 py-2 text-left">Ед.</th>
                              <th className="px-3 py-2 text-left">Комментарий</th>
                            </tr>
                          </thead>
                          <tbody>
                            {openItems.map((it) => (
                              <ReceivedRow
                                key={it.id}
                                item={it}
                                onSaved={() =>
                                  qc.invalidateQueries({ queryKey: ["wh-inbound-items"] })
                                }
                              />
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <div>
                    <Label className="mb-1 block text-xs text-muted-foreground">
                      Фото документов
                    </Label>
                    <DocsUploader
                      shipmentId={open.id}
                      urls={Array.isArray(open.docs_photo_urls) ? open.docs_photo_urls : []}
                      onChanged={() => qc.invalidateQueries({ queryKey: ["wh-inbound"] })}
                    />
                  </div>

                  <div>
                    <Label className="mb-1 block text-xs text-muted-foreground">
                      Комментарий склада
                    </Label>
                    <Textarea
                      value={warehouseComment}
                      onChange={(e) => setWarehouseComment(e.target.value)}
                      rows={2}
                      placeholder="Комментарий при приёмке"
                    />
                  </div>

                  {open.status === "problem" && (
                    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
                      <div className="font-semibold text-destructive">Проблема</div>
                      <div className="mt-1">Причина: {open.problem_reason ?? "—"}</div>
                      {open.problem_comment && <div>Комментарий: {open.problem_comment}</div>}
                      {open.problem_photo_url && (
                        <a
                          href={open.problem_photo_url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-block text-xs underline"
                        >
                          Открыть фото
                        </a>
                      )}
                    </div>
                  )}
                </div>

                <DialogFooter className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    disabled={open.status !== "expected"}
                    onClick={() => updateStatus.mutate({ id: open.id, status: "arrived" })}
                  >
                    <Truck className="mr-1 h-4 w-4" /> Машина прибыла
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={!["arrived", "expected"].includes(open.status)}
                    onClick={() => updateStatus.mutate({ id: open.id, status: "receiving" })}
                  >
                    <PlayCircle className="mr-1 h-4 w-4" /> Начать приёмку
                  </Button>
                  <Button
                    disabled={open.status === "accepted"}
                    onClick={() => updateStatus.mutate({ id: open.id, status: "accepted" })}
                  >
                    <CheckCircle2 className="mr-1 h-4 w-4" /> Принять товар
                  </Button>
                  <Button variant="destructive" onClick={() => setProblemOpen(true)}>
                    <AlertTriangle className="mr-1 h-4 w-4" /> Сообщить о проблеме
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Создание поступления */}
        <CreateShipmentDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          warehouses={warehouses ?? []}
          onCreated={() => qc.invalidateQueries({ queryKey: ["wh-inbound"] })}
        />

        {/* Проблема */}
        <ProblemDialog
          open={problemOpen}
          onOpenChange={setProblemOpen}
          shipmentId={open?.id ?? null}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["wh-inbound"] });
            setProblemOpen(false);
          }}
        />
      </main>
    </div>
  );
}

function ReceivedRow({ item, onSaved }: { item: any; onSaved: () => void }) {
  const [qty, setQty] = useState<string>(
    item.qty_received != null ? String(item.qty_received) : "",
  );
  const [comment, setComment] = useState<string>(item.comment ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("inbound_shipment_items" as any)
        .update({
          qty_received: qty === "" ? null : Number(qty),
          comment: comment.trim() || null,
        })
        .eq("id", item.id);
      if (error) throw error;
      onSaved();
      toast.success("Сохранено");
    } catch (e: any) {
      toast.error(e.message ?? "Ошибка");
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr className="border-t border-border">
      <td className="px-3 py-2">{item.product_name}</td>
      <td className="px-3 py-2 text-muted-foreground">{item.sku ?? "—"}</td>
      <td className="px-3 py-2 text-right">{item.qty_expected}</td>
      <td className="px-3 py-2">
        <Input
          type="number"
          step="any"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          onBlur={save}
          className="h-8 w-24 text-right"
          disabled={saving}
        />
      </td>
      <td className="px-3 py-2 text-muted-foreground">{item.unit ?? "—"}</td>
      <td className="px-3 py-2">
        <Input
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          onBlur={save}
          className="h-8"
          placeholder="—"
          disabled={saving}
        />
      </td>
    </tr>
  );
}

function DocsUploader({
  shipmentId,
  urls,
  onChanged,
}: {
  shipmentId: string;
  urls: string[];
  onChanged: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    try {
      const url = await uploadPublicFile(INBOUND_BUCKET, f, `inbound/${shipmentId}`);
      const next = [...urls, url];
      const { error } = await supabase
        .from("inbound_shipments" as any)
        .update({ docs_photo_urls: next })
        .eq("id", shipmentId);
      if (error) throw error;
      onChanged();
      toast.success("Документ загружен");
    } catch (err: any) {
      toast.error(err.message ?? "Ошибка загрузки");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }
  async function remove(url: string) {
    const next = urls.filter((u) => u !== url);
    const { error } = await supabase
      .from("inbound_shipments" as any)
      .update({ docs_photo_urls: next })
      .eq("id", shipmentId);
    if (error) toast.error(error.message);
    else onChanged();
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {urls.map((u) => (
          <div key={u} className="relative">
            <a href={u} target="_blank" rel="noreferrer">
              <img src={u} alt="doc" className="h-20 w-20 rounded-md border border-border object-cover" />
            </a>
            <button
              type="button"
              onClick={() => remove(u)}
              className="absolute -right-2 -top-2 rounded-full bg-destructive p-1 text-destructive-foreground"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
      <Input type="file" accept="image/*" onChange={onFile} disabled={uploading} />
    </div>
  );
}

function CreateShipmentDialog({
  open,
  onOpenChange,
  warehouses,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  warehouses: { id: string; name: string; city: string | null }[];
  onCreated: () => void;
}) {
  const [sourceType, setSourceType] = useState<SourceType>("factory");
  const [sourceName, setSourceName] = useState("");
  const [destWh, setDestWh] = useState<string>("");
  const [expectedAt, setExpectedAt] = useState<string>("");
  const [plate, setPlate] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [comment, setComment] = useState("");
  const [items, setItems] = useState<{ name: string; sku: string; unit: string; qty: string }[]>([
    { name: "", sku: "", unit: "шт", qty: "1" },
  ]);
  const [saving, setSaving] = useState(false);

  function reset() {
    setSourceType("factory");
    setSourceName("");
    setDestWh("");
    setExpectedAt("");
    setPlate("");
    setDriverName("");
    setDriverPhone("");
    setComment("");
    setItems([{ name: "", sku: "", unit: "шт", qty: "1" }]);
  }

  async function submit() {
    if (!destWh) {
      toast.error("Укажите склад приёма");
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("inbound_shipments" as any)
        .insert({
          source_type: sourceType,
          source_name: sourceName.trim() || null,
          destination_warehouse_id: destWh,
          expected_at: expectedAt ? new Date(expectedAt).toISOString() : null,
          vehicle_plate: plate.trim() || null,
          driver_name: driverName.trim() || null,
          driver_phone: driverPhone.trim() || null,
          comment: comment.trim() || null,
          status: "expected",
        })
        .select("id")
        .single();
      if (error) throw error;
      const shipmentId = (data as any).id as string;
      const validItems = items
        .filter((it) => it.name.trim().length > 0)
        .map((it) => ({
          shipment_id: shipmentId,
          product_name: it.name.trim(),
          sku: it.sku.trim() || null,
          unit: it.unit.trim() || null,
          qty_expected: Number(it.qty || 0),
        }));
      if (validItems.length > 0) {
        const { error: e2 } = await supabase
          .from("inbound_shipment_items" as any)
          .insert(validItems);
        if (e2) throw e2;
      }
      toast.success("Поступление создано");
      onCreated();
      onOpenChange(false);
      reset();
    } catch (e: any) {
      toast.error(e.message ?? "Ошибка");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Новое поступление</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label className="mb-1 block text-xs text-muted-foreground">Источник</Label>
              <Select value={sourceType} onValueChange={(v) => setSourceType(v as SourceType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="factory">Завод</SelectItem>
                  <SelectItem value="other_warehouse">Другой склад</SelectItem>
                  <SelectItem value="return">Возврат</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1 block text-xs text-muted-foreground">Название источника</Label>
              <Input value={sourceName} onChange={(e) => setSourceName(e.target.value)} />
            </div>
            <div>
              <Label className="mb-1 block text-xs text-muted-foreground">Склад приёма *</Label>
              <Select value={destWh} onValueChange={setDestWh}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите склад" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name} {w.city ? `· ${w.city}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1 block text-xs text-muted-foreground">Дата и время прибытия</Label>
              <Input
                type="datetime-local"
                value={expectedAt}
                onChange={(e) => setExpectedAt(e.target.value)}
              />
            </div>
            <div>
              <Label className="mb-1 block text-xs text-muted-foreground">Машина (номер)</Label>
              <Input value={plate} onChange={(e) => setPlate(e.target.value)} />
            </div>
            <div>
              <Label className="mb-1 block text-xs text-muted-foreground">Водитель</Label>
              <Input value={driverName} onChange={(e) => setDriverName(e.target.value)} />
            </div>
            <div>
              <Label className="mb-1 block text-xs text-muted-foreground">Телефон водителя</Label>
              <Input value={driverPhone} onChange={(e) => setDriverPhone(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="mb-1 block text-xs text-muted-foreground">Комментарий</Label>
            <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Список товаров</h3>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setItems((arr) => [...arr, { name: "", sku: "", unit: "шт", qty: "1" }])
                }
              >
                <Plus className="mr-1 h-3 w-3" /> Добавить
              </Button>
            </div>
            <div className="space-y-2">
              {items.map((it, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2">
                  <Input
                    className="col-span-5"
                    placeholder="Название"
                    value={it.name}
                    onChange={(e) =>
                      setItems((arr) => arr.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)))
                    }
                  />
                  <Input
                    className="col-span-3"
                    placeholder="Артикул"
                    value={it.sku}
                    onChange={(e) =>
                      setItems((arr) => arr.map((x, i) => (i === idx ? { ...x, sku: e.target.value } : x)))
                    }
                  />
                  <Input
                    className="col-span-2"
                    type="number"
                    placeholder="Кол-во"
                    value={it.qty}
                    onChange={(e) =>
                      setItems((arr) => arr.map((x, i) => (i === idx ? { ...x, qty: e.target.value } : x)))
                    }
                  />
                  <Input
                    className="col-span-1"
                    placeholder="Ед."
                    value={it.unit}
                    onChange={(e) =>
                      setItems((arr) => arr.map((x, i) => (i === idx ? { ...x, unit: e.target.value } : x)))
                    }
                  />
                  <Button
                    className="col-span-1"
                    variant="ghost"
                    size="icon"
                    onClick={() => setItems((arr) => arr.filter((_, i) => i !== idx))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={submit} disabled={saving}>
            Создать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProblemDialog({
  open,
  onOpenChange,
  shipmentId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  shipmentId: string | null;
  onSaved: () => void;
}) {
  const [reason, setReason] = useState("");
  const [comment, setComment] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string>("");
  const [saving, setSaving] = useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f || !shipmentId) return;
    try {
      const url = await uploadPublicFile(INBOUND_BUCKET, f, `inbound/${shipmentId}/problem`);
      setPhotoUrl(url);
    } catch (err: any) {
      toast.error(err.message ?? "Ошибка загрузки");
    } finally {
      e.target.value = "";
    }
  }

  async function submit() {
    if (!shipmentId) return;
    if (!reason.trim()) {
      toast.error("Укажите причину");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("inbound_shipments" as any)
        .update({
          status: "problem",
          problem_reason: reason.trim(),
          problem_comment: comment.trim() || null,
          problem_photo_url: photoUrl || null,
        })
        .eq("id", shipmentId);
      if (error) throw error;
      toast.success("Проблема зафиксирована");
      onSaved();
      setReason("");
      setComment("");
      setPhotoUrl("");
    } catch (e: any) {
      toast.error(e.message ?? "Ошибка");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Сообщить о проблеме</DialogTitle>
          <DialogDescription>
            Укажите причину, комментарий и при необходимости приложите фото.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="mb-1 block text-xs text-muted-foreground">Причина *</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Например: брак, недостача, повреждение тары"
            />
          </div>
          <div>
            <Label className="mb-1 block text-xs text-muted-foreground">Комментарий</Label>
            <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} />
          </div>
          <div>
            <Label className="mb-1 block text-xs text-muted-foreground">Фото</Label>
            <Input type="file" accept="image/*" onChange={onFile} />
            {photoUrl && (
              <a href={photoUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block">
                <img src={photoUrl} alt="problem" className="h-24 w-24 rounded-md border border-border object-cover" />
              </a>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button variant="destructive" onClick={submit} disabled={saving}>
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
