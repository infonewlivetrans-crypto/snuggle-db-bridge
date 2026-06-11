// Блок «Данные заказчику» по сделке.
// Показывает связанные грузы, позволяет указать email-получателей,
// сформировать текст, скопировать его и отметить «отправлено вручную».
// Реальная SMTP/мессенджер-отправка тут не делается.

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, FileText, Loader2, Save, Send, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { apiGetAuth, apiPost, apiPatch } from "@/lib/api-client";

interface FreightRow {
  id: string;
  title: string | null;
  loading_city: string | null;
  unloading_city: string | null;
  loading_date: string | null;
  unloading_date: string | null;
  cargo_name: string | null;
  rate: number | string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_emails: string[] | null;
  customer_phone: string | null;
  customer_send_comment: string | null;
}

interface SendHistoryRow {
  id: string;
  recipient_email: string | null;
  recipient_name: string | null;
  send_channel: string;
  subject: string | null;
  status: string;
  sent_at: string | null;
  created_at: string;
}

interface Props {
  dealId: string;
  dealStatus: string;
  carrierAccepted: boolean; // true, если перевозчик уже принял
}

const READY_STATUSES = new Set([
  "agreed",
  "documents_sent",
  "loading",
  "in_transit",
  "unloading",
  "delivered",
  "waiting_payment",
  "closed",
]);

