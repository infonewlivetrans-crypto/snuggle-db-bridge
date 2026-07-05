// Панель статусов команд Radius Track Browser Agent.
// Показывает последние 30 команд по активной сессии с фильтром и действиями
// «Отменить» (queued/sent), «Повторить» (failed/expired/cancelled).
// НИКАКОГО API ATI не используется.
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiGetAuth, apiPatch } from "@/lib/api-client";
import { RefreshCw, XCircle, RotateCw, AlertOctagon } from "lucide-react";

export type AgentCommandRow = {
  id: string;
  command_type: string;
  status: string;
  created_at: string;
  sent_at: string | null;
  acknowledged_at: string | null;
  completed_at: string | null;
  expires_at: string | null;
  error_message: string | null;
  result_json: Record<string, unknown> | null;
  search_task_id: string | null;
  candidate_id: string | null;
  session_id: string;
};

function fmt(s: string | null): string {
  if (!s) return "—";
  try { return new Date(s).toLocaleTimeString(); } catch { return s; }
}

function statusPill(status: string): string {
  const map: Record<string, string> = {
    queued: "bg-zinc-200 text-zinc-800",
    sent: "bg-blue-100 text-blue-800",
    acknowledged: "bg-indigo-100 text-indigo-800",
    completed: "bg-emerald-100 text-emerald-800",
    failed: "bg-rose-100 text-rose-800",
    expired: "bg-amber-100 text-amber-900",
    cancelled: "bg-zinc-300 text-zinc-700",
  };
  return map[status] ?? "bg-muted";
}

/** Признак «зависшая» команда: sent давно, не ack; ack давно, не complete. */
function isStuck(row: AgentCommandRow): boolean {
  const now = Date.now();
  const created = new Date(row.created_at).getTime();
  const ackAt = row.acknowledged_at ? new Date(row.acknowledged_at).getTime() : null;
  const sentAt = row.sent_at ? new Date(row.sent_at).getTime() : null;
  if (row.status === "queued" && now - created > 60_000) return true;
  if (row.status === "sent" && sentAt && now - sentAt > 45_000) return true;
  if (row.status === "acknowledged" && ackAt && now - ackAt > 90_000) return true;
  return false;
}

