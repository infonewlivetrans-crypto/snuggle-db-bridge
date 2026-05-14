import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Weight, Box, Package, MapPin, AlertTriangle } from "lucide-react";
import { apiGetAuth } from "@/lib/api-client";

type OrderTotals = {
  id: string;
  total_weight_kg: number | null;
  total_volume_m3: number | null;
  items_count: number | null;
};

export function RequestTotalsCards({ requestId }: { requestId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["request-totals", requestId],
    queryFn: async () => {
      return await apiGetAuth<{
        ordersCount: number;
        pointsCount: number;
        totalWeight: number;
        totalVolume: number;
        missing: number;
      }>(`/api/request-totals?routeId=${encodeURIComponent(requestId)}`);
    },
  });

  const totals = {
    ordersCount: data?.ordersCount ?? 0,
    totalWeight: data?.totalWeight ?? 0,
    totalVolume: data?.totalVolume ?? 0,
    missing: data?.missing ?? 0,
    pointsCount: data?.pointsCount ?? 0,
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          icon={<Weight className="h-4 w-4" />}
          label="Общий вес"
          value={`${totals.totalWeight.toLocaleString("ru-RU")} кг`}
        />
        <Stat
          icon={<Box className="h-4 w-4" />}
          label="Общий объём"
          value={`${totals.totalVolume.toLocaleString("ru-RU")} м³`}
        />
        <Stat
          icon={<Package className="h-4 w-4" />}
          label="Заказов"
          value={totals.ordersCount}
        />
        <Stat
          icon={<MapPin className="h-4 w-4" />}
          label="Точек"
          value={totals.pointsCount}
        />
      </div>

      {!isLoading && totals.missing > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div>
            Не у всех заказов заполнены вес и объём
            <span className="text-xs opacity-80"> · без данных: {totals.missing}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-xl font-bold text-foreground">{value}</div>
    </div>
  );
}
