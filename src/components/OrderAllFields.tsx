import { ListChecks } from "lucide-react";
import {
  PAYMENT_LABELS,
  PAYMENT_STATUS_LABELS,
  STATUS_LABELS,
  type Order,
} from "@/lib/orders";

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Да" : "Нет";
  if (typeof v === "number") return v.toLocaleString("ru-RU");
  return String(v);
}

export function OrderAllFields({ order }: { order: Order }) {
  const rows: Array<[string, unknown]> = [
    ["Номер", order.order_number],
    ["Статус", STATUS_LABELS[order.status]],
    ["Создан", new Date(order.created_at).toLocaleString("ru-RU")],
    ["Обновлён", new Date(order.updated_at).toLocaleString("ru-RU")],
    ["Адрес доставки", order.delivery_address],
    ["Координаты", order.latitude && order.longitude ? `${order.latitude}, ${order.longitude}` : null],
    ["Ориентиры", order.landmarks],
    ["Доступ / инструкции", order.access_instructions],
    ["Контакт", order.contact_name],
    ["Телефон", order.contact_phone],
    ["Маркетплейс", order.marketplace],
    ["Клиент работает в выходные", order.client_works_weekends ?? false],
    ["Тип оплаты", PAYMENT_LABELS[order.payment_type]],
    ["Статус оплаты", order.payment_status ? PAYMENT_STATUS_LABELS[order.payment_status] : null],
    ["Сумма к получению", order.amount_due != null ? `${Number(order.amount_due).toLocaleString("ru-RU")} ₽` : null],
    ["Стоимость доставки", order.delivery_cost != null ? `${Number(order.delivery_cost).toLocaleString("ru-RU")} ₽` : null],
    ["Источник стоимости", order.delivery_cost_source],
    ["Требуется QR", order.requires_qr],
    ["QR получен", order.qr_received],
    ["Наличные получены", order.cash_received],
    ["Вес, кг", order.total_weight_kg],
    ["Объём, м³", order.total_volume_m3],
    ["Позиций", order.items_count],
    ["Комментарий", order.comment],
  ];

  return (
    <details className="rounded-lg border border-border">
      <summary className="flex cursor-pointer items-center gap-2 p-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <ListChecks className="h-3.5 w-3.5" />
        Все поля заказа
      </summary>
      <div className="border-t border-border p-4">
        <dl className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-3 border-b border-border/50 py-1 text-sm">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="text-right font-medium text-foreground">{fmt(value)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </details>
  );
}
