import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Wallet, Save, History, Pencil } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export type CostMethod = "manual" | "per_km" | "per_point" | "km_plus_point";

const METHOD_LABEL: Record<CostMethod, string> = {
  manual: "Вручную",
  per_km: "За километр",
  per_point: "За точку",
  km_plus_point: "Километр + точка",
};

type Props = {
  routeId: string;
  warehouseId?: string | null;
  appliedTariffId?: string | null;
  totalDistanceKm: number;
  pointsCount: number;
  costMethod: CostMethod;
  costPerKm: number;
  costPerPoint: number;
  fixedCost: number;
  deliveryCost: number;
};

type TariffRow = {
  id: string;
  warehouse_id: string;
  name: string;
  kind: string;
  city: string | null;
  zone: string | null;
  destination_city: string | null;
  fixed_price: number | null;
  price_per_km: number | null;
  price_per_point: number | null;
  base_price: number | null;
  is_active: boolean;
  comment: string | null;
};

function tariffToCostMethod(kind: string): CostMethod {
  if (kind === "per_km_round" || kind === "per_km_last") return "per_km";
  if (kind === "per_point") return "per_point";
  if (kind === "combo") return "km_plus_point";
  return "manual";
}

function tariffGeo(t: TariffRow): string {
  if (t.kind === "fixed_direction") return `${t.city ?? "—"} → ${t.destination_city ?? "—"}`;
  if (t.kind === "fixed_zone") return `Зона: ${t.zone ?? "—"}`;
  if (t.kind === "fixed_city") return `Город: ${t.city ?? "—"}`;
  return "—";
}

const fmtMoney = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 2 });

