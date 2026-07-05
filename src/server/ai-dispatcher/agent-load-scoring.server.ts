// Server-side scoring грузов, пришедших от Browser Agent.
// НИКАКОГО API ATI. Используются данные с открытой страницы ATI,
// сохранённые через SECURITY DEFINER RPC agent_upsert_load.
// Обновление scoring — тоже через безопасный RPC agent_update_candidate_scoring,
// который проверяет agent token и принадлежность кандидата.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Client = SupabaseClient<Database>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export type TargetStatus =
  | "target_not_reached"
  | "target_almost_reached"
  | "target_reached"
  | "target_exceeded"
  | "no_target";

export interface ScoringInput {
  candidate: Record<string, unknown>;
  task: Record<string, unknown>;
  mode?: "main" | "additional";
}

export interface ScoringResult {
  match_score: number;
  profitability_score: number;
  risk_score: number;
  summary: string;
  reasons: string[];
  warnings: string[];
  calculated_profit: number | null;
  calculated_price_per_km: number | null;
  target_progress_percent: number | null;
  target_status: TargetStatus;
  new_status: string;
}

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function calcEconomics(cand: Record<string, unknown>, task: Record<string, unknown>) {
  const price = num(cand.price) ?? 0;
  const distance = num(cand.distance_km) ?? 0;
  const fuelL = num(task.fuel_consumption_l_per_100km) ?? 32;
  const fuelPrice = num(task.fuel_price_per_l) ?? 65;
  const other = num(task.other_expenses) ?? 0;
  const commPct = num(task.commission_percent) ?? 0;
  const fuelCost = distance > 0 ? (distance * fuelL / 100) * fuelPrice : 0;
  const commission = price * (commPct / 100);
  const profit = price - fuelCost - other - commission;
  const perKm = distance > 0 ? price / distance : null;
  return { profit, perKm, fuelCost };
}

export function calculateTargetProgress(
  totalPrice: number,
  target: number | null,
): { percent: number | null; status: TargetStatus } {
  if (!target || target <= 0) return { percent: null, status: "no_target" };
  const pct = Math.round((totalPrice / target) * 100);
  let status: TargetStatus;
  if (pct >= 110) status = "target_exceeded";
  else if (pct >= 100) status = "target_reached";
  else if (pct >= 85) status = "target_almost_reached";
  else status = "target_not_reached";
  return { percent: pct, status };
}

