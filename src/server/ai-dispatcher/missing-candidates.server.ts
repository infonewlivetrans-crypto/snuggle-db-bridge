// Block 3B — управление пропавшими кандидатами (missing/reappeared/archive/restore/recheck).
// Никаких service_role. Все действия под RLS диспетчера.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { logAgentEvent } from "./mock-agent.server";
import { getActiveSession } from "./agent-adapter.server";
import { createReadVisibleLoadsCommand } from "./agent-command.server";

type AnyClient = any;

const CLOSED_STATUSES = new Set([
  "rejected",
  "archived",
  "closed_by_dispatcher",
  "deal_created",
  "confirmed",
]);

/** Проверить, что кандидат принадлежит диспетчеру (по search_task). */
export async function assertCandidateAccess(
  client: AnyClient,
  dispatcherId: string,
  candidateId: string,
): Promise<{ id: string; search_task_id: string; status: string; not_actual_reason: string | null; missing_seen_count: number }> {
  const { data, error } = await client
    .from("ai_dispatch_load_candidates")
    .select("id, search_task_id, status, not_actual_reason, missing_seen_count")
    .eq("id", candidateId)
    .maybeSingle();
  if (error || !data) throw new Error("candidate_not_found");
  const { data: task } = await client
    .from("ai_dispatch_search_tasks")
    .select("id, dispatcher_id")
    .eq("id", data.search_task_id)
    .maybeSingle();
  if (!task || task.dispatcher_id !== dispatcherId) throw new Error("forbidden");
  return data;
}

/** Вернуть кандидата в основной список после ручного пропадания или not_actual/missing_from_page. */
export async function restoreCandidate(
  client: AnyClient,
  dispatcherId: string,
  candidateId: string,
): Promise<void> {
  const cand = await assertCandidateAccess(client, dispatcherId, candidateId);
  if (CLOSED_STATUSES.has(cand.status) && cand.status !== "archived") {
    throw new Error(`cannot_restore_status_${cand.status}`);
  }
  const patch: Record<string, unknown> = {
    missing_seen_count: 0,
    last_missing_at: null,
  };
  // Если помечен not_actual по missing_from_page — сбрасываем в new (пересчёт скорингом).
  if (cand.status === "not_actual" && cand.not_actual_reason === "missing_from_page") {
    patch.status = "new";
    patch.not_actual_reason = null;
  } else if (cand.status === "archived") {
    patch.status = "new";
  }
  await client.from("ai_dispatch_load_candidates").update(patch).eq("id", candidateId);
  await logAgentEvent(client, dispatcherId, cand.search_task_id, candidateId,
    "candidate_restored_by_dispatcher" as never,
    "Кандидат восстановлен диспетчером",
    { previous_status: cand.status, previous_not_actual_reason: cand.not_actual_reason });
}

/** Архивировать кандидата (сохранить историю, скрыть из основного списка). */
export async function archiveCandidate(
  client: AnyClient,
  dispatcherId: string,
  candidateId: string,
  comment?: string,
): Promise<void> {
  const cand = await assertCandidateAccess(client, dispatcherId, candidateId);
  const patch: Record<string, unknown> = { status: "archived" };
  if (comment && typeof comment === "string") patch.dispatcher_comment = comment.slice(0, 500);
  await client.from("ai_dispatch_load_candidates").update(patch).eq("id", candidateId);
  await logAgentEvent(client, dispatcherId, cand.search_task_id, candidateId,
    "candidate_archived_by_dispatcher" as never,
    "Кандидат отправлен в архив",
    { previous_status: cand.status });
}

/** Попросить агента перечитать страницу задачи (визуальный recheck). */
export async function requestRecheck(
  client: AnyClient,
  dispatcherId: string,
  candidateId: string,
): Promise<{ command_id: string | null }> {
  const cand = await assertCandidateAccess(client, dispatcherId, candidateId);
  await logAgentEvent(client, dispatcherId, cand.search_task_id, candidateId,
    "candidate_recheck_requested" as never,
    "Диспетчер запросил повторное чтение страницы");
  const session = await getActiveSession(client, dispatcherId);
  if (!session) return { command_id: null };
  const cmdId = await createReadVisibleLoadsCommand(client, dispatcherId, session.id, cand.search_task_id);
  return { command_id: cmdId ?? null };
}

/** Список пропавших/неактуальных/архивных/снова появившихся для задачи или диспетчера. */
export interface MissingCandidateRow {
  id: string;
  search_task_id: string;
  status: string;
  not_actual_reason: string | null;
  missing_seen_count: number;
  last_missing_at: string | null;
  last_seen_at: string | null;
  seen_count: number;
  pickup_city: string | null;
  delivery_city: string | null;
  cargo_name: string | null;
  weight: number | null;
  volume: number | null;
  price: number | null;
  price_per_km: number | null;
  match_score: number | null;
  updated_at: string;
  dispatcher_comment: string | null;
  group: "missing_1" | "missing_2" | "not_actual" | "archived" | "reappeared";
}

export async function listMissingForTask(
  client: AnyClient,
  dispatcherId: string,
  searchTaskId: string,
): Promise<MissingCandidateRow[]> {
  const { data: task } = await client
    .from("ai_dispatch_search_tasks")
    .select("id, dispatcher_id")
    .eq("id", searchTaskId)
    .maybeSingle();
  if (!task || task.dispatcher_id !== dispatcherId) throw new Error("forbidden");

  const { data } = await client
    .from("ai_dispatch_load_candidates")
    .select(
      "id, search_task_id, status, not_actual_reason, missing_seen_count, last_missing_at, last_seen_at, seen_count, pickup_city, delivery_city, cargo_name, weight, volume, price, price_per_km, match_score, updated_at, dispatcher_comment",
    )
    .eq("search_task_id", searchTaskId)
    .or("missing_seen_count.gt.0,status.eq.not_actual,status.eq.archived")
    .order("updated_at", { ascending: false })
    .limit(200);

  const rows: MissingCandidateRow[] = (data ?? []).map((r: any) => ({
    ...r,
    group: classifyGroup(r),
  }));

  // Reappeared: недавно снова увиденные (last_seen_at > last_missing_at). Их вернём отдельным запросом.
  const { data: reapp } = await client
    .from("ai_dispatch_load_candidates")
    .select(
      "id, search_task_id, status, not_actual_reason, missing_seen_count, last_missing_at, last_seen_at, seen_count, pickup_city, delivery_city, cargo_name, weight, volume, price, price_per_km, match_score, updated_at, dispatcher_comment",
    )
    .eq("search_task_id", searchTaskId)
    .not("last_missing_at", "is", null)
    .eq("missing_seen_count", 0)
    .gte("last_seen_at", new Date(Date.now() - 24 * 3600_000).toISOString())
    .order("last_seen_at", { ascending: false })
    .limit(100);
  for (const r of reapp ?? []) {
    if (!rows.find((x) => x.id === r.id)) {
      rows.push({ ...(r as any), group: "reappeared" });
    }
  }
  return rows;
}

function classifyGroup(r: any): MissingCandidateRow["group"] {
  if (r.status === "archived") return "archived";
  if (r.status === "not_actual") return "not_actual";
  if (r.missing_seen_count >= 2) return "missing_2";
  if (r.missing_seen_count >= 1) return "missing_1";
  return "not_actual";
}
