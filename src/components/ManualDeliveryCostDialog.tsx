import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import type { Order } from "@/lib/orders";

interface Props {
  order: Order | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ManualDeliveryCostDialog({ order, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [cost, setCost] = useState<string>("");
  const [reason, setReason] = useState("");
  const [author, setAuthor] = useState<string>("");

  useEffect(() => {
    if (open && order) {
      setCost(String(order.delivery_cost ?? 0));
      setReason(order.manual_cost_reason ?? "");
      // Запоминаем последнего автора в localStorage
      const saved = typeof window !== "undefined" ? localStorage.getItem("rt_author") : null;
      setAuthor(order.manual_cost_set_by ?? saved ?? "");
    }
  }, [open, order]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!order) throw new Error("Нет заказа");
      const numCost = Number(cost);
      if (!Number.isFinite(numCost) || numCost < 0) {
        throw new Error("Введите корректную стоимость (≥ 0)");
      }
      if (!reason.trim()) throw new Error("Укажите причину изменения");
      if (!author.trim()) throw new Error("Укажите, кто меняет стоимость");
      if (typeof window !== "undefined") localStorage.setItem("rt_author", author.trim());

      const { error } = await supabase
        .from("orders")
        .update({
          delivery_cost: numCost,
          delivery_cost_source: "manual",
          manual_cost_reason: reason.trim(),
          manual_cost_set_by: author.trim(),
        })
        .eq("id", order.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["routes"] });
      toast.success("Стоимость доставки изменена вручную");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!order) return null;
  const wasManual = order.delivery_cost_source === "manual";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            Ручное изменение стоимости
          </DialogTitle>
          <DialogDescription>
            Заказ <span className="font-mono font-semibold">{order.order_number}</span>. После
            подтверждения автоматический пересчёт по тарифам для этого заказа будет отключён.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="cost" className="text-xs uppercase tracking-wider text-muted-foreground">
              Стоимость доставки, ₽
            </Label>
            <Input
              id="cost"
              type="number"
              step="0.01"
              min="0"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor="reason" className="text-xs uppercase tracking-wider text-muted-foreground">
              Причина изменения <span className="text-red-600">*</span>
            </Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Например: согласовано с клиентом, нестандартный заезд, доплата за подъём…"
              rows={3}
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor="author" className="text-xs uppercase tracking-wider text-muted-foreground">
              Кто изменяет <span className="text-red-600">*</span>
            </Label>
            <Input
              id="author"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="ФИО или должность"
              className="mt-1.5"
            />
          </div>

          {wasManual && order.manual_cost_set_at && (
            <div className="rounded-md border border-border bg-secondary/40 p-3 text-xs text-muted-foreground">
              Последнее изменение:{" "}
              <span className="font-medium text-foreground">
                {new Date(order.manual_cost_set_at).toLocaleString("ru-RU")}
              </span>
              {order.manual_cost_set_by ? ` · ${order.manual_cost_set_by}` : ""}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Сохранение…" : "Подтвердить и сохранить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
