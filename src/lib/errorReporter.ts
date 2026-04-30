// Клиентский хелпер для отправки отчётов об ошибках на сервер.
// Безопасно вызывать из любого места UI: ошибки отчёта молча проглатываются,
// чтобы не вызывать каскад.
import { reportErrorFn, notifyAdminAboutErrorFn } from "@/server/system-errors.functions";
import {
  classifyError,
  ERROR_TITLES,
  errorMessage,
  errorTechnical,
  type ErrorKind,
} from "@/lib/errors";

export type ReportErrorContext = {
  section?: string;
  action?: string;
  code?: string;
  severity?: "info" | "warning" | "error" | "critical";
  url?: string;
};

export async function reportError(err: unknown, ctx: ReportErrorContext = {}) {
  try {
    const kind: ErrorKind = classifyError(err);
    const title = ctx.code ? `${ERROR_TITLES[kind]} (${ctx.code})` : ERROR_TITLES[kind];
    await reportErrorFn({
      data: {
        code: ctx.code ?? kind,
        title,
        message: errorMessage(err) || ERROR_TITLES[kind],
        technical: errorTechnical(err),
        section: ctx.section ?? null,
        action: ctx.action ?? null,
        severity: ctx.severity ?? (kind === "no_access" || kind === "permission" ? "warning" : "error"),
        url: ctx.url ?? (typeof window !== "undefined" ? window.location.href : null),
      },
    });
  } catch {
    // тихо: отчёт не должен ломать UI
  }
}

export async function notifyAdmin(opts: { errorId?: string; title: string; message?: string }) {
  try {
    await notifyAdminAboutErrorFn({
      data: {
        errorId: opts.errorId ?? null,
        title: opts.title,
        message: opts.message ?? null,
        url: typeof window !== "undefined" ? window.location.href : null,
      },
    });
    return true;
  } catch {
    return false;
  }
}
