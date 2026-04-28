import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Activity, History as HistoryIcon, Save, AlertTriangle, Info } from "lucide-react";
import type { BodyType } from "@/lib/carriers";

export type RequestStatus =
  | "draft"
  | "ready_for_planning"
  | "needs_review"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "cancelled";

export const REQUEST_STATUS_FULL_LABELS: Record<RequestStatus, string> = {
  draft: "Черновик",
  ready_for_planning: "Готова к планированию",
  needs_review: "Требует проверки",
  confirmed: "Подтверждена",
  in_progress: "В работе",
  completed: "Завершена",
  cancelled: "Отменена",
};

const STATUS_STYLES: Record<RequestStatus, string> = {
  draft: "bg-slate-100 text-slate-900 border-slate-200 dark:bg-slate-900/40 dark:text-slate-200",
  ready_for_planning: "bg-blue-100 text-blue-900 border-blue-200 dark:bg-blue-900/40 dark:text-blue-200",
  needs_review: "bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-900/40 dark:text-amber-200",
  confirmed: "bg-green-100 text-green-900 border-green-200 dark:bg-green-900/40 dark:text-green-200",
  in_progress: "bg-indigo-100 text-indigo-900 border-indigo-200 dark:bg-indigo-900/40 dark:text-indigo-200",
  completed: "bg-emerald-100 text-emerald-900 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-200",
  cancelled: "bg-red-100 text-red-900 border-red-200 dark:bg-red-900/40 dark:text-red-200",
};

type Props = {
  requestId: string;
  current: RequestStatus;
  changedBy: string | null;
  changedAt: string | null;
  comment: string | null;
  // Для подсказок логисту
  ordersCount: number;
  hasWarehouse: boolean;
  hasDate: boolean;
  hasRequirements: boolean;
  weightOver: boolean;
  volumeOver: boolean;
};

type HistoryRow = {
  id: string;
  from_status: RequestStatus | null;
  to_status: RequestStatus;
  changed_by: string | null;
  changed_at: string;
  comment: string | null;
};

