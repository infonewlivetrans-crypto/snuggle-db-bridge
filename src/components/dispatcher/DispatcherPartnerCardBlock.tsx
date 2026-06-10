import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, FileText, Loader2, Save, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiGetAuth, apiPost, apiPatch } from "@/lib/api-client";
import { toast } from "sonner";
import {
  PARTNER_CARD_SEND_CHANNELS,
  PARTNER_CARD_SEND_CHANNEL_LABELS,
  PARTNER_CARD_SEND_STATUS_LABELS,
  type PartnerCardSendChannel,
  type PartnerCardSendStatus,
} from "@/lib/dispatcher/statuses";

interface SendRow {
  id: string;
  dispatcher_carrier_ext_id: string;
  dispatcher_driver_ext_id: string | null;
  dispatcher_vehicle_ext_id: string | null;
  dispatcher_deal_id: string | null;
  recipient_name: string | null;
  recipient_email: string | null;
  recipient_phone: string | null;
  recipient_messenger: string | null;
  send_channel: string;
  subject: string | null;
  message_text: string;
  status: string;
  sent_at: string | null;
  created_at: string;
}

interface DriverOption {
  id: string;
  full_name: string | null;
  dispatcher_carrier_ext_id: string | null;
}
interface VehicleOption {
  id: string;
  vehicle_kind: string | null;
  body_type: string | null;
  dispatcher_carrier_ext_id: string | null;
  dispatcher_driver_ext_id: string | null;
}

interface Props {
  carrierExtId: string;
  initialDriverId?: string | null;
  initialVehicleId?: string | null;
  initialDealId?: string | null;
}

