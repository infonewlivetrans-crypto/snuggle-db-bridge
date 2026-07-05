// Блок «Цель поиска» — целевая ставка, ₽/км, прибыль, связка.
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Target } from "lucide-react";

export interface SearchTargetValues {
  min_price?: number | null;
  min_price_per_km?: number | null;
  target_total_price?: number | null;
  target_price_per_km?: number | null;
  target_net_profit?: number | null;
  target_bundle_price?: number | null;
  max_bundle_items?: number | null;
  bundle_search_enabled?: boolean | null;
  stop_search_when_target_reached?: boolean | null;
}

export function SearchTargetBlock({
  values, onChange, compact,
}: {
  values: SearchTargetValues;
  onChange: (v: SearchTargetValues) => void;
  compact?: boolean;
}) {
  const set = <K extends keyof SearchTargetValues>(k: K, v: SearchTargetValues[K]) =>
    onChange({ ...values, [k]: v });
  const num = (v: string) => (v === "" ? null : Number(v));

  return (
    <Card className={compact ? "p-2" : "p-3"}>
      <div className="flex items-center gap-2 text-sm font-semibold mb-2">
        <Target className="h-4 w-4" /> Цель поиска
      </div>
      <p className="text-[11px] text-muted-foreground mb-2">
        Система может подобрать один груз или связку из нескольких грузов, пока не будет достигнута заданная ставка.
      </p>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <Label className="text-[10px]">Мин. ставка ₽</Label>
          <Input className="h-8" type="number" value={values.min_price ?? ""}
            onChange={(e) => set("min_price", num(e.target.value))} />
        </div>
        <div>
          <Label className="text-[10px]">Мин. ₽/км</Label>
          <Input className="h-8" type="number" value={values.min_price_per_km ?? ""}
            onChange={(e) => set("min_price_per_km", num(e.target.value))} />
        </div>
        <div>
          <Label className="text-[10px]">Целевая общая сумма ₽</Label>
          <Input className="h-8" type="number" value={values.target_total_price ?? ""}
            onChange={(e) => set("target_total_price", num(e.target.value))} />
        </div>
        <div>
          <Label className="text-[10px]">Целевая ₽/км</Label>
          <Input className="h-8" type="number" value={values.target_price_per_km ?? ""}
            onChange={(e) => set("target_price_per_km", num(e.target.value))} />
        </div>
        <div>
          <Label className="text-[10px]">Мин. чистая прибыль ₽</Label>
          <Input className="h-8" type="number" value={values.target_net_profit ?? ""}
            onChange={(e) => set("target_net_profit", num(e.target.value))} />
        </div>
        <div>
          <Label className="text-[10px]">Целевая сумма связки ₽</Label>
          <Input className="h-8" type="number" value={values.target_bundle_price ?? ""}
            onChange={(e) => set("target_bundle_price", num(e.target.value))} />
        </div>
        <div>
          <Label className="text-[10px]">Макс. грузов в связке</Label>
          <Input className="h-8" type="number" value={values.max_bundle_items ?? 3}
            onChange={(e) => set("max_bundle_items", num(e.target.value))} />
        </div>
      </div>
      <div className="flex items-center gap-2 mt-2 text-xs">
        <Switch checked={values.bundle_search_enabled ?? true}
          onCheckedChange={(v) => set("bundle_search_enabled", v)} id="bundle-en" />
        <Label htmlFor="bundle-en" className="text-xs">Искать догруз автоматически после выбора основного</Label>
      </div>
      <div className="flex items-center gap-2 mt-1 text-xs">
        <Switch checked={values.stop_search_when_target_reached ?? false}
          onCheckedChange={(v) => set("stop_search_when_target_reached", v)} id="stop-target" />
        <Label htmlFor="stop-target" className="text-xs">Остановить поиск после достижения цели</Label>
      </div>
    </Card>
  );
}

export function TargetProgressBadge({
  percent, status, totalPrice, target,
}: {
  percent: number | null; status: string | null;
  totalPrice: number | null; target: number | null;
}) {
  if (percent == null && !target) return null;
  const p = percent ?? (target ? Math.round(((totalPrice ?? 0) / target) * 100) : 0);
  const remaining = target ? Math.max(0, target - (totalPrice ?? 0)) : null;
  const cls =
    status === "target_reached" || status === "target_exceeded" ? "bg-emerald-600 text-white" :
    status === "target_almost_reached" ? "bg-amber-500 text-white" :
    "bg-zinc-300 text-zinc-800";
  return (
    <div className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] ${cls}`}>
      <Target className="h-3 w-3" />
      Цель: {p}%{remaining != null ? ` · до цели ${Math.round(remaining)} ₽` : ""}
    </div>
  );
}
