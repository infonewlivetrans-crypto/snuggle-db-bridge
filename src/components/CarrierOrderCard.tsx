// Карточка заказа для перевозчика. Показываем ТОЛЬКО рабочую информацию,
// без внутренних комментариев менеджеров, маржи и финансов компании.
// Если поле пустое — пишем "не указано", сами блоки не скрываем.
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PhoneCallButton } from "@/components/PhoneCallButton";
import { PAYMENT_LABELS, type Order } from "@/lib/orders";
import {
  MapPin,
  Package,
  Clock,
  Wallet,
  QrCode,
  FileText,
  AlertCircle,
} from "lucide-react";

type Props = {
  order: Pick<
    Order,
    | "id"
    | "order_number"
    | "delivery_address"
    | "contact_name"
    | "contact_phone"
    | "delivery_window_from"
    | "delivery_window_to"
    | "delivery_time_comment"
    | "comment"
    | "total_weight_kg"
    | "total_volume_m3"
    | "items_count"
    | "payment_type"
    | "payment_status"
    | "amount_due"
    | "requires_qr"
    | "access_instructions"
    | "landmarks"
  >;
  /** Адрес склада/загрузки (общий по рейсу). */
  pickupAddress?: string | null;
  /** Время работы клиента — приходит из карточки клиента. */
  workingHours?: string | null;
  /** Нужно ли фото накладной (по умолчанию — да). */
  requiresInvoicePhoto?: boolean;
};

const NA = "не указано";

function fmtTime(t: string | null | undefined): string | null {
  if (!t) return null;
  return t.length >= 5 ? t.slice(0, 5) : t;
}

export function CarrierOrderCard({
  order,
  pickupAddress,
  workingHours,
  requiresInvoicePhoto = true,
}: Props) {
  const needsCash = order.payment_type === "cash" && order.payment_status !== "paid";
  const prepaid = order.payment_status === "paid";
  const window =
    order.delivery_window_from || order.delivery_window_to
      ? `${fmtTime(order.delivery_window_from) ?? "…"} – ${fmtTime(order.delivery_window_to) ?? "…"}`
      : null;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base">№ {order.order_number}</CardTitle>
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {prepaid && (
              <Badge variant="outline" className="text-xs">
                Оплачено заранее
              </Badge>
            )}
            {needsCash && (
              <Badge className="bg-amber-100 text-amber-900 border-amber-200 text-xs">
                Наличные
                {order.amount_due != null
                  ? `: ${Number(order.amount_due).toLocaleString("ru-RU")} ₽`
                  : ""}
              </Badge>
            )}
            {order.requires_qr && (
              <Badge className="bg-blue-100 text-blue-900 border-blue-200 text-xs">
                <QrCode className="mr-1 h-3 w-3" />
                QR
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-start gap-2">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Загрузка
            </div>
            <div>{pickupAddress ? pickupAddress : NA}</div>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-status-success" />
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Выгрузка
            </div>
            <div className="font-medium">{order.delivery_address || NA}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {order.landmarks ? order.landmarks : NA}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/30 p-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Клиент
            </div>
            <div className="truncate font-medium">{order.contact_name || NA}</div>
          </div>
          <PhoneCallButton phone={order.contact_phone} compact size="default" />
        </div>

        <div className="flex items-start gap-2">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="space-y-0.5 text-xs">
            <div>
              <span className="text-muted-foreground">Работает:</span>{" "}
              <span className="font-medium">{workingHours ? workingHours : NA}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Окно доставки:</span>{" "}
              <span className="font-medium">{window ?? NA}</span>
            </div>
            <div className="text-muted-foreground">
              {order.delivery_time_comment ? order.delivery_time_comment : NA}
            </div>
          </div>
        </div>

        <div className="flex items-start gap-2">
          <Package className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
            <span>
              вес{" "}
              <span className="font-medium">
                {order.total_weight_kg != null ? `${order.total_weight_kg} кг` : NA}
              </span>
            </span>
            <span>
              объём{" "}
              <span className="font-medium">
                {order.total_volume_m3 != null ? `${order.total_volume_m3} м³` : NA}
              </span>
            </span>
            <span>
              шт{" "}
              <span className="font-medium">
                {order.items_count != null ? order.items_count : NA}
              </span>
            </span>
          </div>
        </div>

        <div className="flex items-start gap-2">
          <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="text-xs">
            Оплата: <span className="font-medium">{PAYMENT_LABELS[order.payment_type]}</span>
            {needsCash && (
              <span className="ml-1 text-foreground">
                · к получению{" "}
                {order.amount_due != null
                  ? `${Number(order.amount_due).toLocaleString("ru-RU")} ₽`
                  : NA}
              </span>
            )}
            {prepaid && <span className="ml-1 text-status-success">· оплачено заранее</span>}
          </div>
        </div>

        {/* Требования */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted/20 p-2 text-xs">
            <QrCode className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              Нужен QR-код: <span className="font-semibold">{order.requires_qr ? "да" : "нет"}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted/20 p-2 text-xs">
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              Фото накладной нужно:{" "}
              <span className="font-semibold">{requiresInvoicePhoto ? "да" : "нет"}</span>
            </div>
          </div>
        </div>

        <div className="text-xs">
          <div className="font-medium text-foreground">Особые условия выгрузки</div>
          <div className="text-muted-foreground whitespace-pre-line">
            {order.access_instructions ? order.access_instructions : NA}
          </div>
        </div>

        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="text-xs">
            <div className="font-medium text-foreground">Комментарий по доставке</div>
            <div className="text-muted-foreground whitespace-pre-line">
              {order.comment ? order.comment : NA}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
