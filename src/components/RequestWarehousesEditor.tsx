import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Warehouse, AlertTriangle, Save } from "lucide-react";
import { toast } from "sonner";

const FACTORY_VALUE = "__factory__";
const NONE_VALUE = "__none__";

type WarehouseRow = { id: string; name: string; city: string | null };

export function RequestWarehousesEditor({
  requestId,
  requestType,
  warehouseId,
  destinationWarehouseId,
}: {
  requestId: string;
  requestType: string;
  warehouseId: string | null;
  destinationWarehouseId: string | null;
}) {
  const queryClient = useQueryClient();

  const isFactorySource = warehouseId === null && requestType === "factory_to_warehouse";
  const [source, setSource] = useState<string>(
    warehouseId ?? (requestType === "factory_to_warehouse" ? FACTORY_VALUE : NONE_VALUE),
  );
  const [destination, setDestination] = useState<string>(
    destinationWarehouseId ?? NONE_VALUE,
  );

  useEffect(() => {
    setSource(
      warehouseId ?? (requestType === "factory_to_warehouse" ? FACTORY_VALUE : NONE_VALUE),
    );
    setDestination(destinationWarehouseId ?? NONE_VALUE);
  }, [warehouseId, destinationWarehouseId, requestType]);

  const { data: warehouses } = useQuery({
    queryKey: ["warehouses-active"],
    queryFn: async (): Promise<WarehouseRow[]> => {
      const { data, error } = await supabase
        .from("warehouses")
        .select("id, name, city")
        .eq("is_active", true)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as WarehouseRow[];
    },
  });

  const destinationRequired =
    requestType === "warehouse_transfer" || requestType === "factory_to_warehouse";

  const destinationMissing = destinationRequired && destination === NONE_VALUE;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: { warehouse_id: string | null; destination_warehouse_id: string | null } = {
        warehouse_id: source === NONE_VALUE || source === FACTORY_VALUE ? null : source,
        destination_warehouse_id: destination === NONE_VALUE ? null : destination,
      };
      const { error } = await supabase.from("routes").update(payload).eq("id", requestId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transport-request", requestId] });
      queryClient.invalidateQueries({ queryKey: ["transport-requests"] });
      toast.success("Склады обновлены");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <Warehouse className="h-3.5 w-3.5" />
        Склады
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">
            Склад отправления
            {requestType === "factory_to_warehouse" && (
              <span className="ml-1 text-muted-foreground/70">(можно «Завод»)</span>
            )}
          </label>
          <Select value={source} onValueChange={setSource}>
            <SelectTrigger>
              <SelectValue placeholder="Выберите склад" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_VALUE}>— не выбрано —</SelectItem>
              {requestType === "factory_to_warehouse" && (
                <SelectItem value={FACTORY_VALUE}>Завод</SelectItem>
              )}
              {(warehouses ?? []).map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.name}
                  {w.city ? ` · ${w.city}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="mb-1 block text-xs text-muted-foreground">
            Склад назначения
            {destinationRequired ? (
              <span className="ml-1 text-destructive">*</span>
            ) : (
              <span className="ml-1 text-muted-foreground/70">(не обязателен)</span>
            )}
          </label>
          <Select value={destination} onValueChange={setDestination}>
            <SelectTrigger>
              <SelectValue placeholder="Выберите склад" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_VALUE}>— не выбрано —</SelectItem>
              {(warehouses ?? []).map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.name}
                  {w.city ? ` · ${w.city}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {destinationMissing && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-sm text-amber-700 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          Укажите склад назначения
        </div>
      )}

      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || destinationMissing}
          className="gap-1.5"
        >
          <Save className="h-4 w-4" />
          {saveMutation.isPending ? "Сохранение..." : "Сохранить склады"}
        </Button>
      </div>
    </div>
  );
}
