import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ChevronDown, ChevronRight, Copy } from "lucide-react";
import { toast } from "sonner";
import type { ErrorDetails } from "@/lib/supabaseError";

export function ErrorDetailsPanel({
  title = "Ошибка",
  details,
  className,
}: {
  title?: string;
  details: ErrorDetails | null;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  if (!details) return null;

  const rows: Array<[string, string | number | null]> = [
    ["message", details.message],
    ["details", details.details],
    ["hint", details.hint],
    ["code", details.code],
    ["status", details.status],
    ["body", details.body],
  ];
  const visible = rows.filter(([, v]) => v != null && String(v).length > 0);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        visible.map(([k, v]) => `${k}: ${v}`).join("\n") + "\n\nraw:\n" + details.raw,
      );
      toast.success("Скопировано");
    } catch {
      toast.error("Не удалось скопировать");
    }
  };

  return (
    <Alert variant="destructive" className={className}>
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <div className="text-sm break-words">{details.summary}</div>
        {visible.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={() => setOpen((v) => !v)}
            >
              {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              {open ? "Скрыть подробности" : "Подробности ошибки"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={copy}
            >
              <Copy className="h-3 w-3" /> Копировать
            </Button>
          </div>
        )}
        {open && (
          <div className="mt-2 space-y-1 rounded-md border border-destructive/30 bg-destructive/5 p-2 font-mono text-xs">
            {visible.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[80px_1fr] gap-2">
                <span className="text-muted-foreground">{k}</span>
                <span className="whitespace-pre-wrap break-all">{String(v)}</span>
              </div>
            ))}
            <details className="mt-2">
              <summary className="cursor-pointer text-muted-foreground">raw</summary>
              <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap break-all text-[11px]">
                {details.raw}
              </pre>
            </details>
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
}
