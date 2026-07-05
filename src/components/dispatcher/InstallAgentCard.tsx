// InstallAgentCard — карточка «установите Radius Track Agent».
// Показывается когда detectExtension() вернул installed=false.
// Никаких chrome:// программных вызовов — только текст и ссылки.
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, RefreshCw, ExternalLink } from "lucide-react";
import { Link } from "@tanstack/react-router";

interface Props {
  onRecheck?: () => void;
  compact?: boolean;
}

export function InstallAgentCard({ onRecheck, compact }: Props) {
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
              Для автоматического поиска нужно один раз установить Radius Track Agent
              в браузере Chrome на компьютере.
            </p>
          </div>
          <ol className="text-xs space-y-1.5 list-decimal list-inside text-muted-foreground">
            <li>Скачайте или получите папку расширения <code className="text-foreground">browser-agent/dist</code>.</li>
            <li>Откройте <code className="text-foreground">chrome://extensions</code> и включите «Режим разработчика».</li>
            <li>Нажмите «Загрузить распакованное расширение» и выберите папку <code className="text-foreground">browser-agent/dist</code>.</li>
          </ol>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" variant="default" asChild>
              <Link to="/browser-agent/install">
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                Открыть инструкцию
              </Link>
            </Button>
            {onRecheck && (
              <Button size="sm" variant="outline" onClick={onRecheck}>
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
