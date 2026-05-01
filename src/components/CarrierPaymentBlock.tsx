import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Coins, CheckCircle2, AlertCircle, Send } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth/auth-context";

export type CarrierPaymentStatus =
  | "not_calculated"
  | "calculated"
  | "review"
  | "approved"
  | "to_pay";

const STATUS_LABELS: Record<CarrierPaymentStatus, string> = {
  not_calculated: "Не рассчитано",
  calculated: "Рассчитано",
  review: "На проверке",
  approved: "Подтверждено",
  to_pay: "К оплате",
};

const STATUS_STYLES: Record<CarrierPaymentStatus, string> = {
  not_calculated: "bg-slate-100 text-slate-900 border-slate-200",
  calculated: "bg-blue-100 text-blue-900 border-blue-200",
  review: "bg-amber-100 text-amber-900 border-amber-200",
  approved: "bg-emerald-100 text-emerald-900 border-emerald-200",
  to_pay: "bg-violet-100 text-violet-900 border-violet-200",
};

type Row = {
  carrier_cost: number | null;
  carrier_payment_status: CarrierPaymentStatus;
  carrier_cost_comment: string | null;
  carrier_cost_approved_at: string | null;
  carrier_id: string | null;
  cost_method: string | null;
  fixed_cost: number | null;
  cost_per_km: number | null;
  cost_per_point: number | null;
  total_distance_km: number | null;
  points_count: number | null;
};

export function CarrierPaymentBlock({ routeId }: { routeId: string }) {
  const qc = useQueryClient();
  const { roles } = useAuth();
  const canManage = roles.includes("admin") || roles.includes("logist");

  const [comment, setComment] = useState<string>("");

  const { data, isLoading } = useQuery({
    queryKey: ["route-carrier-payment", routeId],
    queryFn: async (): Promise<Row | null> => {
      const { data, error } = await supabase
        .from("routes")
        .select(
          "carrier_cost, carrier_payment_status, carrier_cost_comment, carrier_cost_approved_at, carrier_id, cost_method, fixed_cost, cost_per_km, cost_per_point, total_distance_km, points_count",
        )
        .eq("id", routeId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Row | null;
    },
  });

  const setStatus = useMutation({
    mutationFn: async (status: CarrierPaymentStatus) => {
      const patch: Record<string, unknown> = {
        carrier_payment_status: status,
        carrier_cost_comment: comment.trim() || data?.carrier_cost_comment || null,
      };
      if (status === "approved" || status === "to_pay") {
        patch.carrier_cost_approved_at = new Date().toISOString();
      }
      const { error } = await supabase.from("routes").update(patch).eq("id", routeId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Статус расчёта обновлён");
      setComment("");
      qc.invalidateQueries({ queryKey: ["route-carrier-payment", routeId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return null;
  if (!data) return null;

  const status = data.carrier_payment_status;
  const methodLabel: Record<string, string> = {
    manual: "Вручную",
    per_km: "За километр",
    per_point: "За точку",
    km_plus_point: "Километр + точка",
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Coins className="h-4 w-4 text-primary" />
            Стоимость перевозчику
          </CardTitle>
          <Badge variant="outline" className={STATUS_STYLES[status]}>
            {STATUS_LABELS[status]}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!data.carrier_id && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Перевозчик ещё не назначен — расчёт станет доступен после подтверждения.
          </div>
        )}

        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          <div className="text-muted-foreground">Способ расчёта</div>
          <div>{data.cost_method ? methodLabel[data.cost_method] ?? data.cost_method : "—"}</div>

          {data.cost_method === "manual" && (
            <>
              <div className="text-muted-foreground">Фиксированная цена</div>
              <div>{fmtMoney(data.fixed_cost)}</div>
            </>
          )}
          {(data.cost_method === "per_km" || data.cost_method === "km_plus_point") && (
            <>
              <div className="text-muted-foreground">Цена за км</div>
              <div>{fmtMoney(data.cost_per_km)}</div>
            </>
          )}
          {(data.cost_method === "per_point" || data.cost_method === "km_plus_point") && (
            <>
              <div className="text-muted-foreground">Цена за точку</div>
              <div>{fmtMoney(data.cost_per_point)}</div>
            </>
          )}

          <div className="text-muted-foreground">Километров</div>
          <div>{data.total_distance_km ?? 0} км</div>

          <div className="text-muted-foreground">Точек</div>
          <div>{data.points_count ?? 0}</div>

          <div className="border-t pt-1.5 font-medium">Итого перевозчику</div>
          <div className="border-t pt-1.5 text-base font-semibold">
            {fmtMoney(data.carrier_cost)}
          </div>
        </div>

        {data.carrier_cost_comment && (
          <div className="rounded-md border border-border bg-muted/30 p-2 text-xs">
            <div className="mb-0.5 font-medium text-muted-foreground">Комментарий логиста</div>
            <div className="whitespace-pre-wrap">{data.carrier_cost_comment}</div>
          </div>
        )}

        {data.carrier_cost_approved_at && (
          <div className="text-xs text-emerald-700">
            <CheckCircle2 className="mr-1 inline h-3 w-3" />
            Подтверждено: {new Date(data.carrier_cost_approved_at).toLocaleString("ru-RU")}
          </div>
        )}

        {canManage && (
          <div className="space-y-2 border-t pt-3">
            <Label className="text-xs">Комментарий логиста</Label>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Комментарий к расчёту (необязательно)"
              rows={2}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={!data.carrier_cost || setStatus.isPending}
                onClick={() => setStatus.mutate("review")}
              >
                <Send className="mr-1.5 h-3.5 w-3.5" /> На проверку
              </Button>
              <Button
                size="sm"
                disabled={!data.carrier_cost || setStatus.isPending}
                onClick={() => setStatus.mutate("approved")}
              >
                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Подтвердить
              </Button>
              <Button
                size="sm"
                variant="default"
                disabled={status !== "approved" || setStatus.isPending}
                onClick={() => setStatus.mutate("to_pay")}
              >
                К оплате
              </Button>
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
