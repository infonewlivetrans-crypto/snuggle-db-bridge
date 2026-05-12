// Форматирование ошибок Supabase/API без подмены реального сообщения.
// "Сессия истекла" показываем только если ошибка действительно про JWT.

export interface SupabaseLikeError {
  message?: unknown;
  details?: unknown;
  hint?: unknown;
  code?: unknown;
  status?: unknown;
  error?: unknown;
}

function asStr(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v.trim() || null;
  return String(v);
}

export function isJwtExpired(err: unknown): boolean {
  if (!err) return false;
  const blob = (() => {
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  })().toLowerCase();
  return (
    blob.includes("jwt has expired") ||
    blob.includes("jwt expired") ||
    blob.includes("token has expired") ||
    blob.includes("pgrst301")
  );
}

export function formatSupabaseError(
  err: unknown,
  responseStatus?: number,
  responseBody?: unknown,
): string {
  if (isJwtExpired(err) || (typeof responseBody === "string" && isJwtExpired(responseBody))) {
    return "Сессия истекла. Войдите заново.";
  }

  const e = (err ?? {}) as SupabaseLikeError;
  const parts: string[] = [];
  const msg = asStr(e.message) ?? (err instanceof Error ? err.message : null) ?? asStr(e.error);
  if (msg) parts.push(msg);

  const details = asStr(e.details);
  if (details && details !== msg) parts.push(`details: ${details}`);

  const hint = asStr(e.hint);
  if (hint) parts.push(`hint: ${hint}`);

  const code = asStr(e.code);
  if (code) parts.push(`code: ${code}`);

  const status = responseStatus ?? (typeof e.status === "number" ? e.status : null);
  if (status) parts.push(`status: ${status}`);

  if (responseBody != null) {
    let body =
      typeof responseBody === "string" ? responseBody : (() => {
        try {
          return JSON.stringify(responseBody);
        } catch {
          return String(responseBody);
        }
      })();
    if (body && body.length > 500) body = body.slice(0, 500) + "…";
    if (body && !parts.some((p) => p.includes(body))) parts.push(`body: ${body}`);
  }

  if (parts.length === 0) {
    if (err instanceof Error) return err.message || "Неизвестная ошибка";
    if (typeof err === "string") return err;
    try {
      return JSON.stringify(err) || "Неизвестная ошибка";
    } catch {
      return "Неизвестная ошибка";
    }
  }
  return parts.join(" · ");
}
