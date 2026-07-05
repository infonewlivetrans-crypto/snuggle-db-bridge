// SearchProgressBlock — простые понятные этапы поиска для диспетчера.
// Никаких queued/sent/acknowledged/command_id/session_id/RPC.
// Использует существующие статусы задачи и счётчики.
import { Card } from "@/components/ui/card";
import { Loader2, Search, CheckCircle2, PauseCircle, AlertTriangle } from "lucide-react";

export type SimpleSearchStage =
  | "idle"
  | "preparing"
  | "opening_ati"
  | "awaiting_ati_login"
  | "filling_params"
  | "starting_search"
  | "checking_loads"
  | "searching"
  | "found"
  | "paused"
  | "error";

interface Props {
  stage: SimpleSearchStage;
  loadsSeen?: number | null;
  matched?: number | null;
  nextRefreshInSec?: number | null;
  errorMessage?: string | null;
}

const STAGE_TEXT: Record<SimpleSearchStage, string> = {
  idle: "Готов к поиску",
  preparing: "Подготавливаю поиск",
  opening_ati: "Открываю ATI",
  awaiting_ati_login: "Ожидаю вход в ATI",
  filling_params: "Заполняю параметры",
  starting_search: "Запускаю поиск",
  checking_loads: "Проверяю грузы",
  searching: "Идёт поиск",
  found: "Найдены подходящие грузы",
  paused: "Поиск на паузе",
  error: "Произошла ошибка",
};

export function SearchProgressBlock({
  stage,
  loadsSeen,
  matched,
  nextRefreshInSec,
  errorMessage,
}: Props) {
  const Icon =
    stage === "found" ? CheckCircle2 :
    stage === "paused" ? PauseCircle :
    stage === "error" ? AlertTriangle :
    stage === "idle" ? Search : Loader2;
  const spin = !["idle", "found", "paused", "error"].includes(stage);
  return (
    <Card className="p-3">
      <div className="flex items-center gap-2">
        <Icon className={"h-4 w-4 text-primary " + (spin ? "animate-spin" : "")} />
        <div className="text-sm font-medium">{STAGE_TEXT[stage]}</div>
      </div>
      {(loadsSeen != null || matched != null) && (
        <div className="mt-2 text-xs text-muted-foreground flex gap-3 flex-wrap">
          {loadsSeen != null && <span>Найдено грузов: <b className="text-foreground">{loadsSeen}</b></span>}
          {matched != null && <span>Подходит: <b className="text-foreground">{matched}</b></span>}
          {nextRefreshInSec != null && nextRefreshInSec > 0 && (
            <span>Следующая проверка через {nextRefreshInSec} сек</span>
          )}
        </div>
      )}
      {stage === "error" && errorMessage && (
        <p className="mt-2 text-xs text-destructive">{errorMessage}</p>
      )}
    </Card>
  );
}

// Маппер статуса задачи → простой этап.
export function mapTaskStatusToStage(
  status: string | null | undefined,
  matched?: number | null,
): SimpleSearchStage {
  if (!status) return "idle";
  if ((matched ?? 0) > 0) return "found";
  switch (status) {
    case "draft": return "preparing";
    case "starting": return "starting_search";
    case "searching": return "searching";
    case "main_found": return "found";
    case "paused": return "paused";
    case "stopped": return "idle";
    default: return "preparing";
  }
}
