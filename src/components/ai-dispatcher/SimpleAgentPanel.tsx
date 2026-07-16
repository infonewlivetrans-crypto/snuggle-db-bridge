// SimpleAgentPanel — упрощённый интерфейс Browser Agent для диспетчера.
// Одна кнопка «Подключить агент», одна «Найти груз», ссылка «Диагностика».
// Никаких токенов/сессий/challenge_secret не показывает.
import { useCallback, useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Plug, Search, Wrench, CheckCircle2, AlertTriangle, Smartphone, Pause, Square, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  detectExtension,
  getAgentStatus,
  requestAgentConnection,
  openAtiAndStart,
  type AgentStatus,
} from "@/lib/ai-dispatcher/extension-bridge";
import { isNewer } from "@/lib/semver";
import { apiPost, apiGetAuth } from "@/lib/api-client";
import { getSimpleAgentErrorMessage } from "@/lib/ai-dispatcher/agent-error-messages";
import { InstallAgentCard } from "@/components/dispatcher/InstallAgentCard";
import { SearchProgressBlock, type SimpleSearchStage } from "@/components/ai-dispatcher/SearchProgressBlock";

export type SimplePanelState =
  | "checking"
  | "not_installed"
  | "disconnected"
  | "connecting"
  | "ready"
  | "needs_ati_login"
  | "searching"
  | "suitable_found"
  | "paused"
  | "error"
  | "desktop_required";

interface OrchestratorStatus {
  task_id: string;
  orchestration_status: string | null;
  simple_stage: string;
  message: string;
  error_code: string | null;
  error_message: string | null;
  can_retry: boolean;
  can_pause: boolean;
  can_stop: boolean;
  loads_seen_count: number;
  matched_count: number;
  next_refresh_at: string | null;
}

interface Props {
  onOpenDiagnostics: () => void;
  activeTaskId?: string | null;
  findLoadDisabled?: boolean;
  findLoadDisabledReason?: string | null;
}

const STATE_TEXT: Record<SimplePanelState, string> = {
  checking: "Проверяю подключение агента…",
  not_installed: "Для автоматического поиска нужно один раз установить Radius Track Agent",
  disconnected: "Агент установлен, но ещё не подключён",
  connecting: "Подключаю агент…",
  ready: "Агент готов к поиску грузов",
  needs_ati_login: "Войдите в ATI в открывшейся вкладке",
  searching: "Агент ищет подходящие грузы",
  suitable_found: "Найдены подходящие грузы",
  paused: "Поиск приостановлен",
  error: "Произошла ошибка",
  desktop_required: "Откройте Радиус Трек в Chrome на компьютере для автоматического поиска",
};

function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

function mapOrchStageToSimpleSearchStage(stage: string | undefined | null): SimpleSearchStage {
  switch (stage) {
    case "checking_agent": return "preparing";
    case "creating_task": return "preparing";
    case "opening_ati": return "opening_ati";
    case "waiting_user_login": return "awaiting_ati_login";
    case "applying_filters": return "filling_params";
    case "starting_search": return "starting_search";
    case "waiting_results": return "searching";
    case "reading_loads": return "checking_loads";
    case "scoring": return "checking_loads";
    case "searching": return "searching";
    case "suitable_found": return "found";
    case "paused": return "paused";
    case "failed": return "error";
    case "stopped": return "idle";
    default: return "idle";
  }
}

const ACTIVE_ORCH: string[] = [
  "checking_agent", "opening_ati", "waiting_user_login", "applying_filters",
  "starting_search", "waiting_results", "reading_loads", "scoring",
  "searching", "suitable_found",
];

