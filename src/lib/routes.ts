import type { BodyType, Vehicle } from "@/lib/carriers";

export type RouteStatus = "planned" | "in_progress" | "completed" | "cancelled";

export type TransportRequestType =
  | "client_delivery"
  | "warehouse_transfer"
  | "factory_to_warehouse";

export const REQUEST_TYPE_LABELS: Record<TransportRequestType, string> = {
  client_delivery: "Доставка клиентам",
  warehouse_transfer: "Перемещение между складами",
  factory_to_warehouse: "С завода на склад",
};

export const REQUEST_TYPE_ORDER: TransportRequestType[] = [
  "client_delivery",
  "warehouse_transfer",
  "factory_to_warehouse",
];

export const REQUEST_TYPE_STYLES: Record<TransportRequestType, string> = {
  client_delivery: "bg-blue-100 text-blue-900 border-blue-200",
  warehouse_transfer: "bg-purple-100 text-purple-900 border-purple-200",
  factory_to_warehouse: "bg-amber-100 text-amber-900 border-amber-200",
};

/** Проверка совместимости машины с заявкой по весу/объёму/типу кузова */
export type VehicleFitIssue =
  | "capacity_kg"
  | "volume_m3"
  | "body_type"
  | "no_vehicle"
  | "no_capacity_data"
  | "no_volume_data";

export type VehicleFit = {
  ok: boolean;
  issues: VehicleFitIssue[];
  /** % загрузки по весу (0–100+) */
  weightLoadPct: number | null;
  /** % загрузки по объёму */
  volumeLoadPct: number | null;
};

export function checkVehicleFit(args: {
  vehicle: Pick<Vehicle, "capacity_kg" | "volume_m3" | "body_type"> | null | undefined;
  totalWeightKg: number;
  totalVolumeM3: number;
  requiredBodyType?: BodyType | null;
}): VehicleFit {
  const issues: VehicleFitIssue[] = [];
  const v = args.vehicle;
  if (!v) {
    return { ok: false, issues: ["no_vehicle"], weightLoadPct: null, volumeLoadPct: null };
  }
  if (v.capacity_kg == null) issues.push("no_capacity_data");
  else if (args.totalWeightKg > Number(v.capacity_kg)) issues.push("capacity_kg");

  if (v.volume_m3 == null) issues.push("no_volume_data");
  else if (args.totalVolumeM3 > Number(v.volume_m3)) issues.push("volume_m3");

  if (args.requiredBodyType && v.body_type !== args.requiredBodyType) {
    issues.push("body_type");
  }
  return {
    ok: !issues.some((i) => i === "capacity_kg" || i === "volume_m3" || i === "body_type"),
    issues,
    weightLoadPct: v.capacity_kg ? (args.totalWeightKg / Number(v.capacity_kg)) * 100 : null,
    volumeLoadPct: v.volume_m3 ? (args.totalVolumeM3 / Number(v.volume_m3)) * 100 : null,
  };
}

export type PointStatus =
  | "pending"
  | "arrived"
  | "completed"
  | "failed"
  | "returned_to_warehouse"
  | "defective"
  | "no_payment"
  | "no_qr"
  | "client_no_answer"
  | "client_absent"
  | "client_refused"
  | "no_unloading"
  | "problem";

export type DeliveryRoute = {
  id: string;
  route_number: string;
  route_date: string;
  driver_name: string | null;
  driver_id: string | null;
  vehicle_id: string | null;
  warehouse_id: string | null;
  status: RouteStatus;
  comment: string | null;
  created_at: string;
  updated_at: string;
  // Заявка на транспорт
  request_type: TransportRequestType;
  destination_warehouse_id: string | null;
  required_body_type: BodyType | null;
  required_capacity_kg: number | null;
  required_volume_m3: number | null;
  planned_departure_at: string | null;
  total_weight_kg: number;
  total_volume_m3: number;
  points_count: number;
};


