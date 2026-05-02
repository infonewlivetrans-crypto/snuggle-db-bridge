// Карточка заказа для водителя на точке.
// Показываем только то, что нужно сделать "здесь и сейчас":
// - куда ехать, кому звонить, что выгрузить;
// - получить QR (если нужен), получить наличные (если нужны), сколько;
// - какие фото загрузить, что делать при проблеме.
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PhoneCallButton } from "@/components/PhoneCallButton";
import { PAYMENT_LABELS, type Order } from "@/lib/orders";
import { MapPin, Package, QrCode, Wallet, Camera, AlertTriangle, Clock } from "lucide-react";

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
  /** Кнопка "Сообщить о проблеме" — открывает диалог в родителе. */
  onReportProblem?: () => void;
};

function fmtTime(t: string | null | undefined): string | null {
  if (!t) return null;
  return t.length >= 5 ? t.slice(0, 5) : t;
}

export function DriverOrderCard({
  order,
  managerName,
  managerPhone,
  workingHours,
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
            {order.requires_qr && (
              <Badge
                className={
                  order.qr_received
                    ? "bg-emerald-100 text-emerald-900 border-emerald-200 text-xs"
                    : "bg-blue-100 text-blue-900 border-blue-200 text-xs"
                }
              >
                <QrCode className="mr-1 h-3 w-3" />
                {order.qr_received ? "QR получен" : "Нужен QR"}
              </Badge>
            )}
            {needsCash && order.amount_due != null && (
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
              <div className="font-medium">{order.delivery_address || "—"}</div>
              {order.landmarks && (
                <div className="mt-1 text-xs text-muted-foreground">{order.landmarks}</div>
              )}
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
                <div className="truncate font-medium">{order.contact_name || "—"}</div>
              </div>
              <PhoneCallButton phone={order.contact_phone} compact size="default" fullWidth />
            </div>
            {(managerName || managerPhone) && (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="text-xs text-muted-foreground">Менеджер</div>
                  <div className="truncate font-medium">{managerName || "—"}</div>
                </div>
                <PhoneCallButton
                  phone={managerPhone}
                  compact
                  size="default"
                  variant="outline"
                  fullWidth
                />
              </div>
            )}
          </div>
        </div>

        {/* Что выгрузить */}
        {(order.total_weight_kg != null ||
          order.total_volume_m3 != null ||
          order.items_count != null) && (
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted/20 p-2">
            <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
              <span className="text-muted-foreground">Что выгрузить:</span>
              {order.total_weight_kg != null && (
                <span className="font-medium">{order.total_weight_kg} кг</span>
              )}
              {order.total_volume_m3 != null && (
                <span className="font-medium">{order.total_volume_m3} м³</span>
              )}
              {order.items_count != null && (
                <span className="font-medium">{order.items_count} шт</span>
              )}
            </div>
          </div>
        )}

        {/* Окно доставки */}
        {(window || workingHours) && (
          <div className="flex items-start gap-2 text-xs">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="space-y-0.5">
              {workingHours && (
                <div>
                  Работает: <span className="font-medium">{workingHours}</span>
                </div>
              )}
              {window && (
                <div>
                  Окно: <span className="font-medium">{window}</span>
                </div>
              )}
              {order.delivery_time_comment && (
                <div className="text-muted-foreground">{order.delivery_time_comment}</div>
              )}
            </div>
          </div>
        )}

        {/* Шаги доставки */}
        <div className="space-y-2">
          {order.requires_qr && (
            <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 p-2 text-sm dark:bg-blue-950 dark:text-blue-200 dark:border-blue-900">
              <QrCode className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div className="font-medium">Получить QR-код у клиента</div>
                <div className="text-xs opacity-80">Сфотографировать QR и приложить к точке</div>
              </div>
            </div>
          )}
          {needsCash && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-sm dark:bg-amber-950 dark:text-amber-200 dark:border-amber-900">
              <Wallet className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div className="font-medium">
                  Получить с клиента:{" "}
                  {order.amount_due != null
                    ? `${Number(order.amount_due).toLocaleString("ru-RU")} ₽`
                    : "уточнить сумму"}
                </div>
                <div className="text-xs opacity-80">{PAYMENT_LABELS[order.payment_type]}</div>
              </div>
            </div>
          )}
          {prepaid && (
            <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-2 text-sm dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-900">
              <Wallet className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="font-medium">Оплачено заранее. Деньги не брать.</div>
            </div>
          )}
          <div className="flex items-start gap-2 rounded-md border border-border bg-muted/20 p-2 text-xs text-muted-foreground">
            <Camera className="mt-0.5 h-4 w-4 shrink-0" />
            <div>Загрузить фото: место выгрузки, документы{order.requires_qr ? ", QR" : ""}.</div>
          </div>
        </div>

        {order.access_instructions && (
          <div className="text-xs">
            <div className="font-medium text-foreground">Особые условия выгрузки</div>
            <div className="text-muted-foreground whitespace-pre-line">
              {order.access_instructions}
            </div>
          </div>
        )}

        {order.comment && (
          <div className="text-xs">
            <div className="font-medium text-foreground">Комментарий</div>
            <div className="text-muted-foreground whitespace-pre-line">{order.comment}</div>
          </div>
        )}

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