export function TransportRequestStatusBlock(props: Props) {
  const queryClient = useQueryClient();
  const [target, setTarget] = useState<RequestStatus>(props.current);
  const [user, setUser] = useState<string>(props.changedBy ?? "");
  const [comment, setComment] = useState<string>("");

  const recommended = useMemo<RequestStatus>(() => {
    if (props.ordersCount === 0) return "draft";
    if (props.weightOver || props.volumeOver) return "needs_review";
    if (props.hasWarehouse && props.hasDate && props.hasRequirements) return "ready_for_planning";
    return "draft";
  }, [props]);

  const { data: history } = useQuery({
    queryKey: ["transport-request-status-history", props.requestId],
    queryFn: async (): Promise<HistoryRow[]> => {
      const { data, error } = await supabase
        .from("transport_request_status_history")
        .select("id, from_status, to_status, changed_by, changed_at, comment")
        .eq("route_id", props.requestId)
        .order("changed_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as HistoryRow[];
    },
  });

  const allowed = useMemo(() => {
    // Простое правило: «Подтверждена» доступна только если нет превышений и нет «Требует проверки»
    const all: RequestStatus[] = [
      "draft",
      "ready_for_planning",
      "needs_review",
      "confirmed",
      "in_progress",
      "completed",
      "cancelled",
    ];
    return all.map((s) => {
      let disabled = false;
      let reason = "";
      if (s === "ready_for_planning") {
        if (props.ordersCount === 0) {
          disabled = true;
          reason = "Нет заказов";
        } else if (!props.hasWarehouse || !props.hasDate || !props.hasRequirements) {
          disabled = true;
          reason = "Заполните склад, дату и требования к транспорту";
        }
      }
      if (s === "confirmed" && (props.weightOver || props.volumeOver)) {
        disabled = true;
        reason = "Есть превышения по весу/объёму";
      }
      return { value: s, disabled, reason };
    });
  }, [props]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user.trim()) {
        throw new Error("Укажите, кто изменяет статус");
      }
      const now = new Date().toISOString();
      const { error: upErr } = await supabase
        .from("routes")
        .update({
          request_status: target,
          request_status_changed_by: user.trim(),
          request_status_changed_at: now,
          request_status_comment: comment.trim() || null,
        })
        .eq("id", props.requestId);
      if (upErr) throw upErr;

      const { error: histErr } = await supabase
        .from("transport_request_status_history")
        .insert({
          route_id: props.requestId,
          from_status: props.current,
          to_status: target,
          changed_by: user.trim(),
          comment: comment.trim() || null,
        });
      if (histErr) throw histErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transport-request", props.requestId] });
      queryClient.invalidateQueries({
        queryKey: ["transport-request-status-history", props.requestId],
      });
      queryClient.invalidateQueries({ queryKey: ["transport-requests"] });
      setComment("");
      toast.success("Статус заявки обновлён");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <Activity className="h-3.5 w-3.5" />
          Статус заявки
        </div>
        <Badge variant="outline" className={STATUS_STYLES[props.current]}>
          {REQUEST_STATUS_FULL_LABELS[props.current]}
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
        <Field label="Изменил" value={props.changedBy || "—"} />
        <Field
          label="Когда"
          value={
            props.changedAt
              ? new Date(props.changedAt).toLocaleString("ru-RU")
              : "—"
          }
        />
        <Field label="Комментарий" value={props.comment || "—"} />
      </div>

      {recommended !== props.current && (
        <div className="flex items-start gap-2 rounded-md border border-blue-500/40 bg-blue-500/10 p-2.5 text-sm text-blue-700 dark:text-blue-300">
          <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
          Рекомендуемый статус: «{REQUEST_STATUS_FULL_LABELS[recommended]}»
        </div>
      )}

      <div className="space-y-3 rounded-md border border-dashed border-border p-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Новый статус</label>
            <Select value={target} onValueChange={(v) => setTarget(v as RequestStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {allowed.map((a) => (
                  <SelectItem key={a.value} value={a.value} disabled={a.disabled}>
                    {REQUEST_STATUS_FULL_LABELS[a.value]}
                    {a.disabled ? ` — ${a.reason}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Кто меняет</label>
            <Input
              value={user}
              onChange={(e) => setUser(e.target.value)}
              placeholder="Имя логиста"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs text-muted-foreground">
            Комментарий к смене статуса
          </label>
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            placeholder="Необязательно"
          />
        </div>

        {(props.weightOver || props.volumeOver) && target === "confirmed" && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            Нельзя подтвердить заявку с превышениями
          </div>
        )}

        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || target === props.current}
            className="gap-1.5"
          >
            <Save className="h-4 w-4" />
            {saveMutation.isPending ? "Сохранение..." : "Изменить статус"}
          </Button>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <HistoryIcon className="h-3.5 w-3.5" />
          История статусов
        </div>
        {!history || history.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-3 text-center text-sm text-muted-foreground">
            История пока пуста
          </div>
        ) : (
          <ul className="space-y-1.5">
            {history.map((h) => (
              <li
                key={h.id}
                className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-secondary/30 p-2 text-sm"
              >
                <Badge variant="outline" className={STATUS_STYLES[h.to_status]}>
                  {REQUEST_STATUS_FULL_LABELS[h.to_status]}
                </Badge>
                {h.from_status && (
                  <span className="text-xs text-muted-foreground">
                    из «{REQUEST_STATUS_FULL_LABELS[h.from_status]}»
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  · {new Date(h.changed_at).toLocaleString("ru-RU")}
                </span>
                <span className="text-xs text-foreground">
                  · {h.changed_by || "—"}
                </span>
                {h.comment && (
                  <span className="basis-full text-xs italic text-muted-foreground">
                    {h.comment}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-card p-2">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 text-foreground">{value}</div>
    </div>
  );
}

// Утилита для подсчёта превышений вне компонента не нужна — страница передаёт их пропсами.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _BodyTypeRef = BodyType;