export type Warehouse = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  phone: string | null;
  contact_person: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type RoutePoint = {
  id: string;
  route_id: string;
  order_id: string;
  point_number: number;
  status: PointStatus;
  planned_time: string | null;
  arrived_at: string | null;
  completed_at: string | null;
  created_at: string;
};

export const ROUTE_STATUS_LABELS: Record<RouteStatus, string> = {
  planned: "Запланирован",
  in_progress: "В пути",
  completed: "Выполнен",
  cancelled: "Отменён",
};

export const ROUTE_STATUS_ORDER: RouteStatus[] = [
  "planned",
  "in_progress",
  "completed",
  "cancelled",
];

export const ROUTE_STATUS_STYLES: Record<RouteStatus, string> = {
  planned: "bg-blue-100 text-blue-900 border-blue-200",
  in_progress: "bg-primary text-primary-foreground border-primary",
  completed: "bg-green-100 text-green-900 border-green-200",
  cancelled: "bg-muted text-muted-foreground border-border",
};

export const POINT_STATUS_LABELS: Record<PointStatus, string> = {
  pending: "Ожидает",
  arrived: "Прибыл",
  completed: "Доставлено",
  failed: "Не удалось",
  returned_to_warehouse: "Возврат на склад",
  defective: "Брак",
  no_payment: "Нет оплаты",
  no_qr: "Нет QR-кода",
  client_no_answer: "Клиент не отвечает",
  client_absent: "Клиента нет на месте",
  client_refused: "Отказ клиента",
  no_unloading: "Нет возможности выгрузки",
  problem: "Проблема",
};

export const POINT_STATUS_ORDER: PointStatus[] = [
  "pending",
  "arrived",
  "completed",
  "returned_to_warehouse",
  "defective",
  "no_payment",
  "no_qr",
  "client_no_answer",
  "client_absent",
  "client_refused",
  "no_unloading",
  "problem",
  "failed",
];

export const POINT_STATUS_STYLES: Record<PointStatus, string> = {
  pending: "bg-secondary text-foreground border-border",
  arrived: "bg-orange-100 text-orange-900 border-orange-200",
  completed: "bg-green-100 text-green-900 border-green-200",
  failed: "bg-destructive/10 text-destructive border-destructive/20",
  returned_to_warehouse: "bg-purple-100 text-purple-900 border-purple-200",
  defective: "bg-amber-100 text-amber-900 border-amber-200",
  no_payment: "bg-red-100 text-red-900 border-red-200",
  no_qr: "bg-red-100 text-red-900 border-red-200",
  client_no_answer: "bg-orange-100 text-orange-900 border-orange-200",
  client_absent: "bg-orange-100 text-orange-900 border-orange-200",
  client_refused: "bg-red-100 text-red-900 border-red-200",
  no_unloading: "bg-red-100 text-red-900 border-red-200",
  problem: "bg-destructive/10 text-destructive border-destructive/20",
};

/** Группировка статусов точки по итогу доставки */
export const SUCCESS_POINT_STATUSES: PointStatus[] = ["completed"];
export const FAILED_POINT_STATUSES: PointStatus[] = [
  "failed",
  "no_payment",
  "no_qr",
  "client_no_answer",
  "client_absent",
  "client_refused",
  "no_unloading",
  "problem",
  "returned_to_warehouse",
];
export const DEFECTIVE_POINT_STATUSES: PointStatus[] = ["defective"];

/** Маппинг статуса точки в исходный статус заказа */
export function pointStatusToOrderStatus(s: PointStatus):
  | "delivered"
  | "not_delivered"
  | "defective"
  | null {
  if (SUCCESS_POINT_STATUSES.includes(s)) return "delivered";
  if (DEFECTIVE_POINT_STATUSES.includes(s)) return "defective";
  if (FAILED_POINT_STATUSES.includes(s)) return "not_delivered";
  return null;
}
