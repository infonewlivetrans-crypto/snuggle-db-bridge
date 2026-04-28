import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Search, Package2, Plus, Trash2 } from "lucide-react";
import { STATUS_LABELS, STATUS_STYLES, type Order, type OrderStatus } from "@/lib/orders";

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

  const removeMutation = useMutation({
    mutationFn: async (pointId: string) => {
      const { error } = await supabase.from("route_points").delete().eq("id", pointId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["request-orders", requestId] });
      queryClient.invalidateQueries({ queryKey: ["transport-request", requestId] });
      queryClient.invalidateQueries({ queryKey: ["transport-requests"] });
      toast.success("Заказ удалён из заявки");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <Package2 className="h-3.5 w-3.5" />
          Заказы в заявке {items ? `· ${items.length}` : ""}
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)} className="gap-1.5">
          <Plus className="h-4 w-4" />
          Добавить заказ
        </Button>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Загрузка...</div>
      ) : !items || items.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          В заявке пока нет заказов
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((it) => {
            const o = it.order;
            const sum = o.amount_due ?? o.delivery_cost ?? 0;
            return (
              <li
                key={it.id}
                className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-secondary/30 p-3"
              >
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
        existingOrderIds={(items ?? []).map((i) => i.order_id)}
        nextPointNumber={(items?.length ?? 0) + 1}
      />
    </div>
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