function splitEmails(s: string): string[] {
  return s
    .split(/[,\s;]+/)
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

export function CustomerSendBlock({ dealId, dealStatus, carrierAccepted }: Props) {
  const qc = useQueryClient();
  const ready = READY_STATUSES.has(dealStatus) || carrierAccepted;

  const freightsQ = useQuery({
    enabled: ready,
    queryKey: ["customer-send", "freights", dealId],
    queryFn: () =>
      apiGetAuth<{ rows: FreightRow[] }>(
        `/api/dispatcher/freights?deal_id=${dealId}&limit=200`,
        10000,
      ),
  });

  const freights: FreightRow[] = useMemo(
    () => freightsQ.data?.rows ?? [],
    [freightsQ.data],
  );

  const historyQ = useQuery({
    enabled: ready,
    queryKey: ["customer-send", "history", dealId],
    queryFn: () =>
      apiGetAuth<{ rows: SendHistoryRow[] }>(
        `/api/dispatcher/partner-card/sends?deal_id=${dealId}&limit=50`,
        10000,
      ),
  });
  const history = historyQ.data?.rows ?? [];

  if (!ready) {
    return (
      <div className="rounded-md border p-3 text-sm text-muted-foreground">
        Сначала перевозчик должен принять предложение. После принятия здесь
        появится блок «Данные заказчику».
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex items-center gap-2">
        <MailCheck className="h-4 w-4" />
        <span className="text-sm font-semibold">Данные заказчику по грузам</span>
      </div>

      {freightsQ.isLoading || allFreightsQ.isLoading ? (
        <div className="text-xs text-muted-foreground">
          <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" /> Загрузка грузов…
        </div>
      ) : freights.length === 0 ? (
        <div className="text-xs text-muted-foreground">
          К этой сделке пока не привязано ни одного груза.
        </div>
      ) : (
        <div className="space-y-3">
          {freights.map((f) => (
            <FreightSendRow
              key={f.id}
              dealId={dealId}
              freight={f}
              onSaved={() => {
                qc.invalidateQueries({ queryKey: ["customer-send", "history", dealId] });
                qc.invalidateQueries({ queryKey: ["customer-send", "freights", dealId] });
                qc.invalidateQueries({ queryKey: ["customer-send", "freights-all", dealId] });
              }}
            />
          ))}
        </div>
      )}

      <div className="space-y-1">
        <div className="text-xs font-semibold text-muted-foreground">
          История отправок заказчику
        </div>
        {historyQ.isLoading ? (
          <div className="text-xs text-muted-foreground">Загрузка…</div>
        ) : history.length === 0 ? (
          <div className="text-xs text-muted-foreground">Пока пусто.</div>
        ) : (
          <div className="space-y-1">
            {history.map((h) => (
              <Card key={h.id}>
                <CardContent className="flex flex-wrap items-center gap-2 p-2 text-xs">
                  <Badge variant="outline">{h.status}</Badge>
                  <Badge variant="secondary">{h.send_channel}</Badge>
                  <span className="text-muted-foreground">
                    {new Date(h.created_at).toLocaleString("ru-RU")}
                  </span>
                  {h.recipient_email && (
                    <span className="font-mono">{h.recipient_email}</span>
                  )}
                  {h.subject && (
                    <span className="text-muted-foreground">— {h.subject}</span>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FreightSendRow({
  dealId,
  freight,
  onSaved,
}: {
  dealId: string;
  freight: FreightRow;
  onSaved: () => void;
}) {
  const initialExtra =
    Array.isArray(freight.customer_emails) && freight.customer_emails.length > 0
      ? freight.customer_emails.join(", ")
      : "";
  const [primaryEmail, setPrimaryEmail] = useState(freight.customer_email ?? "");
  const [extraEmails, setExtraEmails] = useState(initialExtra);
  const [customerName, setCustomerName] = useState(freight.customer_name ?? "");
  const [customerPhone, setCustomerPhone] = useState(freight.customer_phone ?? "");
  const [comment, setComment] = useState(freight.customer_send_comment ?? "");
  const [subject, setSubject] = useState<string | null>(null);
  const [messageText, setMessageText] = useState<string>("");
  const [loadingPreview, setLoadingPreview] = useState(false);

  const allEmails = useMemo(() => {
    const list: string[] = [];
    if (primaryEmail.trim()) list.push(primaryEmail.trim());
    for (const e of splitEmails(extraEmails)) {
      if (!list.includes(e)) list.push(e);
    }
    return list;
  }, [primaryEmail, extraEmails]);

  async function saveFreightFields() {
    try {
      await apiPatch(`/api/dispatcher/freights/${freight.id}`, {
        customer_email: primaryEmail.trim() || null,
        customer_emails: splitEmails(extraEmails),
        customer_name: customerName.trim() || null,
        customer_phone: customerPhone.trim() || null,
        customer_send_comment: comment.trim() || null,
      });
    } catch (e) {
      toast.error("Не удалось сохранить поля груза", {
        description: e instanceof Error ? e.message : undefined,
      });
      throw e;
    }
  }

  async function buildText() {
    setLoadingPreview(true);
    try {
      await saveFreightFields();
      const params = new URLSearchParams();
      params.set("freight_id", freight.id);
      if (comment.trim()) params.set("comment", comment.trim());
      const res = await apiGetAuth<{
        subject: string;
        message_text: string;
      }>(
        `/api/dispatcher/deals/${dealId}/customer-send-preview?${params.toString()}`,
        15000,
      );
      setSubject(res.subject);
      setMessageText(res.message_text);
    } catch (e) {
      toast.error("Не удалось сформировать текст", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setLoadingPreview(false);
    }
  }

  const logMut = useMutation({
    mutationFn: async (status: "copied" | "sent" | "draft") => {
      if (!messageText.trim()) throw new Error("Сначала сформируйте текст");
      if (allEmails.length === 0) throw new Error("Укажите хотя бы один email");
      return apiPost(`/api/dispatcher/deals/${dealId}/customer-send-log`, {
        freight_id: freight.id,
        recipient_email: allEmails.join(", "),
        recipient_name: customerName.trim() || null,
        send_channel: "manual",
        subject,
        message_text: messageText,
        status,
      });
    },
    onSuccess: () => {
      toast.success("Сохранено в историю");
      onSaved();
    },
    onError: (e: unknown) =>
      toast.error("Не удалось сохранить", {
        description: e instanceof Error ? e.message : undefined,
      }),
  });

  async function copyText() {
    if (!messageText) {
      toast.error("Сначала сформируйте текст");
      return;
    }
    try {
      await navigator.clipboard.writeText(messageText);
      toast.success("Текст скопирован");
      logMut.mutate("copied");
    } catch {
      toast.error("Не удалось скопировать");
    }
  }

  return (
    <Card>
      <CardContent className="space-y-2 p-3 text-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="font-semibold">
              {(freight.loading_city ?? "—") + " → " + (freight.unloading_city ?? "—")}
            </div>
            <div className="text-xs text-muted-foreground">
              {freight.cargo_name ?? freight.title ?? "Груз"} ·{" "}
              {freight.loading_date ?? "—"} → {freight.unloading_date ?? "—"}
            </div>
          </div>
          <Badge variant="outline">
            <FileText className="mr-1 h-3 w-3" /> Груз
          </Badge>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">Email заказчика (основной)</Label>
            <Input
              value={primaryEmail}
              onChange={(e) => setPrimaryEmail(e.target.value)}
              placeholder="customer@example.com"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Доп. email через запятую</Label>
            <Input
              value={extraEmails}
              onChange={(e) => setExtraEmails(e.target.value)}
              placeholder="manager@example.com, ops@example.com"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Имя заказчика</Label>
            <Input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Телефон/контакт</Label>
            <Input
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">Комментарий для заказчика</Label>
            <Textarea
              rows={2}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" type="button" onClick={buildText} disabled={loadingPreview}>
            {loadingPreview ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : null}
            Сформировать текст
          </Button>
          <Button
            size="sm"
            type="button"
            variant="outline"
            onClick={copyText}
            disabled={!messageText}
          >
            <Copy className="mr-1 h-3.5 w-3.5" /> Скопировать
          </Button>
          <Button
            size="sm"
            type="button"
            variant="outline"
            onClick={() => logMut.mutate("draft")}
            disabled={!messageText || logMut.isPending}
          >
            <Save className="mr-1 h-3.5 w-3.5" /> В историю
          </Button>
          <Button
            size="sm"
            type="button"
            onClick={() => logMut.mutate("sent")}
            disabled={!messageText || logMut.isPending}
          >
            <Send className="mr-1 h-3.5 w-3.5" /> Отметить отправлено
          </Button>
        </div>

        {subject && (
          <div className="text-xs text-muted-foreground">
            Тема: <span className="text-foreground">{subject}</span>
          </div>
        )}
        {messageText && (
          <Textarea
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            rows={14}
            className="font-mono text-xs"
          />
        )}
        {allEmails.length > 0 && (
          <div className="text-xs text-muted-foreground">
            Получатели: <span className="font-mono">{allEmails.join(", ")}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