export function scoreAgentLoadCandidate(input: ScoringInput): ScoringResult {
  const { candidate: cand, task } = input;
  const mode = input.mode ?? (cand.is_additional_load ? "additional" : "main");

  const price = num(cand.price);
  const perKmRaw = num(cand.price_per_km);
  const weight = num(cand.weight);
  const volume = num(cand.volume);
  const bodyType = str(cand.body_type);
  const loadingType = str(cand.loading_type);
  const pickupCity = str(cand.pickup_city);
  const deliveryCity = str(cand.delivery_city);
  const distance = num(cand.distance_km);

  const vp = ((task.vehicle_params_json ?? {}) as Record<string, unknown>) ?? {};
  const vehBody = str(vp.body_type);
  const vehLoading = str(vp.loading_type);
  const capW = (num(vp.tonnage) ?? num(vp.capacity_t) ?? 0) * 1000;
  const capV = num(vp.volume_m3) ?? num(vp.volume) ?? 0;
  const homeCity = str(task.start_city) ?? str(vp.home_city);
  const destCity = str(task.destination_city);

  const minPrice = num(task.min_price);
  const minPerKm = num(task.min_price_per_km);
  const targetTotal = num(task.target_total_price);
  const targetPerKm = num(task.target_price_per_km);
  const targetProfit = num(task.target_net_profit);
  const targetBundle = num(task.target_bundle_price);

  const reasons: string[] = [];
  const warnings: string[] = [];

  const econ = calcEconomics(cand, task);
  const effectivePerKm = perKmRaw ?? econ.perKm ?? null;

  let match = 40; // базовый
  let profitability = 40;
  let risk = 20;

  // Match: направление
  if (pickupCity && homeCity && pickupCity.toLowerCase().includes(homeCity.toLowerCase())) {
    match += 15; reasons.push(`Подача из ${homeCity}`);
  }
  if (destCity && deliveryCity && deliveryCity.toLowerCase().includes(destCity.toLowerCase())) {
    match += 15; reasons.push(`В нужное направление (${destCity})`);
  } else if (destCity && deliveryCity) {
    warnings.push(`Выгрузка ${deliveryCity} ≠ целевое направление ${destCity}`);
  }

  // Match: вес/объём
  if (capW > 0 && weight != null) {
    if (weight > capW) { match -= 30; warnings.push(`Перевес: ${weight} кг > ${capW} кг`); risk += 30; }
    else if (weight >= capW * 0.6) { match += 10; reasons.push("Хорошая загрузка по весу"); }
  }
  if (capV > 0 && volume != null) {
    if (volume > capV) { match -= 20; warnings.push(`Превышен объём: ${volume} > ${capV}`); risk += 15; }
  }

  // Кузов / загрузка
  if (vehBody && bodyType && vehBody.toLowerCase() !== bodyType.toLowerCase()) {
    match -= 8; warnings.push(`Кузов: груз «${bodyType}», машина «${vehBody}»`);
  }
  if (vehLoading && loadingType && !loadingType.toLowerCase().includes(vehLoading.toLowerCase())) {
    warnings.push(`Загрузка: «${loadingType}» vs «${vehLoading}»`);
  }

  // Экономика: мин ставка / мин ₽/км
  if (minPrice && price != null) {
    if (price < minPrice) { profitability -= 25; warnings.push(`Ниже минимальной ставки ${minPrice} ₽`); }
    else { profitability += 10; }
  }
  if (minPerKm && effectivePerKm != null) {
    if (effectivePerKm < minPerKm) { profitability -= 20; warnings.push(`Ниже мин. ₽/км (${minPerKm})`); }
    else { profitability += 10; }
  }

  // Экономика: прибыль/цель
  if (econ.profit > 0) { profitability += 15; reasons.push(`Расчётная прибыль ~${Math.round(econ.profit)} ₽`); }
  else { profitability -= 20; warnings.push(`Убыточно: ~${Math.round(econ.profit)} ₽`); }
  if (targetProfit && econ.profit < targetProfit) {
    warnings.push(`Прибыль ниже целевой (${Math.round(econ.profit)} < ${targetProfit})`);
  }
  if (targetPerKm && effectivePerKm != null && effectivePerKm >= targetPerKm) {
    profitability += 15; reasons.push(`₽/км достигает цели (${targetPerKm})`);
  }

  // Догруз: осторожность
  if (mode === "additional") {
    if (distance == null) warnings.push("Отклонение от маршрута неизвестно — оценка предварительная");
    risk += 10;
  }

  // Target progress по одиночному грузу
  const target = targetTotal ?? targetBundle ?? null;
  const totalPrice = price ?? 0;
  const { percent, status } = calculateTargetProgress(totalPrice, target);
  if (status === "target_reached" || status === "target_exceeded") {
    reasons.push("Цель по ставке достигнута");
    match += 10;
  } else if (status === "target_almost_reached") {
    reasons.push(`Почти цель (${percent}%)`);
    match += 5;
  }

  // Clamp
  match = Math.max(0, Math.min(100, Math.round(match)));
  profitability = Math.max(0, Math.min(100, Math.round(profitability)));
  risk = Math.max(0, Math.min(100, Math.round(risk)));

  const summary = mode === "additional"
    ? `Догруз ${pickupCity ?? "?"} → ${deliveryCity ?? "?"} · score ${match}`
    : `${pickupCity ?? "?"} → ${deliveryCity ?? "?"} · ставка ${price ?? "?"} ₽ · score ${match}`;

  let newStatus = "new";
  if (match >= 80) newStatus = "high_match";
  else if (match >= 60) newStatus = "suitable";
  else newStatus = "low_match";

  return {
    match_score: match,
    profitability_score: profitability,
    risk_score: risk,
    summary,
    reasons,
    warnings,
    calculated_profit: Number.isFinite(econ.profit) ? Math.round(econ.profit) : null,
    calculated_price_per_km: effectivePerKm != null ? Math.round(effectivePerKm) : null,
    target_progress_percent: percent,
    target_status: status,
    new_status: newStatus,
  };
}

