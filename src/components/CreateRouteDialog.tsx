import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import type { Order } from "@/lib/orders";
import { STATUS_LABELS, STATUS_STYLES } from "@/lib/orders";
import { ArrowDown, ArrowUp, X, Search, MapPin, GripVertical } from "lucide-react";

interface CreateRouteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateRouteDialog({ open, onOpenChange }: CreateRouteDialogProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [driverName, setDriverName] = useState("");
  const [routeDate, setRouteDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [comment, setComment] = useState("");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Доступные заказы (новые и в работе)
  const { data: orders } = useQuery({
    queryKey: ["orders", "available-for-route"],
    queryFn: async (): Promise<Order[]> => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .in("status", ["new", "in_progress"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Order[];
    },
    enabled: open,
  });

  const filtered = useMemo(() => {
    if (!orders) return [];
    if (!search) return orders;
    const q = search.toLowerCase();
    return orders.filter(
      (o) =>
        o.order_number.toLowerCase().includes(q) ||
        o.delivery_address.toLowerCase().includes(q),
    );
  }, [orders, search]);

  const ordersById = useMemo(() => {
    const m = new Map<string, Order>();
    (orders ?? []).forEach((o) => m.set(o.id, o));
    return m;
  }, [orders]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const move = (idx: number, dir: -1 | 1) => {
    setSelectedIds((prev) => {
      const next = [...prev];
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= next.length) return prev;
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      return next;
    });
  };

  const remove = (id: string) => {
    setSelectedIds((prev) => prev.filter((x) => x !== id));
  };

  const reset = () => {
    setDriverName("");
    setComment("");
    setSearch("");
    setSelectedIds([]);
    setRouteDate(new Date().toISOString().slice(0, 10));
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (!driverName.trim()) throw new Error("Укажите имя водителя");
      if (selectedIds.length === 0) throw new Error("Выберите хотя бы один заказ");

      // Сгенерировать номер маршрута через RPC
      const { data: numData, error: numErr } = await supabase.rpc("generate_route_number");
      if (numErr) throw numErr;
      const routeNumber = numData as string;

      // Создать маршрут
      const { data: route, error: routeErr } = await supabase
        .from("routes")
        .insert({
          route_number: routeNumber,
          driver_name: driverName.trim(),
          route_date: routeDate,
          comment: comment.trim() || null,
          status: "planned",
        })
        .select()
        .single();
      if (routeErr) throw routeErr;

      // Добавить точки
      const points = selectedIds.map((orderId, idx) => ({
        route_id: route.id,
        order_id: orderId,
        point_number: idx + 1,
        status: "pending" as const,
      }));
      const { error: pointsErr } = await supabase.from("route_points").insert(points);
      if (pointsErr) throw pointsErr;

      return route;
    },
    onSuccess: (route) => {
      queryClient.invalidateQueries({ queryKey: ["routes"] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast.success(`Маршрут ${route.route_number} создан`);
      reset();
      onOpenChange(false);
      navigate({ to: "/routes/$routeId", params: { routeId: route.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Создание маршрута</DialogTitle>
          <DialogDescription>
            Заполните данные маршрута, выберите заказы и задайте порядок доставки
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {/* Параметры маршрута */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="driver">Водитель *</Label>
              <Input
                id="driver"
                placeholder="Иванов И."
                value={driverName}
                onChange={(e) => setDriverName(e.target.value)}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="date">Дата</Label>
              <Input
                id="date"
                type="date"
                value={routeDate}
                onChange={(e) => setRouteDate(e.target.value)}
                className="mt-1.5"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="comment">Комментарий</Label>
            <Input
              id="comment"
              placeholder="Например: утренний рейс"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="mt-1.5"
            />
          </div>

          {/* Выбор заказов */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label>Доступные заказы</Label>
              <span className="text-xs text-muted-foreground">
                Выбрано: {selectedIds.length}
              </span>
            </div>
            <div className="relative mb-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Поиск по номеру или адресу"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="max-h-56 overflow-y-auto rounded-lg border border-border">
              {filtered.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  Нет доступных заказов
                </div>
              ) : (
                filtered.map((o) => {
                  const checked = selectedIds.includes(o.id);
                  return (
                    <label
                      key={o.id}
                      className="flex cursor-pointer items-start gap-3 border-b border-border p-3 last:border-b-0 hover:bg-secondary/50"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleSelect(o.id)}
                        className="mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-semibold">
                            {o.order_number}
                          </span>
                          <Badge variant="outline" className={STATUS_STYLES[o.status]}>
                            {STATUS_LABELS[o.status]}
                          </Badge>
                        </div>
                        <div className="mt-0.5 flex items-start gap-1 text-xs text-muted-foreground">
                          <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                          <span className="truncate">{o.delivery_address}</span>
                        </div>
                      </div>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          {/* Порядок доставки */}
          {selectedIds.length > 0 && (
            <div>
              <Label>Порядок доставки</Label>
              <div className="mt-2 space-y-2">
                {selectedIds.map((id, idx) => {
                  const o = ordersById.get(id);
                  if (!o) return null;
                  return (
                    <div
                      key={id}
                      className="flex items-center gap-2 rounded-lg border border-border bg-card p-2"
                    >
                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
                        {idx + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-mono text-sm font-semibold">{o.order_number}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {o.delivery_address}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => move(idx, -1)}
                        disabled={idx === 0}
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => move(idx, 1)}
                        disabled={idx === selectedIds.length - 1}
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => remove(id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
              {mutation.isPending ? "Создание..." : "Создать маршрут"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
