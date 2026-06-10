import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { apiGetAuth, apiPatch } from "@/lib/api-client";
import { toast } from "sonner";
import {
  CARRIER_REQUEST_PAYMENT_TYPE_LABELS,
  CARRIER_REQUEST_STATUS_LABELS,
  type CarrierRequestPaymentType,
  type CarrierRequestStatus,
} from "@/lib/dispatcher/statuses";

interface RequestRow {
  id: string;
  request_number: string | null;
  cargo_name: string | null;
  loading_city: string | null;
  loading_address: string | null;
  loading_date: string | null;
  unloading_city: string | null;
  unloading_address: string | null;
  unloading_date: string | null;
  rate_amount: number | string | null;
  rate_currency: string | null;
  payment_type: string | null;
  payment_delay_days: number | null;
  commission_percent: number | string | null;
  commission_amount: number | string | null;
  dispatcher_comment: string | null;
  carrier_comment: string | null;
  request_status: string;
  sent_at: string | null;
  created_at: string;
}

function paymentLabel(t: string | null, delay: number | null): string {
  if (!t) return "—";
  const base = CARRIER_REQUEST_PAYMENT_TYPE_LABELS[t as CarrierRequestPaymentType] ?? t;
  if (t === "delayed" && delay != null) return `${base}, ${delay} дн.`;
  return base;
}

export function CarrierRequestsBlock() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["carrier", "requests"],
    queryFn: () => apiGetAuth<{ rows: RequestRow[] }>("/api/carrier/requests", 10000),
  });
  const rows = data?.rows ?? [];

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-medium">Заявки от диспетчера</h2>
      <p className="text-sm text-muted-foreground">
        Заявки на перевозку, направленные вам диспетчером. Подтвердите или
        отклоните условия.
      </p>

      {isLoading ? (
        <div className="flex items-center justify-center py-6 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Загрузка…
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            Пока нет заявок.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <RequestCard key={r.id} row={r} onChange={() => qc.invalidateQueries({ queryKey: ["carrier", "requests"] })} />
          ))}
        </div>
      )}
    </div>
  );
}

function RequestCard({ row, onChange }: { row: RequestRow; onChange: () => void }) {
  const [comment, setComment] = useState<string>(row.carrier_comment ?? "");

  const respondMut = useMutation({
    mutationFn: async (status: "accepted" | "declined") =>
      apiPatch<{ row: RequestRow }>(`/api/carrier/requests/${row.id}/respond`, {
        request_status: status,
        carrier_comment: comment || null,
      }),
    onSuccess: (_, status) => {
      onChange();
      toast.success(status === "accepted" ? "Заявка принята" : "Заявка отклонена");
    },
    onError: (e: unknown) =>
      toast.error("Не удалось сохранить", {
        description: e instanceof Error ? e.message : undefined,
      }),
  });

  const isFinal = row.request_status === "accepted" || row.request_status === "declined";
  const currency = row.rate_currency ?? "RUB";

  return (
    <Card>
      <CardContent className="space-y-2 p-3 text-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="font-semibold">
            {row.request_number ?? row.id.slice(0, 8)}
          </div>
          <Badge variant="outline">
            {CARRIER_REQUEST_STATUS_LABELS[row.request_status as CarrierRequestStatus] ??
              row.request_status}
          </Badge>
        </div>

        <div className="grid gap-1 text-xs sm:grid-cols-2">
          <div><span className="text-muted-foreground">Груз: </span>{row.cargo_name ?? "—"}</div>
          <div>
            <span className="text-muted-foreground">Маршрут: </span>
            {(row.loading_city ?? "—") + " → " + (row.unloading_city ?? "—")}
          </div>
          <div>
            <span className="text-muted-foreground">Загрузка: </span>
            {[row.loading_address, row.loading_date].filter(Boolean).join(" / ") || "—"}
          </div>
          <div>
            <span className="text-muted-foreground">Выгрузка: </span>
            {[row.unloading_address, row.unloading_date].filter(Boolean).join(" / ") || "—"}
          </div>
          <div>
            <span className="text-muted-foreground">Ставка: </span>
            {row.rate_amount == null ? "—" : `${row.rate_amount} ${currency}`}
          </div>
          <div>
            <span className="text-muted-foreground">Оплата: </span>
            {paymentLabel(row.payment_type, row.payment_delay_days)}
          </div>
          <div>
            <span className="text-muted-foreground">Комиссия диспетчера: </span>
            {row.commission_amount == null
              ? "—"
              : `${row.commission_amount} ${currency} (${row.commission_percent ?? 5}%)`}
          </div>
        </div>

        {row.dispatcher_comment && (
          <div className="rounded-md border bg-muted/30 p-2 text-xs">
            <div className="text-muted-foreground">Комментарий диспетчера:</div>
            <div>{row.dispatcher_comment}</div>
          </div>
        )}

        {!isFinal ? (
          <div className="space-y-2">
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Комментарий перевозчика (по желанию)"
              rows={2}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => respondMut.mutate("accepted")}
                disabled={respondMut.isPending}
              >
                <Check className="mr-1 h-3.5 w-3.5" /> Принять
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => respondMut.mutate("declined")}
                disabled={respondMut.isPending}
              >
                <X className="mr-1 h-3.5 w-3.5" /> Отклонить
              </Button>
            </div>
          </div>
        ) : (
          row.carrier_comment && (
            <div className="rounded-md border p-2 text-xs">
              <div className="text-muted-foreground">Ваш комментарий:</div>
              <div>{row.carrier_comment}</div>
            </div>
          )
        )}
      </CardContent>
    </Card>
  );
}
