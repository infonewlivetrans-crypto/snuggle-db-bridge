// AI Dispatcher — mock Browser Agent (Radius Track Agent).
// ВНИМАНИЕ: реальный браузерный агент будет подключён следующим этапом.
// Здесь — dev/Lovable симулятор: создаёт события, генерирует кандидатов,
// двигает счётчики обновлений. API ATI НЕ используется и не планируется.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Client = SupabaseClient<Database>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export type AgentEventType =
  | "search_button_clicked"
  | "ati_open_requested"
  | "ati_opened"
  | "login_required"
  | "filters_ready"
  | "refresh_started"
  | "refresh_completed"
  | "suitable_load_found"
  | "focus_candidate_requested"
  | "candidate_focused_on_site"
  | "main_load_selected"
  | "additional_search_requested"
  | "call_list_added"
  | "call_started"
  | "call_result_saved"
  | "ati_search_page_opened"
  | "filters_detected"
  | "filters_applied_mock"
  | "page_refresh_scheduled"
  | "page_refreshed"
  | "candidate_seen"
  | "candidate_updated"
  | "candidate_became_not_actual"
  | "candidate_focused"
  | "candidate_page_opened"
  | "candidate_page_closed"
  | "irrelevant_page_closed"
  | "bundle_suggested"
  | "multi_vehicle_cycle_started"
  | "multi_vehicle_cycle_completed";

export async function logAgentEvent(
  client: Client,
  dispatcherId: string,
  taskId: string | null,
  candidateId: string | null,
  eventType: AgentEventType,
  message?: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: Record<string, any>,
) {
  const c = client as AnyClient;
  await c.from("ai_dispatch_agent_events").insert({
    dispatcher_id: dispatcherId,
    search_task_id: taskId,
    candidate_id: candidateId,
    event_type: eventType,
    message: message ?? null,
    event_payload: payload ?? null,
  });
}

const CITIES = ["Москва", "Санкт-Петербург", "Казань", "Нижний Новгород", "Екатеринбург", "Самара", "Воронеж"];
const CARGOS = ["Стройматериалы", "Продукты питания", "Электроника", "Мебель", "Запчасти", "Бумага"];
const BODY_TYPES = ["тент", "изотерм", "рефрижератор", "борт"];

function rnd<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] as T;
}
function rndN(min: number, max: number): number {
  return Math.round(min + Math.random() * (max - min));
}

