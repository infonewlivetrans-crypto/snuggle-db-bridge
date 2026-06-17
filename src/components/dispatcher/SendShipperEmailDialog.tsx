// Диалог отправки данных перевозчика грузовладельцу.
// Использует SMTP-почту перевозчика (через POST /api/dispatcher/shipper-email/send),
// тело письма собирается из существующего шаблона src/lib/dispatcher/customer-card.ts.
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Mail, Loader2, AlertTriangle, Copy } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { apiGetAuth, apiPost } from "@/lib/api-client";
import {
  buildCustomerCardMessage,
  buildCustomerCardSubject,
  type CustomerCardPayload,
} from "@/lib/dispatcher/customer-card";

interface ShipperEmailRequestRow {
  id: string;
  request_number: string | null;
  dispatcher_carrier_ext_id: string | null;
  loading_city: string | null;
  unloading_city: string | null;
  loading_date: string | null;
  unloading_date: string | null;
  cargo_name: string | null;
  dispatcher_comment: string | null;
  carrier: { id?: string; name: string | null; phone: string | null; inn?: string | null; email?: string | null; ati_id?: string | null } | null;
  driver: { full_name: string | null; phone: string | null } | null;
  vehicle: {
    vehicle_kind: string | null;
    body_type: string | null;
    plate_number: string | null;
    payload_kg: number | null;
    volume_m3: number | null;
  } | null;
  freights: Array<{
    id: string;
    cargo_name: string | null;
    loading_city: string | null;
    unloading_city: string | null;
    loading_date: string | null;
    customer_name?: string | null;
    customer_email?: string | null;
    customer_phone?: string | null;
  }>;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: ShipperEmailRequestRow;
}

interface EmailStatus {
  row: {
    email: string;
    from_name: string | null;
    is_active: boolean;
    is_verified: boolean;
    has_password: boolean;
    last_error: string | null;
    last_test_at: string | null;
  } | null;
}

