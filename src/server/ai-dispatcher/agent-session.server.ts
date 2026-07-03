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

import { hashAgentSecret, generatePairingCode } from "./agent-auth.server";

const PAIRING_CODE_TTL_MS = 15 * 60 * 1000;

export async function createSession(
  client: Client, dispatcherId: string,
  input: { agent_type?: "browser_extension" | "desktop_agent" | "mock_agent"; agent_name?: string },
) {
  const c = client as AnyClient;
  const pairingCode = generatePairingCode();
  const expiresAt = new Date(Date.now() + PAIRING_CODE_TTL_MS).toISOString();
  const { data } = await c.from("ai_dispatch_agent_sessions").insert({
    dispatcher_id: dispatcherId,
    agent_type: input.agent_type ?? "browser_extension",
    agent_name: input.agent_name ?? "Radius Track Browser Agent",
    status: "pairing",
    pairing_code_hash: hashAgentSecret(pairingCode),
    pairing_code_expires_at: expiresAt,
  }).select("*").single();
  await logAgentEvent(client, dispatcherId, null, null, "agent_session_created",
    "Создана новая сессия агента", { session_id: data?.id });
  await logAgentEvent(client, dispatcherId, null, null, "agent_pairing_code_created",
    "Сгенерирован код подключения агента");
  return { session: data, pairing_code: pairingCode, pairing_code_expires_at: expiresAt };
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

export async function revokeSession(
  client: Client, dispatcherId: string, id: string,
) {
  const c = client as AnyClient;
  await c.from("ai_dispatch_agent_sessions").update({
    revoked_at: new Date().toISOString(),
    agent_token_hash: null,
    status: "disconnected",
  }).eq("id", id).eq("dispatcher_id", dispatcherId);
  await logAgentEvent(client, dispatcherId, null, null, "agent_disconnected",
    "Токен агента отозван", { session_id: id });
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
