import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FileText, CheckCircle2, XCircle, RotateCcw, Image as ImageIcon } from "lucide-react";

type ReportPayload = {
  delivery_route_id: string;
  route_number: string;
  route_date: string;
  driver: string | null;
  vehicle: string | null;
  totals: {
    total: number;
    delivered: number;
    not_delivered: number;
    returned: number;
    amount_due: number;
    amount_received: number;
    amount_diff: number;
  };
  orders: Array<{
    order_id: string;
    order_number: string;
    contact_name: string | null;
    delivery_address: string | null;
    dp_status: "delivered" | "not_delivered" | "returned_to_warehouse" | string;
    undelivered_reason: string | null;
    amount_due: number | null;
    amount_received: number | null;
    amount_diff: number;
    requires_qr: boolean;
    qr_received: boolean;
    cash_received: boolean;
    payment_comment: string | null;
    order_comment: string | null;
    photos: Array<{ kind: string; url: string }>;
  }>;
};

const STATUS_LABEL: Record<string, string> = {
  delivered: "Доставлено",
  not_delivered: "Не доставлено",
  returned_to_warehouse: "Возврат на склад",
};

const STATUS_ICON: Record<string, React.ReactNode> = {
  delivered: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />,
  not_delivered: <XCircle className="h-3.5 w-3.5 text-red-600" />,
  returned_to_warehouse: <RotateCcw className="h-3.5 w-3.5 text-orange-600" />,
};

const fmtMoney = (n: number | null | undefined) =>
  (n ?? 0).toLocaleString("ru-RU");

export function RouteCompletionReportBlock({ deliveryRouteId }: { deliveryRouteId: string }) {
  const { data: notif } = useQuery({
    queryKey: ["route-completed-report", deliveryRouteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, payload, created_at")
        .eq("kind", "route_completed_report")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      const found = (data ?? []).find(
        (n) => (n.payload as ReportPayload | null)?.delivery_route_id === deliveryRouteId,
      );
      return found ?? null;
    },
  });

  if (!notif) return null;
  const p = notif.payload as ReportPayload;

  return (
    <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-4">
      <div className="mb-3 flex items-center gap-2">
        <FileText className="h-4 w-4 text-blue-700 dark:text-blue-300" />
        <h2 className="text-sm font-semibold text-blue-700 dark:text-blue-300">
          Сводный отчёт менеджеру
        </h2>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <Info label="Маршрут" value={p.route_number} />
        <Info label="Дата" value={new Date(p.route_date).toLocaleDateString("ru-RU")} />
        <Info label="Водитель" value={p.driver ?? "—"} />
        <Info label="Машина" value={p.vehicle ?? "—"} />
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <Info label="Всего" value={String(p.totals.total)} />
        <Info label="Доставлено" value={String(p.totals.delivered)} />
        <Info label="Не доставлено" value={String(p.totals.not_delivered)} />
        <Info label="Возврат" value={String(p.totals.returned)} />
      </div>

      <div className="mb-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
        <Info label="К получению" value={fmtMoney(p.totals.amount_due)} />
        <Info label="Получено" value={fmtMoney(p.totals.amount_received)} />
        <Info
          label="Расхождение"
          value={(p.totals.amount_diff > 0 ? "+" : "") + fmtMoney(p.totals.amount_diff)}
          accent={p.totals.amount_diff !== 0}
        />
      </div>

      <div className="space-y-2">
        {p.orders.map((o) => (
          <div key={o.order_id} className="rounded-md border border-border bg-card p-3 text-xs">
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 font-medium">
                {STATUS_ICON[o.dp_status]}
                <span>№{o.order_number}</span>
                <span className="text-muted-foreground">· {o.contact_name ?? "—"}</span>
              </div>
              <span className="text-muted-foreground">
                {STATUS_LABEL[o.dp_status] ?? o.dp_status}
              </span>
            </div>
            <div className="text-muted-foreground">{o.delivery_address ?? "—"}</div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground">
              {o.amount_due != null && <span>К получению: {fmtMoney(o.amount_due)}</span>}
              {o.amount_received != null && <span>Получено: {fmtMoney(o.amount_received)}</span>}
              {o.amount_diff !== 0 && (
                <span className="text-red-600">
                  Расхождение: {(o.amount_diff > 0 ? "+" : "") + fmtMoney(o.amount_diff)}
                </span>
              )}
              {o.requires_qr && <span>QR: {o.qr_received ? "✓" : "✗"}</span>}
              <span>Наличка: {o.cash_received ? "✓" : "—"}</span>
            </div>
            {(o.payment_comment || o.order_comment) && (
              <div className="mt-1 italic text-muted-foreground">
                {[o.order_comment, o.payment_comment].filter(Boolean).join(" · ")}
              </div>
            )}
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

function Info({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded border px-2 py-1.5 ${accent ? "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300" : "border-border bg-card"}`}>
      <div className="text-[10px] uppercase tracking-wider opacity-70">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}
