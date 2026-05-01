import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Wallet, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth/auth-context";

export type CarrierPayoutStatus =
  | "to_pay"
  | "scheduled"
  | "paid"
  | "partially_paid"
  | "cancelled";

export const PAYOUT_STATUS_LABELS: Record<CarrierPayoutStatus, string> = {
  to_pay: "К оплате",
  scheduled: "Запланировано",
  paid: "Оплачено",
  partially_paid: "Частично оплачено",
  cancelled: "Отменено",
};

export const PAYOUT_STATUS_STYLES: Record<CarrierPayoutStatus, string> = {
  to_pay: "bg-violet-100 text-violet-900 border-violet-200",
  scheduled: "bg-blue-100 text-blue-900 border-blue-200",
  paid: "bg-emerald-100 text-emerald-900 border-emerald-200",
  partially_paid: "bg-amber-100 text-amber-900 border-amber-200",
  cancelled: "bg-slate-100 text-slate-700 border-slate-200",
};

const ACTION_BY_STATUS: Record<CarrierPayoutStatus, string> = {
  to_pay: "marked_to_pay",
  scheduled: "payment_scheduled",
  paid: "payment_paid",
  partially_paid: "payment_partial",
  cancelled: "payment_cancelled",
};

type Row = {
  carrier_cost: number | null;
  carrier_payment_status: string | null;
  carrier_payout_status: CarrierPayoutStatus | null;
  carrier_payout_scheduled_date: string | null;
  carrier_payout_paid_amount: number | null;
  carrier_payout_paid_at: string | null;
  carrier_payout_comment: string | null;
  carrier_payout_changed_at: string | null;
  carrier_id: string | null;
};

export function isOverdue(
  status: CarrierPayoutStatus | null | undefined,
  scheduledDate: string | null | undefined,
): boolean {
  if (!status || !scheduledDate) return false;
  if (status === "paid" || status === "cancelled") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sched = new Date(scheduledDate);
  return sched.getTime() < today.getTime();
}