function splitEmails(s: string): string[] {
  return s
    .split(/[,;\s]+/)
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

export function SendShipperEmailDialog({ open, onOpenChange, row }: Props) {
  const carrierExtId = row.dispatcher_carrier_ext_id ?? "";
  const firstFreight = row.freights[0];

  const initialPayload: CustomerCardPayload = useMemo(
    () => ({
      freight: {
        loading_city: row.loading_city,
        unloading_city: row.unloading_city,
        loading_date: row.loading_date,
        unloading_date: row.unloading_date,
        cargo_name: row.cargo_name,
        title: null,
        weight_kg: null,
        volume_m3: null,
        customer_name: firstFreight?.customer_name ?? null,
      },
      carrier: row.carrier
        ? {
            name: row.carrier.name ?? null,
            inn: row.carrier.inn ?? null,
            phone: row.carrier.phone ?? null,
            email: row.carrier.email ?? null,
            ati_id: row.carrier.ati_id ?? null,
          }
        : null,
      driver: row.driver
        ? { full_name: row.driver.full_name ?? null, phone: row.driver.phone ?? null }
        : null,
      vehicle: row.vehicle
        ? {
            vehicle_kind: row.vehicle.vehicle_kind ?? null,
            body_type: row.vehicle.body_type ?? null,
            plate: row.vehicle.plate_number ?? null,
            payload_kg: row.vehicle.payload_kg ?? null,
            volume_m3: row.vehicle.volume_m3 ?? null,
          }
        : null,
      dispatcher_comment: row.dispatcher_comment,
    }),
    [row, firstFreight],
  );

  const [toField, setToField] = useState(firstFreight?.customer_email ?? "");
  const [ccField, setCcField] = useState("");
  const [subject, setSubject] = useState(() => buildCustomerCardSubject(initialPayload));
  const [body, setBody] = useState(() => buildCustomerCardMessage(initialPayload));

  // Idempotency ключ: стабильный для пары (request_id, текущий dispatcher).
  // На фронте — устойчив к двойному клику; на бэке — UNIQUE индекс по (created_by, client_request_id).
  const [clientRequestId] = useState(
    () => `cr-${row.id}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  );

  useEffect(() => {
    if (!open) return;
    setSubject(buildCustomerCardSubject(initialPayload));
    setBody(buildCustomerCardMessage(initialPayload));
    setToField(firstFreight?.customer_email ?? "");
    setCcField("");
  }, [open, initialPayload, firstFreight]);

  const statusQ = useQuery<EmailStatus>({
    queryKey: ["dispatcher-carrier-email-status", carrierExtId],
    enabled: open && !!carrierExtId,
    queryFn: () =>
      apiGetAuth<EmailStatus>(
        `/api/dispatcher/carrier-email-status?carrier_ext_id=${encodeURIComponent(carrierExtId)}`,
      ),
    staleTime: 30_000,
  });

  const status = statusQ.data?.row ?? null;
  const accountReady = !!status && status.is_active && status.has_password;

  const sendMut = useMutation({
    mutationFn: async () => {
      const to = splitEmails(toField);
      const cc = splitEmails(ccField);
      if (to.length === 0) throw new Error("Укажите минимум один e-mail получателя");
      if (!carrierExtId) throw new Error("Не определён перевозчик");
      return apiPost<{ ok: boolean; id?: string; duplicate?: boolean; error?: string }>(
        "/api/dispatcher/shipper-email/send",
        {
          carrier_ext_id: carrierExtId,
          carrier_request_id: row.id,
          to,
          cc: cc.length > 0 ? cc : undefined,
          subject,
          body,
          client_request_id: clientRequestId,
        },
        30000,
      );
    },
    onSuccess: (res) => {
      if (res.ok) {
        toast.success(res.duplicate ? "Письмо уже было отправлено" : "Письмо отправлено");
        onOpenChange(false);
      } else {
        toast.error("Не удалось отправить письмо", {
          description: res.error ?? "Неизвестная ошибка",
        });
      }
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      let description = msg;
      if (msg.includes("no_carrier_email_account") || msg.includes("account_inactive")) {
        description = "У перевозчика не подключена SMTP-почта.";
      } else if (msg.includes("no_password")) {
        description = "У перевозчика не сохранён пароль приложения SMTP.";
      } else if (msg.includes("decrypt_failed")) {
        description = "Не удалось расшифровать пароль SMTP. Попросите перевозчика сохранить пароль заново.";
      }
      toast.error("Не удалось отправить письмо", { description });
    },
  });

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(`${subject}\n\n${body}`);
      toast.success("Скопировано в буфер обмена");
    } catch {
      toast.error("Не удалось скопировать");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-screen h-[100dvh] max-w-none rounded-none p-0 sm:max-w-2xl sm:h-auto sm:max-h-[92vh] sm:rounded-lg flex flex-col gap-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-primary" />
              Отправить данные перевозчика грузовладельцу
            </DialogTitle>
            <DialogDescription>
              Письмо уйдёт с почты перевозчика
              {status?.email ? ` (${status.email})` : ""}.
              {row.request_number ? ` Заявка №${row.request_number}.` : ""}
            </DialogDescription>
          </DialogHeader>

          {statusQ.isLoading ? (
            <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Проверка SMTP-аккаунта…
            </div>
          ) : !accountReady ? (
            <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="space-y-1">
                  <div className="font-medium">
                    У перевозчика не подключена почта
                  </div>
                  <div className="text-xs">
                    Отправка через систему сейчас невозможна. Вы можете скопировать письмо и
                    отправить его вручную, либо попросить перевозчика подключить SMTP в его кабинете
                    (вкладка «Почта»).
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <div className="mt-4 space-y-3 text-sm">
            <div>
              <Label className="text-xs">Кому (через запятую)</Label>
              <Input
                value={toField}
                onChange={(e) => setToField(e.target.value)}
                placeholder="customer@example.com"
              />
            </div>
            <div>
              <Label className="text-xs">Копия (опционально)</Label>
              <Input
                value={ccField}
                onChange={(e) => setCcField(e.target.value)}
                placeholder="cc1@example.com, cc2@example.com"
              />
            </div>
            <div>
              <Label className="text-xs">Тема</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Текст</Label>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={16}
                className="font-mono text-xs"
              />
            </div>
          </div>
        </div>

        <DialogFooter className="border-t bg-card px-6 py-3">
          <Button variant="ghost" type="button" onClick={copyToClipboard}>
            <Copy className="mr-1 h-4 w-4" /> Скопировать
          </Button>
          <Button
            type="button"
            onClick={() => sendMut.mutate()}
            disabled={!accountReady || sendMut.isPending}
          >
            {sendMut.isPending ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Mail className="mr-1 h-4 w-4" />
            )}
            Отправить письмо
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
