import { Wallet, AlertTriangle, CheckCircle2 } from "lucide-react";

type OrderRow = {
  order_id: string;
  order_number: string;
  contact_name: string | null;
  amount_due: number | null;
  amount_received: number | null;
  amount_diff: number;
  cash_received: boolean;
  payment_comment: string | null;
};

type Props = {
  orders: OrderRow[];
  // Optional: payment_type / payment_status are not in the notification payload —
  // we infer "prepaid" from amount_due == null/0 OR cash_received==false AND amount_received==null
  // The trigger doesn't include payment_type, so we mark prepaid via "amount_due == 0" or "no money expected".
  // Manager sees raw numbers either way.
};

const fmt = (n: number | null | undefined) =>
  ((n ?? 0) as number).toLocaleString("ru-RU");

export function PaymentSummaryReportBlock({ orders }: Props) {
  // Prepaid heuristic: no amount_due expected
  const prepaid = orders.filter((o) => !o.amount_due || Number(o.amount_due) === 0);
  const toCollect = orders.filter((o) => Number(o.amount_due ?? 0) > 0);
  const mismatched = toCollect.filter((o) => Number(o.amount_diff ?? 0) !== 0);

  const totalDue = toCollect.reduce((s, o) => s + Number(o.amount_due ?? 0), 0);
  const totalGot = toCollect.reduce((s, o) => s + Number(o.amount_received ?? 0), 0);
  const totalDiff = totalGot - totalDue;

  return (
    <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
      <div className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-amber-800 dark:text-amber-200">
        <Wallet className="h-4 w-4" />
        Наличные и оплата
      </div>

      <div className="mb-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
        <Stat label="Должен был забрать" value={fmt(totalDue) + " ₽"} />
        <Stat label="Фактически забрал" value={fmt(totalGot) + " ₽"} />
        <Stat
          label="Расхождение"
          value={(totalDiff > 0 ? "+" : "") + fmt(totalDiff) + " ₽"}
          accent={totalDiff !== 0}
        />
      </div>

      {mismatched.length > 0 && (
        <div className="mb-3 flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-2.5 py-2 text-xs text-red-800 dark:text-red-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="font-medium">
            Есть расхождение по оплате — {mismatched.length} заказ(ов)
          </span>
        </div>
      )}

      {/* Заказы под оплату */}
      {toCollect.length > 0 && (
        <div className="mb-3">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Заказы под оплату
          </div>
          <div className="space-y-1">
            {toCollect.map((o) => {
              const diff = Number(o.amount_diff ?? 0);
              const mismatch = diff !== 0;
              return (
                <div
                  key={o.order_id}
                  className={`rounded border px-2 py-1.5 text-xs ${
                    mismatch
                      ? "border-red-500/40 bg-red-500/10"
                      : "border-border bg-card"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">
                      №{o.order_number}
                      <span className="ml-1.5 text-muted-foreground">
                        · {o.contact_name ?? "—"}
                      </span>
                    </span>
                    <span className="text-muted-foreground">
                      {fmt(o.amount_due)} → {fmt(o.amount_received)}
                      {mismatch && (
                        <span className="ml-1.5 font-semibold text-red-700 dark:text-red-300">
                          ({diff > 0 ? "+" : ""}
                          {fmt(diff)})
                        </span>
                      )}
                    </span>
                  </div>
                  {o.payment_comment && (
                    <div className="mt-0.5 italic text-muted-foreground">
                      Комментарий водителя: {o.payment_comment}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Уже оплачены заранее */}
      {prepaid.length > 0 && (
        <div>
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
            Оплачены заранее ({prepaid.length})
          </div>
          <div className="flex flex-wrap gap-1">
            {prepaid.map((o) => (
              <span
                key={o.order_id}
                className="inline-flex items-center rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[11px] text-emerald-800 dark:text-emerald-200"
              >
                №{o.order_number}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded border px-2 py-1.5 ${
        accent
          ? "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300"
          : "border-border bg-card"
      }`}
    >
      <div className="text-[10px] uppercase tracking-wider opacity-70">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}