export function SimpleAgentPanel({
  onOpenDiagnostics,
  activeTaskId,
  findLoadDisabled,
  findLoadDisabledReason,
}: Props) {
  const mobile = isMobileDevice();
  const [state, setState] = useState<SimplePanelState>(mobile ? "desktop_required" : "checking");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [orch, setOrch] = useState<OrchestratorStatus | null>(null);
  const [installedAgentVersion, setInstalledAgentVersion] = useState<string | null>(null);
  const [latestAgentVersion, setLatestAgentVersion] = useState<string | null>(null);
  const lastCheckRef = useRef(0);

  const refreshStatus = useCallback(async () => {
    if (mobile) return;
    const now = Date.now();
    if (now - lastCheckRef.current < 1500) return;
    lastCheckRef.current = now;
    try {
      const detected = await detectExtension(2000);
      if (!detected.installed) { setState("not_installed"); return; }
      const status: AgentStatus = await getAgentStatus();
      if (status.agentVersion) setInstalledAgentVersion(status.agentVersion);
      if (status.connected) {
        setState((prev) => (prev === "connecting" || prev === "checking" || prev === "disconnected" || prev === "error") ? "ready" : prev);
      } else {
        setState("disconnected");
      }
    } catch {
      setState("not_installed");
    }
  }, [mobile]);

  useEffect(() => { refreshStatus(); }, [refreshStatus]);
  useEffect(() => {
    if (mobile) return;
    const onFocus = () => refreshStatus();
    const onVis = () => { if (document.visibilityState === "visible") refreshStatus(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    const iv = window.setInterval(refreshStatus, 30_000);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(iv);
    };
  }, [mobile, refreshStatus]);

  // Poll orchestrator status when task is set
  useEffect(() => {
    if (!activeTaskId) { setOrch(null); return; }
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await apiGetAuth<{ status: OrchestratorStatus }>(
          `/api/dispatcher/ai-dispatcher/tasks/${activeTaskId}/orchestrator/status`,
        );
        if (!cancelled) setOrch(r.status);
      } catch { /* ignore */ }
    };
    tick();
    const iv = window.setInterval(tick, 3000);
    return () => { cancelled = true; window.clearInterval(iv); };
  }, [activeTaskId]);

  // Overlay orchestrator state onto panel state
  const orchStage = orch?.orchestration_status ?? null;
  let effectiveState: SimplePanelState = state;
  if (state === "ready" && orchStage) {
    if (orchStage === "waiting_user_login") effectiveState = "needs_ati_login";
    else if (orchStage === "suitable_found") effectiveState = "suitable_found";
    else if (orchStage === "paused") effectiveState = "paused";
    else if (orchStage === "failed") effectiveState = "error";
    else if (ACTIVE_ORCH.includes(orchStage)) effectiveState = "searching";
  }
  const uiErrorMsg = errorMsg
    ?? (orch?.orchestration_status === "failed" ? (orch.error_message ?? "Произошла ошибка") : null);

  const handleConnect = useCallback(async () => {
    setErrorMsg(null);
    setState("connecting");
    try {
      const detected = await detectExtension(2500);
      if (!detected.installed) { setState("not_installed"); return; }
      if (detected.connected) { setState("ready"); toast.success("Агент подключён"); return; }
      const origin = window.location.origin;
      const ch = await apiPost<{ challenge_id: string; challenge_secret: string }>(
        "/api/dispatcher/ai-dispatcher/agent/auto-pair/challenge",
        { origin, ttl_seconds: 120 },
      );
      const result = await requestAgentConnection({
        challengeId: ch.challenge_id,
        challengeSecret: ch.challenge_secret,
        origin,
      });
      if (result.ok && result.connected) {
        setState("ready");
        toast.success("Агент подключён");
      } else {
        const msg = getSimpleAgentErrorMessage(result.errorCode, result.errorMessage ?? "Не удалось подключить агент");
        setErrorMsg(msg); setState("error"); toast.error(msg);
      }
    } catch (e) {
      const simple = getSimpleAgentErrorMessage(null, e instanceof Error ? e.message : "Не удалось подключить агент");
      setErrorMsg(simple); setState("error"); toast.error(simple);
    }
  }, []);

  const handleFindLoad = useCallback(async () => {
    if (!activeTaskId) { toast.error("Выберите задачу поиска"); return; }
    if (orch && orch.orchestration_status && ACTIVE_ORCH.includes(orch.orchestration_status)) {
      toast.message("Поиск уже запущен");
      return;
    }
    // Открываем/фокусируем управляемую вкладку ATI ДО запуска оркестратора.
    try {
      const open = await openAtiAndStart(activeTaskId, 5000);
      if (!open.ok) {
        const msg = getSimpleAgentErrorMessage(open.errorCode ?? null, "Не удалось открыть ATI");
        toast.error(msg);
        return;
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось открыть ATI");
      return;
    }
    try {
      const r = await apiPost<{ ok: boolean; status?: OrchestratorStatus; error_message?: string }>(
        `/api/dispatcher/ai-dispatcher/tasks/${activeTaskId}/orchestrator/start`,
        {},
      );
      if (r.ok && r.status) { setOrch(r.status); toast.success("Поиск запущен"); }
      else toast.error(r.error_message ?? "Не удалось запустить поиск");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось запустить поиск");
    }
  }, [activeTaskId, orch]);

  const handleRetry = useCallback(async () => {
    if (!activeTaskId) return;
    try {
      const r = await apiPost<{ ok: boolean; status?: OrchestratorStatus; error_message?: string }>(
        `/api/dispatcher/ai-dispatcher/tasks/${activeTaskId}/orchestrator/retry`, {},
      );
      if (r.ok && r.status) { setOrch(r.status); toast.success("Поиск перезапущен"); }
      else toast.error(r.error_message ?? "Не удалось повторить");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Не удалось повторить"); }
  }, [activeTaskId]);

  const handlePause = useCallback(async () => {
    if (!activeTaskId) return;
    try {
      const r = await apiPost<{ ok: boolean; status?: OrchestratorStatus }>(
        `/api/dispatcher/ai-dispatcher/tasks/${activeTaskId}/orchestrator/pause`, {},
      );
      if (r.status) setOrch(r.status);
    } catch { /* ignore */ }
  }, [activeTaskId]);

  const handleStop = useCallback(async () => {
    if (!activeTaskId) return;
    try {
      const r = await apiPost<{ ok: boolean; status?: OrchestratorStatus }>(
        `/api/dispatcher/ai-dispatcher/tasks/${activeTaskId}/orchestrator/stop`, {},
      );
      if (r.status) setOrch(r.status);
    } catch { /* ignore */ }
  }, [activeTaskId]);

  const Icon =
    effectiveState === "ready" || effectiveState === "suitable_found" ? CheckCircle2 :
    effectiveState === "error" ? AlertTriangle :
    effectiveState === "desktop_required" ? Smartphone :
    effectiveState === "checking" || effectiveState === "connecting" || effectiveState === "searching" ? Loader2 :
    Plug;
  const spin = effectiveState === "checking" || effectiveState === "connecting" || effectiveState === "searching";
  const showConnect = effectiveState === "disconnected" || effectiveState === "error" && !orch;
  const canFind = ["ready", "suitable_found", "paused"].includes(effectiveState);
  const orchActive = orch && orch.orchestration_status && ACTIVE_ORCH.includes(orch.orchestration_status);
  const showFind = canFind && !orchActive;
  const showRetry = orch?.can_retry === true;
  const showPause = orch?.can_pause === true;
  const showStop = orch?.can_stop === true;

  return (
    <Card className="p-4" data-testid="simple-agent-panel">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary">
          <Icon className={"h-5 w-5 " + (spin ? "animate-spin" : "")} />
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold">Помощник поиска грузов</div>
          <p className="text-xs text-muted-foreground mt-1">{STATE_TEXT[effectiveState]}</p>
          {uiErrorMsg && (
            <p className="text-xs text-destructive mt-1">{uiErrorMsg}</p>
          )}
          {findLoadDisabled && findLoadDisabledReason && showFind && (
            <p className="text-xs text-amber-600 mt-1">{findLoadDisabledReason}</p>
          )}
        </div>
      </div>

      {effectiveState === "not_installed" && (
        <div className="mt-3">
          <InstallAgentCard onRecheck={refreshStatus} compact />
        </div>
      )}

      {effectiveState !== "desktop_required" && (
        <div className="mt-3 flex flex-wrap gap-2">
          {showConnect && (
            <Button size="sm" onClick={handleConnect} data-testid="connect-agent-btn">
              <Plug className="h-3.5 w-3.5 mr-1.5" />
              Подключить агент
            </Button>
          )}
          {showFind && (
            <Button size="sm" onClick={handleFindLoad} disabled={findLoadDisabled || !activeTaskId} data-testid="find-load-btn">
              <Search className="h-3.5 w-3.5 mr-1.5" />
              Найти груз
            </Button>
          )}
          {showRetry && (
            <Button size="sm" variant="secondary" onClick={handleRetry} data-testid="retry-orchestrator-btn">
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Повторить поиск
            </Button>
          )}
          {showPause && (
            <Button size="sm" variant="outline" onClick={handlePause} data-testid="pause-orchestrator-btn">
              <Pause className="h-3.5 w-3.5 mr-1.5" />
              Пауза
            </Button>
          )}
          {showStop && (
            <Button size="sm" variant="outline" onClick={handleStop} data-testid="stop-orchestrator-btn">
              <Square className="h-3.5 w-3.5 mr-1.5" />
              Остановить
            </Button>
          )}
          {effectiveState === "connecting" && (
            <Button size="sm" disabled>
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              Подключаю…
            </Button>
          )}
          <button
            type="button"
            onClick={onOpenDiagnostics}
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 self-center ml-auto"
            data-testid="open-diagnostics-btn"
          >
            <Wrench className="h-3 w-3 inline-block mr-1" />
            Диагностика
          </button>
        </div>
      )}

      {orch && orchStage && orchStage !== "idle" && (
        <div className="mt-3">
          <SearchProgressBlock
            stage={mapOrchStageToSimpleSearchStage(orchStage)}
            loadsSeen={orch.loads_seen_count}
            matched={orch.matched_count}
            errorMessage={orch.error_message}
          />
        </div>
      )}
    </Card>
  );
}
