import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { User, Truck, AlertTriangle, Save } from "lucide-react";

// Заглушки — справочники
export const DRIVER_OPTIONS = ["Иванов Иван", "Петров Сергей"] as const;
export const VEHICLE_OPTIONS = ["Газель А123ВС", "Фура В456СD"] as const;

const NONE = "__none__";

export function RouteExecutionBlock({
  deliveryRouteId,
  driver,
  vehicle,
}: {
  deliveryRouteId: string;
  driver: string | null;
  vehicle: string | null;
}) {
  const qc = useQueryClient();
  const [d, setD] = useState<string>(driver ?? "");
  const [v, setV] = useState<string>(vehicle ?? "");

  useEffect(() => {
    setD(driver ?? "");
    setV(vehicle ?? "");
  }, [driver, vehicle]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("delivery_routes")
        .update({
          assigned_driver: d || null,
          assigned_vehicle: v || null,
        })
        .eq("id", deliveryRouteId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Назначение сохранено");
      qc.invalidateQueries({ queryKey: ["delivery-route", deliveryRouteId] });
      qc.invalidateQueries({ queryKey: ["delivery-routes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const missing = !driver || !vehicle;

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="mb-3 flex items-center gap-2">
        <Truck className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Исполнение маршрута</h3>
      </div>

      {missing && (
        <div className="mb-3 flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
          <AlertTriangle className="h-3.5 w-3.5" />
          Не назначен водитель или транспорт
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div>
          <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <User className="h-3.5 w-3.5" />
            Водитель
          </label>
          <Select value={d || NONE} onValueChange={(val) => setD(val === NONE ? "" : val)}>
            <SelectTrigger>
              <SelectValue placeholder="Выберите водителя" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>— не назначен —</SelectItem>
              {DRIVER_OPTIONS.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Truck className="h-3.5 w-3.5" />
            Машина
          </label>
          <Select value={v || NONE} onValueChange={(val) => setV(val === NONE ? "" : val)}>
            <SelectTrigger>
              <SelectValue placeholder="Выберите машину" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>— не назначена —</SelectItem>
              {VEHICLE_OPTIONS.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button onClick={() => save.mutate()} disabled={save.isPending} className="gap-1.5">
          <Save className="h-4 w-4" />
          Сохранить
        </Button>
      </div>

      {(driver || vehicle) && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <InfoRow icon={<User className="h-3.5 w-3.5" />} label="Назначенный водитель" value={driver} />
          <InfoRow icon={<Truck className="h-3.5 w-3.5" />} label="Назначенная машина" value={vehicle} />
        </div>
      )}
    </div>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
}) {
  return (
    <div className="rounded-md border border-border bg-secondary/30 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-0.5 text-sm font-medium text-foreground">
        {value || <span className="italic text-muted-foreground">не назначен(а)</span>}
      </div>
    </div>
  );
}