export async function mockRefreshTask(
  client: Client,
  dispatcherId: string,
  taskId: string,
): Promise<{ created: number; matched: number; bestCandidateId: string | null }> {
  const c = client as AnyClient;
  const { data: task } = await c
    .from("ai_dispatch_search_tasks")
    .select("*")
    .eq("id", taskId)
    .single();
  if (!task) return { created: 0, matched: 0, bestCandidateId: null };

  await logAgentEvent(client, dispatcherId, taskId, null, "refresh_started",
    "Агент обновляет выдачу на сайте ATI (mock)");

  // Сгенерируем 2-4 «найденных» строки выдачи.
  const isAdditional = task.search_mode === "additional_load";
  const baseStart = task.start_city || rnd(CITIES);
  const baseEnd = task.destination_city || rnd(CITIES.filter((c2) => c2 !== baseStart));
  const generated = rndN(2, 4);
  let bestId: string | null = null;
  let bestScore = -1;
  let matched = 0;
  const created: string[] = [];

  for (let i = 0; i < generated; i++) {
    const pickupCity = i === 0 ? baseStart : rnd(CITIES);
    const deliveryCity = i === 0 ? baseEnd : rnd(CITIES.filter((c2) => c2 !== pickupCity));
    const weight = isAdditional ? rndN(500, 5000) : rndN(3000, 20000);
    const volume = isAdditional ? rndN(2, 20) : rndN(10, 86);
    const distance = rndN(200, 1500);
    const price = rndN(20000, 120000);
    const pricePerKm = Math.round((price / Math.max(distance, 1)) * 100) / 100;
    const score = Math.min(100, Math.round((pricePerKm / 80) * 60 + Math.random() * 40));
    const rowIndex = i + 1;
    const externalRef = `mock-${Date.now()}-${i}`;
    const sourceUrl = "https://ati.su/loads/" + externalRef;
    const isMatch = score >= 60;
    if (isMatch) matched++;
    const { data: ins } = await c
      .from("ai_dispatch_load_candidates")
      .insert({
        search_task_id: taskId,
        source_type: "ati_site",
        source_name: "ATI.su (mock)",
        source_page_url: sourceUrl,
        source_card_anchor: "#load-" + externalRef,
        source_row_index: rowIndex,
        source_external_ref: externalRef,
        agent_open_hint_json: { row_index: rowIndex, external_ref: externalRef },
        pickup_city: pickupCity,
        delivery_city: deliveryCity,
        pickup_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
        cargo_name: rnd(CARGOS),
        weight,
        volume,
        body_type: rnd(BODY_TYPES),
        loading_type: rnd(["задняя", "боковая", "верхняя"]),
        price,
        payment_type: rnd(["безнал НДС", "безнал без НДС", "нал"]),
        distance_km: distance,
        price_per_km: pricePerKm,
        match_score: score,
        profitability_score: Math.min(100, Math.round(pricePerKm * 1.2)),
        risk_score: Math.max(0, 100 - score),
        ai_summary: `${pickupCity} → ${deliveryCity}, ${weight} кг, ${pricePerKm} ₽/км`,
        ai_reasons: isMatch
          ? ["Хорошая ставка за км", "Подходит по направлению"]
          : ["Низкая ставка за км"],
        ai_warnings: score < 40 ? ["Опасный груз: низкая маржа"] : [],
        is_additional_load: isAdditional,
        linked_main_candidate_id: isAdditional ? task.main_load_candidate_id : null,
        status: isMatch ? "suitable" : "new",
      })
      .select("id")
      .single();
    if (ins?.id) {
      created.push(ins.id);
      if (score > bestScore) {
        bestScore = score;
        bestId = ins.id;
      }
    }
  }

  const now = new Date();
  const nextAt = new Date(now.getTime() + (task.refresh_interval_seconds ?? 60) * 1000);
  await c
    .from("ai_dispatch_search_tasks")
    .update({
      last_refresh_at: now.toISOString(),
      next_refresh_at: nextAt.toISOString(),
      refresh_count: (task.refresh_count ?? 0) + 1,
      loads_seen_count: (task.loads_seen_count ?? 0) + generated,
      matched_count: (task.matched_count ?? 0) + matched,
      best_candidate_id: bestId ?? task.best_candidate_id,
      status: task.status === "draft" || task.status === "starting" ? "searching" : task.status,
    })
    .eq("id", taskId);

  await logAgentEvent(client, dispatcherId, taskId, null, "refresh_completed",
    `Просмотрено ${generated}, подходит ${matched}`,
    { generated, matched, best_candidate_id: bestId });

  if (matched > 0 && bestId) {
    await logAgentEvent(client, dispatcherId, taskId, bestId, "suitable_load_found",
      "Найден подходящий груз — требуется решение диспетчера");
  }

  return { created: created.length, matched, bestCandidateId: bestId };
}

export async function mockOpenAti(
  client: Client,
  dispatcherId: string,
  taskId: string,
) {
  const c = client as AnyClient;
  await logAgentEvent(client, dispatcherId, taskId, null, "ati_open_requested",
    "Запрошено открытие сайта ATI (агент открывает в браузере диспетчера)");
  await logAgentEvent(client, dispatcherId, taskId, null, "ati_opened",
    "Сайт ATI открыт. Если не авторизованы — войдите вручную. Радиус Трек не хранит логин и пароль.");
  await logAgentEvent(client, dispatcherId, taskId, null, "filters_ready",
    "Фильтры выставлены по параметрам автомобиля и направлению");
  const now = new Date();
  await c
    .from("ai_dispatch_search_tasks")
    .update({
      status: "searching",
      next_refresh_at: new Date(now.getTime() + 60 * 1000).toISOString(),
    })
    .eq("id", taskId);
}

export async function mockFocusCandidate(
  client: Client,
  dispatcherId: string,
  candidateId: string,
) {
  const c = client as AnyClient;
  const { data: cand } = await c
    .from("ai_dispatch_load_candidates")
    .select("id, search_task_id, source_page_url, source_card_anchor")
    .eq("id", candidateId)
    .single();
  if (!cand) return;
  await logAgentEvent(client, dispatcherId, cand.search_task_id, candidateId,
    "focus_candidate_requested",
    "Запрошено открытие груза на сайте ATI");
  // В реальном агенте здесь будет фокусировка карточки в открытой вкладке.
  await logAgentEvent(client, dispatcherId, cand.search_task_id, candidateId,
    "candidate_focused_on_site",
    `Агент сфокусировал груз (mock). URL: ${cand.source_page_url ?? "—"}`);
}