export const scoreAgentMainLoad = (i: Omit<ScoringInput, "mode">): ScoringResult =>
  scoreAgentLoadCandidate({ ...i, mode: "main" });
export const scoreAgentAdditionalLoad = (i: Omit<ScoringInput, "mode">): ScoringResult =>
  scoreAgentLoadCandidate({ ...i, mode: "additional" });

/** Прогнать scoring для набора кандидатов от агента и записать результат
 *  через безопасный RPC agent_update_candidate_scoring. */
export async function scoreCandidatesForTask(
  client: Client,
  tokenHash: string,
  taskId: string,
  candidateIds: string[],
): Promise<{ scored: number; best: { id: string | null; score: number }; suitable: number; high: number; }> {
  if (candidateIds.length === 0) return { scored: 0, best: { id: null, score: -1 }, suitable: 0, high: 0 };
  const c = client as AnyClient;
  const { data: task } = await c.from("ai_dispatch_search_tasks").select("*").eq("id", taskId).maybeSingle();
  if (!task) return { scored: 0, best: { id: null, score: -1 }, suitable: 0, high: 0 };
  const { data: cands } = await c.from("ai_dispatch_load_candidates").select("*").in("id", candidateIds);
  const rows = (cands ?? []) as Record<string, unknown>[];

  let best: { id: string | null; score: number } = { id: null, score: -1 };
  let suitable = 0, high = 0, scored = 0;

  for (const cand of rows) {
    const mode: "main" | "additional" = cand.is_additional_load ? "additional" : "main";
    const result = scoreAgentLoadCandidate({ candidate: cand, task: task as Record<string, unknown>, mode });
    scored++;
    if (result.match_score > best.score) best = { id: cand.id as string, score: result.match_score };
    if (result.match_score >= 60) suitable++;
    if (result.match_score >= 80) high++;

    await c.rpc("agent_update_candidate_scoring", {
      _token_hash: tokenHash,
      _candidate_id: cand.id,
      _match_score: result.match_score,
      _profitability_score: result.profitability_score,
      _risk_score: result.risk_score,
      _summary: result.summary,
      _reasons: result.reasons,
      _warnings: result.warnings,
      _calculated_profit: result.calculated_profit,
      _calculated_price_per_km: result.calculated_price_per_km,
      _target_progress_percent: result.target_progress_percent,
      _target_status: result.target_status,
      _new_status: result.new_status,
    });

    if (result.match_score >= 80) {
      await c.rpc("agent_log_event", {
        _token_hash: tokenHash,
        _event_type: "high_score_load_found",
        _message: `high_score_load_found: ${result.match_score}`,
        _search_task_id: taskId, _candidate_id: cand.id,
        _payload: { score: result.match_score, target_status: result.target_status },
      });
    } else if (result.match_score >= 60) {
      await c.rpc("agent_log_event", {
        _token_hash: tokenHash,
        _event_type: "suitable_load_found",
        _message: `suitable_load_found: ${result.match_score}`,
        _search_task_id: taskId, _candidate_id: cand.id,
        _payload: { score: result.match_score, target_status: result.target_status },
      });
    }
    if (result.target_status === "target_reached" || result.target_status === "target_exceeded") {
      await c.rpc("agent_log_event", {
        _token_hash: tokenHash, _event_type: "target_reached",
        _message: "Цель по ставке достигнута",
        _search_task_id: taskId, _candidate_id: cand.id, _payload: {},
      });
    } else if (result.target_status === "target_almost_reached") {
      await c.rpc("agent_log_event", {
        _token_hash: tokenHash, _event_type: "target_almost_reached",
        _message: `Почти цель: ${result.target_progress_percent}%`,
        _search_task_id: taskId, _candidate_id: cand.id, _payload: {},
      });
    }
  }

  await c.rpc("agent_update_task_search_result", {
    _token_hash: tokenHash,
    _task_id: taskId,
    _best_candidate_id: best.id,
    _matched_count: suitable,
  });

  return { scored, best, suitable, high };
}
