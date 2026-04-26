export type RouteStatus = "planned" | "in_progress" | "completed" | "cancelled";
export type PointStatus = "pending" | "arrived" | "completed" | "failed";

export type DeliveryRoute = {
  id: string;
  route_number: string;
  route_date: string;
  driver_name: string;
  status: RouteStatus;
  comment: string | null;
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
};

export const POINT_STATUS_ORDER: PointStatus[] = ["pending", "arrived", "completed", "failed"];

export const POINT_STATUS_STYLES: Record<PointStatus, string> = {
  pending: "bg-secondary text-foreground border-border",
  arrived: "bg-orange-100 text-orange-900 border-orange-200",
  completed: "bg-green-100 text-green-900 border-green-200",
  failed: "bg-destructive/10 text-destructive border-destructive/20",
};
