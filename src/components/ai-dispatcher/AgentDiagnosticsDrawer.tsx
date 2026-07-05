// AgentDiagnosticsDrawer — вся техническая диагностика Browser Agent.
// По умолчанию закрыт. Открывается из SimpleAgentPanel по ссылке «Диагностика».
// Не отображает: agent token, token hash, challenge secret, Authorization, cookies, password.
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { AgentHealthPanel } from "@/components/ai-dispatcher/AgentHealthPanel";
import { AgentConnectionPanel, AgentTabsPanel, AGENT_MODE_STORAGE_KEY, type AgentAdapterMode } from "@/components/ai-dispatcher/AgentConnectionPanel";
import { AgentCommandStatusPanel } from "@/components/ai-dispatcher/AgentCommandStatusPanel";
import { AGENT_MOCK_MODE_ENABLED } from "@/lib/feature-flags";
import { Badge } from "@/components/ui/badge";
import { useEffect, useState } from "react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId?: string | null;
}

export function AgentDiagnosticsDrawer({ open, onOpenChange, sessionId }: Props) {
  const [mode, setMode] = useState<AgentAdapterMode>(() => {
    if (typeof window === "undefined") return "mock";
    const v = window.localStorage.getItem(AGENT_MODE_STORAGE_KEY);
    return (v === "browser_agent_ready" || v === "browser_agent_live") ? v : "mock";
  });
  useEffect(() => {
    const h = (e: Event) => setMode((e as CustomEvent).detail as AgentAdapterMode);
    window.addEventListener("rt-agent-mode-changed", h as EventListener);
    return () => window.removeEventListener("rt-agent-mode-changed", h as EventListener);
  }, []);
  const setModePersist = (m: AgentAdapterMode) => {
    window.localStorage.setItem(AGENT_MODE_STORAGE_KEY, m);
    window.dispatchEvent(new CustomEvent("rt-agent-mode-changed", { detail: m }));
  };

  // Mock-режим доступен только если явно включён в dev.
  const canShowMock = AGENT_MOCK_MODE_ENABLED;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto" data-testid="agent-diagnostics-drawer">
        <SheetHeader>
          <SheetTitle>Диагностика агента</SheetTitle>
          <SheetDescription>
            Технические сведения о Browser Agent. Токены и коды подключения здесь не отображаются.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {canShowMock ? (
            <AgentConnectionPanel mode={mode} onModeChange={setModePersist} />
          ) : (
            <AgentConnectionPanel
              mode={mode === "mock" ? "browser_agent_ready" : mode}
              onModeChange={(m) => setModePersist(m === "mock" ? "browser_agent_ready" : m)}
            />
          )}
          <AgentHealthPanel />
          <AgentCommandStatusPanel sessionId={sessionId ?? null} />
          <AgentTabsPanel />

          {!canShowMock && (
            <div className="text-[11px] text-muted-foreground">
              <Badge variant="outline" className="mr-1">prod-safe</Badge>
              Mock-режим агента доступен только в dev при VITE_RT_AGENT_MOCK_ENABLED=true.
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
