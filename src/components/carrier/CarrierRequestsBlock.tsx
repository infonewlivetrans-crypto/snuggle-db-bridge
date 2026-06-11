import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, FileText, Loader2, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  terms_text: string | null;
  dispatcher_comment: string | null;
  carrier_comment: string | null;
  request_status: string;
  sent_at: string | null;
  created_at: string;
}

const DECLINE_REASONS = [
  "Низкая ставка",
  "Не подходит маршрут",
  "Не подходит дата",
  "Не подходят условия оплаты",
  "Машина занята",
  "Водитель отказался",
  "Другая причина",
];

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
  const [contractOpen, setContractOpen] = useState(false);

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

  const contractQ = useQuery({
    queryKey: ["carrier", "contract", row.id],
    queryFn: () =>
      apiGetAuth<{ subject: string; contract_text: string }>(
        `/api/carrier/requests/${row.id}/contract-preview`,
        10000,
      ),
    enabled: contractOpen,
  });

  async function copyContract() {
    const text = contractQ.data?.contract_text ?? "";
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Текст скопирован");
    } catch {
      toast.error("Не удалось скопировать");
    }
  }

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
            <span className="text-muted-foreground">Комиссия сервиса: </span>
            {row.commission_amount == null
              ? "—"
              : `${row.commission_amount} ${currency} (${row.commission_percent ?? 5}%)`}
          </div>
          <div>
            <span className="text-muted-foreground">К выплате: </span>
            {row.rate_amount != null && row.commission_amount != null
              ? `${Number(row.rate_amount) - Number(row.commission_amount)} ${currency}`
              : "—"}
          </div>
        </div>

        {row.terms_text && (
          <div className="rounded-md border bg-muted/30 p-2 text-xs whitespace-pre-wrap">
            <div className="mb-1 text-muted-foreground">Состав рейса:</div>
            {row.terms_text}
          </div>
        )}

        {row.dispatcher_comment && (
          <div className="rounded-md border bg-muted/30 p-2 text-xs">
            <div className="text-muted-foreground">Комментарий диспетчера:</div>
            <div>{row.dispatcher_comment}</div>
          </div>
        )}

        {!isFinal ? (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1">
              {DECLINE_REASONS.map((r) => (
                <button
                  type="button"
                  key={r}
                  onClick={() => setComment(r)}
                  className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] hover:bg-muted"
                >
                  {r}
                </button>
              ))}
            </div>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Причина отказа или комментарий перевозчика"
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
                <X className="mr-1 h-3.5 w-3.5" /> Отказаться
              </Button>
            </div>
          </div>
        ) : (
          row.carrier_comment && (
            <div className="rounded-md border p-2 text-xs">
              <div className="text-muted-foreground">
                {row.request_status === "declined" ? "Причина отказа:" : "Ваш комментарий:"}
              </div>
              <div>{row.carrier_comment}</div>
            </div>
          )
        )}

        <div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setContractOpen(true)}
          >
            <FileText className="mr-1 h-3.5 w-3.5" /> Посмотреть заявку-договор
          </Button>
        </div>
      </CardContent>

      <Dialog open={contractOpen} onOpenChange={setContractOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {contractQ.data?.subject ??
                `Заявка-договор №${row.request_number ?? ""}`}
            </DialogTitle>
          </DialogHeader>
          {contractQ.isLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Загрузка…
            </div>
          ) : contractQ.error ? (
            <div className="text-sm text-destructive">
              Не удалось загрузить:{" "}
              {contractQ.error instanceof Error ? contractQ.error.message : "ошибка"}
            </div>
          ) : (
            <Textarea
              readOnly
              value={contractQ.data?.contract_text ?? ""}
              rows={18}
              className="font-mono text-xs"
            />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={copyContract} disabled={!contractQ.data}>
              <Copy className="mr-1 h-3.5 w-3.5" /> Копировать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
