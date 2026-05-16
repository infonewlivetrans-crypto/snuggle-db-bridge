import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import { getSessionUser } from "@/server/auth-cookies.server";

type AppRole = Database["public"]["Enums"]["app_role"];

function unauth(): never {
  throw new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
}

function makeClientFor(token: string) {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
  const key =
    process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";

  return createClient<Database>(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function requireAuthenticatedUserId(): Promise<string> {
  const session = await getSessionUser();
  if (session?.userId) return session.userId;

  const req = getRequest();
  const authHeader = req?.headers?.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) unauth();

  const token = authHeader.slice(7).trim();
  if (!token) unauth();

  const client = makeClientFor(token);
  try {
    const { data, error } = await client.auth.getClaims(token);
    if (error || !data?.claims?.sub) unauth();
    return data.claims.sub as string;
  } catch {
    unauth();
  }
}

export async function assertCallerIsAdmin(userId: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new Error("Доступ запрещён: требуется роль администратора");
  }
}

export async function assertCallerHasAnyRole(userId: string, roles: readonly AppRole[]): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", [...roles]);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new Error("Доступ запрещён: недостаточно прав");
  }
}