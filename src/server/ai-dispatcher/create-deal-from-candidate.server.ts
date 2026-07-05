// Создание черновика сделки (dispatcher_deals) из AI-кандидата или связки.
// Не создаёт дубль. Не отправляет автоматически. Только status='draft'.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Client = SupabaseClient<Database>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export interface CreateDealResult {
  status: "created" | "already_exists";
  deal_id: string;
}

export async function findExistingDealForCandidate(
  client: Client, candidateId: string,
): Promise<string | null> {
  const c = client as AnyClient;
  const { data } = await c.from("dispatcher_deals")
    .select("id").eq("ai_candidate_id", candidateId).maybeSingle();
  return data?.id ?? null;
}

export async function createDealDraftFromCandidate(
  client: Client, dispatcherId: string, candidateId: string,
  extra: { agreed_price?: number | null; comment?: string | null } = {},
): Promise<CreateDealResult> {
  const c = client as AnyClient;
  const existing = await findExistingDealForCandidate(client, candidateId);
  if (existing) return { status: "already_exists", deal_id: existing };

  const { data: cand } = await c.from("ai_dispatch_load_candidates")
    .select("*").eq("id", candidateId).maybeSingle();
  if (!cand) throw new Error("candidate_not_found");
  const { data: task } = await c.from("ai_dispatch_search_tasks")
    .select("id, dispatcher_id, vehicle_id, driver_id, vehicle_params_json, payment_type")
    .eq("id", cand.search_task_id).maybeSingle();
  if (!task || task.dispatcher_id !== dispatcherId) throw new Error("task_forbidden");

  const payload = {
    dispatcher_user_id: dispatcherId,
    created_by: dispatcherId,
    driver_id: task.driver_id ?? null,
    vehicle_id: task.vehicle_id ?? null,
    total_rate: extra.agreed_price ?? cand.price ?? null,
    route_from: cand.pickup_city ?? null,
    route_to: cand.delivery_city ?? null,
    loading_date: cand.pickup_date ?? null,
    unloading_date: cand.delivery_date ?? null,
    payment_type: cand.payment_type ?? null,
    deal_status: "draft",
    comment: extra.comment ?? cand.dispatcher_comment ?? null,
    ai_candidate_id: candidateId,
    ai_search_task_id: cand.search_task_id,
    ai_source: "ai_dispatcher",
  };

  const { data, error } = await c.from("dispatcher_deals").insert(payload).select("id").single();
  if (error) throw new Error(error.message);
  return { status: "created", deal_id: data.id };
}

export async function createDealDraftFromBundle(
  client: Client, dispatcherId: string, bundleId: string,
): Promise<CreateDealResult> {
  const c = client as AnyClient;
  const { data: existing } = await c.from("dispatcher_deals")
    .select("id").eq("ai_bundle_id", bundleId).maybeSingle();
  if (existing) return { status: "already_exists", deal_id: existing.id };

  const { data: bundle } = await c.from("ai_dispatch_load_bundles")
    .select("*").eq("id", bundleId).maybeSingle();
  if (!bundle || bundle.dispatcher_id !== dispatcherId) throw new Error("bundle_forbidden");

  const payload = {
    dispatcher_user_id: dispatcherId,
    created_by: dispatcherId,
    vehicle_id: bundle.vehicle_id ?? null,
    total_rate: bundle.total_price ?? null,
    deal_status: "draft",
    ai_bundle_id: bundleId,
    ai_search_task_id: bundle.search_task_id ?? null,
    ai_source: "ai_dispatcher_bundle",
    comment: bundle.ai_summary ?? null,
  };
  const { data, error } = await c.from("dispatcher_deals").insert(payload).select("id").single();
  if (error) throw new Error(error.message);
  return { status: "created", deal_id: data.id };
}
