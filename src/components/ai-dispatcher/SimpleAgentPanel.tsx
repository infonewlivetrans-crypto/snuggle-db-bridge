// SimpleAgentPanel — упрощённый интерфейс Browser Agent для диспетчера.
// Только «Подключить агент», «Найти груз» и ссылка «Диагностика».
// Никаких токенов/сессий/challenge_secret не показывает.
import { useCallback, useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Plug, Search, Wrench, CheckCircle2, AlertTriangle, Smartphone } from "lucide-react";
import { toast } from "sonner";
import {
  detectExtension,
  getAgentStatus,
  requestAgentConnection,
  type AgentStatus,
} from "@/lib/ai-dispatcher/extension-bridge";
import { apiPost } from "@/lib/api-client";
import { getSimpleAgentErrorMessage } from "@/lib/ai-dispatcher/agent-error-messages";
import { InstallAgentCard } from "@/components/dispatcher/InstallAgentCard";

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

interface Props {
  onOpenDiagnostics: () => void;
  onFindLoad?: () => void;
  findLoadDisabled?: boolean;
  findLoadDisabledReason?: string | null;
  externalStage?: Exclude<SimplePanelState, "checking" | "not_installed" | "disconnected" | "connecting" | "ready" | "desktop_required"> | null;
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

export function SimpleAgentPanel({
  onOpenDiagnostics,
  onFindLoad,
  findLoadDisabled,
  findLoadDisabledReason,
  externalStage,
}: Props) {
  const mobile = isMobileDevice();
  const [state, setState] = useState<SimplePanelState>(mobile ? "desktop_required" : "checking");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
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
      if (status.connected) {
        setState((prev) => (externalStage ? prev : "ready"));
      } else if (status.needsReconnect) {
        setState("disconnected");
      } else {
        setState("disconnected");
      }
    } catch {
      setState("not_installed");
    }
  }, [mobile, externalStage]);

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

  // Внешний stage (searching/found/paused/error) перекрывает базовый ready.
  const effectiveState: SimplePanelState = externalStage && state === "ready" ? externalStage : state;

  const handleConnect = useCallback(async () => {
    setErrorMsg(null);
    setState("connecting");
    try {
      const detected = await detectExtension(2500);
      if (!detected.installed) {
        setState("not_installed");
        return;
      }
      if (detected.connected) {
        setState("ready");
        toast.success("Агент подключён");
        return;
      }
      const origin = window.location.origin;
      // Создаём challenge (авторизованный endpoint).
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
        setErrorMsg(msg);
        setState("error");
        toast.error(msg);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Не удалось подключить агент";
      const simple = getSimpleAgentErrorMessage(null, msg);
      setErrorMsg(simple);
      setState("error");
      toast.error(simple);
    }
  }, []);

  const Icon =
    effectiveState === "ready" || effectiveState === "suitable_found" ? CheckCircle2 :
    effectiveState === "error" ? AlertTriangle :
    effectiveState === "desktop_required" ? Smartphone :
    effectiveState === "checking" || effectiveState === "connecting" || effectiveState === "searching" ? Loader2 :
    Plug;

  const spin = effectiveState === "checking" || effectiveState === "connecting" || effectiveState === "searching";
  const showConnect = effectiveState === "disconnected" || effectiveState === "error";
  const showFind = effectiveState === "ready" || effectiveState === "suitable_found" || effectiveState === "paused";

  return (
    <Card className="p-4" data-testid="simple-agent-panel">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary">
          <Icon className={"h-5 w-5 " + (spin ? "animate-spin" : "")} />
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold">Помощник поиска грузов</div>
          <p className="text-xs text-muted-foreground mt-1">
            {STATE_TEXT[effectiveState]}
          </p>
          {errorMsg && effectiveState === "error" && (
            <p className="text-xs text-destructive mt-1">{errorMsg}</p>
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
          {showFind && onFindLoad && (
            <Button
              size="sm"
              onClick={onFindLoad}
              disabled={findLoadDisabled}
              data-testid="find-load-btn"
            >
              <Search className="h-3.5 w-3.5 mr-1.5" />
              Найти груз
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
    </Card>
  );
}
