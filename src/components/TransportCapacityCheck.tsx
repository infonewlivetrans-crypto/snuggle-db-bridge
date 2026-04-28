import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ShieldCheck, AlertTriangle, CheckCircle2, Info } from "lucide-react";

export function TransportCapacityCheck({
  requestId,
  requiredCapacityKg,
  requiredVolumeM3,
}: {
  requestId: string;
  requiredCapacityKg: number | null;
  requiredVolumeM3: number | null;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["request-totals", requestId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("route_points")
        .select("order:order_id(total_weight_kg, total_volume_m3)")
        .eq("route_id", requestId);
      if (error) throw error;
      let weight = 0;
      let volume = 0;
      for (const r of (data ?? []) as any[]) {
        if (!r.order) continue;
        weight += Number(r.order.total_weight_kg ?? 0);
        volume += Number(r.order.total_volume_m3 ?? 0);
      }
      return { weight, volume };
    },
  });

  const totals = data ?? { weight: 0, volume: 0 };
  const hasRequirements = requiredCapacityKg != null || requiredVolumeM3 != null;
  const weightOver =
    requiredCapacityKg != null && totals.weight > requiredCapacityKg;
  const volumeOver =
    requiredVolumeM3 != null && totals.volume > requiredVolumeM3;
  const allOk = hasRequirements && !weightOver && !volumeOver && !isLoading;

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5" />
        Проверка транспорта
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Cell
          label="Вес заявки"
          value={`${totals.weight.toLocaleString("ru-RU")} кг`}
        />
        <Cell
          label="Допустимый вес"
          value={
            requiredCapacityKg != null
              ? `${requiredCapacityKg.toLocaleString("ru-RU")} кг`
              : "—"
          }
          highlight={weightOver ? "bad" : undefined}
        />
        <Cell
          label="Объём заявки"
          value={`${totals.volume.toLocaleString("ru-RU")} м³`}
        />
        <Cell
          label="Допустимый объём"
          value={
            requiredVolumeM3 != null
              ? `${requiredVolumeM3.toLocaleString("ru-RU")} м³`
              : "—"
          }
          highlight={volumeOver ? "bad" : undefined}
        />
      </div>

      {!hasRequirements ? (
        <Banner
          tone="info"
          icon={<Info className="h-4 w-4" />}
          text="Укажите грузоподъёмность и/или объём в требованиях к транспорту, чтобы выполнить проверку"
        />
      ) : (
        <div className="space-y-2">
          {weightOver && (
            <Banner
              tone="bad"
              icon={<AlertTriangle className="h-4 w-4" />}
              text="Вес заявки превышает грузоподъёмность транспорта"
            />
          )}
          {volumeOver && (
            <Banner
              tone="bad"
              icon={<AlertTriangle className="h-4 w-4" />}
              text="Объём заявки превышает объём кузова"
            />
          )}
          {allOk && (
            <Banner
              tone="ok"
              icon={<CheckCircle2 className="h-4 w-4" />}
              text="Заявка подходит под указанный транспорт"
            />
          )}
        </div>
      )}
    </div>
  );
}

function Cell({
  label,
  value,
  highlight,
}: {
  label: string;
  value: React.ReactNode;
  highlight?: "bad";
}) {
  return (
    <div
      className={`rounded-md border p-2.5 ${
        highlight === "bad"
          ? "border-destructive/40 bg-destructive/10"
          : "border-border bg-card"
      }`}
    >
      <div className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={`mt-0.5 text-base font-semibold ${
          highlight === "bad" ? "text-destructive" : "text-foreground"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function Banner({
  tone,
  icon,
  text,
}: {
  tone: "ok" | "bad" | "info";
  icon: React.ReactNode;
  text: string;
}) {
  const cls =
    tone === "ok"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : tone === "bad"
        ? "border-destructive/40 bg-destructive/10 text-destructive"
        : "border-border bg-secondary/40 text-muted-foreground";
  return (
    <div className={`flex items-start gap-2 rounded-md border p-2.5 text-sm ${cls}`}>
      <span className="mt-0.5 flex-shrink-0">{icon}</span>
      <span>{text}</span>
    </div>
  );
}
