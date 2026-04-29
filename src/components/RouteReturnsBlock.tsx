import { RotateCcw, Image as ImageIcon, MapPin, Clock } from "lucide-react";
import {
  DELIVERY_POINT_UNDELIVERED_REASON_LABELS,
  type DeliveryPointUndeliveredReason,
} from "@/lib/deliveryPointStatus";

type OrderRow = {
  order_id: string;
  order_number: string;
  contact_name: string | null;
  delivery_address: string | null;
  dp_status: string;
  undelivered_reason: string | null;
  return_warehouse_name?: string | null;
  return_comment?: string | null;
  expected_return_at?: string | null;
  payment_comment: string | null;
  order_comment: string | null;
  photos: Array<{ kind: string; url: string }>;
};

const reasonLabel = (r: string | null | undefined) => {
  if (!r) return "—";
  return (
    DELIVERY_POINT_UNDELIVERED_REASON_LABELS[r as DeliveryPointUndeliveredReason] ?? r
  );
};

const fmtDateTime = (iso: string | null | undefined) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
};

export function RouteReturnsBlock({ orders }: { orders: OrderRow[] }) {
  const returns = orders.filter((o) => o.dp_status === "returned_to_warehouse");
  if (returns.length === 0) return null;

  return (
    <div className="rounded-md border border-orange-500/30 bg-orange-500/5 p-3">
      <div className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-orange-800 dark:text-orange-200">
        <RotateCcw className="h-4 w-4" />
        Возвраты на склад ({returns.length})
      </div>

      <div className="space-y-2">
        {returns.map((o) => (
          <div
            key={o.order_id}
            className="rounded-md border border-orange-500/30 bg-card p-3 text-xs"
          >
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">
                №{o.order_number}
                <span className="ml-1.5 text-muted-foreground">
                  · {o.contact_name ?? "—"}
                </span>
              </span>
              <span className="rounded border border-orange-500/40 bg-orange-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-orange-800 dark:text-orange-200">
                Возврат на склад
              </span>
            </div>

            {o.delivery_address && (
              <div className="mb-1.5 flex items-start gap-1 text-muted-foreground">
                <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                <span>{o.delivery_address}</span>
              </div>
            )}

            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              <Field label="Причина возврата">
                {reasonLabel(o.undelivered_reason)}
              </Field>
              <Field label="Склад возврата">
                {o.return_warehouse_name ?? "—"}
              </Field>
              <Field
                label={
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Ориентировочное время
                  </span>
                }
              >
                {fmtDateTime(o.expected_return_at)}
              </Field>
              <Field label="Комментарий">
                {o.return_comment || o.payment_comment || "—"}
              </Field>
            </div>

            {o.photos.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {o.photos.map((ph, i) => (
                  <a
                    key={i}
                    href={ph.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] hover:bg-muted/80"
                    title={ph.kind}
                  >
                    <ImageIcon className="h-3 w-3" />
                    {ph.kind}
                  </a>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded border border-border/60 bg-background/50 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="font-medium">{children}</div>
    </div>
  );
}
