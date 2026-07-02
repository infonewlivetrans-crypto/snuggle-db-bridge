// Управление сессиями Radius Track Browser Agent.
// dev/mock: pairing-код генерируется на клиенте, реального агента ещё нет.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { logAgentEvent } from "./mock-agent.server";

type Client = SupabaseClient<Database>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export async function listSessions(client: Client, dispatcherId: string) {
  const c = client as AnyClient;
  const { data } = await c.from("ai_dispatch_agent_sessions")
    .select("*")
    .eq("dispatcher_id", dispatcherId)
    .order("created_at", { ascending: false })
    .limit(20);
  return data ?? [];
}

export async function getSession(client: Client, dispatcherId: string, id: string) {
  const c = client as AnyClient;
  const { data } = await c.from("ai_dispatch_agent_sessions")
    .select("*").eq("id", id).eq("dispatcher_id", dispatcherId).maybeSingle();
  return data;
}

function hashCode(code: string): string {
  // Небольшой не-крипто хеш (dev only). Реальный агент подтверждает pairing
  // через отдельный обмен, здесь мы храним только маскирующий отпечаток.
  let h = 0;
  for (let i = 0; i < code.length; i++) h = ((h << 5) - h + code.charCodeAt(i)) | 0;
  return `dev_${(h >>> 0).toString(16)}`;
}

export async function createSession(
  client: Client, dispatcherId: string,
  input: { agent_type?: "browser_extension" | "desktop_agent" | "mock_agent"; agent_name?: string },
) {
  const c = client as AnyClient;
  const pairingCode = Math.random().toString(36).slice(2, 8).toUpperCase();
  const { data } = await c.from("ai_dispatch_agent_sessions").insert({
    dispatcher_id: dispatcherId,
    agent_type: input.agent_type ?? "browser_extension",
    agent_name: input.agent_name ?? "Radius Track Browser Agent",
    status: "pairing",
    pairing_code_hash: hashCode(pairingCode),
  }).select("*").single();
  await logAgentEvent(client, dispatcherId, null, null, "agent_session_created",
    "Создана новая сессия агента", { session_id: data?.id });
  await logAgentEvent(client, dispatcherId, null, null, "agent_pairing_code_created",
    "Сгенерирован код подключения агента (dev)");
  return { session: data, pairing_code: pairingCode };
}

export async function mockConnectSession(
  client: Client, dispatcherId: string, id: string,
) {
  const c = client as AnyClient;
  const now = new Date().toISOString();
  await c.from("ai_dispatch_agent_sessions").update({
    status: "connected",
    paired_at: now,
    last_heartbeat_at: now,
    agent_version: "0.0.1-mock",
    browser_name: "Chrome",
  }).eq("id", id).eq("dispatcher_id", dispatcherId);
  await logAgentEvent(client, dispatcherId, null, null, "agent_connected",
    "Агент подключён (mock)", { session_id: id });
}

export async function disconnectSession(
  client: Client, dispatcherId: string, id: string,
) {
  const c = client as AnyClient;
  await c.from("ai_dispatch_agent_sessions").update({
    status: "disconnected",
  }).eq("id", id).eq("dispatcher_id", dispatcherId);
  await logAgentEvent(client, dispatcherId, null, null, "agent_disconnected",
    "Агент отключён", { session_id: id });
}

export async function recordHeartbeat(
  client: Client, dispatcherId: string, id: string,
  patch?: { status?: string; active_tab_count?: number; current_task_id?: string | null },
) {
  const c = client as AnyClient;
  await c.from("ai_dispatch_agent_sessions").update({
    last_heartbeat_at: new Date().toISOString(),
    ...(patch?.status ? { status: patch.status } : {}),
    ...(typeof patch?.active_tab_count === "number" ? { active_tab_count: patch.active_tab_count } : {}),
    ...(patch?.current_task_id !== undefined ? { current_task_id: patch.current_task_id } : {}),
  }).eq("id", id).eq("dispatcher_id", dispatcherId);
  await logAgentEvent(client, dispatcherId, null, null, "agent_heartbeat_received",
    "Heartbeat агента", { session_id: id });
}
