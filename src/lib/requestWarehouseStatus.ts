import { useQuery } from "@tanstack/react-query";
import { apiGetAuth } from "@/lib/api-client";

export type RequestWarehouseStatus =
  | "awaiting_check"
  | "shortage"
  | "reserved"
  | "ready"
  | "loading"
  | "loaded"
  | "shipped";

export const REQ_WH_STATUS_LABELS: Record<RequestWarehouseStatus, string> = {
  awaiting_check: "Ожидает проверки склада",
  shortage: "Не хватает товара",
  reserved: "Товар зарезервирован",
  ready: "Готово к отгрузке",
  loading: "Загрузка начата",
  loaded: "Загружено",
  shipped: "Отгружено со склада",
};

export const REQ_WH_STATUS_STYLES: Record<RequestWarehouseStatus, string> = {
  awaiting_check: "bg-secondary text-foreground border-border",
  shortage: "bg-red-100 text-red-900 border-red-200",
  reserved: "bg-blue-100 text-blue-900 border-blue-200",
  ready: "bg-green-100 text-green-900 border-green-200",
  loading: "bg-amber-100 text-amber-900 border-amber-200",
  loaded: "bg-indigo-100 text-indigo-900 border-indigo-200",
  shipped: "bg-emerald-100 text-emerald-900 border-emerald-200",
};

export const REQ_WH_STATUS_OK_FOR_DRIVER: RequestWarehouseStatus[] = [
  "ready",
  "loading",
  "loaded",
  "shipped",
];

export function useRequestWarehouseStatus(
  requestId: string | null | undefined,
  warehouseId: string | null | undefined,
) {
  return useQuery({
    queryKey: ["request-wh-status", requestId, warehouseId],
    enabled: !!requestId,
    queryFn: async (): Promise<{
      status: RequestWarehouseStatus;
      requiredCount: number;
      reservedFully: boolean;
      anyShortage: boolean;
    }> => {
      const params = new URLSearchParams({ request_id: requestId! });
      if (warehouseId) params.set("warehouse_id", warehouseId);
      return await apiGetAuth(`/api/request-warehouse-status?${params.toString()}`);
    },
  });
}

export function deriveStatusFromFlags(opts: {
  hasOrders: boolean;
  reservedFully: boolean;
  anyShortage: boolean;
  planConfirmed: boolean;
  loadingStarted: boolean;
  loaded: boolean;
  departed: boolean;
}): RequestWarehouseStatus {
  if (opts.departed) return "shipped";
  if (opts.loaded) return "loaded";
  if (opts.loadingStarted) return "loading";
  if (!opts.hasOrders) return "awaiting_check";
  if (opts.reservedFully && opts.planConfirmed) return "ready";
  if (opts.reservedFully) return "reserved";
  if (opts.anyShortage) return "shortage";
  return "awaiting_check";
}
