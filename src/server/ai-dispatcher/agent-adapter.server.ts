// Adapter-ready слой между UI/API и реальным Radius Track Browser Agent.
// Режимы:
//   - mock                  → используем существующий mock-agent.server.ts
//   - browser_agent_ready   → создаём команды в ai_dispatch_agent_commands
//   - browser_agent_live    → пока отключён (реальный агент подключается на следующем этапе)
//
// НИКАКОГО API ATI. Реальный агент — расширение браузера, работает поверх сайта ATI.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  mockOpenAti, mockRefreshTask, mockFocusCandidate, logAgentEvent,
} from "./mock-agent.server";
import {
  openSearchTab, openCandidateTab, closeTab, markCandidateNotActual as mockMarkNotActual,
} from "./agent-tabs.server";
import {
  createOpenAtiCommand, createRefreshCommand, createFocusCandidateCommand,
  createCloseCandidatePageCommand, createReadVisibleLoadsCommand,
} from "./agent-command.server";

type Client = SupabaseClient<Database>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export type AgentAdapterMode = "mock" | "browser_agent_ready" | "browser_agent_live";

export interface AdapterCtx {
  client: Client;
  dispatcherId: string;
  mode: AgentAdapterMode;
  /** Активная сессия агента (для ready/live режимов). */
  sessionId?: string | null;
}

async function ensureLiveDisabled(ctx: AdapterCtx) {
  if (ctx.mode === "browser_agent_live") {
    await logAgentEvent(ctx.client, ctx.dispatcherId, null, null,
      "browser_agent_live_disabled",
      "Live-режим Browser Agent пока отключён. Используйте mock или ready.");
    throw new Error("browser_agent_live_not_implemented");
  }
}

async function requireSession(ctx: AdapterCtx): Promise<string> {
  if (!ctx.sessionId) throw new Error("agent_session_required");
  return ctx.sessionId;
}

// ─── Public API ─────────────────────────────────────────────────────────
export async function openAtiForTask(ctx: AdapterCtx, taskId: string): Promise<void> {
  await ensureLiveDisabled(ctx);
  if (ctx.mode === "mock") {
    await mockOpenAti(ctx.client, ctx.dispatcherId, taskId);
    await openSearchTab(ctx.client, ctx.dispatcherId, taskId, "https://ati.su/loads/");
    return;
  }
  const s = await requireSession(ctx);
  await createOpenAtiCommand(ctx.client, ctx.dispatcherId, s, taskId);
  await logAgentEvent(ctx.client, ctx.dispatcherId, taskId, null,
    "browser_agent_ready", "Отправлена команда open_ati реальному агенту");
}

export async function startSearchForTask(ctx: AdapterCtx, taskId: string): Promise<void> {
  await ensureLiveDisabled(ctx);
  const c = ctx.client as AnyClient;
  await c.from("ai_dispatch_search_tasks")
    .update({ status: "searching", auto_refresh_enabled: true })
    .eq("id", taskId);
  if (ctx.mode === "browser_agent_ready" && ctx.sessionId) {
    await createOpenAtiCommand(ctx.client, ctx.dispatcherId, ctx.sessionId, taskId);
  }
}

export async function refreshTask(ctx: AdapterCtx, taskId: string) {
  await ensureLiveDisabled(ctx);
  if (ctx.mode === "mock") {
    return mockRefreshTask(ctx.client, ctx.dispatcherId, taskId);
  }
  const s = await requireSession(ctx);
  const id = await createRefreshCommand(ctx.client, ctx.dispatcherId, s, taskId);
  return { created: 0, matched: 0, bestCandidateId: null, command_id: id };
}

export async function focusCandidate(ctx: AdapterCtx, candidateId: string) {
  await ensureLiveDisabled(ctx);
  const c = ctx.client as AnyClient;
  const { data: cand } = await c.from("ai_dispatch_load_candidates")
    .select("id, search_task_id, source_page_url, agent_open_hint_json")
    .eq("id", candidateId).single();
  if (!cand) return;
  if (ctx.mode === "mock") {
    await mockFocusCandidate(ctx.client, ctx.dispatcherId, candidateId);
    await openCandidateTab(ctx.client, ctx.dispatcherId, candidateId,
      cand.source_page_url ?? "https://ati.su/loads/");
    return;
  }
  const s = await requireSession(ctx);
  await createFocusCandidateCommand(
    ctx.client, ctx.dispatcherId, s, cand.search_task_id, candidateId,
    cand.agent_open_hint_json ?? {},
  );
}

export async function closeCandidatePage(ctx: AdapterCtx, candidateId: string, reason = "manual") {
  await ensureLiveDisabled(ctx);
  const c = ctx.client as AnyClient;
  const { data: cand } = await c.from("ai_dispatch_load_candidates")
    .select("id, agent_tab_id").eq("id", candidateId).single();
  if (ctx.mode === "mock") {
    if (cand?.agent_tab_id) {
      await closeTab(ctx.client, ctx.dispatcherId, cand.agent_tab_id, reason);
      await c.from("ai_dispatch_load_candidates").update({ agent_tab_id: null }).eq("id", candidateId);
    }
    return;
  }
  const s = await requireSession(ctx);
  await createCloseCandidatePageCommand(ctx.client, ctx.dispatcherId, s, candidateId);
}

export async function markCandidateNotActual(
  ctx: AdapterCtx, candidateId: string,
  reason: "not_actual" | "closed_by_agent" | "replaced_by_better" | "too_cheap" | "route_mismatch" | "capacity_mismatch",
  message?: string,
) {
  // Пометка «неактуально» — состояние в БД, одинаково для всех режимов.
  await mockMarkNotActual(ctx.client, ctx.dispatcherId, candidateId, reason, message);
  if (ctx.mode === "browser_agent_ready" && ctx.sessionId) {
    await createCloseCandidatePageCommand(ctx.client, ctx.dispatcherId, ctx.sessionId, candidateId);
  }
}

export async function syncAgentTabs(ctx: AdapterCtx): Promise<void> {
  // Заглушка для будущей синхронизации живых вкладок из реального агента.
  // На dev-этапе mock-вкладки уже создаются в openSearchTab/openCandidateTab.
  if (ctx.mode === "browser_agent_ready" && ctx.sessionId) {
    await logAgentEvent(ctx.client, ctx.dispatcherId, null, null,
      "browser_agent_ready", "Ждём отчёт агента о вкладках (POST /tabs)");
  }
}

// ─── Session helpers ────────────────────────────────────────────────────
export async function getActiveSession(
  client: Client, dispatcherId: string,
): Promise<{ id: string; status: string; agent_type: string } | null> {
  const c = client as AnyClient;
  const { data } = await c.from("ai_dispatch_agent_sessions")
    .select("id, status, agent_type")
    .eq("dispatcher_id", dispatcherId)
    .in("status", ["connected", "opening_site", "searching", "reading_page", "refreshing", "waiting_user_login"])
    .order("last_heartbeat_at", { ascending: false, nullsFirst: false })
    .limit(1).maybeSingle();
  return data ?? null;
}

export async function resolveAdapterCtx(
  client: Client, dispatcherId: string, mode: AgentAdapterMode,
): Promise<AdapterCtx> {
  if (mode === "mock") return { client, dispatcherId, mode };
  const s = await getActiveSession(client, dispatcherId);
  return { client, dispatcherId, mode, sessionId: s?.id ?? null };
}
