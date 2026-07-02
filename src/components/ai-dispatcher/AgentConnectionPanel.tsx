// UI-компоненты подключения Radius Track Browser Agent (dev/mock).
// НИКАКОГО API ATI. Реальный агент — расширение браузера, подключается на след. этапе.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiGetAuth, apiPost, apiPatch, apiDelete } from "@/lib/api-client";
import { Activity, Link2, Power, PlugZap, X, Focus, AlertOctagon } from "lucide-react";

export type AgentAdapterMode = "mock" | "browser_agent_ready" | "browser_agent_live";
export const AGENT_MODE_STORAGE_KEY = "rt-ai-agent-mode";

export function useAgentMode(): [AgentAdapterMode, (m: AgentAdapterMode) => void] {
  const initial: AgentAdapterMode =
    (typeof window !== "undefined" &&
      (window.localStorage.getItem(AGENT_MODE_STORAGE_KEY) as AgentAdapterMode)) || "mock";
  const set = (m: AgentAdapterMode) => {
    if (typeof window !== "undefined") window.localStorage.setItem(AGENT_MODE_STORAGE_KEY, m);
    // ре-рендер через простое событие
    window.dispatchEvent(new CustomEvent("rt-agent-mode-changed", { detail: m }));
  };
  return [initial, set];
}

type Session = {
  id: string;
  agent_name: string;
  agent_type: string;
  agent_version: string | null;
  status: string;
  last_heartbeat_at: string | null;
  active_tab_count: number;
  last_error: string | null;
  paired_at: string | null;
  created_at: string;
};

type AgentTab = {
  id: string;
  tab_type: string;
  tab_status: string;
  url: string | null;
  title: string | null;
  opened_at: string | null;
  last_active_at: string | null;
  candidate_id: string | null;
  search_task_id: string | null;
};

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    pairing: "bg-amber-100 text-amber-800",
    connected: "bg-emerald-100 text-emerald-800",
    disconnected: "bg-zinc-200 text-zinc-700",
    error: "bg-rose-100 text-rose-800",
  };
  return <span className={`inline-block px-2 py-0.5 rounded text-[10px] ${map[status] ?? "bg-muted"}`}>{status}</span>;
}

