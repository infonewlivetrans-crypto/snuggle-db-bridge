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

async function handlePairAuto(request: Request): Promise<Response> {
  // Расширение обменивает одноразовый challenge на agent token.
  // Не требует Authorization. Проверяются challenge_id + secret + origin через RPC.
  const { isTrustedAgentOrigin, normalizeOrigin } = await import("@/lib/ai-dispatcher/agent-origins");
  const body = await readJson(request);
  const challengeId = String(body?.challenge_id ?? "").trim();
  const challengeSecret = String(body?.challenge_secret ?? "").trim();
  const origin = normalizeOrigin(String(body?.origin ?? ""));
  if (!challengeId || !challengeSecret) {
    return jsonResponse({ error: "missing_challenge" }, { status: 400 });
  }
  if (!origin || !isTrustedAgentOrigin(origin)) {
    return jsonResponse({ error: "untrusted_origin" }, { status: 400 });
  }
  const secretHash = hashAgentSecret(challengeSecret);
  const { raw, hash } = generateAgentToken();
  const rpc = makeAnonClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (rpc as any).rpc("agent_consume_pair_challenge", {
    _challenge_id: challengeId,
    _challenge_secret_hash: secretHash,
    _origin: origin,
    _agent_token_hash: hash,
    _agent_version: body?.agent_version ?? null,
    _protocol_version: body?.protocol_version ?? null,
    _browser_name: body?.browser_name ?? null,
    _token_ttl_seconds: 60 * 60 * 24 * 30,
  });
  if (error || !data || !data.length) {
    const msg = String(error?.message ?? "");
    let code = "pair_failed";
    if (msg.includes("challenge_expired")) code = "challenge_expired";
    else if (msg.includes("challenge_already_used")) code = "challenge_already_used";
    else if (msg.includes("origin_mismatch")) code = "origin_mismatch";
    else if (msg.includes("challenge_secret_mismatch")) code = "invalid_challenge_secret";
    else if (msg.includes("challenge_not_found")) code = "challenge_not_found";
    return jsonResponse({ error: code }, { status: 401 });
  }
  const row = data[0] as { session_id: string };
  return jsonResponse({
    agent_token: raw, // возвращается только расширению; не должно уходить в Web
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

// Sanitize RPC advance result before returning to agent.
// Whitelist только UI-safe поля; никаких токенов, dispatcher_id, SQL-текстов.
function sanitizeAdvanceResult(raw: unknown): Record<string, unknown> {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const status = typeof r.status === "string" ? r.status : "unknown";
  const orchestration_status = typeof r.orchestration_status === "string" ? r.orchestration_status : null;
  const next_command_type = typeof r.next_command_type === "string" ? r.next_command_type : null;
  const next_command_id = typeof r.next_command_id === "string" ? r.next_command_id : null;
  const orchestration_error_code = typeof r.orchestration_error_code === "string" ? r.orchestration_error_code : null;
  return {
    advance_status: status,
    already_processed: status === "already_processed",
    stale_ignored: status === "stale_ignored",
    orchestration_status,
    next_command_created: !!next_command_id,
    next_command_type,
    next_command_id,
    orchestration_error_code,
  };
}

async function advanceOrchestrationSafely(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  c: any, tokenHash: string, commandId: string, outcome: string,
  resultJson: unknown, errorMessage: string | null,
): Promise<Record<string, unknown>> {
  try {
    const { data, error } = await c.rpc("agent_advance_orchestration_after_command", {
      _token_hash: tokenHash,
      _command_id: commandId,
      _outcome: outcome,
      _result_json: resultJson ?? {},
      _error_message: errorMessage,
    });
    if (error) return { advance_status: "error", already_processed: false, orchestration_status: null };
    return sanitizeAdvanceResult(data);
  } catch {
    return { advance_status: "error", already_processed: false, orchestration_status: null };
  }
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
    if (error) return jsonResponse({ error: "ack_failed" }, { status: 400 });
    return jsonResponse({ ok: true });
  }
  if (action === "complete") {
    const { error } = await c.rpc("agent_complete_command", {
      _token_hash: auth.tokenHash, _command_id: commandId, _result: body?.result_json ?? {},
    });
    if (error) return jsonResponse({ error: "complete_failed" }, { status: 400 });
    const advance = await advanceOrchestrationSafely(
      c, auth.tokenHash, commandId, "completed", body?.result_json ?? {}, null,
    );
    return jsonResponse({ ok: true, ...advance });
  }
  // action === "fail" — поддерживаем sub-outcome через body.outcome
  const rawOutcome = String(body?.outcome ?? "failed").toLowerCase();
  const outcome = ["failed", "expired", "cancelled", "login_required"].includes(rawOutcome)
    ? rawOutcome : "failed";
  const errMsg = String(body?.error_message ?? (outcome === "expired" ? "agent_timeout" : "unknown"));
  const { error } = await c.rpc("agent_fail_command", {
    _token_hash: auth.tokenHash, _command_id: commandId,
    _error: errMsg, _result: body?.result_json ?? null,
  });
  if (error) return jsonResponse({ error: "fail_failed" }, { status: 400 });
  const advance = await advanceOrchestrationSafely(
    c, auth.tokenHash, commandId, outcome, body?.result_json ?? null, errMsg,
  );
  return jsonResponse({ ok: true, ...advance });
}

async function handleLoginDetected(request: Request): Promise<Response> {
  const auth = await requireAgentToken(request);
  if (auth instanceof Response) return auth;
  const body = await readJson(request);
  const searchTaskId = String(body?.search_task_id ?? "").trim();
  const runId = String(body?.orchestration_run_id ?? "").trim();
  if (!searchTaskId || !runId) {
    return jsonResponse({ error: "missing_params" }, { status: 400 });
  }
  const rpc = makeAnonClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = rpc;
  try {
    const { data, error } = await c.rpc("agent_resume_after_ati_login", {
      _token_hash: auth.tokenHash,
      _search_task_id: searchTaskId,
      _orchestration_run_id: runId,
    });
    if (error) return jsonResponse({ ok: false, error: "resume_failed" }, { status: 400 });
    const sanitized = sanitizeAdvanceResult(data);
    // Лог события (без токенов/dispatcher_id)
    await c.rpc("agent_log_event", {
      _token_hash: auth.tokenHash,
      _event_type: sanitized.advance_status === "ok" ? "ati_login_detected" : "atomic_orchestration_duplicate_ignored",
      _message: sanitized.advance_status === "ok" ? "Вход в ATI обнаружен" : "Повторное событие login_detected",
      _search_task_id: searchTaskId,
      _candidate_id: null,
      _payload: {
        advance_status: sanitized.advance_status,
        orchestration_status: sanitized.orchestration_status,
      },
    });
    return jsonResponse({ ok: true, ...sanitized });
  } catch {
    return jsonResponse({ ok: false, error: "resume_failed" }, { status: 400 });
  }
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
  // read_success=true: сюда мы попадаем только после успешного extraction страницы.
  try {
    await c.rpc("agent_mark_missing_candidates", {
      _token_hash: auth.tokenHash,
      _search_task_id: searchTaskId,
      _seen_dedup_keys: seenKeys,
      _mark_not_actual_after: 3,
      _read_success: true,
      _read_cycle_started_at: body?.read_cycle_started_at ?? null,
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
  // Строгий whitelist. Никаких session/user/token/pairing/dispatcher/candidate/task.
  const { buildPublicHealthPayload } = await import("@/lib/ai-dispatcher/agent-version-contract");
  return jsonResponse(buildPublicHealthPayload());
}

async function handleSessionHealth(request: Request): Promise<Response> {
  const auth = await requireAgentToken(request);
  if (auth instanceof Response) return auth;
  const rpc = makeAnonClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = rpc;
  const { data, error } = await c
    .from("ai_dispatch_agent_sessions")
    .select("id, status, last_heartbeat_at, agent_version, browser_name, active_tab_count, current_task_id, last_action, last_error, revoked_at, agent_token_expires_at, paired_at")
    .eq("id", auth.sessionId)
    .maybeSingle();
  if (error || !data) return jsonResponse({ error: "session_not_found" }, { status: 404 });
  const { getAgentCompatibilityStatus } = await import("@/lib/ai-dispatcher/agent-version-contract");
  const compatibility = getAgentCompatibilityStatus({
    agent_version: data.agent_version,
    protocol_version: null,
    selector_config_version: null,
  });
  const tokenStatus = data.revoked_at
    ? "revoked"
    : data.agent_token_expires_at && new Date(data.agent_token_expires_at).getTime() < Date.now()
      ? "expired" : "active";
  return jsonResponse({
    session_id: data.id,
    status: data.status,
    token_status: tokenStatus,
    last_heartbeat_at: data.last_heartbeat_at,
    agent_version: data.agent_version,
    protocol_version: null,
    selector_config_version: null,
    browser_name: data.browser_name,
    active_tab_count: data.active_tab_count,
    current_task_id: data.current_task_id,
    last_action: data.last_action,
    last_error: data.last_error,
    revoked_at: data.revoked_at,
    expires_at: data.agent_token_expires_at,
    paired_at: data.paired_at,
    compatibility_status: compatibility.status,
    compatibility_reasons: compatibility.reasons,
  });
}

async function handleSchedulerStatus(request: Request, taskId: string): Promise<Response> {
  const auth = await requireAgentToken(request);
  if (auth instanceof Response) return auth;
  if (!taskId) return jsonResponse({ error: "missing_task_id" }, { status: 400 });
  const rpc = makeAnonClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = rpc;
  const { data, error } = await c
    .from("ai_dispatch_search_tasks")
    .select("id, dispatcher_id, status, orchestration_status, auto_refresh_enabled, refresh_interval_seconds, search_mode")
    .eq("id", taskId)
    .maybeSingle();
  if (error || !data) return jsonResponse({ error: "task_not_found" }, { status: 404 });
  if (data.dispatcher_id !== auth.dispatcherId) {
    return jsonResponse({ error: "forbidden" }, { status: 403 });
  }
  const stopStatuses = new Set([
    "paused", "stopped", "failed", "confirmed", "deal_created", "suitable_found",
  ]);
  const should_stop = stopStatuses.has(String(data.status));
  return jsonResponse({
    task_id: data.id,
    active: !should_stop && Boolean(data.auto_refresh_enabled ?? true),
    task_status: data.status ?? null,
    orchestration_status: data.orchestration_status ?? null,
    auto_refresh_enabled: Boolean(data.auto_refresh_enabled ?? true),
    refresh_interval_seconds: Math.max(60, Number(data.refresh_interval_seconds ?? 60)),
    search_mode: data.search_mode ?? null,
    should_stop_scheduler: should_stop,
  });
}

async function router(request: Request, splat: string): Promise<Response> {
  const method = request.method.toUpperCase();
  const parts = splat.split("/").filter(Boolean);
  const [head, mid, tail] = parts;
  // /health (без авторизации) — только whitelist метаданных
  if (head === "health" && method === "GET") return handleHealth();
  // /session-health (Bearer agent_token) — только данные своей сессии
  if (head === "session-health" && method === "GET") return handleSessionHealth(request);
  // /pair
  if (head === "pair" && method === "POST") return handlePair(request);
  // /pair-auto (одноразовый challenge → agent_token только расширению)
  if (head === "pair-auto" && method === "POST") return handlePairAuto(request);
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
  // /login-detected — atomic resume после ручного входа в ATI
  if (head === "login-detected" && method === "POST") return handleLoginDetected(request);
  // /call-queue/:candidate_id
  if (head === "call-queue" && mid && method === "POST") return handleCallQueueAdd(request, mid);
  // /tasks/:id/scheduler-status — UI-safe статус для background scheduler
  if (head === "tasks" && mid && tail === "scheduler-status" && method === "GET") {
    return handleSchedulerStatus(request, mid);
  }
  // /full-scan/(sync-filters|begin|page|complete|status)/:task_id
  if (head === "full-scan" && mid && tail) {
    return handleFullScan(request, mid, tail, method);
  }
  // /candidates/:id/reject
  if (head === "candidates" && mid && tail === "reject" && method === "POST") {
    return handleCandidateReject(request, mid);
  }

  return jsonResponse({
    error: "unknown_agent_endpoint",
    path: splat, method,
    hint: getBearerToken(request) ? "path not supported" : "requires Authorization: Bearer <agent_token>",
  }, { status: 404 });
}

async function handleFullScan(
  request: Request,
  action: string,
  taskId: string,
  method: string,
): Promise<Response> {
  const auth = await requireAgentToken(request);
  if (auth instanceof Response) return auth;
  if (!taskId) return jsonResponse({ error: "missing_task_id" }, { status: 400 });
  const {
    syncFilterFingerprint, beginInitialScan, recordScanPage,
    completeInitialScan, getScanStatus,
  } = await import("@/server/ai-dispatcher/full-scan.server");
  if (action === "status" && method === "GET") {
    const s = await getScanStatus(taskId, auth.dispatcherId);
    if (!s.found) return jsonResponse({ error: "not_found" }, { status: 404 });
    return jsonResponse(s);
  }
  if (method !== "POST") return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
  const body = await readJson(request);
  if (action === "sync-filters") {
    const fp = String(body?.filter_fingerprint ?? "").trim();
    if (!fp) return jsonResponse({ error: "missing_fingerprint" }, { status: 400 });
    const r = await syncFilterFingerprint(taskId, auth.dispatcherId, fp);
    if (!r.ok) return jsonResponse({ error: r.error ?? "sync_failed" }, { status: 400 });
    return jsonResponse({ ok: true, reset: r.reset ?? false, previous_fingerprint: r.previous ?? null });
  }
  if (action === "begin") {
    const r = await beginInitialScan(taskId, auth.dispatcherId);
    if (!r.ok) return jsonResponse({ error: r.error ?? "begin_failed" }, { status: 400 });
    return jsonResponse({ ok: true, status: r.status ?? "running" });
  }
  if (action === "page") {
    const fp = String(body?.page_fingerprint ?? "").trim();
    if (!fp) return jsonResponse({ error: "missing_page_fingerprint" }, { status: 400 });
    const r = await recordScanPage(taskId, auth.dispatcherId, fp);
    if (!r.ok) {
      return jsonResponse(
        { ok: false, reason: r.reason, pages_read: r.pages_read ?? null, continue: false },
        { status: 200 },
      );
    }
    return jsonResponse({ ok: true, continue: true, pages_read: r.pages_read });
  }
  if (action === "complete") {
    const finalStatus = body?.status === "failed" ? "failed" : "done";
    const r = await completeInitialScan(
      taskId, auth.dispatcherId, finalStatus, body?.error ?? null,
    );
    if (!r.ok) return jsonResponse({ error: r.error ?? "complete_failed" }, { status: 400 });
    return jsonResponse({ ok: true, status: finalStatus });
  }
  return jsonResponse({ error: "unknown_full_scan_action" }, { status: 404 });
}

async function handleCandidateReject(request: Request, candidateId: string): Promise<Response> {
  const auth = await requireAgentToken(request);
  if (auth instanceof Response) return auth;
  const body = await readJson(request);
  const reason = String(body?.reason ?? "").trim();
  if (!reason) return jsonResponse({ error: "missing_reason" }, { status: 400 });
  const { markCandidateRejected } = await import("@/server/ai-dispatcher/full-scan.server");
  const r = await markCandidateRejected(candidateId, auth.dispatcherId, {
    rejection_reason: reason,
    rejection_details: body?.details ?? null,
    rating_negative: body?.rating_negative,
    rating_reasons: body?.rating_reasons,
  });
  if (!r.ok) {
    const status = r.error === "not_found" ? 404 : r.error === "forbidden" ? 403 : 400;
    return jsonResponse({ error: r.error ?? "reject_failed" }, { status });
  }
  return jsonResponse({ ok: true });
}

export const Route = createFileRoute("/api/public/agent/ai-dispatcher/$")({
  server: {
    handlers: {
      GET: async ({ request, params }) => router(request, params._splat ?? ""),
      POST: async ({ request, params }) => router(request, params._splat ?? ""),
    },
  },
});
