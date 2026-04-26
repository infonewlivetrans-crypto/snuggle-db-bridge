import type { Database } from "@/integrations/supabase/types";

export type OrderStatus = "new" | "in_progress" | "delivering" | "completed" | "cancelled";
export type PaymentType = "cash" | "card" | "online" | "qr";

export type Order = {
  id: string;
  order_number: string;
  status: OrderStatus;
  delivery_address: string;
  payment_type: PaymentType;
  requires_qr: boolean;
  comment: string | null;
  cash_received: boolean;
  qr_received: boolean;
  created_at: string;
  updated_at: string;
};

export const STATUS_LABELS: Record<OrderStatus, string> = {
  new: "Новый",
  in_progress: "В работе",
  delivering: "Доставляется",
  completed: "Выполнен",
  cancelled: "Отменён",
};

export const STATUS_ORDER: OrderStatus[] = [
  "new",
  "in_progress",
  "delivering",
  "completed",
  "cancelled",
];

export const PAYMENT_LABELS: Record<PaymentType, string> = {
  cash: "Наличные",
  card: "Карта",
  online: "Онлайн",
  qr: "QR-код",
};

export const STATUS_STYLES: Record<OrderStatus, string> = {
  new: "bg-blue-100 text-blue-900 border-blue-200",
  in_progress: "bg-primary text-primary-foreground border-primary",
  delivering: "bg-orange-100 text-orange-900 border-orange-200",
  completed: "bg-green-100 text-green-900 border-green-200",
  cancelled: "bg-muted text-muted-foreground border-border",
};

// Type guard helper for Supabase
export type DbOrder = Database extends { public: { Tables: { orders: { Row: infer R } } } } ? R : Order;
