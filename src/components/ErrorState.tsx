import { useState } from "react";
import { AlertTriangle, RefreshCw, Send, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  classifyError,
  ERROR_HINTS,
  ERROR_TITLES,
  errorMessage,
  type ErrorKind,
} from "@/lib/errors";
import { notifyAdmin, reportError } from "@/lib/errorReporter";

type Props = {
  error: unknown;
  /** Раздел/страница, где произошла ошибка — пишется в журнал */
  section?: string;
  /** Что пытались сделать (load/save/import/photo/...) */
  action?: string;
  /** Принудительно задать тип ошибки (если хотим перезаписать классификатор) */
  kind?: ErrorKind;
  /** Кнопка «Повторить» */
  onRetry?: () => void;
  /** Компактный режим — для inline-блоков внутри страниц */
  compact?: boolean;
  /** Не отправлять ошибку в журнал автоматически */
  silent?: boolean;
};

export function ErrorState({ error, section, action, kind, onRetry, compact, silent }: Props) {
  const detected: ErrorKind = kind ?? classifyError(error);
  const title = ERROR_TITLES[detected];
  const hint = ERROR_HINTS[detected];
  const [reported, setReported] = useState(false);
  const [sending, setSending] = useState(false);

  // Автологирование при показе (один раз)
  useState(() => {
    if (!silent) {
      void reportError(error, { section, action, code: detected, severity: detected === "no_access" || detected === "permission" ? "warning" : "error" });
    }
    return null;
  });

  const handleNotify = async () => {
    setSending(true);
    const ok = await notifyAdmin({
      title: `${title}${section ? ` · ${section}` : ""}`,
      message: errorMessage(error) || hint,
    });
    setSending(false);
    setReported(ok);
    if (ok) toast.success("Сообщение отправлено администратору");
    else toast.error("Не удалось отправить сообщение. Попробуйте позже.");
  };

  const Icon = detected === "no_access" || detected === "permission" ? ShieldAlert : AlertTriangle;

  return (
    <div
      className={
        compact
          ? "flex flex-col gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm"
          : "mx-auto flex max-w-xl flex-col items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-5"
      }
      role="alert"
    >
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
        <div className="space-y-1">
          <div className="font-semibold text-foreground">{title}</div>
          <div className="text-sm text-muted-foreground">{hint}</div>
          {errorMessage(error) ? (
            <div className="mt-2 break-words rounded border border-border bg-card px-2 py-1 text-xs text-muted-foreground">
              {errorMessage(error)}
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {onRetry ? (
          <Button size="sm" variant="default" onClick={onRetry}>
            <RefreshCw className="mr-1.5 h-4 w-4" /> Повторить
          </Button>
        ) : null}
        <Button size="sm" variant="outline" onClick={handleNotify} disabled={sending || reported}>
          <Send className="mr-1.5 h-4 w-4" />
          {reported ? "Сообщение отправлено" : sending ? "Отправка…" : "Сообщить администратору"}
        </Button>
      </div>
    </div>
  );
}