export function DispatcherPartnerCardBlock({
  carrierExtId,
  initialDriverId = null,
  initialVehicleId = null,
  initialDealId = null,
}: Props) {
  const qc = useQueryClient();
  const [driverId, setDriverId] = useState<string | null>(initialDriverId);
  const [vehicleId, setVehicleId] = useState<string | null>(initialVehicleId);
  const [dealId] = useState<string | null>(initialDealId);
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [recipientMessenger, setRecipientMessenger] = useState("");
  const [channel, setChannel] = useState<PartnerCardSendChannel>("manual");
  const [comment, setComment] = useState("");
  const [subject, setSubject] = useState<string | null>(null);
  const [messageText, setMessageText] = useState<string>("");
  const [previewLoading, setPreviewLoading] = useState(false);

  // Подгружаем водителей и транспорт перевозчика — фильтр на клиенте.
  const driversQ = useQuery({
    queryKey: ["pcb", "drivers", carrierExtId],
    queryFn: () =>
      apiGetAuth<{ rows: DriverOption[] }>(
        `/api/dispatcher/drivers?carrier_id=${carrierExtId}&limit=100`,
        10000,
      ),
    enabled: !!carrierExtId,
  });
  const vehiclesQ = useQuery({
    queryKey: ["pcb", "vehicles", carrierExtId],
    queryFn: () =>
      apiGetAuth<{ rows: VehicleOption[] }>(
        `/api/dispatcher/vehicles?carrier_id=${carrierExtId}&limit=100`,
        10000,
      ),
    enabled: !!carrierExtId,
  });

  const drivers = driversQ.data?.rows ?? [];
  const vehicles = vehiclesQ.data?.rows ?? [];

  const historyQ = useQuery({
    queryKey: ["pcb", "history", carrierExtId],
    queryFn: () =>
      apiGetAuth<{ rows: SendRow[] }>(
        `/api/dispatcher/partner-card/sends?carrier_id=${carrierExtId}&limit=20`,
        10000,
      ),
    enabled: !!carrierExtId,
  });
  const history = historyQ.data?.rows ?? [];

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    p.set("carrier_id", carrierExtId);
    if (driverId) p.set("driver_id", driverId);
    if (vehicleId) p.set("vehicle_id", vehicleId);
    if (dealId) p.set("deal_id", dealId);
    if (comment.trim()) p.set("comment", comment.trim());
    return p.toString();
  }, [carrierExtId, driverId, vehicleId, dealId, comment]);

  async function buildPreview() {
    setPreviewLoading(true);
    try {
      const res = await apiGetAuth<{ subject: string; message_text: string }>(
        `/api/dispatcher/partner-card/preview?${queryString}`,
        15000,
      );
      setSubject(res.subject);
      setMessageText(res.message_text);
    } catch (e) {
      toast.error("Не удалось собрать карточку", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setPreviewLoading(false);
    }
  }

  // Автоподтягивание транспорта по водителю и наоборот.
  useEffect(() => {
    if (vehicleId && !driverId) {
      const v = vehicles.find((x) => x.id === vehicleId);
      if (v?.dispatcher_driver_ext_id) setDriverId(v.dispatcher_driver_ext_id);
    }
  }, [vehicleId, vehicles, driverId]);

  const saveMut = useMutation({
    mutationFn: async (status: PartnerCardSendStatus) => {
      if (!messageText.trim()) throw new Error("Сначала сформируйте карточку");
      const body = {
        dispatcher_carrier_ext_id: carrierExtId,
        dispatcher_driver_ext_id: driverId,
        dispatcher_vehicle_ext_id: vehicleId,
        dispatcher_deal_id: dealId,
        recipient_name: recipientName || null,
        recipient_email: recipientEmail || null,
        recipient_phone: recipientPhone || null,
        recipient_messenger: recipientMessenger || null,
        send_channel: channel,
        subject,
        message_text: messageText,
        status,
      };
      return apiPost<{ row: SendRow }>("/api/dispatcher/partner-card/sends", body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pcb", "history", carrierExtId] });
      toast.success("Сохранено в историю");
    },
    onError: (e: unknown) =>
      toast.error("Не удалось сохранить", {
        description: e instanceof Error ? e.message : undefined,
      }),
  });

  const markSentMut = useMutation({
    mutationFn: async (id: string) =>
      apiPatch<{ row: SendRow }>(`/api/dispatcher/partner-card/sends/${id}`, {
        status: "sent",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pcb", "history", carrierExtId] });
      toast.success("Отмечено как отправлено");
    },
  });

  async function copyText() {
    if (!messageText) {
      toast.error("Сначала сформируйте карточку");
      return;
    }
    try {
      await navigator.clipboard.writeText(messageText);
      toast.success("Текст скопирован");
      saveMut.mutate("copied");
    } catch {
      toast.error("Не удалось скопировать");
    }
  }

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4" />
        <span className="text-sm font-semibold">Карточка партнёра для заказчика</span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">Водитель</Label>
          <Select
            value={driverId ?? "_none"}
            onValueChange={(v) => setDriverId(v === "_none" ? null : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Не выбран" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">Не выбран</SelectItem>
              {drivers.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.full_name ?? d.id.slice(0, 8)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Транспорт</Label>
          <Select
            value={vehicleId ?? "_none"}
            onValueChange={(v) => setVehicleId(v === "_none" ? null : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Не выбран" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">Не выбран</SelectItem>
              {vehicles
                .filter((v) => !driverId || v.dispatcher_driver_ext_id === driverId || !v.dispatcher_driver_ext_id)
                .map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {[v.vehicle_kind, v.body_type].filter(Boolean).join(" / ") || v.id.slice(0, 8)}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">Получатель — имя</Label>
          <Input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Канал</Label>
          <Select value={channel} onValueChange={(v) => setChannel(v as PartnerCardSendChannel)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PARTNER_CARD_SEND_CHANNELS.map((c) => (
                <SelectItem key={c} value={c}>
                  {PARTNER_CARD_SEND_CHANNEL_LABELS[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Email</Label>
          <Input value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Телефон</Label>
          <Input value={recipientPhone} onChange={(e) => setRecipientPhone(e.target.value)} />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label className="text-xs">Мессенджер (Telegram / WhatsApp / Max)</Label>
          <Input
            value={recipientMessenger}
            onChange={(e) => setRecipientMessenger(e.target.value)}
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label className="text-xs">Комментарий диспетчера для заказчика</Label>
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" type="button" onClick={buildPreview} disabled={previewLoading}>
          {previewLoading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
          Сформировать карточку
        </Button>
        <Button size="sm" type="button" variant="outline" onClick={copyText} disabled={!messageText}>
          <Copy className="mr-1 h-3.5 w-3.5" /> Скопировать
        </Button>
        <Button
          size="sm"
          type="button"
          variant="outline"
          onClick={() => saveMut.mutate("draft")}
          disabled={!messageText || saveMut.isPending}
        >
          <Save className="mr-1 h-3.5 w-3.5" /> В историю
        </Button>
        <Button
          size="sm"
          type="button"
          variant="default"
          onClick={() => saveMut.mutate("sent")}
          disabled={!messageText || saveMut.isPending}
        >
          <Send className="mr-1 h-3.5 w-3.5" /> Отметить как отправлено
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

      <div className="space-y-1">
        <div className="text-xs font-semibold text-muted-foreground">История отправок</div>
        {historyQ.isLoading ? (
          <div className="text-xs text-muted-foreground">Загрузка…</div>
        ) : history.length === 0 ? (
          <div className="text-xs text-muted-foreground">Пока пусто</div>
        ) : (
          <div className="space-y-1">
            {history.map((h) => (
              <Card key={h.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-2 p-2 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">
                      {PARTNER_CARD_SEND_STATUS_LABELS[
                        h.status as PartnerCardSendStatus
                      ] ?? h.status}
                    </Badge>
                    <Badge variant="secondary">
                      {PARTNER_CARD_SEND_CHANNEL_LABELS[
                        h.send_channel as PartnerCardSendChannel
                      ] ?? h.send_channel}
                    </Badge>
                    <span className="text-muted-foreground">
                      {new Date(h.created_at).toLocaleString("ru-RU")}
                    </span>
                    {h.recipient_name && <span>{h.recipient_name}</span>}
                  </div>
                  {h.status !== "sent" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => markSentMut.mutate(h.id)}
                    >
                      Отметить отправленным
                    </Button>
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
