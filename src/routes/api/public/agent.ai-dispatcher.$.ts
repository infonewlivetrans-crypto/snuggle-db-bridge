// Публичные endpoints Radius Track Browser Agent.
// НЕ используют API ATI. Авторизация — Bearer agent_token,
// который проверяется через SECURITY DEFINER RPC agent_verify_token.
// service_role не используется, RLS не отключается.
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, makeAnonClient, getBearerToken } from "@/server/api-helpers.server";
import {
  requireAgentToken, hashAgentSecret, generateAgentToken,
} from "@/server/ai-dispatcher/agent-auth.server";
import { buildLoadDedupKey } from "@/server/ai-dispatcher/load-dedup.server";
import { scoreCandidatesForTask } from "@/server/ai-dispatcher/agent-load-scoring.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyBody = any;

async function readJson(request: Request): Promise<AnyBody> {
  try { return await request.json(); } catch { return {}; }
}

async function handlePair(request: Request): Promise<Response> {
  const body = await readJson(request);
  const code = String(body?.pairing_code ?? "").trim();
  if (!code) return jsonResponse({ error: "missing_pairing_code" }, { status: 400 });
  const codeHash = hashAgentSecret(code);
  const { raw, hash } = generateAgentToken();
  const rpc = makeAnonClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (rpc as any).rpc("agent_pair", {
    _pairing_code_hash: codeHash,
    _agent_token_hash: hash,
    _agent_version: body?.agent_version ?? null,
    _browser_name: body?.browser_name ?? null,
    _token_ttl_seconds: 60 * 60 * 24 * 30,
  });
  if (error) return jsonResponse({ error: "invalid_pairing_code", detail: error.message }, { status: 401 });
  const row = (data as { session_id: string; dispatcher_id: string }[])[0];
  return jsonResponse({
    agent_token: raw, // показывается один раз
    session_id: row.session_id,
    expires_in_seconds: 60 * 60 * 24 * 30,
  });
}

async function handleHeartbeat(request: Request): Promise<Response> {
  const auth = await requireAgentToken(request);
  if (auth instanceof Response) return auth;
  const body = await readJson(request);
  const rpc = makeAnonClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (rpc as any).rpc("agent_heartbeat", {
    _token_hash: auth.tokenHash,
    _agent_version: body?.agent_version ?? null,
    _browser_name: body?.browser_name ?? null,
    _active_tab_count: body?.active_tab_count ?? null,
    _current_url: body?.current_url ?? null,
    _current_task_id: body?.current_task_id ?? null,
    _status: body?.status ?? null,
    _last_action: body?.last_action ?? null,
    _last_error: body?.last_error ?? null,
  });
  return jsonResponse({ ok: true });
}

async function handlePoll(request: Request): Promise<Response> {
  const auth = await requireAgentToken(request);
  if (auth instanceof Response) return auth;
  const rpc = makeAnonClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (rpc as any).rpc("agent_poll_commands", {
    _token_hash: auth.tokenHash, _limit: 20,
  });
  if (error) return jsonResponse({ error: error.message }, { status: 500 });
  return jsonResponse({ commands: data ?? [] });
}

async function handleCommandAction(
  request: Request, action: "ack" | "complete" | "fail", commandId: string,
): Promise<Response> {
  const auth = await requireAgentToken(request);
  if (auth instanceof Response) return auth;
  const body = await readJson(request);
  const rpc = makeAnonClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = rpc;
  if (action === "ack") {
    const { error } = await c.rpc("agent_ack_command", {
      _token_hash: auth.tokenHash, _command_id: commandId,
    });
    if (error) return jsonResponse({ error: error.message }, { status: 400 });
  } else if (action === "complete") {
    const { error } = await c.rpc("agent_complete_command", {
      _token_hash: auth.tokenHash, _command_id: commandId, _result: body?.result_json ?? {},
    });
    if (error) return jsonResponse({ error: error.message }, { status: 400 });
  } else {
    const { error } = await c.rpc("agent_fail_command", {
      _token_hash: auth.tokenHash, _command_id: commandId,
      _error: String(body?.error_message ?? "unknown"), _result: body?.result_json ?? null,
    });
    if (error) return jsonResponse({ error: error.message }, { status: 400 });
  }
  return jsonResponse({ ok: true });
}

async function handleEvents(request: Request): Promise<Response> {
  const auth = await requireAgentToken(request);
  if (auth instanceof Response) return auth;
  const body = await readJson(request);
  const events = Array.isArray(body?.events) ? body.events : [];
  const rpc = makeAnonClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = rpc;
  for (const ev of events) {
    await c.rpc("agent_log_event", {
      _token_hash: auth.tokenHash,
      _event_type: String(ev?.event_type ?? "agent_event"),
      _message: ev?.message ?? null,
      _search_task_id: ev?.search_task_id ?? null,
      _candidate_id: ev?.candidate_id ?? null,
      _payload: ev?.payload ?? {},
    });
  }
  return jsonResponse({ ok: true, saved: events.length });
}

