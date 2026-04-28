import type { Database } from "@/integrations/supabase/types";

export type OrderStatus =
  | "new"
  | "in_progress"
  | "ready_for_delivery"
  | "delivering"
  | "completed"
  | "cancelled"
  | "delivered"
  | "not_delivered"
  | "defective"
  | "awaiting_resend"
  | "awaiting_return"
  | "return_accepted";
export type PaymentType = "cash" | "card" | "online" | "qr";
export type PaymentStatus = "not_paid" | "partial" | "paid" | "refunded";

export type Order = {
  id: string;
  order_number: string;
  status: OrderStatus;
  delivery_address: string | null;
  payment_type: PaymentType;
  requires_qr: boolean;
  comment: string | null;
  cash_received: boolean;
  qr_received: boolean;
  created_at: string;
  updated_at: string;
  // Координаты и навигация
  latitude: number | null;
  longitude: number | null;
  landmarks: string | null;
  access_instructions: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  map_link: string | null;
  delivery_photo_url: string | null;
  total_weight_kg: number | null;
  total_volume_m3: number | null;
  items_count: number | null;
  qr_photo_url: string | null;
  qr_photo_uploaded_at: string | null;
  qr_photo_uploaded_by: string | null;
  // Стоимость доставки
  delivery_cost?: number;
  delivery_cost_source?: "auto" | "tariff" | "manual";
  manual_cost_reason?: string | null;
  manual_cost_set_by?: string | null;
  manual_cost_set_at?: string | null;
  applied_tariff_id?: string | null;
  // Финансы и атрибуты клиента
  amount_due?: number | null;
  payment_status?: PaymentStatus;
  marketplace?: string | null;
  client_works_weekends?: boolean;
};


export const STATUS_LABELS: Record<OrderStatus, string> = {
  new: "Новый",
  in_progress: "В работе",
  ready_for_delivery: "Готов к доставке",
  delivering: "Доставляется",
  completed: "Выполнен",
  cancelled: "Отменён",
  delivered: "Доставлен",
  not_delivered: "Не доставлен",
  defective: "Требует повторной доставки",
  awaiting_resend: "Возврат на склад",
};

export const STATUS_ORDER: OrderStatus[] = [
  "new",
  "in_progress",
  "ready_for_delivery",
  "delivering",
  "delivered",
  "not_delivered",
  "defective",
  "awaiting_resend",
  "completed",
  "cancelled",
];

export const PAYMENT_LABELS: Record<PaymentType, string> = {
  cash: "Наличные",
  card: "Карта",
  online: "Онлайн",
  qr: "QR-код",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  not_paid: "Не оплачен",
  partial: "Частично",
  paid: "Оплачен",
  refunded: "Возврат",
};

export const PAYMENT_STATUS_STYLES: Record<PaymentStatus, string> = {
  not_paid: "bg-amber-100 text-amber-900 border-amber-200",
  partial: "bg-blue-100 text-blue-900 border-blue-200",
  paid: "bg-green-100 text-green-900 border-green-200",
  refunded: "bg-muted text-muted-foreground border-border",
};

export const STATUS_STYLES: Record<OrderStatus, string> = {
  new: "bg-blue-100 text-blue-900 border-blue-200",
  in_progress: "bg-primary text-primary-foreground border-primary",
  ready_for_delivery: "bg-cyan-100 text-cyan-900 border-cyan-200",
  delivering: "bg-orange-100 text-orange-900 border-orange-200",
  completed: "bg-green-100 text-green-900 border-green-200",
  cancelled: "bg-muted text-muted-foreground border-border",
  delivered: "bg-green-100 text-green-900 border-green-200",
  not_delivered: "bg-red-100 text-red-900 border-red-200",
  defective: "bg-amber-100 text-amber-900 border-amber-200",
  awaiting_resend: "bg-purple-100 text-purple-900 border-purple-200",
};

// Type guard helper for Supabase
export type DbOrder = Database extends { public: { Tables: { orders: { Row: infer R } } } } ? R : Order;