export function AgentConnectionPanel({
  mode, onModeChange,
}: { mode: AgentAdapterMode; onModeChange: (m: AgentAdapterMode) => void }) {
  const qc = useQueryClient();
  const sessionsQ = useQuery({
    queryKey: ["ai-agent-sessions"],
    queryFn: () => apiGetAuth<{ rows: Session[] }>("/api/dispatcher/ai-dispatcher/agent/sessions"),
    refetchInterval: 15000,
  });
  const rows = sessionsQ.data?.rows ?? [];
  const active = rows.find((r) => ["connected", "opening_site", "searching", "reading_page", "refreshing"].includes(r.status));

  const create = useMutation({
    mutationFn: () => apiPost<{ session: Session; pairing_code: string }>(
      "/api/dispatcher/ai-dispatcher/agent/sessions",
      { agent_type: "browser_extension" },
    ),
    onSuccess: (res) => {
      toast.success(`Код подключения агента: ${res.pairing_code}`);
      qc.invalidateQueries({ queryKey: ["ai-agent-sessions"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Ошибка"),
  });

  const mockConnect = useMutation({
    mutationFn: (id: string) => apiPatch(`/api/dispatcher/ai-dispatcher/agent/sessions/${id}`, { action: "mock-connect" }),
    onSuccess: () => {
      toast.success("Агент подключён (mock)");
      qc.invalidateQueries({ queryKey: ["ai-agent-sessions"] });
    },
  });

  const disconnect = useMutation({
    mutationFn: (id: string) => apiPatch(`/api/dispatcher/ai-dispatcher/agent/sessions/${id}`, { action: "disconnect" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-agent-sessions"] }),
  });

  const heartbeat = useMutation({
    mutationFn: (id: string) => apiPatch(`/api/dispatcher/ai-dispatcher/agent/sessions/${id}`, { action: "heartbeat" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-agent-sessions"] }),
  });

  return (
    <Card className="p-3 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <PlugZap className="h-4 w-4" /> Подключение Browser Agent
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">Режим</span>
          <Select value={mode} onValueChange={(v) => onModeChange(v as AgentAdapterMode)}>
            <SelectTrigger className="h-7 w-[210px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="mock">Mock Agent</SelectItem>
              <SelectItem value="browser_agent_ready">Browser Agent Ready</SelectItem>
              <SelectItem value="browser_agent_live" disabled>Browser Agent Live — не подключён</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground leading-snug">
        Browser Agent работает в вашем браузере и использует вашу открытую сессию ATI.
        Радиус Трек не хранит логин и пароль ATI. API ATI не используется.
      </p>

      {active ? (
        <div className="rounded border p-2 text-xs space-y-1">
          <div className="flex items-center justify-between">
            <div className="font-medium">{active.agent_name}</div>
            <StatusPill status={active.status} />
          </div>
          <div className="text-muted-foreground">
            Тип: {active.agent_type} · Версия: {active.agent_version ?? "—"} · Вкладок: {active.active_tab_count}
          </div>
          <div className="text-muted-foreground">
            Последний heartbeat: {active.last_heartbeat_at ? new Date(active.last_heartbeat_at).toLocaleTimeString() : "—"}
          </div>
          {active.last_error && <div className="text-rose-700">Ошибка: {active.last_error}</div>}
          <div className="flex gap-2 pt-1">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => heartbeat.mutate(active.id)}>
              <Activity className="h-3.5 w-3.5 mr-1" /> Heartbeat
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => disconnect.mutate(active.id)}>
              <Power className="h-3.5 w-3.5 mr-1" /> Отключить
            </Button>
          </div>
        </div>
      ) : (
        <div className="text-xs text-muted-foreground">Активный агент не подключён.</div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" className="h-7 text-xs" onClick={() => create.mutate()} disabled={create.isPending}>
          <Link2 className="h-3.5 w-3.5 mr-1" /> Создать код подключения
        </Button>
        {rows.filter((r) => r.status === "pairing").map((s) => (
          <Button
            key={s.id} size="sm" variant="secondary" className="h-7 text-xs"
            onClick={() => mockConnect.mutate(s.id)}
          >
            Сымитировать подключение (dev)
          </Button>
        ))}
      </div>

      <p className="text-[10px] text-muted-foreground">
        Dev/mock режим имитирует работу агента. Реальное расширение будет подключено следующим этапом.
      </p>
    </Card>
  );
}

// ─── Вкладки агента ─────────────────────────────────────────────────────
export function AgentTabsPanel() {
  const qc = useQueryClient();
  const tabsQ = useQuery({
    queryKey: ["ai-agent-tabs"],
    queryFn: () => apiGetAuth<{ rows: AgentTab[] }>("/api/dispatcher/ai-dispatcher/agent/tabs"),
    refetchInterval: 10000,
  });
  const rows = tabsQ.data?.rows ?? [];
  const close = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/dispatcher/ai-dispatcher/agent/tabs?id=${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-agent-tabs"] }),
  });

  return (
    <Card className="p-3">
      <div className="text-sm font-semibold mb-2">Вкладки агента</div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">Нет открытых вкладок агента.</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((t) => (
            <li key={t.id} className="rounded border p-2 text-xs space-y-0.5">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium truncate">
                  {t.title ?? t.url ?? "(без названия)"}
                </div>
                <Badge variant="outline" className="text-[10px]">{t.tab_type} · {t.tab_status}</Badge>
              </div>
              {t.url && (
                <div className="text-muted-foreground truncate">{t.url}</div>
              )}
              <div className="flex gap-1 pt-1">
                <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" disabled>
                  <Focus className="h-3 w-3 mr-1" /> Сфокусировать
                </Button>
                <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => close.mutate(t.id)}>
                  <X className="h-3 w-3 mr-1" /> Закрыть
                </Button>
                <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" disabled>
                  <AlertOctagon className="h-3 w-3 mr-1" /> Неактуальна
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
