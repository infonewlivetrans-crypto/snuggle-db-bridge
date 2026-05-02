// Карточка заказа для водителя на точке.
// Показываем только то, что нужно сделать "здесь и сейчас":
// - куда ехать, кому звонить, что выгрузить;
// - получить QR (если нужен), получить наличные (если нужны), сколько;
// - какие фото загрузить, что делать при проблеме.
// Если поле пустое — пишем "не указано", сами блоки не скрываем.
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PhoneCallButton } from "@/components/PhoneCallButton";
import { PAYMENT_LABELS, type Order } from "@/lib/orders";
import {
  MapPin,
  Package,
  QrCode,
  Wallet,
  Camera,
  AlertTriangle,
  Clock,
  FileText,
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
    | "qr_received"
    | "access_instructions"
    | "landmarks"
    | "map_link"
  >;
  /** Имя/телефон менеджера клиента — для быстрого звонка при проблеме. */
  managerName?: string | null;
  managerPhone?: string | null;
  workingHours?: string | null;
  /** Нужно ли загружать фото накладной (по умолчанию — да). */
  requiresInvoicePhoto?: boolean;
  /** Кнопка "Сообщить о проблеме" — открывает диалог в родителе. */
  onReportProblem?: () => void;
};

const NA = "не указано";

function fmtTime(t: string | null | undefined): string | null {
  if (!t) return null;
  return t.length >= 5 ? t.slice(0, 5) : t;
}

function orDash(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === "") return NA;
  return String(v);
}

export function DriverOrderCard({
  order,
  managerName,
  managerPhone,
  workingHours,
  requiresInvoicePhoto = true,
  onReportProblem,
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
            <Badge
              className={
                order.requires_qr
                  ? order.qr_received
                    ? "bg-emerald-100 text-emerald-900 border-emerald-200 text-xs"
                    : "bg-blue-100 text-blue-900 border-blue-200 text-xs"
                  : "bg-muted text-muted-foreground border-border text-xs"
              }
            >
              <QrCode className="mr-1 h-3 w-3" />
              {order.requires_qr ? (order.qr_received ? "QR получен" : "Нужен QR") : "QR не нужен"}
            </Badge>
            {needsCash && (
              <Badge className="bg-amber-100 text-amber-900 border-amber-200 text-xs">
                Наличные
              </Badge>
            )}
            {prepaid && (
              <Badge className="bg-emerald-100 text-emerald-900 border-emerald-200 text-xs">
                Оплачено
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {/* Куда ехать */}
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <div className="flex items-start gap-2">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-status-success" />
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Куда ехать
              </div>
              <div className="font-medium">{orDash(order.delivery_address)}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {order.landmarks ? order.landmarks : NA}
              </div>
              {order.map_link && (
                <a
                  href={order.map_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block text-xs text-primary underline"
                >
                  Открыть на карте
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Кому звонить */}
        <div className="space-y-2 rounded-lg border border-border bg-card p-3">
          <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Кому звонить
          </div>
          <div className="space-y-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">Клиент</div>
                <div className="truncate font-medium">{orDash(order.contact_name)}</div>
              </div>
              <PhoneCallButton phone={order.contact_phone} compact size="default" fullWidth />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">Менеджер / логист</div>
                <div className="truncate font-medium">{orDash(managerName)}</div>
              </div>
              <PhoneCallButton
                phone={managerPhone}
                compact
                size="default"
                variant="outline"
                fullWidth
              />
            </div>
          </div>
        </div>

        {/* Что выгрузить */}
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/20 p-2">
          <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
            <span className="text-muted-foreground">Груз:</span>
            <span className="font-medium">
              вес {order.total_weight_kg != null ? `${order.total_weight_kg} кг` : NA}
            </span>
            <span className="font-medium">
              объём {order.total_volume_m3 != null ? `${order.total_volume_m3} м³` : NA}
            </span>
            <span className="font-medium">
              {order.items_count != null ? `${order.items_count} шт` : `шт ${NA}`}
            </span>
          </div>
        </div>

        {/* Время */}
        <div className="flex items-start gap-2 text-xs">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="space-y-0.5">
            <div>
              Работает клиента: <span className="font-medium">{orDash(workingHours)}</span>
            </div>
            <div>
              Окно доставки: <span className="font-medium">{window ?? NA}</span>
            </div>
            <div className="text-muted-foreground">
              {order.delivery_time_comment ? order.delivery_time_comment : NA}
            </div>
          </div>
        </div>

        {/* Деньги */}
        <div className="space-y-2">
          <div className="rounded-md border border-border bg-muted/20 p-2 text-xs">
            <div>
              Статус оплаты:{" "}
              <span className="font-medium">
                {prepaid ? "оплачено заранее" : "не оплачено заранее"}
              </span>
            </div>
            <div>
              Тип оплаты: <span className="font-medium">{PAYMENT_LABELS[order.payment_type]}</span>
            </div>
            {needsCash && (
              <div>
                К получению наличными:{" "}
                <span className="font-semibold">
                  {order.amount_due != null
                    ? `${Number(order.amount_due).toLocaleString("ru-RU")} ₽`
                    : NA}
                </span>
              </div>
            )}
          </div>
          {needsCash && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-sm dark:bg-amber-950 dark:text-amber-200 dark:border-amber-900">
              <Wallet className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="font-medium">
                Получить с клиента{" "}
                {order.amount_due != null
                  ? `${Number(order.amount_due).toLocaleString("ru-RU")} ₽`
                  : "(уточнить сумму)"}
              </div>
            </div>
          )}
        </div>

        {/* Что приложить */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted/20 p-2 text-xs">
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              Фото накладной нужно:{" "}
              <span className="font-semibold">{requiresInvoicePhoto ? "да" : "нет"}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted/20 p-2 text-xs">
            <QrCode className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              Нужен QR-код: <span className="font-semibold">{order.requires_qr ? "да" : "нет"}</span>
            </div>
          </div>
          <div className="flex items-start gap-2 rounded-md border border-border bg-muted/20 p-2 text-xs text-muted-foreground">
            <Camera className="mt-0.5 h-4 w-4 shrink-0" />
            <div>Загрузить фото: место выгрузки, документы{order.requires_qr ? ", QR" : ""}.</div>
          </div>
        </div>

        {/* Особые условия */}
        <div className="text-xs">
          <div className="font-medium text-foreground">Особые условия выгрузки</div>
          <div className="text-muted-foreground whitespace-pre-line">
            {order.access_instructions ? order.access_instructions : NA}
          </div>
        </div>

        {/* Комментарий */}
        <div className="text-xs">
          <div className="font-medium text-foreground">Комментарий по доставке</div>
          <div className="text-muted-foreground whitespace-pre-line">
            {order.comment ? order.comment : NA}
          </div>
        </div>

        {onReportProblem && (
          <button
            type="button"
            onClick={onReportProblem}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/20"
          >
            <AlertTriangle className="h-4 w-4" />
            Сообщить о проблеме
          </button>
        )}
      </CardContent>
    </Card>
  );
}