export function CarrierPayoutBlock({ routeId }: { routeId: string }) {
  const { user, profile, roles } = useAuth();
  const qc = useQueryClient();
  const isStaff =
    roles.includes("admin") || roles.includes("director") || roles.includes("logist");

  const { data: row } = useQuery({
    queryKey: ["carrier-payout", routeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("routes")
        .select(
          "carrier_cost,carrier_payment_status,carrier_payout_status,carrier_payout_scheduled_date,carrier_payout_paid_amount,carrier_payout_paid_at,carrier_payout_comment,carrier_payout_changed_at,carrier_id",
        )
        .eq("id", routeId)
        .maybeSingle();
      if (error) throw error;
      return data as Row | null;
    },
  });

  const [status, setStatus] = useState<CarrierPayoutStatus>("to_pay");
  const [schedDate, setSchedDate] = useState<string>("");
  const [paidAmount, setPaidAmount] = useState<string>("");
  const [comment, setComment] = useState<string>("");

  useEffect(() => {
    if (!row) return;
    setStatus(row.carrier_payout_status ?? "to_pay");
    setSchedDate(row.carrier_payout_scheduled_date ?? "");
    setPaidAmount(
      row.carrier_payout_paid_amount != null && Number(row.carrier_payout_paid_amount) > 0
        ? String(row.carrier_payout_paid_amount)
        : "",
    );
    setComment(row.carrier_payout_comment ?? "");
  }, [row]);

  const save = useMutation({
    mutationFn: async () => {
      const label = profile?.full_name ?? user?.email ?? null;
      const patch: Record<string, unknown> = {
        carrier_payout_status: status,
        carrier_payout_scheduled_date: schedDate || null,
        carrier_payout_comment: comment || null,
        carrier_payout_changed_at: new Date().toISOString(),
        carrier_payout_changed_by: user?.id ?? null,
      };
      if (status === "paid" || status === "partially_paid") {
        patch.carrier_payout_paid_amount = paidAmount
          ? Number(paidAmount)
          : status === "paid"
          ? Number(row?.carrier_cost ?? 0)
          : 0;
        patch.carrier_payout_paid_at = new Date().toISOString();
      } else if (status === "to_pay" || status === "scheduled" || status === "cancelled") {
        patch.carrier_payout_paid_amount = 0;
        patch.carrier_payout_paid_at = null;
      }
      const { error } = await supabase.from("routes").update(patch).eq("id", routeId);
      if (error) throw error;

      await supabase.from("route_carrier_history").insert({
        route_id: routeId,
        carrier_id: row?.carrier_id ?? null,
        action: ACTION_BY_STATUS[status],
        actor_user_id: user?.id ?? null,
        actor_label: label,
        comment: comment || null,
      });
    },
    onSuccess: () => {
      toast.success("Сохранено");
      qc.invalidateQueries({ queryKey: ["carrier-payout", routeId] });
      qc.invalidateQueries({ queryKey: ["carrier-payments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!row) return null;
  // Show only when payment has been approved/marked to_pay, or already in payout flow
  if (
    row.carrier_payment_status !== "to_pay" &&
    row.carrier_payment_status !== "approved" &&
    !row.carrier_payout_status
  ) {
    return null;
  }

  const overdue = isOverdue(row.carrier_payout_status, row.carrier_payout_scheduled_date);
  const currentStatus: CarrierPayoutStatus = row.carrier_payout_status ?? "to_pay";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Wallet className="h-5 w-5" />
          Оплата перевозчику
        </CardTitle>
        <Badge variant="outline" className={PAYOUT_STATUS_STYLES[currentStatus]}>
          {PAYOUT_STATUS_LABELS[currentStatus]}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        {overdue && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <div className="font-medium">Просроченная оплата перевозчику</div>
              <div className="text-xs mt-0.5">
                Запланировано на{" "}
                {new Date(row.carrier_payout_scheduled_date!).toLocaleDateString("ru-RU")}
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <div className="text-xs text-muted-foreground">Сумма к оплате</div>
            <div className="text-lg font-semibold">{fmtMoney(row.carrier_cost)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Оплачено</div>
            <div className="text-lg font-semibold">
              {fmtMoney(row.carrier_payout_paid_amount)}
              {row.carrier_payout_paid_at && (
                <span className="ml-2 text-xs text-muted-foreground">
                  • {new Date(row.carrier_payout_paid_at).toLocaleDateString("ru-RU")}
                </span>
              )}
            </div>
          </div>
        </div>

        {isStaff ? (
          <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Статус оплаты
              </Label>
              <select
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={status}
                onChange={(e) => setStatus(e.target.value as CarrierPayoutStatus)}
              >
                {(
                  ["to_pay", "scheduled", "paid", "partially_paid", "cancelled"] as CarrierPayoutStatus[]
                ).map((s) => (
                  <option key={s} value={s}>
                    {PAYOUT_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="payout-date">Планируемая дата оплаты</Label>
                <Input
                  id="payout-date"
                  type="date"
                  value={schedDate}
                  onChange={(e) => setSchedDate(e.target.value)}
                />
              </div>
              {(status === "paid" || status === "partially_paid") && (
                <div>
                  <Label htmlFor="payout-amount">
                    {status === "partially_paid" ? "Сумма частичной оплаты" : "Сумма оплаты"}
                  </Label>
                  <Input
                    id="payout-amount"
                    type="number"
                    inputMode="decimal"
                    placeholder={String(row.carrier_cost ?? 0)}
                    value={paidAmount}
                    onChange={(e) => setPaidAmount(e.target.value)}
                  />
                </div>
              )}
            </div>

            <div>
              <Label htmlFor="payout-comment">Комментарий</Label>
              <Textarea
                id="payout-comment"
                rows={2}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Например: оплата по графику пятницы"
              />
            </div>

            <div className="flex justify-end">
              <Button onClick={() => save.mutate()} disabled={save.isPending} className="gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Сохранить
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 rounded-md border border-border p-3 text-sm sm:grid-cols-2">
            <div>
              <div className="text-xs text-muted-foreground">Планируемая дата</div>
              <div>
                {row.carrier_payout_scheduled_date
                  ? new Date(row.carrier_payout_scheduled_date).toLocaleDateString("ru-RU")
                  : "—"}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Комментарий</div>
              <div>{row.carrier_payout_comment || "—"}</div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function fmtMoney(v: number | null | undefined): string {
  if (v == null) return "—";
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(Number(v));
}
