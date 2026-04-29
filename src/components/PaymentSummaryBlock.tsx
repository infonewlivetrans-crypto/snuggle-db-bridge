import { Wallet, AlertTriangle, CheckCircle2, Banknote } from "lucide-react";
import { PAYMENT_LABELS, type PaymentType } from "@/lib/orders";

type Props = {
  paymentType: PaymentType;
  paymentStatus: string; // "paid" | "not_paid" | ...
  amountDue: number | null;
  amountReceived: number | null;
  paymentComment?: string | null;
};

const fmt = (n: number | null | undefined) =>
  n == null ? "—" : `${Number(n).toLocaleString("ru-RU")} ₽`;

export function PaymentSummaryBlock({
  paymentType,
  paymentStatus,
  amountDue,
  amountReceived,
  paymentComment,
}: Props) {
  const isPrepaid = paymentStatus === "paid";
  const isCash = paymentType === "cash";
  const due = Number(amountDue ?? 0);
  const got = amountReceived == null ? null : Number(amountReceived);
  const diff = got == null ? 0 : got - due;
  const hasMismatch = got != null && got > 0 && due > 0 && diff !== 0;

  return (
    <div className="rounded-md border border-border bg-card/50 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <Wallet className="h-3.5 w-3.5" />
        Оплата и наличные
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <Field label="Тип оплаты">{PAYMENT_LABELS[paymentType]}</Field>
        <Field label="Оплачено заранее">
          {isPrepaid ? (
            <span className="text-emerald-700 dark:text-emerald-300">Да</span>
          ) : (
            <span className="text-amber-700 dark:text-amber-300">Нет</span>
          )}
        </Field>
        <Field label="К получению">{fmt(amountDue)}</Field>
        <Field label="Фактически получено">
          {got == null ? "—" : fmt(got)}
        </Field>
      </div>

      {due > 0 && got != null && (
        <div className="mt-2 text-xs">
          <span className="text-muted-foreground">Расхождение: </span>
          <span
            className={
              diff === 0
                ? "font-medium text-emerald-700 dark:text-emerald-300"
                : "font-medium text-red-700 dark:text-red-300"
            }
          >
            {diff > 0 ? "+" : ""}
            {fmt(diff)}
          </span>
        </div>
      )}

      {/* Подсказки водителю */}
      {isPrepaid && (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-2 text-xs text-emerald-800 dark:text-emerald-200">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="font-medium">
            Клиент уже оплатил. Деньги не забирать.
          </span>
        </div>
      )}

      {!isPrepaid && isCash && (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-xs text-amber-900 dark:text-amber-100">
          <Banknote className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="font-medium">
            Получить с клиента: {fmt(amountDue)}
          </span>
        </div>
      )}

      {hasMismatch && (
        <div className="mt-2 flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-2.5 py-2 text-xs text-red-800 dark:text-red-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="font-medium">Есть расхождение по оплате</span>
        </div>
      )}

      {paymentComment && (
        <div className="mt-2 rounded border border-border bg-muted/30 px-2 py-1.5 text-xs italic text-muted-foreground">
          {paymentComment}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded border border-border/60 bg-background p-2">
      <div className="mb-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="text-sm font-medium">{children}</div>
    </div>
  );
}
