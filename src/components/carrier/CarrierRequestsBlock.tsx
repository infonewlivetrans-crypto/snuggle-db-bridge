import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, FileText, Inbox, Loader2, X } from "lucide-react";
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
import { RouteMapPreview } from "@/components/dispatcher/VehicleMapPanel";

interface FreightRow {
  id: string;
  cargo_name: string | null;
  loading_city: string | null;
  unloading_city: string | null;
  loading_date: string | null;
  weight_kg: number | string | null;
  volume_m3: number | string | null;
  rate_amount: number | string | null;
}

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
  responded_at: string | null;
  created_at: string;
  freights?: FreightRow[];
}

export interface CarrierRequestsResponse {
  rows: RequestRow[];
  total: number;
  counts: Record<string, number>;
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

export const CARRIER_REQUESTS_QUERY_KEY = ["carrier", "requests"] as const;

export function useCarrierRequestsQuery() {
  return useQuery({
    queryKey: CARRIER_REQUESTS_QUERY_KEY,
    queryFn: () => apiGetAuth<CarrierRequestsResponse>("/api/carrier/requests", 10000),
    refetchInterval: 30_000,
  });
}

export function CarrierRequestsBlock() {
  const qc = useQueryClient();
  const { data, isLoading } = useCarrierRequestsQuery();
  const rows = data?.rows ?? [];

  const incoming = rows.filter((r) => r.request_status === "sent" || r.request_status === "viewed");
  const accepted = rows.filter((r) => r.request_status === "accepted");
  const declined = rows.filter((r) => r.request_status === "declined");

  const refresh = () => qc.invalidateQueries({ queryKey: CARRIER_REQUESTS_QUERY_KEY });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Загрузка…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Section
        icon={<Inbox className="h-4 w-4 text-primary" />}
        title="Входящие предложения"
        count={incoming.length}
        emptyText="Нет новых предложений."
      >
        {incoming.map((r) => (
          <RequestCard key={r.id} row={r} variant="incoming" onChange={refresh} />
        ))}
      </Section>

      <Section
        icon={<Check className="h-4 w-4 text-emerald-600" />}
        title="Принятые рейсы"
        count={accepted.length}
        emptyText="Пока нет принятых предложений."
      >
        {accepted.map((r) => (
          <RequestCard key={r.id} row={r} variant="accepted" onChange={refresh} />
        ))}
      </Section>

      <Section
        icon={<X className="h-4 w-4 text-muted-foreground" />}
        title="История отказов"
        count={declined.length}
        emptyText="Отказов нет."
        collapsible
      >
        {declined.map((r) => (
          <RequestCard key={r.id} row={r} variant="declined" onChange={refresh} />
        ))}
      </Section>
    </div>
  );
}

function Section({
  icon,
  title,
  count,
  emptyText,
  collapsible,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  emptyText: string;
  collapsible?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(!collapsible);
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => collapsible && setOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-left"
        disabled={!collapsible}
      >
        {icon}
        <h3 className="text-base font-semibold">{title}</h3>
        <Badge variant="secondary">{count}</Badge>
      </button>
      {open ? (
        count === 0 ? (
          <Card>
            <CardContent className="py-4 text-center text-sm text-muted-foreground">
              {emptyText}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">{children}</div>
        )
      ) : null}
    </div>
  );
}

function RequestCard({
  row,
  variant,
  onChange,
}: {
  row: RequestRow;
  variant: "incoming" | "accepted" | "declined";
  onChange: () => void;
}) {
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

  const currency = row.rate_currency ?? "RUB";
  const payout =
    row.rate_amount != null && row.commission_amount != null
      ? Number(row.rate_amount) - Number(row.commission_amount)
      : null;
  const freights = row.freights ?? [];
  const isNew = row.request_status === "sent";

  return (
    <Card className={isNew ? "border-primary/60" : ""}>
      <CardContent className="space-y-2 p-3 text-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            {variant === "incoming" && (
              <div className="text-xs font-medium uppercase tracking-wide text-primary">
                Вам предложен рейс
              </div>
            )}
            <div className="font-semibold">
              № {row.request_number ?? row.id.slice(0, 8)}
            </div>
            <div className="text-xs text-muted-foreground">
              {(row.loading_city ?? "—") + " → " + (row.unloading_city ?? "—")}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            {isNew && <Badge>Новое</Badge>}
            <Badge variant="outline">
              {CARRIER_REQUEST_STATUS_LABELS[row.request_status as CarrierRequestStatus] ??
                row.request_status}
            </Badge>
          </div>
        </div>

        <RouteMapPreview
          loading={{ city: row.loading_city, address: row.loading_address }}
          unloading={{ city: row.unloading_city, address: row.unloading_address }}
        />

        {freights.length > 0 && (
          <div className="rounded-md border bg-muted/20 p-2 text-xs">
            <div className="mb-1 text-muted-foreground">Грузы в рейсе ({freights.length}):</div>
            <ul className="space-y-0.5">
              {freights.map((f) => (
                <li key={f.id} className="flex flex-wrap justify-between gap-2">
                  <span className="truncate">
                    {f.cargo_name ?? "Груз"} · {f.loading_city ?? "—"} → {f.unloading_city ?? "—"}
                  </span>
                  <span className="text-muted-foreground">
                    {[
                      f.loading_date,
                      f.weight_kg ? `${f.weight_kg} кг` : null,
                      f.volume_m3 ? `${f.volume_m3} м³` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid gap-1 text-xs sm:grid-cols-2">
          <div>
            <span className="text-muted-foreground">Загрузка: </span>
            {[row.loading_address, row.loading_date].filter(Boolean).join(" / ") || "—"}
          </div>
          <div>
            <span className="text-muted-foreground">Выгрузка: </span>
            {[row.unloading_address, row.unloading_date].filter(Boolean).join(" / ") || "—"}
          </div>
          <div>
            <span className="text-muted-foreground">Ставка заказчика: </span>
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
          <div className="font-medium">
            <span className="text-muted-foreground font-normal">К выплате перевозчику: </span>
            {payout == null ? "—" : `${payout} ${currency}`}
          </div>
        </div>

        {row.dispatcher_comment && (
          <div className="rounded-md border bg-muted/30 p-2 text-xs">
            <div className="text-muted-foreground">Комментарий диспетчера:</div>
            <div>{row.dispatcher_comment}</div>
          </div>
        )}

        {variant === "incoming" ? (
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
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setContractOpen(true)}
              >
                <FileText className="mr-1 h-3.5 w-3.5" /> Заявка-договор
              </Button>
            </div>
          </div>
        ) : (
          <>
            {row.carrier_comment && (
              <div className="rounded-md border p-2 text-xs">
                <div className="text-muted-foreground">
                  {variant === "declined" ? "Причина отказа:" : "Ваш комментарий:"}
                </div>
                <div>{row.carrier_comment}</div>
              </div>
            )}
            <div>
              <Button size="sm" variant="outline" onClick={() => setContractOpen(true)}>
                <FileText className="mr-1 h-3.5 w-3.5" /> Заявка-договор
              </Button>
            </div>
          </>
        )}
      </CardContent>

      <Dialog open={contractOpen} onOpenChange={setContractOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {contractQ.data?.subject ?? `Заявка-договор №${row.request_number ?? ""}`}
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
