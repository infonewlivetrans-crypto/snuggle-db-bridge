// InstallAgentCard — «установите Radius Track Agent».
// Показывает прямую кнопку скачивания zip и краткую инструкцию.
// Открывает полную инструкцию /browser-agent/install.
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, RefreshCw, ExternalLink, AlertTriangle } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useAgentRelease } from "@/lib/ai-dispatcher/agent-release";
import { AgentDownloadButton } from "@/components/ai-dispatcher/AgentDownloadButton";
import { detectDeviceSupport } from "@/lib/ai-dispatcher/device-support";

interface Props {
  onRecheck?: () => void;
  compact?: boolean;
}

export function InstallAgentCard({ onRecheck, compact }: Props) {
  const { release, loading, error } = useAgentRelease();
  const support = detectDeviceSupport();

  return (
    <Card className={compact ? "p-3" : "p-4"}>
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary">
          <Download className="h-5 w-5" />
        </div>
        <div className="flex-1 space-y-3">
          <div>
            <div className="text-sm font-semibold">
              Установите Radius Track Agent
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Скачайте расширение прямо отсюда и подключите его в браузере Chrome
              на компьютере. Установка занимает меньше минуты.
            </p>
          </div>

          {!support.supported && (
            <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-2 text-xs text-amber-800 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                Расширение работает только в Chrome на компьютере. Сейчас открыт{" "}
                {support.browserLabel}.
              </span>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                Не удалось получить сведения о последней версии агента. Попробуйте
                обновить страницу.
              </span>
            </div>
          )}

          <ol className="text-xs space-y-1.5 list-decimal list-inside text-muted-foreground">
            <li>Скачайте архив кнопкой ниже.</li>
            <li>Распакуйте архив в удобную папку.</li>
            <li>
              Откройте <code className="text-foreground">chrome://extensions</code>{" "}
              и включите «Режим разработчика».
            </li>
            <li>
              Нажмите «Загрузить распакованное расширение» и выберите распакованную
              папку.
            </li>
          </ol>

          <div className="flex flex-wrap gap-2 pt-1">
            <AgentDownloadButton
              release={release}
              loading={loading}
              size="sm"
              disabled={!support.supported}
            />
            <Button size="sm" variant="outline" asChild>
              <Link to="/browser-agent/install">
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                Полная инструкция
              </Link>
            </Button>
            {onRecheck && (
              <Button size="sm" variant="ghost" onClick={onRecheck}>
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                Проверить снова
              </Button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
