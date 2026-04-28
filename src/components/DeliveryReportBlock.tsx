import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, AlertTriangle } from "lucide-react";

type ReportPayload = {
  order_number?: string;
  contact_name?: string | null;
  delivery_address?: string | null;
  manager_name?: string | null;
  final_status?: "delivered" | "not_delivered" | "returned_to_warehouse";
  final_status_label?: string;
  reason_label?: string | null;
  return_warehouse_name?: string | null;
  return_comment?: string | null;
  expected_return_at?: string | null;
  arrived_at?: string | null;
  unload_started_at?: string | null;
  unload_finished_at?: string | null;
  finished_at?: string | null;
  unload_minutes?: number | null;
  idle_duration_minutes?: number | null;
  idle_reason_label?: string | null;
  idle_comment?: string | null;
  requires_qr?: boolean;
  qr_received?: boolean;
  amount_due?: number | null;
  amount_received?: number | null;
  amount_diff?: number | null;
  payment_comment?: string | null;
  order_comment?: string | null;
  photos?: Array<{ kind: string; url: string }>;
  photos_count?: number;
};

type Row = {
  id: string;
  created_at: string;
  is_read: boolean;
  payload: ReportPayload;
};

const STATUS_TONE: Record<string, string> = {
  delivered: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  not_delivered: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
  returned_to_warehouse: "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300",
};

const PHOTO_KIND_LABEL: Record<string, string> = {
  qr: "QR-код",
  signed_docs: "Документы",
  payment: "Оплата",
  problem: "Проблема",
  unloading_place: "Место выгрузки",
};

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtMin(min: number | null | undefined): string {
  if (min == null) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h} ч ${m} мин` : `${m} мин`;
}

function fmtMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("ru-RU");
}

export function DeliveryReportBlock({ orderId }: { orderId: string }) {
  const { data: reports = [], isLoading } = useQuery<Row[]>({
    queryKey: ["delivery-reports-notifications", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, created_at, is_read, payload")
        .eq("order_id", orderId)
        .eq("kind", "delivery_report")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  return (
    <div className="rounded-md border border-border bg-card/50 p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <ClipboardList className="h-3.5 w-3.5" />
        Отчёт по доставке
        <span className="text-muted-foreground/70">({reports.length})</span>
      </div>
      {isLoading ? (
        <div className="text-xs text-muted-foreground">Загрузка...</div>
      ) : reports.length === 0 ? (
        <div className="text-xs text-muted-foreground">
          Отчёт сформируется автоматически после завершения точки маршрута
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((r) => {
            const p = r.payload ?? {};
            const photoGroups = (p.photos ?? []).reduce<Record<string, string[]>>((acc, ph) => {
              (acc[ph.kind] ??= []).push(ph.url);
              return acc;
            }, {});
            const showDiscrepancy =
              p.amount_diff != null && p.amount_diff !== 0;

            return (
              <div key={r.id} className="rounded border border-border/70 bg-background p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={STATUS_TONE[p.final_status ?? ""] ?? "border-border"}
                    >
                      {p.final_status_label ?? "Статус"}
                    </Badge>
                    <span className="font-medium">№ {p.order_number ?? "—"}</span>
                  </div>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {new Date(r.created_at).toLocaleString("ru-RU")}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
                  <Field label="Клиент" value={p.contact_name ?? "—"} />
                  <Field label="Адрес" value={p.delivery_address ?? "—"} />
                  {p.reason_label && <Field label="Причина" value={p.reason_label} />}
                  {p.return_warehouse_name && (
                    <Field label="Склад возврата" value={p.return_warehouse_name} />
                  )}
                  {p.expected_return_at && (
                    <Field label="Ожид. возврат" value={fmtTime(p.expected_return_at)} />
                  )}
                  <Field label="Прибытие" value={fmtTime(p.arrived_at)} />
                  <Field label="Время разгрузки" value={fmtMin(p.unload_minutes)} />
                  {(p.idle_duration_minutes ?? 0) > 0 && (
                    <Field
                      label="Простой"
                      value={`${fmtMin(p.idle_duration_minutes)}${
                        p.idle_reason_label ? ` (${p.idle_reason_label})` : ""
                      }`}
                    />
                  )}
                  {p.requires_qr && (
                    <Field
                      label="QR-код"
                      value={p.qr_received ? "получен" : "не получен"}
                    />
                  )}
                  <Field label="К получению" value={fmtMoney(p.amount_due)} />
                  <Field label="Получено фактически" value={fmtMoney(p.amount_received)} />
                  {showDiscrepancy && (
                    <Field
                      label="Расхождение"
                      value={`${(p.amount_diff ?? 0) > 0 ? "+" : ""}${fmtMoney(p.amount_diff)}`}
                      tone="red"
                    />
                  )}
                  {p.payment_comment && (
                    <Field label="Комм. по оплате" value={p.payment_comment} />
                  )}
                  {p.order_comment && (
                    <Field label="Комм. к заказу" value={p.order_comment} />
                  )}
                  {p.return_comment && (
                    <Field label="Комм. возврата" value={p.return_comment} />
                  )}
                  {p.idle_comment && <Field label="Комм. простоя" value={p.idle_comment} />}
                </div>

                {showDiscrepancy && (
                  <div className="mt-2 inline-flex items-center gap-1 rounded border border-red-500/30 bg-red-500/5 px-2 py-1 text-[11px] text-red-700 dark:text-red-300">
                    <AlertTriangle className="h-3 w-3" />
                    Есть расхождение по оплате
                  </div>
                )}

                {Object.keys(photoGroups).length > 0 && (
                  <div className="mt-3 space-y-2">
                    {Object.entries(photoGroups).map(([kind, urls]) => (
                      <div key={kind}>
                        <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                          {PHOTO_KIND_LABEL[kind] ?? kind} ({urls.length})
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {urls.map((url, i) => (
                            <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                              <img
                                src={url}
                                alt={kind}
                                className="h-14 w-14 rounded border border-border object-cover"
                              />
                            </a>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "red";
}) {
  const cls =
    tone === "red"
      ? "text-red-700 dark:text-red-300 font-medium"
      : "text-foreground";
  return (
    <div className="flex justify-between gap-3 border-b border-border/30 py-1 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className={`text-right ${cls}`}>{value}</span>
    </div>
  );
}