async function handleTabs(request: Request): Promise<Response> {
  const auth = await requireAgentToken(request);
  if (auth instanceof Response) return auth;
  const body = await readJson(request);
  const tabs = Array.isArray(body?.tabs) ? body.tabs : [];
  const rpc = makeAnonClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = rpc;
  const ids: string[] = [];
  for (const t of tabs) {
    const { data } = await c.rpc("agent_upsert_tab", {
      _token_hash: auth.tokenHash,
      _tab_external_id: String(t?.tab_external_id ?? ""),
      _search_task_id: t?.search_task_id ?? null,
      _candidate_id: t?.candidate_id ?? null,
      _tab_type: t?.tab_type ?? "search_page",
      _tab_status: t?.tab_status ?? "open",
      _url: t?.url ?? "",
      _title: t?.title ?? null,
      _close_reason: t?.close_reason ?? null,
    });
    if (data) ids.push(String(data));
  }
  return jsonResponse({ ok: true, tab_ids: ids });
}

async function handleLoads(request: Request): Promise<Response> {
  const auth = await requireAgentToken(request);
  if (auth instanceof Response) return auth;
  const body = await readJson(request);
  const searchTaskId = String(body?.search_task_id ?? "");
  if (!searchTaskId) return jsonResponse({ error: "missing_search_task_id" }, { status: 400 });
  const sourcePageUrl = body?.source_page_url ?? null;
  const loads = Array.isArray(body?.loads) ? body.loads : [];
  const rpc = makeAnonClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = rpc;
  interface UpsertMeta { candidate_id: string; source_row_index: number | null; source_external_ref: string | null; text_hash: string | null; }
  const createdMeta: UpsertMeta[] = [];
  const updatedMeta: UpsertMeta[] = [];
  const skipped: string[] = [];
  const seenKeys: string[] = [];
  for (const load of loads) {
    const key = buildLoadDedupKey(load, sourcePageUrl);
    seenKeys.push(key);
    const payload = { ...load, source_page_url: sourcePageUrl ?? load?.source_page_url ?? null };
    const { data, error } = await c.rpc("agent_upsert_load", {
      _token_hash: auth.tokenHash,
      _search_task_id: searchTaskId,
      _dedup_key: key,
      _payload: payload,
    });
    if (error) { skipped.push(key); continue; }
    const row = (data as { candidate_id: string; was_created: boolean }[])?.[0];
    if (!row) continue;
    const meta: UpsertMeta = {
      candidate_id: row.candidate_id,
      source_row_index: load?.source_row_index ?? null,
      source_external_ref: load?.source_external_ref ?? null,
      text_hash: load?.agent_open_hint_json?.textHash ?? null,
    };
    if (row.was_created) createdMeta.push(meta); else updatedMeta.push(meta);
  }

  // Отметить пропавшие с видимой выдачи кандидаты.
  try {
    await c.rpc("agent_mark_missing_candidates", {
      _token_hash: auth.tokenHash,
      _search_task_id: searchTaskId,
      _seen_dedup_keys: seenKeys,
      _mark_not_actual_after: 3,
    });
  } catch { /* ignore */ }

  // Полноценный server-side scoring для всех новых/обновлённых кандидатов.
  const allIds = [...createdMeta, ...updatedMeta].map((m) => m.candidate_id);
  let bestId: string | null = null;
  let suitableCount = 0;
  let highCount = 0;
  if (allIds.length) {
    try {
      const res = await scoreCandidatesForTask(rpc, auth.tokenHash, searchTaskId, allIds);
      bestId = res.best.id;
      suitableCount = res.suitable;
      highCount = res.high;
    } catch (_e) { /* оставим базовые значения */ }
  }

  // Enrich с scores/status/warnings из БД (уже с новым scoring) для клиента.
  const detailsById = new Map<string, {
    match_score: number | null; profitability_score: number | null; risk_score: number | null;
    status: string | null; ai_summary: string | null; ai_reasons: unknown; ai_warnings: unknown;
    target_progress_percent: number | null; target_status: string | null;
    calculated_profit: number | null; calculated_price_per_km: number | null;
  }>();
  if (allIds.length) {
    const { data: rows } = await c.from("ai_dispatch_load_candidates")
      .select("id, match_score, profitability_score, risk_score, status, ai_summary, ai_reasons, ai_warnings, target_progress_percent, target_status, calculated_profit, calculated_price_per_km")
      .in("id", allIds);
    for (const r of rows ?? []) detailsById.set(r.id, r);
  }
  const enrich = (m: UpsertMeta) => {
    const d = detailsById.get(m.candidate_id);
    return {
      candidate_id: m.candidate_id,
      source_row_index: m.source_row_index,
      source_external_ref: m.source_external_ref,
      text_hash: m.text_hash,
      match_score: d?.match_score ?? null,
      profitability_score: d?.profitability_score ?? null,
      risk_score: d?.risk_score ?? null,
      status: d?.status ?? null,
      ai_summary: d?.ai_summary ?? null,
      ai_reasons: d?.ai_reasons ?? [],
      ai_warnings: d?.ai_warnings ?? [],
      target_progress_percent: d?.target_progress_percent ?? null,
      target_status: d?.target_status ?? null,
      calculated_profit: d?.calculated_profit ?? null,
      calculated_price_per_km: d?.calculated_price_per_km ?? null,
    };
  };
  const created = createdMeta.map(enrich);
  const updated = updatedMeta.map(enrich);
  const suitable_count = suitableCount || [...created, ...updated].filter((x) => (x.match_score ?? 0) >= 60).length;

  await c.rpc("agent_log_event", {
    _token_hash: auth.tokenHash,
    _event_type: "visible_loads_received",
    _message: `visible loads: created=${created.length} updated=${updated.length} suitable=${suitable_count} high=${highCount}`,
    _search_task_id: searchTaskId, _candidate_id: null,
    _payload: { source_page_url: sourcePageUrl, count: loads.length, suitable_count, high_count: highCount },
  });

  return jsonResponse({
    ok: true, created, updated, skipped,
    suitable_count, high_count: highCount, best_candidate_id: bestId,
  });
}

