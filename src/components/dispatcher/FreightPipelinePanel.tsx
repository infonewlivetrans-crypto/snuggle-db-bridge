import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { freightsApi } from "@/lib/dispatcher/api";
import type { FreightDTO } from "@/lib/dispatcher/types";
import {
  FREIGHT_STATUS_LABELS,
  FREIGHT_SIGNED_SENT_CHANNELS,
  FREIGHT_SIGNED_SENT_CHANNEL_LABELS,
  type FreightSignedSentChannel,
  type FreightStatus,
} from "@/lib/dispatcher/statuses";
import { FreightAssignmentBlock } from "./FreightAssignmentBlock";

interface Props {
  freight: FreightDTO;
  onChanged: (updated: FreightDTO) => void;
}

const PIPELINE_STEPS: FreightStatus[] = [
  "new",
  "checking",
  "customer_called",
  "customer_ready",
  "waiting_docs",
  "docs_received",
  "carrier_signing",
  "signed_sent",
  "deal_created",
];

const TERMINAL_STEPS: FreightStatus[] = ["not_suitable", "cancelled", "archived"];

export function FreightPipelinePanel({ freight, onChanged }: Props) {
  const [busy, setBusy] = useState(false);
  const [channel, setChannel] = useState<FreightSignedSentChannel>("email");
  const [comment, setComment] = useState("");
  const [assignCarrier, setAssignCarrier] = useState(freight.assigned_carrier_ext_id ?? "");
  const [assignDriver, setAssignDriver] = useState(freight.assigned_driver_ext_id ?? "");
  const [assignVehicle, setAssignVehicle] = useState(freight.assigned_vehicle_ext_id ?? "");

  const patch = async (body: Record<string, unknown>, okMsg: string) => {
    setBusy(true);
    try {
      const res = await freightsApi.update(freight.id, body);
      toast.success(okMsg);
      onChanged(res.row);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  };

  const setStatus = (s: FreightStatus) => patch({ dispatcher_status: s }, `Статус: ${FREIGHT_STATUS_LABELS[s]}`);

  const saveAssignment = () =>
    patch(
      {
        assigned_carrier_ext_id: assignCarrier || null,
        assigned_driver_ext_id: assignDriver || null,
        assigned_vehicle_ext_id: assignVehicle || null,
      },
      "Назначение сохранено",
    );

  const markSignedSent = () =>
    patch(
      {
        dispatcher_status: "signed_sent",
        signed_sent_at: new Date().toISOString(),
        signed_sent_channel: channel,
        signed_sent_comment: comment || null,
      },
      "Отмечено как отправлено",
    );

  return (
    <div className="space-y-4 rounded-md border p-3 bg-muted/30">
      <div className="text-sm font-medium">Этапы заявки</div>

      <div className="flex flex-wrap gap-1">
        {PIPELINE_STEPS.map((s) => (
          <Button
            key={s}
            size="sm"
            variant={freight.dispatcher_status === s ? "default" : "outline"}
            disabled={busy}
            onClick={() => setStatus(s)}
          >
            {FREIGHT_STATUS_LABELS[s]}
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1">
        {TERMINAL_STEPS.map((s) => (
          <Button
            key={s}
            size="sm"
            variant={freight.dispatcher_status === s ? "destructive" : "ghost"}
            disabled={busy}
            onClick={() => setStatus(s)}
          >
            {FREIGHT_STATUS_LABELS[s]}
          </Button>
        ))}
      </div>

      <div className="space-y-2">
        <div className="text-sm font-medium">Назначение машины</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <Input placeholder="ID перевозчика (ext)" value={assignCarrier} onChange={(e) => setAssignCarrier(e.target.value.trim())} />
          <Input placeholder="ID водителя (ext)" value={assignDriver} onChange={(e) => setAssignDriver(e.target.value.trim())} />
          <Input placeholder="ID транспорта (ext)" value={assignVehicle} onChange={(e) => setAssignVehicle(e.target.value.trim())} />
        </div>
        <Button size="sm" disabled={busy} onClick={saveAssignment}>Сохранить назначение</Button>
        <div className="text-xs text-muted-foreground">
          UUID берётся из таблиц «Перевозчики», «Водители», «Транспорт». Полноценный пикер — следующим этапом.
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-sm font-medium">Подписанная заявка отправлена заказчику</div>
        <div className="flex flex-wrap gap-2 items-center">
          <Select value={channel} onValueChange={(v) => setChannel(v as FreightSignedSentChannel)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {FREIGHT_SIGNED_SENT_CHANNELS.map((c) => (
                <SelectItem key={c} value={c}>{FREIGHT_SIGNED_SENT_CHANNEL_LABELS[c]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Textarea
            placeholder="Комментарий (необязательно)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="min-h-[40px] flex-1 min-w-[200px]"
          />
          <Button size="sm" disabled={busy} onClick={markSignedSent}>Отметить отправку</Button>
        </div>
        {freight.signed_sent_at && (
          <div className="text-xs text-muted-foreground">
            Отправлено: {new Date(freight.signed_sent_at).toLocaleString("ru-RU")}
            {freight.signed_sent_channel ? ` · ${FREIGHT_SIGNED_SENT_CHANNEL_LABELS[freight.signed_sent_channel as FreightSignedSentChannel] ?? freight.signed_sent_channel}` : ""}
          </div>
        )}
      </div>
    </div>
  );
}
