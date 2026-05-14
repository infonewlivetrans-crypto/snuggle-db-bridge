import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Pause, Play, AlertTriangle, Timer } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useState } from "react";

export type IdleReason =
  | "client_absent"
  | "client_no_answer"
  | "no_unloaders"
  | "no_access"
  | "no_payment"
  | "no_qr"
  | "client_asks_wait"
  | "other";

export const IDLE_REASON_LABELS: Record<IdleReason, string> = {
  client_absent: "Клиента нет",
  client_no_answer: "Клиент не отвечает",
  no_unloaders: "Нет людей для разгрузки",
  no_access: "Нет подъезда",
  no_payment: "Нет оплаты",
  no_qr: "Нет QR-кода",
  client_asks_wait: "Клиент просит подождать",
  other: "Другое",
};

export type IdleData = {
  dp_idle_started_at: string | null;
  dp_idle_finished_at: string | null;
  dp_idle_duration_minutes: number | null;
  dp_idle_reason: IdleReason | null;
  dp_idle_comment: string | null;
};

type Props = {
  routePointId: string;
  data: IdleData;
};

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtMin(min: number | null): string {
  if (min == null) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h} ч ${m} мин` : `${m} мин`;
}

export function PointIdleBlock({ routePointId, data }: Props) {
  const qc = useQueryClient();
  const [reason, setReason] = useState<IdleReason | "">(data.dp_idle_reason ?? "");
  const [comment, setComment] = useState(data.dp_idle_comment ?? "");

  useEffect(() => {
    setReason(data.dp_idle_reason ?? "");
    setComment(data.dp_idle_comment ?? "");
  }, [routePointId, data.dp_idle_reason, data.dp_idle_comment]);

  const update = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { error } = await (
        supabase.from("route_points") as unknown as {
          update: (p: Record<string, unknown>) => {
            eq: (c: string, v: string) => Promise<{ error: Error | null }>;
          };
        }
      )
        .update(payload)
        .eq("id", routePointId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["delivery-route-points"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const inProgress = !!data.dp_idle_started_at && !data.dp_idle_finished_at;

  const startIdle = () => {
    if (!reason) {
      toast.error("Укажите причину простоя");
      return;
    }
    update.mutate({
      dp_idle_started_at: new Date().toISOString(),
      dp_idle_finished_at: null,
      dp_idle_duration_minutes: null,
      dp_idle_reason: reason,
      dp_idle_comment: comment || null,
    });
    toast.success("Простой начат");
  };

  const finishIdle = () => {
    if (!data.dp_idle_started_at) return;
    const finished = new Date();
    const durationMin = Math.max(
      0,
      Math.round((finished.getTime() - new Date(data.dp_idle_started_at).getTime()) / 60000),
    );
    update.mutate({
      dp_idle_finished_at: finished.toISOString(),
      dp_idle_duration_minutes: durationMin,
      dp_idle_reason: reason || data.dp_idle_reason,
      dp_idle_comment: comment || null,
    });
    toast.success(`Простой завершён: ${fmtMin(durationMin)}`);
  };

  return (
    <div className="space-y-3 rounded-md border border-border bg-muted/20 p-3">
      <div className="flex items-center gap-2">
        <Timer className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Простой</span>
      </div>

      {inProgress && (
        <div className="flex items-center gap-1.5 rounded-md border border-orange-500/40 bg-orange-500/10 px-2 py-1.5 text-xs font-medium text-orange-700 dark:text-orange-300">
          <AlertTriangle className="h-3.5 w-3.5" />
          Точка находится в простое
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <div className="mb-1 text-xs text-muted-foreground">Причина</div>
          <Select value={reason} onValueChange={(v) => setReason(v as IdleReason)}>
            <SelectTrigger className="h-8">
              <SelectValue placeholder="Выберите причину" />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(IDLE_REASON_LABELS) as IdleReason[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {IDLE_REASON_LABELS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <div className="mb-1 text-xs text-muted-foreground">Комментарий</div>
          <Textarea
            rows={1}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Необязательно"
            className="min-h-8"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={inProgress ? "outline" : "default"}
          className="h-8 gap-1"
          onClick={startIdle}
          disabled={inProgress}
        >
          <Pause className="h-3.5 w-3.5" />
          Начать простой
        </Button>
        <Button
          size="sm"
          variant={inProgress ? "default" : "outline"}
          className="h-8 gap-1"
          onClick={finishIdle}
          disabled={!inProgress}
        >
          <Play className="h-3.5 w-3.5" />
          Завершить простой
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
        <Cell label="Начало" value={fmtTime(data.dp_idle_started_at)} />
        <Cell label="Окончание" value={fmtTime(data.dp_idle_finished_at)} />
        <Cell label="Длительность" value={fmtMin(data.dp_idle_duration_minutes)} />
      </div>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border bg-card px-2 py-1.5">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-mono text-foreground">{value}</div>
    </div>
  );
}