async function handleCallQueueAdd(request: Request, candidateId: string): Promise<Response> {
  const auth = await requireAgentToken(request);
  if (auth instanceof Response) return auth;
  if (!candidateId) return jsonResponse({ error: "missing_candidate_id" }, { status: 400 });
  const body = await readJson(request);
  const rpc = makeAnonClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = rpc;
  const { data, error } = await c.rpc("agent_add_to_call_queue", {
    _token_hash: auth.tokenHash,
    _candidate_id: candidateId,
    _source: String(body?.source ?? "agent"),
    _comment: body?.comment ?? null,
  });
  if (error) {
    return jsonResponse({
      ok: false, status: "failed", error: error.message,
    }, { status: error.message?.includes("invalid_candidate") ? 404 : 400 });
  }
  const row = (data as { status: string; queue_id: string }[])?.[0];
  const status = row?.status ?? "failed";
  return jsonResponse({
    ok: status !== "failed",
    status,
    already: status === "already_exists",
    queue_id: row?.queue_id ?? null,
  });
}

async function handleHealth(): Promise<Response> {
  return jsonResponse({ ok: true, ts: new Date().toISOString(), service: "radius-track-agent-endpoint" });
}

async function router(request: Request, splat: string): Promise<Response> {
  const method = request.method.toUpperCase();
  const parts = splat.split("/").filter(Boolean);
  const [head, mid, tail] = parts;
  // /health (без авторизации) — для popup-теста
  if (head === "health" && method === "GET") return handleHealth();
  // /pair
  if (head === "pair" && method === "POST") return handlePair(request);
  // /heartbeat
  if (head === "heartbeat" && method === "POST") return handleHeartbeat(request);
  // /commands/poll (GET)
  if (head === "commands" && mid === "poll" && method === "GET") return handlePoll(request);
  // /commands/:id/(ack|complete|fail)
  if (head === "commands" && mid && tail && method === "POST") {
    if (tail === "ack" || tail === "complete" || tail === "fail") {
      return handleCommandAction(request, tail, mid);
    }
  }
  // /events
  if (head === "events" && method === "POST") return handleEvents(request);
  // /tabs
  if (head === "tabs" && method === "POST") return handleTabs(request);
  // /loads
  if (head === "loads" && method === "POST") return handleLoads(request);
  // /call-queue/:candidate_id
  if (head === "call-queue" && mid && method === "POST") return handleCallQueueAdd(request, mid);

  return jsonResponse({
    error: "unknown_agent_endpoint",
    path: splat, method,
    hint: getBearerToken(request) ? "path not supported" : "requires Authorization: Bearer <agent_token>",
  }, { status: 404 });
}

export const Route = createFileRoute("/api/public/agent/ai-dispatcher/$")({
  server: {
    handlers: {
      GET: async ({ request, params }) => router(request, params._splat ?? ""),
      POST: async ({ request, params }) => router(request, params._splat ?? ""),
    },
  },
});
