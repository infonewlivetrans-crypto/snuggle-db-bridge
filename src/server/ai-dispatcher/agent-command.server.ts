// Модуль команд для Radius Track Browser Agent.
// Никакого API ATI. Команды создаёт диспетчер (или adapter),
// реальный agent (в будущем — расширение браузера) выбирает их
// через /api/agent/ai-dispatcher/commands/poll.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { logAgentEvent } from "./mock-agent.server";

type Client = SupabaseClient<Database>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export type AgentCommandType =
  | "open_ati" | "apply_filters" | "start_search" | "refresh_page"
  | "read_visible_loads" | "focus_candidate" | "open_candidate_page"
  | "close_candidate_page" | "close_irrelevant_tabs"
  | "pause_search" | "resume_search" | "stop_search" | "heartbeat_check";

export type AgentCommandStatus =
  | "queued" | "sent" | "acknowledged" | "completed" | "failed" | "expired" | "cancelled";

export interface CreateCommandInput {
  sessionId: string;
  commandType: AgentCommandType;
  searchTaskId?: string | null;
  candidateId?: string | null;
  payload?: Record<string, unknown>;
  expiresInSec?: number;
}

export async function createAgentCommand(
  client: Client,
  dispatcherId: string,
  input: CreateCommandInput,
): Promise<string | null> {
  const c = client as AnyClient;
  const expiresAt = input.expiresInSec
    ? new Date(Date.now() + input.expiresInSec * 1000).toISOString()
    : new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const { data } = await c.from("ai_dispatch_agent_commands").insert({
    dispatcher_id: dispatcherId,
    session_id: input.sessionId,
    search_task_id: input.searchTaskId ?? null,
    candidate_id: input.candidateId ?? null,
    command_type: input.commandType,
    command_payload_json: input.payload ?? {},
    status: "queued",
    expires_at: expiresAt,
  }).select("id").single();
  await logAgentEvent(
    client, dispatcherId, input.searchTaskId ?? null, input.candidateId ?? null,
    "command_created", `Команда агенту: ${input.commandType}`,
    { command_type: input.commandType, session_id: input.sessionId, command_id: data?.id },
  );
  return data?.id ?? null;
}

export async function listPendingAgentCommands(
  client: Client,
  sessionId: string,
  limit = 20,
) {
  const c = client as AnyClient;
  const { data } = await c.from("ai_dispatch_agent_commands")
    .select("*")
    .eq("session_id", sessionId)
    .in("status", ["queued", "sent"])
    .order("created_at", { ascending: true })
    .limit(limit);
  return data ?? [];
}

export async function ackAgentCommand(
  client: Client, dispatcherId: string, commandId: string,
): Promise<void> {
  const c = client as AnyClient;
  const now = new Date().toISOString();
  await c.from("ai_dispatch_agent_commands")
    .update({ status: "acknowledged", acknowledged_at: now, sent_at: now })
    .eq("id", commandId);
  await logAgentEvent(client, dispatcherId, null, null, "command_acknowledged",
    "Агент подтвердил команду", { command_id: commandId });
}

export async function completeAgentCommand(
  client: Client, dispatcherId: string, commandId: string, result?: Record<string, unknown>,
): Promise<void> {
  const c = client as AnyClient;
  await c.from("ai_dispatch_agent_commands").update({
    status: "completed",
    completed_at: new Date().toISOString(),
    result_json: result ?? null,
  }).eq("id", commandId);
  await logAgentEvent(client, dispatcherId, null, null, "command_completed",
    "Команда агента выполнена", { command_id: commandId });
}

export async function failAgentCommand(
  client: Client, dispatcherId: string, commandId: string, error: string,
): Promise<void> {
  const c = client as AnyClient;
  await c.from("ai_dispatch_agent_commands").update({
    status: "failed",
    completed_at: new Date().toISOString(),
    error_message: error,
  }).eq("id", commandId);
  await logAgentEvent(client, dispatcherId, null, null, "command_failed",
    `Команда не выполнена: ${error}`, { command_id: commandId });
}

export async function expireOldCommands(
  client: Client, dispatcherId: string,
): Promise<number> {
  const c = client as AnyClient;
  const { data } = await c.from("ai_dispatch_agent_commands")
    .update({ status: "expired" })
    .lt("expires_at", new Date().toISOString())
    .in("status", ["queued", "sent"])
    .eq("dispatcher_id", dispatcherId)
    .select("id");
  return (data ?? []).length;
}

// ─── Helpers ──────────────────────────────────────────
export const createOpenAtiCommand = (client: Client, d: string, s: string, t: string) =>
  createAgentCommand(client, d, { sessionId: s, searchTaskId: t, commandType: "open_ati" });

export const createRefreshCommand = (client: Client, d: string, s: string, t: string) =>
  createAgentCommand(client, d, { sessionId: s, searchTaskId: t, commandType: "refresh_page" });

export const createFocusCandidateCommand = (
  client: Client, d: string, s: string, t: string | null, cand: string,
  hint?: Record<string, unknown>,
) => createAgentCommand(client, d, {
  sessionId: s, searchTaskId: t, candidateId: cand,
  commandType: "focus_candidate", payload: hint ?? {},
});

export const createCloseCandidatePageCommand = (
  client: Client, d: string, s: string, cand: string,
) => createAgentCommand(client, d, {
  sessionId: s, candidateId: cand, commandType: "close_candidate_page",
});

export const createApplyFiltersCommand = (
  client: Client, d: string, s: string, t: string, filters: Record<string, unknown>,
) => createAgentCommand(client, d, {
  sessionId: s, searchTaskId: t, commandType: "apply_filters", payload: { filters },
});
