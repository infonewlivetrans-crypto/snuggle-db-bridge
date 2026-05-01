import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Search, Package2, Plus, Trash2, ArrowUp, ArrowDown, FileSpreadsheet, Pencil } from "lucide-react";
import { STATUS_LABELS, STATUS_STYLES, type Order, type OrderStatus } from "@/lib/orders";
import { RequestImportWizard } from "@/components/RequestImportWizard";

type RequestOrder = {
  id: string; // route_points.id
  order_id: string;
  point_number: number;
  order: {
    id: string;
    order_number: string;
    status: OrderStatus;
    delivery_address: string | null;
    contact_name: string | null;
    amount_due: number | null;
    delivery_cost: number | null;
  };
};

const ELIGIBLE_STATUSES: OrderStatus[] = ["new", "in_progress", "ready_for_delivery"];

export function RequestOrdersBlock({ requestId }: { requestId: string }) {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [editPoint, setEditPoint] = useState<RequestOrder | null>(null);

  const { data: items, isLoading } = useQuery({
    queryKey: ["request-orders", requestId],
    queryFn: async (): Promise<RequestOrder[]> => {
      const { data, error } = await supabase
        .from("route_points")
        .select(
          "id, order_id, point_number, order:order_id(id, order_number, status, delivery_address, contact_name, amount_due, delivery_cost)",
        )
        .eq("route_id", requestId)
        .order("point_number", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as RequestOrder[];
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["request-orders", requestId] });
    queryClient.invalidateQueries({ queryKey: ["transport-request", requestId] });
    queryClient.invalidateQueries({ queryKey: ["transport-requests"] });
    queryClient.invalidateQueries({ queryKey: ["request-totals", requestId] });
    queryClient.invalidateQueries({ queryKey: ["delivery-route-points"] });
  };

  const removeMutation = useMutation({
    mutationFn: async (pointId: string) => {
      const { error } = await supabase.from("route_points").delete().eq("id", pointId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Заказ удалён из заявки");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reorderMutation = useMutation({
    mutationFn: async ({ index, dir }: { index: number; dir: -1 | 1 }) => {
      const list = items ?? [];
      const j = index + dir;
      if (j < 0 || j >= list.length) return;
      const a = list[index];
      const b = list[j];
      // swap point_number through a temporary value to avoid unique conflicts
      const tmp = -Math.floor(Math.random() * 1_000_000) - 1;
      const { error: e1 } = await supabase
        .from("route_points")
        .update({ point_number: tmp })
        .eq("id", a.id);
      if (e1) throw e1;
      const { error: e2 } = await supabase
        .from("route_points")
        .update({ point_number: a.point_number })
        .eq("id", b.id);
      if (e2) throw e2;
      const { error: e3 } = await supabase
        .from("route_points")
        .update({ point_number: b.point_number })
        .eq("id", a.id);
      if (e3) throw e3;
    },
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });

  const list = items ?? [];
  const nextPoint = list.length + 1;

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <Package2 className="h-3.5 w-3.5" />
          Точки маршрута {items ? `· ${items.length}` : ""}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setImportOpen(true)}
            className="gap-1.5"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Импорт из файла
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setManualOpen(true)}
            className="gap-1.5"
          >
            <Plus className="h-4 w-4" />
            Точка вручную
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Добавить заказ
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Загрузка...</div>
      ) : list.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          В заявке пока нет точек. Загрузите файл или добавьте вручную.
        </div>
      ) : (
        <ul className="space-y-2">
          {list.map((it, idx) => {
            const o = it.order;
            const sum = o.amount_due ?? o.delivery_cost ?? 0;
            return (
              <li
                key={it.id}
                className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-secondary/30 p-3"
              >
                <div className="flex flex-col">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => reorderMutation.mutate({ index: idx, dir: -1 })}
                    disabled={idx === 0 || reorderMutation.isPending}
                    aria-label="Выше"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => reorderMutation.mutate({ index: idx, dir: 1 })}
                    disabled={idx === list.length - 1 || reorderMutation.isPending}
                    aria-label="Ниже"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {it.point_number}
                </div>
                <div className="font-mono text-sm font-semibold text-foreground">
                  {o.order_number}
                </div>
                <Badge variant="outline" className={STATUS_STYLES[o.status]}>
                  {STATUS_LABELS[o.status]}
                </Badge>
                <div className="flex-1 min-w-[200px] text-sm">
                  <div className="text-foreground">
                    {o.contact_name || (
                      <span className="italic text-muted-foreground">Клиент не указан</span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {o.delivery_address || "—"}
                  </div>
                </div>
                <div className="text-right text-sm font-semibold text-foreground">
                  {Number(sum).toLocaleString("ru-RU")} ₽
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setEditPoint(it)}
                  aria-label="Редактировать"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:bg-destructive/10"
                  onClick={() => removeMutation.mutate(it.id)}
                  disabled={removeMutation.isPending}
                  aria-label="Удалить из заявки"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <AddOrdersDialog
        requestId={requestId}
        open={addOpen}
        onOpenChange={setAddOpen}
        existingOrderIds={list.map((i) => i.order_id)}
        nextPointNumber={nextPoint}
      />

      <RequestImportWizard
        requestId={requestId}
        open={importOpen}
        onOpenChange={setImportOpen}
        startPointNumber={nextPoint}
      />

      <ManualPointDialog
        requestId={requestId}
        open={manualOpen}
        onOpenChange={setManualOpen}
        nextPointNumber={nextPoint}
        onSaved={invalidate}
      />

      {editPoint && (
        <EditPointDialog
          point={editPoint}
          open={!!editPoint}
          onOpenChange={(v) => !v && setEditPoint(null)}
          onSaved={invalidate}
        />
      )}
    </div>
  );
}

function ManualPointDialog({
  requestId,
  open,
  onOpenChange,
  nextPointNumber,
  onSaved,
}: {
  requestId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  nextPointNumber: number;
  onSaved: () => void;
}) {
  const [contact, setContact] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [goods, setGoods] = useState("");
  const [weight, setWeight] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setContact("");
    setPhone("");
    setAddress("");
    setGoods("");
    setWeight("");
    setComment("");
  };

  const submit = async () => {
    if (!address.trim()) {
      toast.error("Укажите адрес выгрузки");
      return;
    }
    setBusy(true);
    try {
      const orderNumber = `MAN-${Date.now().toString().slice(-7)}`;
      const { data: ord, error: ordErr } = await supabase
        .from("orders")
        .insert({
          order_number: orderNumber,
          contact_name: contact.trim() || null,
          contact_phone: phone.trim() || null,
          delivery_address: address.trim(),
          total_weight_kg: weight ? Number(weight.replace(",", ".")) : null,
          comment: [goods.trim(), comment.trim()].filter(Boolean).join(" · ") || null,
          payment_type: "cash",
          delivery_cost: 0,
          source: "manual",
        } as never)
        .select("id")
        .single();
      if (ordErr || !ord) throw ordErr ?? new Error("Не удалось создать заказ");
      const { error: rpErr } = await supabase.from("route_points").insert({
        route_id: requestId,
        order_id: (ord as { id: string }).id,
        point_number: nextPointNumber,
      } as never);
      if (rpErr) throw rpErr;
      toast.success("Точка добавлена");
      onSaved();
      onOpenChange(false);
      reset();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Точка маршрута вручную</DialogTitle>
          <DialogDescription>Будет создан заказ и добавлен в конец маршрута</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Адрес выгрузки *</Label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Контакт</Label>
              <Input value={contact} onChange={(e) => setContact(e.target.value)} />
            </div>
            <div>
              <Label>Телефон</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Груз</Label>
              <Input value={goods} onChange={(e) => setGoods(e.target.value)} />
            </div>
            <div>
              <Label>Вес, кг</Label>
              <Input value={weight} onChange={(e) => setWeight(e.target.value)} inputMode="decimal" />
            </div>
          </div>
          <div>
            <Label>Комментарий</Label>
            <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Отмена
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Сохранение..." : "Добавить точку"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditPointDialog({
  point,
  open,
  onOpenChange,
  onSaved,
}: {
  point: RequestOrder;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const [address, setAddress] = useState(point.order.delivery_address ?? "");
  const [contact, setContact] = useState(point.order.contact_name ?? "");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const { error } = await supabase
        .from("orders")
        .update({
          delivery_address: address.trim() || null,
          contact_name: contact.trim() || null,
        })
        .eq("id", point.order_id);
      if (error) throw error;
      toast.success("Сохранено");
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Редактирование точки {point.order.order_number}</DialogTitle>
          <DialogDescription>Адрес выгрузки и контакт</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Адрес</Label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div>
            <Label>Контакт</Label>
            <Input value={contact} onChange={(e) => setContact(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Отмена
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Сохранение..." : "Сохранить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddOrdersDialog({
  requestId,
  open,
  onOpenChange,
  existingOrderIds,
  nextPointNumber,
}: {
  requestId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  existingOrderIds: string[];
  nextPointNumber: number;
}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: orders, isLoading } = useQuery({
    queryKey: ["available-orders-for-request"],
    enabled: open,
    queryFn: async (): Promise<Order[]> => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .in("status", ELIGIBLE_STATUSES)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Order[];
    },
  });

  const available = (orders ?? []).filter((o) => !existingOrderIds.includes(o.id));
  const filtered = available.filter((o) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      o.order_number.toLowerCase().includes(q) ||
      (o.delivery_address?.toLowerCase().includes(q) ?? false) ||
      (o.contact_name?.toLowerCase().includes(q) ?? false)
    );
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      if (selected.size === 0) return;
      const rows = Array.from(selected).map((order_id, idx) => ({
        route_id: requestId,
        order_id,
        point_number: nextPointNumber + idx,
      }));
      const { error } = await supabase.from("route_points").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["request-orders", requestId] });
      queryClient.invalidateQueries({ queryKey: ["transport-request", requestId] });
      queryClient.invalidateQueries({ queryKey: ["transport-requests"] });
      toast.success(`Добавлено заказов: ${selected.size}`);
      setSelected(new Set());
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Добавить заказы в заявку</DialogTitle>
          <DialogDescription>
            Доступны заказы со статусом «Новый», «В работе» и «Готов к доставке»
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Поиск по номеру, адресу или клиенту..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 -mx-1 px-1">
          {isLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Загрузка...</div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Нет подходящих заказов
            </div>
          ) : (
            filtered.map((o) => {
              const checked = selected.has(o.id);
              return (
                <Card
                  key={o.id}
                  className={`flex cursor-pointer items-center gap-3 p-3 transition-colors ${
                    checked ? "border-primary bg-primary/5" : ""
                  }`}
                  onClick={() => toggle(o.id)}
                >
                  <Checkbox checked={checked} onCheckedChange={() => toggle(o.id)} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-foreground">
                        {o.order_number}
                      </span>
                      <Badge variant="outline" className={STATUS_STYLES[o.status]}>
                        {STATUS_LABELS[o.status]}
                      </Badge>
                    </div>
                    <div className="mt-1 text-sm text-foreground truncate">
                      {o.contact_name || "—"}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {o.delivery_address || "—"}
                    </div>
                  </div>
                  <div className="text-right text-sm font-semibold text-foreground">
                    {Number(o.amount_due ?? o.delivery_cost ?? 0).toLocaleString("ru-RU")} ₽
                  </div>
                </Card>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between gap-3 pt-2 border-t border-border">
          <div className="text-sm text-muted-foreground">Выбрано: {selected.size}</div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button
              onClick={() => addMutation.mutate()}
              disabled={selected.size === 0 || addMutation.isPending}
            >
              {addMutation.isPending ? "Добавление..." : "Добавить в заявку"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