export function RouteCostBlock({
  routeId,
  warehouseId,
  appliedTariffId,
  totalDistanceKm,
  pointsCount,
  costMethod,
  costPerKm,
  costPerPoint,
  fixedCost,
  deliveryCost,
}: Props) {
  const qc = useQueryClient();
  const [method, setMethod] = useState<CostMethod>(costMethod);
  const [perKm, setPerKm] = useState<string>(String(costPerKm ?? 0));
  const [perPoint, setPerPoint] = useState<string>(String(costPerPoint ?? 0));
  const [fixed, setFixed] = useState<string>(String(fixedCost ?? 0));
  const [manualTotal, setManualTotal] = useState<string>(String(deliveryCost ?? 0));
  const [comment, setComment] = useState<string>("");
  const [tariffId, setTariffId] = useState<string>(appliedTariffId ?? "");
  const [reason, setReason] = useState<string>("");

  useEffect(() => {
    setMethod(costMethod);
    setPerKm(String(costPerKm ?? 0));
    setPerPoint(String(costPerPoint ?? 0));
    setFixed(String(fixedCost ?? 0));
    setManualTotal(String(deliveryCost ?? 0));
    setTariffId(appliedTariffId ?? "");
  }, [costMethod, costPerKm, costPerPoint, fixedCost, deliveryCost, appliedTariffId]);

  const { data: tariffs = [] } = useQuery({
    queryKey: ["delivery-tariffs-for-route", warehouseId ?? "any"],
    queryFn: async () => {
      let q = supabase
        .from("delivery_tariffs")
        .select("id, warehouse_id, name, kind, city, zone, destination_city, fixed_price, price_per_km, price_per_point, base_price, is_active, comment")
        .eq("is_active", true)
        .order("priority", { ascending: true });
      if (warehouseId) q = q.eq("warehouse_id", warehouseId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as TariffRow[];
    },
  });

  const applyTariff = (id: string) => {
    setTariffId(id);
    if (!id) return;
    const t = tariffs.find((x) => x.id === id);
    if (!t) return;
    const m = tariffToCostMethod(t.kind);
    setMethod(m);
    if (m === "manual") {
      setManualTotal(String(t.fixed_price ?? 0));
    } else {
      setPerKm(String(t.price_per_km ?? 0));
      setPerPoint(String(t.price_per_point ?? 0));
      setFixed(String(t.base_price ?? 0));
    }
    toast.success(`Тариф «${t.name}» применён`);
  };

  const computedTotal = useMemo(() => {
    const km = totalDistanceKm || 0;
    const pts = pointsCount || 0;
    const ck = Number(perKm) || 0;
    const cp = Number(perPoint) || 0;
    const fx = Number(fixed) || 0;
    if (method === "manual") return Number(manualTotal) || 0;
    if (method === "per_km") return km * ck + fx;
    if (method === "per_point") return pts * cp + fx;
    if (method === "km_plus_point") return km * ck + pts * cp + fx;
    return 0;
  }, [method, totalDistanceKm, pointsCount, perKm, perPoint, fixed, manualTotal]);

  const { data: history = [] } = useQuery({
    queryKey: ["route-cost-history", routeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("route_cost_history")
        .select("id, old_cost, new_cost, old_method, new_method, changed_by, comment, created_at")
        .eq("route_id", routeId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        old_cost: number;
        new_cost: number;
        old_method: string | null;
        new_method: string | null;
        changed_by: string | null;
        comment: string | null;
        created_at: string;
      }>;
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const newCost = computedTotal;
      const oldCost = Number(deliveryCost) || 0;
      const oldMethod = costMethod;
      const newMethod = method;
      const payload = {
        cost_method: method,
        cost_per_km: Number(perKm) || 0,
        cost_per_point: Number(perPoint) || 0,
        fixed_cost: Number(fixed) || 0,
        delivery_cost: newCost,
        manual_cost: method === "manual",
        applied_tariff_id: tariffId || null,
        manual_cost_reason: method === "manual" ? (reason.trim() || null) : null,
      };
      const { error } = await supabase.from("routes").update(payload).eq("id", routeId);
      if (error) throw error;

      const fullComment = [reason.trim(), comment.trim()].filter(Boolean).join(" — ");
      const changed = oldCost !== newCost || oldMethod !== newMethod || fullComment.length > 0;
      if (changed) {
        await supabase.from("route_cost_history").insert({
          route_id: routeId,
          old_cost: oldCost,
          new_cost: newCost,
          old_method: oldMethod,
          new_method: newMethod,
          changed_by: "Логист",
          comment: fullComment || null,
        });
      }
    },
    onSuccess: () => {
      toast.success("Стоимость доставки сохранена");
      setComment("");
      setReason("");
      qc.invalidateQueries({ queryKey: ["route", routeId] });
      qc.invalidateQueries({ queryKey: ["routes"] });
      qc.invalidateQueries({ queryKey: ["route-cost-history", routeId] });
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Не удалось сохранить";
      toast.error(msg);
    },
  });

  return (
    <div className="mb-4 rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Стоимость доставки</h2>
          {method === "manual" && (
            <span className="inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
              <Pencil className="h-3 w-3" />
              Стоимость изменена вручную
            </span>
          )}
        </div>
        <div className="text-sm">
          <span className="text-muted-foreground">Итого: </span>
          <span className="text-base font-bold text-primary">{fmtMoney(computedTotal)} ₽</span>
        </div>
      </div>

      {/* Выбор тарифа */}
      <div className="mb-3 rounded-md border border-dashed border-border bg-muted/30 p-3">
        <Label className="text-xs">Тариф доставки</Label>
        <Select value={tariffId || "__none__"} onValueChange={(v) => applyTariff(v === "__none__" ? "" : v)}>
          <SelectTrigger className="h-9">
            <SelectValue placeholder="Без тарифа" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Без тарифа</SelectItem>
            {tariffs.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name} · {tariffGeo(t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {tariffs.length === 0 && (
          <div className="mt-1.5 text-[11px] text-muted-foreground">
            Нет активных тарифов{warehouseId ? " для склада маршрута" : ""}. Настройте их на странице «Тарифы доставки».
          </div>
        )}
        {tariffId && (
          <div className="mt-1.5 text-[11px] text-muted-foreground">
            После выбора тарифа стоимость пересчитывается автоматически. Сохраните, чтобы применить.
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <Label className="text-xs">Способ расчёта</Label>
          <Select value={method} onValueChange={(v) => setMethod(v as CostMethod)}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(METHOD_LABEL) as CostMethod[]).map((m) => (
                <SelectItem key={m} value={m}>
                  {METHOD_LABEL[m]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs">Километров</Label>
          <Input
            value={fmtMoney(totalDistanceKm)}
            readOnly
            disabled
            className="h-9 bg-muted"
          />
        </div>
        <div>
          <Label className="text-xs">Точек</Label>
          <Input value={String(pointsCount)} readOnly disabled className="h-9 bg-muted" />
        </div>

        {(method === "per_km" || method === "km_plus_point") && (
          <div>
            <Label className="text-xs">Стоимость за км, ₽</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={perKm}
              onChange={(e) => setPerKm(e.target.value)}
              className="h-9"
            />
          </div>
        )}
        {(method === "per_point" || method === "km_plus_point") && (
          <div>
            <Label className="text-xs">Стоимость за точку, ₽</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={perPoint}
              onChange={(e) => setPerPoint(e.target.value)}
              className="h-9"
            />
          </div>
        )}
        {method !== "manual" && (
          <div>
            <Label className="text-xs">Фиксированная надбавка, ₽</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={fixed}
              onChange={(e) => setFixed(e.target.value)}
              className="h-9"
            />
          </div>
        )}
        {method === "manual" && (
          <div className="sm:col-span-2">
            <Label className="text-xs">Итоговая стоимость доставки, ₽</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={manualTotal}
              onChange={(e) => setManualTotal(e.target.value)}
              className="h-9"
            />
          </div>
        )}
      </div>

      {method !== "manual" && (
        <div className="mt-3 rounded-md border border-dashed border-border bg-muted/40 p-2 text-xs text-muted-foreground">
          Расчёт:{" "}
          {method === "per_km" && `${fmtMoney(totalDistanceKm)} км × ${fmtMoney(Number(perKm) || 0)} ₽`}
          {method === "per_point" && `${pointsCount} точек × ${fmtMoney(Number(perPoint) || 0)} ₽`}
          {method === "km_plus_point" &&
            `${fmtMoney(totalDistanceKm)} км × ${fmtMoney(Number(perKm) || 0)} ₽ + ${pointsCount} точек × ${fmtMoney(Number(perPoint) || 0)} ₽`}
          {Number(fixed) > 0 && ` + ${fmtMoney(Number(fixed))} ₽`}
          {" = "}
          <span className="font-semibold text-foreground">{fmtMoney(computedTotal)} ₽</span>
        </div>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {method === "manual" && (
          <div>
            <Label className="text-xs">Причина ручного изменения</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Например: тариф не подходит, особый случай"
              className="h-9"
            />
          </div>
        )}
        <div className={method === "manual" ? "" : "sm:col-span-2"}>
          <Label className="text-xs">Комментарий к изменению</Label>
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Например: согласовано с руководителем"
            rows={2}
            className="resize-none"
          />
        </div>
      </div>

      <div className="mt-3 flex justify-end">
        <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending} className="gap-1.5">
          <Save className="h-3.5 w-3.5" />
          Сохранить
        </Button>
      </div>

      {history.length > 0 && (
        <div className="mt-4 rounded-md border border-border bg-muted/30 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <History className="h-3.5 w-3.5" />
            История изменения стоимости
          </div>
          <div className="space-y-1.5">
            {history.map((h) => (
              <div key={h.id} className="rounded border border-border bg-card px-2 py-1.5 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">
                    {fmtMoney(Number(h.old_cost) || 0)} ₽ → {fmtMoney(Number(h.new_cost) || 0)} ₽
                  </span>
                  <span className="text-muted-foreground">
                    {new Date(h.created_at).toLocaleString("ru-RU")}
                  </span>
                </div>
                <div className="mt-0.5 text-muted-foreground">
                  {h.changed_by ?? "—"}
                  {h.old_method && h.new_method && h.old_method !== h.new_method && (
                    <>
                      {" · "}
                      {METHOD_LABEL[h.old_method as CostMethod] ?? h.old_method} →{" "}
                      {METHOD_LABEL[h.new_method as CostMethod] ?? h.new_method}
                    </>
                  )}
                </div>
                {h.comment && (
                  <div className="mt-0.5 italic text-foreground">{h.comment}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
