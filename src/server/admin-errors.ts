// Tagged error for missing/disabled service_role on production VPS.
// Used by the lazy admin Proxy in api-helpers.server.ts so legacy endpoints
// degrade to a clean 501 instead of crashing the worker.

export const SERVICE_ROLE_UNAVAILABLE = "SERVICE_ROLE_UNAVAILABLE" as const;

export class ServiceRoleUnavailableError extends Error {
  readonly code = SERVICE_ROLE_UNAVAILABLE;
  constructor(message = "Service role is not available in this environment") {
    super(message);
    this.name = "ServiceRoleUnavailableError";
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isServiceRoleUnavailable(err: any): boolean {
  if (!err) return false;
  if (err instanceof ServiceRoleUnavailableError) return true;
  if (typeof err === "object" && err && err.code === SERVICE_ROLE_UNAVAILABLE) return true;
  const msg = (err && (err.message ?? String(err))) || "";
  return /Missing SUPABASE_SERVICE_ROLE_KEY/i.test(msg);
}

export function serviceRoleUnavailableResponse(): Response {
  return new Response(
    JSON.stringify({
      error: SERVICE_ROLE_UNAVAILABLE,
      message:
        "Операция требует привилегированного доступа и недоступна в текущем окружении. Используйте новый AI-диспетчер.",
    }),
    {
      status: 501,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
      },
    },
  );
}

export function isServiceRoleConfigured(): boolean {
  if (typeof process === "undefined" || !process.env) return false;
  const v = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return typeof v === "string" && v.length > 0;
}