export function AgentCommandStatusPanel({ sessionId }: { sessionId: string | null }) {
  const qc = useQueryClient();
  const cmdsQ = useQuery({
    queryKey: ["ai-agent-commands", sessionId],
    queryFn: () => sessionId
      ? apiGetAuth<{ rows: AgentCommandRow[] }>(
        `/api/dispatcher/ai-dispatcher/agent/sessions/${sessionId}/commands?all=1&limit=30`)
      : Promise.resolve({ rows: [] as AgentCommandRow[] }),
    enabled: Boolean(sessionId),
    refetchInterval: 4000,
  });
  const rows = cmdsQ.data?.rows ?? [];
  const active = useMemo(() => rows.filter(
    (r) => ["queued", "sent", "acknowledged"].includes(r.status)), [rows]);
  const finished = useMemo(() => rows.filter(
    (r) => !["queued", "sent", "acknowledged"].includes(r.status)), [rows]);

  const cancel = useMutation({
    mutationFn: (id: string) => apiPatch(
      `/api/dispatcher/ai-dispatcher/agent/commands/${id}`, { action: "cancel" }),
    onSuccess: () => {
      toast.success("Команда отменена");
      qc.invalidateQueries({ queryKey: ["ai-agent-commands", sessionId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Ошибка"),
  });
  const retry = useMutation({
    mutationFn: (id: string) => apiPatch<{ ok: boolean; new_id?: string }>(
      `/api/dispatcher/ai-dispatcher/agent/commands/${id}`, { action: "retry" }),
    onSuccess: () => {
      toast.success("Команда поставлена в очередь заново");
      qc.invalidateQueries({ queryKey: ["ai-agent-commands", sessionId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Ошибка"),
  });

  if (!sessionId) {
    return (
      <Card className="p-3 text-xs text-muted-foreground">
        Панель команд агента доступна после подключения Browser Agent.
      </Card>
    );
  }

  return (
    <Card className="p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">Команды Browser Agent</div>
        <Button size="sm" variant="ghost" className="h-7 text-xs"
          onClick={() => qc.invalidateQueries({ queryKey: ["ai-agent-commands", sessionId] })}>
          <RefreshCw className="h-3 w-3 mr-1" /> Обновить
        </Button>
      </div>

      <div>
        <div className="text-[11px] uppercase text-muted-foreground mb-1">
          Активные ({active.length})
        </div>
        {active.length === 0 ? (
          <div className="text-xs text-muted-foreground">Активных команд нет.</div>
        ) : (
          <ul className="space-y-1">
            {active.map((r) => (
              <CommandRow key={r.id} row={r}
                onCancel={() => cancel.mutate(r.id)}
                onRetry={() => retry.mutate(r.id)}
                cancelling={cancel.isPending}
                retrying={retry.isPending} />
            ))}
          </ul>
        )}
      </div>

      <div>
        <div className="text-[11px] uppercase text-muted-foreground mb-1">
          Последние ({finished.length})
        </div>
        {finished.length === 0 ? (
          <div className="text-xs text-muted-foreground">Пока пусто.</div>
        ) : (
          <ul className="space-y-1 max-h-[240px] overflow-y-auto">
            {finished.slice(0, 20).map((r) => (
              <CommandRow key={r.id} row={r}
                onCancel={() => cancel.mutate(r.id)}
                onRetry={() => retry.mutate(r.id)}
                cancelling={cancel.isPending}
                retrying={retry.isPending} />
            ))}
          </ul>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground">
        Отмена — только для queued/sent. Повтор — только для failed/expired/cancelled.
        Successful команды нельзя отменить.
      </p>
    </Card>
  );
}

function CommandRow({ row, onCancel, onRetry, cancelling, retrying }: {
  row: AgentCommandRow; onCancel: () => void; onRetry: () => void;
  cancelling: boolean; retrying: boolean;
}) {
  const stuck = isStuck(row);
  const canCancel = ["queued", "sent"].includes(row.status);
  const canRetry = ["failed", "expired", "cancelled"].includes(row.status);
  const short = row.result_json
    ? summarizeResult(row.result_json)
    : row.error_message ?? "";
  return (
    <li className="border rounded p-2 text-xs">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`inline-block px-2 py-0.5 rounded text-[10px] ${statusPill(row.status)}`}>
            {row.status}
          </span>
          <span className="font-medium truncate">{row.command_type}</span>
          {stuck && (
            <span className="inline-flex items-center gap-1 text-amber-800 text-[10px]">
              <AlertOctagon className="h-3 w-3" /> зависла
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {canCancel && (
            <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[11px]"
              onClick={onCancel} disabled={cancelling}>
              <XCircle className="h-3 w-3 mr-1" /> Отменить
            </Button>
          )}
          {canRetry && (
            <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[11px]"
              onClick={onRetry} disabled={retrying}>
              <RotateCw className="h-3 w-3 mr-1" /> Повторить
            </Button>
          )}
        </div>
      </div>
      <div className="text-muted-foreground mt-1 text-[11px]">
        Создана: {fmt(row.created_at)}
        {row.acknowledged_at ? ` · ack ${fmt(row.acknowledged_at)}` : ""}
        {row.completed_at ? ` · finished ${fmt(row.completed_at)}` : ""}
        {row.search_task_id ? ` · task ${row.search_task_id.slice(0, 8)}` : ""}
      </div>
      {row.error_message && (
        <div className="text-rose-700 mt-1 text-[11px] break-words">
          Ошибка: {row.error_message}
        </div>
      )}
      {short && !row.error_message && (
        <div className="text-muted-foreground mt-1 text-[11px] break-words">
          Результат: {short}
        </div>
      )}
    </li>
  );
}

function summarizeResult(r: Record<string, unknown>): string {
  const keys: string[] = [];
  if (typeof r.visible === "number") keys.push(`видно ${r.visible}`);
  if (typeof r.sent === "number") keys.push(`отправлено ${r.sent}`);
  if (typeof r.suitable === "number") keys.push(`подходит ${r.suitable}`);
  if (r.opened) keys.push("вкладка открыта");
  if (r.reloaded) keys.push("страница обновлена");
  if (r.focused) keys.push("сфокусирован груз");
  if (r.applied) keys.push("фильтры применены");
  return keys.join(" · ");
}

// Компактный бейдж для встраивания в карточку задачи.
export function AgentActiveCommandBadge({ sessionId, taskId }: {
  sessionId: string | null; taskId: string;
}) {
  const cmdsQ = useQuery({
    queryKey: ["ai-agent-commands", sessionId],
    enabled: Boolean(sessionId),
    queryFn: () => sessionId
      ? apiGetAuth<{ rows: AgentCommandRow[] }>(
        `/api/dispatcher/ai-dispatcher/agent/sessions/${sessionId}/commands?all=1&limit=30`)
      : Promise.resolve({ rows: [] as AgentCommandRow[] }),
    refetchInterval: 5000,
  });
  const rows = cmdsQ.data?.rows ?? [];
  const active = rows.find(
    (r) => r.search_task_id === taskId && ["queued", "sent", "acknowledged"].includes(r.status));
  if (!active) return null;
  return (
    <Badge variant="outline" className="text-[10px] font-mono">
      {active.command_type} · {active.status}
    </Badge>
  );
}
