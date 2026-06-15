import { createStart, createMiddleware, createIsomorphicFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { supabase } from "@/integrations/supabase/client";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import {
  isServiceRoleUnavailable,
  serviceRoleUnavailableResponse,
} from "@/server/admin-errors";

function describeCurrentRequest(): string {
  try {
    const req = getRequest();
    const url = new URL(req.url);
    return `${req.method} ${url.pathname}${url.search}`;
  } catch {
    return "<no-request-context>";
  }
}

function describeError(err: unknown): string {
  if (!err) return "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const e = err as any;
  const msg = e?.message ?? String(err);
  const stackLine = typeof e?.stack === "string"
    ? (e.stack as string).split("\n").slice(0, 4).join(" | ")
    : "";
  return `msg="${msg}" stack="${stackLine}"`;
}

// Server-only env normalization. Mirrors VITE_SUPABASE_URL -> SUPABASE_URL and
// PUBLISHABLE/ANON variants so the auto-generated supabaseAdmin lazy proxy
// (which reads strictly process.env.SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)
// can construct successfully under PM2/self-hosted Node.
//
// Implemented via createIsomorphicFn so the server impl is stripped from the
// client bundle at build time (no top-level import of *.server.ts from a
// client-reachable entry — import-protection stays intact).
const bootstrapServerEnv = createIsomorphicFn()
  .client(() => {})
  .server(() => {
    if (typeof process === "undefined" || !process.env) return;
    const env = process.env as Record<string, string | undefined>;
    if (!env.SUPABASE_URL && env.VITE_SUPABASE_URL) {
      env.SUPABASE_URL = env.VITE_SUPABASE_URL;
    }
    const publishable =
      env.SUPABASE_PUBLISHABLE_KEY ??
      env.SUPABASE_ANON_KEY ??
      env.VITE_SUPABASE_PUBLISHABLE_KEY ??
      env.VITE_SUPABASE_ANON_KEY;
    if (publishable) {
      if (!env.SUPABASE_PUBLISHABLE_KEY) env.SUPABASE_PUBLISHABLE_KEY = publishable;
      if (!env.SUPABASE_ANON_KEY) env.SUPABASE_ANON_KEY = publishable;
    }
  });
bootstrapServerEnv();

// Inject Supabase access token into every server function call so that
// `requireSupabaseAuth` middleware can authenticate the request.
const supabaseAuthHeader = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    let headers: Record<string, string> = {};
    if (typeof window !== "undefined") {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (token) headers = { Authorization: `Bearer ${token}` };
      } catch {
        // ignore — request will fail with 401 in protected middleware
      }
    }
    return next({ headers });
  },
);

// Глобальный safety-net: если какой-то legacy endpoint (users/invites/managers/backups
// и т.п.) пробует выйти на admin-клиент в окружении без SUPABASE_SERVICE_ROLE_KEY,
// мы не валим воркер 500-кой, а отдаём понятный 501. Старый контур не должен ломать
// прод и не должен требовать service_role на VPS.
const serviceRoleGuardRequest = createMiddleware({ type: "request" }).server(
  async ({ next }) => {
    try {
      return await next();
    } catch (err) {
      if (isServiceRoleUnavailable(err)) {
        console.warn(
          "[service-role-guard] privileged operation attempted without SUPABASE_SERVICE_ROLE_KEY",
        );
        return serviceRoleUnavailableResponse();
      }
      throw err;
    }
  },
);

const serviceRoleGuardFunction = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    try {
      return await next();
    } catch (err) {
      if (isServiceRoleUnavailable(err)) {
        console.warn(
          "[service-role-guard] server fn requires service_role but it is not configured",
        );
        throw serviceRoleUnavailableResponse();
      }
      throw err;
    }
  },
);

export const startInstance = createStart(() => ({
  requestMiddleware: [serviceRoleGuardRequest],
  functionMiddleware: [serviceRoleGuardFunction, attachSupabaseAuth, supabaseAuthHeader],
}));
