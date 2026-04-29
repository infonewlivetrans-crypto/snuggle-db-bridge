import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertTriangle, Send, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import type { DeliveryRouteStatus } from "@/lib/deliveryRoutes";

type PointForCheck = {
  point_number: number;
  order: {
    order_number: string | null;
    contact_name: string | null;
    contact_phone: string | null;
    delivery_address: string | null;
    latitude: number | null;
    longitude: number | null;
    payment_type: string | null;
    amount_due: number | null;
    requires_qr: boolean | null;
  } | null;
};

interface Props {
  deliveryRouteId: string;
  status: DeliveryRouteStatus;
  driver: string | null;
  vehicle: string | null;
  points: PointForCheck[];
}

export function RouteIssueCheckBlock({ deliveryRouteId, status, driver, vehicle, points }: Props) {
  const qc = useQueryClient();
  const [errors, setErrors] = useState<string[] | null>(null);
  const [checked, setChecked] = useState(false);

  const runCheck = () => {
    const errs: string[] = [];
    if (!driver || !driver.trim()) errs.push("Не выбран водитель");
    if (!vehicle || !vehicle.trim()) errs.push("Не выбрана машина");
    if (!points || points.length === 0) {
      errs.push("В маршруте нет ни одной точки");
    } else {
      for (const p of points) {
        const tag = `Точка №${p.point_number}`;
        const o = p.order;
        if (!o) {
          errs.push(`${tag}: нет данных заказа`);
          continue;
        }
        if (!o.order_number) errs.push(`${tag}: не указан номер заказа`);
        if (!o.contact_name || !o.contact_name.trim()) errs.push(`${tag}: не указан клиент`);
        if (!o.contact_phone || !o.contact_phone.trim()) errs.push(`${tag}: не указан телефон`);
        const hasAddr = !!(o.delivery_address && o.delivery_address.trim());
        const hasCoords = o.latitude != null && o.longitude != null;
        if (!hasAddr && !hasCoords) errs.push(`${tag}: не указан адрес или координаты`);
        if (o.payment_type === "cash" && (o.amount_due == null || Number(o.amount_due) <= 0)) {
          errs.push(`${tag}: наличная оплата — не указана сумма к получению`);
        }
        if (o.requires_qr === null || o.requires_qr === undefined) {
          errs.push(`${tag}: не отмечено поле «нужен QR»`);
        }
      }
    }
    setErrors(errs);
    setChecked(true);
  };

  const issue = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("delivery_routes")
        .update({ status: "issued" as DeliveryRouteStatus })
        .eq("id", deliveryRouteId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Маршрут выдан водителю");
      qc.invalidateQueries({ queryKey: ["delivery-route", deliveryRouteId] });
      qc.invalidateQueries({ queryKey: ["delivery-routes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isIssuedOrLater = status === "issued" || status === "in_progress" || status === "completed";
  const ok = checked && errors !== null && errors.length === 0;

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Проверка и выдача водителю
        </div>
        {isIssuedOrLater && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
            <CheckCircle2 className="h-3.5 w-3.5" /> Уже выдан
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={runCheck}
          className="gap-1.5"
          disabled={isIssuedOrLater}
        >
          <ShieldCheck className="h-4 w-4" />
          Проверить маршрут
        </Button>
        <Button
          size="sm"
          onClick={() => issue.mutate()}
          disabled={!ok || issue.isPending || isIssuedOrLater}
          className="gap-1.5"
        >
          <Send className="h-4 w-4" />
          Выдать водителю
        </Button>
      </div>

      {checked && errors && errors.length > 0 && (
        <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <div className="mb-1.5 flex items-center gap-1.5 font-medium text-destructive">
            <AlertTriangle className="h-4 w-4" />
            Маршрут нельзя выдать водителю. Исправьте ошибки:
          </div>
          <ul className="ml-5 list-disc space-y-0.5 text-foreground">
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {checked && errors && errors.length === 0 && !isIssuedOrLater && (
        <div className="mt-3 flex items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm font-medium text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
          <CheckCircle2 className="h-4 w-4" />
          Маршрут готов к выдаче водителю
        </div>
      )}
    </div>
  );
}
