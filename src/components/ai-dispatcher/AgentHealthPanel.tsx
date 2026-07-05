// Панель здоровья Radius Track Browser Agent.
// Комбинирует данные активной сессии + список команд + время последнего heartbeat
// в единый статус: Healthy / Warning / Offline / Error. Никакого API ATI.
import { useMemo, type ReactElement } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, ShieldCheck, ShieldAlert, ShieldOff, TriangleAlert } from "lucide-react";
import { apiGetAuth } from "@/lib/api-client";
import type { AgentCommandRow } from "./AgentCommandStatusPanel";

type Session = {
  id: string;
  agent_name: string;
  agent_type: string;
  agent_version: string | null;
  browser_name: string | null;
  status: string;
  last_heartbeat_at: string | null;
  active_tab_count: number;
  last_error: string | null;
  last_action: string | null;
  current_url: string | null;
  current_task_id: string | null;
  agent_token_expires_at: string | null;
  revoked_at: string | null;
  paired_at: string | null;
};

type Health = "healthy" | "warning" | "offline" | "error";

function tokenState(s: Session): "active" | "expired" | "revoked" {
  if (s.revoked_at) return "revoked";
  if (s.agent_token_expires_at && new Date(s.agent_token_expires_at).getTime() < Date.now())
    return "expired";
  return "active";
}

function computeHealth(s: Session | undefined, cmds: AgentCommandRow[]): {
  status: Health; reasons: string[]; lagSec: number | null; failedCount: number;
} {
  const reasons: string[] = [];
  if (!s) return { status: "offline", reasons: ["сессии нет"], lagSec: null, failedCount: 0 };
  const tok = tokenState(s);
  if (tok === "revoked") reasons.push("токен отозван");
  if (tok === "expired") reasons.push("токен истёк");
  const lastHb = s.last_heartbeat_at ? new Date(s.last_heartbeat_at).getTime() : null;
  const lagSec = lastHb ? Math.round((Date.now() - lastHb) / 1000) : null;
  if (s.last_error) reasons.push(`ошибка: ${s.last_error}`);
  const failedRecent = cmds.filter(
    (c) => ["failed", "expired"].includes(c.status)
      && Date.now() - new Date(c.created_at).getTime() < 5 * 60_000).length;
  if (failedRecent >= 3) reasons.push(`${failedRecent} команд с ошибкой за 5 мин`);
  if (lagSec === null) reasons.push("heartbeat отсутствует");
  else if (lagSec > 300) reasons.push(`heartbeat старый (${lagSec}s)`);
  else if (lagSec > 90) reasons.push(`heartbeat замедлен (${lagSec}s)`);

  let status: Health = "healthy";
  if (tok !== "active") status = "error";
  else if (s.last_error) status = "error";
  else if ((lagSec ?? Infinity) > 300 || failedRecent >= 3) status = "offline";
  else if ((lagSec ?? 0) > 90 || failedRecent > 0) status = "warning";
  return { status, reasons, lagSec, failedCount: failedRecent };
}

function healthBadge(h: Health) {
  const map: Record<Health, { cls: string; label: string; icon: ReactElement }> = {
    healthy: { cls: "bg-emerald-100 text-emerald-800 border-emerald-300",
      label: "Healthy", icon: <ShieldCheck className="h-3 w-3 mr-1" /> },
    warning: { cls: "bg-amber-100 text-amber-900 border-amber-300",
      label: "Warning", icon: <TriangleAlert className="h-3 w-3 mr-1" /> },
    offline: { cls: "bg-zinc-200 text-zinc-800 border-zinc-300",
      label: "Offline", icon: <ShieldOff className="h-3 w-3 mr-1" /> },
    error: { cls: "bg-rose-100 text-rose-800 border-rose-300",
      label: "Error", icon: <ShieldAlert className="h-3 w-3 mr-1" /> },
  };
  const it = map[h];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[11px] font-medium ${it.cls}`}>
      {it.icon}{it.label}
    </span>
  );
}

function fmt(s: string | null | undefined): string {
  if (!s) return "—";
  try { return new Date(s).toLocaleTimeString(); } catch { return s; }
}

export function AgentHealthPanel() {
  const sessionsQ = useQuery({
    queryKey: ["ai-agent-sessions"],
    queryFn: () => apiGetAuth<{ rows: Session[] }>(
      "/api/dispatcher/ai-dispatcher/agent/sessions"),
    refetchInterval: 5000,
  });
  const rows = sessionsQ.data?.rows ?? [];
  const active = rows.find((r) => ["connected", "opening_site", "searching", "reading_page", "refreshing"]
    .includes(r.status)) ?? rows.find((r) => !r.revoked_at) ?? null;
  const cmdsQ = useQuery({
    queryKey: ["ai-agent-commands", active?.id ?? null],
    enabled: Boolean(active?.id),
    queryFn: () => active
      ? apiGetAuth<{ rows: AgentCommandRow[] }>(
        `/api/dispatcher/ai-dispatcher/agent/sessions/${active.id}/commands?all=1&limit=30`)
      : Promise.resolve({ rows: [] as AgentCommandRow[] }),
    refetchInterval: 5000,
  });
  const cmds = cmdsQ.data?.rows ?? [];
  const lastCmd = cmds[0] ?? null;
  const lastReadEv = cmds.find((c) => c.command_type === "read_visible_loads" && c.status === "completed");
  const health = useMemo(
    () => computeHealth(active ?? undefined, cmds), [active, cmds]);
  const tok = active ? tokenState(active) : "revoked";

  return (
    <Card className="p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Activity className="h-4 w-4" /> Здоровье Browser Agent
        </div>
        {healthBadge(health.status)}
      </div>
      {!active && (
        <p className="text-xs text-muted-foreground">Активная сессия агента не найдена.</p>
      )}
      {active && (
        <div className="text-xs space-y-1">
          <div className="grid grid-cols-2 gap-1 text-[11px]">
            <Field label="Сессия" value={active.agent_name} />
            <Field label="Статус" value={active.status} />
            <Field label="Версия" value={active.agent_version ?? "—"} />
            <Field label="Браузер" value={active.browser_name ?? "—"} />
            <Field label="Вкладок" value={String(active.active_tab_count)} />
            <Field label="Токен"
              value={tok === "active" ? "активен" : tok === "expired" ? "истёк" : "отозван"} />
            <Field label="Последний heartbeat" value={fmt(active.last_heartbeat_at)} />
            <Field label="Задержка heartbeat"
              value={health.lagSec === null ? "—" : `${health.lagSec}s`} />
            <Field label="Последняя команда"
              value={lastCmd ? `${lastCmd.command_type} · ${lastCmd.status}` : "—"} />
            <Field label="Последнее чтение"
              value={lastReadEv ? fmt(lastReadEv.completed_at) : "—"} />
            <Field label="Failed за 5 мин" value={String(health.failedCount)} />
            <Field label="Задача" value={active.current_task_id?.slice(0, 8) ?? "—"} />
          </div>
          {active.last_error && (
            <div className="text-rose-700 text-[11px]">Последняя ошибка: {active.last_error}</div>
          )}
          {health.reasons.length > 0 && health.status !== "healthy" && (
            <div className="mt-1 flex flex-wrap gap-1">
              {health.reasons.map((r, i) => (
                <Badge key={i} variant="outline" className="text-[10px]">{r}</Badge>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="font-medium truncate">{value}</div>
    </div>
  );
}
