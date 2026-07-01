// Mock-эмуляция вкладок Radius Track Browser Agent (по сайту ATI).
// API ATI не используется. Настоящий агент будет подключён следующим этапом.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { logAgentEvent } from "./mock-agent.server";

type Client = SupabaseClient<Database>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export async function openSearchTab(
  client: Client,
  dispatcherId: string,
  taskId: string,
  url: string,
): Promise<string | null> {
  const c = client as AnyClient;
  const { data } = await c.from("ai_dispatch_agent_tabs").insert({
    dispatcher_id: dispatcherId,
    search_task_id: taskId,
    tab_type: "search_page",
    tab_status: "active",
    url,
    title: "ATI — поиск (mock)",
    opened_at: new Date().toISOString(),
    last_active_at: new Date().toISOString(),
  }).select("id").single();
  await logAgentEvent(client, dispatcherId, taskId, null, "ati_search_page_opened",
    `Открыта mock-вкладка поиска ATI: ${url}`);
  return data?.id ?? null;
}

export async function openCandidateTab(
  client: Client,
  dispatcherId: string,
  candidateId: string,
  url: string,
): Promise<string | null> {
  const c = client as AnyClient;
  const { data: cand } = await c.from("ai_dispatch_load_candidates")
    .select("search_task_id").eq("id", candidateId).single();
  const { data } = await c.from("ai_dispatch_agent_tabs").insert({
    dispatcher_id: dispatcherId,
    search_task_id: cand?.search_task_id ?? null,
    candidate_id: candidateId,
    tab_type: "candidate_page",
    tab_status: "focused",
    url,
    title: "ATI — карточка груза (mock)",
    opened_at: new Date().toISOString(),
    last_active_at: new Date().toISOString(),
  }).select("id").single();
  if (data?.id) {
    await c.from("ai_dispatch_load_candidates")
      .update({ agent_tab_id: data.id }).eq("id", candidateId);
  }
  await logAgentEvent(client, dispatcherId, cand?.search_task_id ?? null, candidateId,
    "candidate_page_opened", `Открыта карточка груза на ATI (mock): ${url}`);
  return data?.id ?? null;
}

export async function closeTab(
  client: Client,
  dispatcherId: string,
  tabId: string,
  reason: string,
): Promise<void> {
  const c = client as AnyClient;
  await c.from("ai_dispatch_agent_tabs").update({
    tab_status: "closed",
    closed_at: new Date().toISOString(),
    close_reason: reason,
  }).eq("id", tabId).eq("dispatcher_id", dispatcherId);
  await logAgentEvent(client, dispatcherId, null, null, "candidate_page_closed",
    `Вкладка агента закрыта (${reason})`);
}

export async function markCandidateNotActual(
  client: Client,
  dispatcherId: string,
  candidateId: string,
  reason: "not_actual" | "closed_by_agent" | "replaced_by_better" | "too_cheap" | "route_mismatch" | "capacity_mismatch",
  message?: string,
): Promise<void> {
  const c = client as AnyClient;
  const { data: cand } = await c.from("ai_dispatch_load_candidates")
    .select("id, agent_tab_id, search_task_id").eq("id", candidateId).single();
  if (!cand) return;
  await c.from("ai_dispatch_load_candidates").update({
    status: "not_actual",
    not_actual_reason: reason,
  }).eq("id", candidateId);
  await logAgentEvent(client, dispatcherId, cand.search_task_id, candidateId,
    "candidate_became_not_actual",
    message ?? `Груз помечен неактуальным (${reason})`);
  if (cand.agent_tab_id) {
    await closeTab(client, dispatcherId, cand.agent_tab_id, `irrelevant:${reason}`);
    await logAgentEvent(client, dispatcherId, cand.search_task_id, candidateId,
      "irrelevant_page_closed", "Mock-вкладка закрыта — груз неактуален");
  }
}
