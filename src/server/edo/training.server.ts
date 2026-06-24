// Тренажёр ЭПД. is_training=true всегда. Учебные сессии не уходят оператору.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EpdScenarioType } from "@/lib/edo/scenarios";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>;

export interface TrainingSession {
  id: string;
  user_id: string;
  role: string;
  scenario_type: EpdScenarioType;
  current_step: number;
  status: string;
  progress_percent: number;
  mistakes_json: unknown[];
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function startTraining(
  client: AnyClient, userId: string,
  input: { role: string; scenario_type: EpdScenarioType },
): Promise<{ id: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client.from("edo_training_sessions") as any)
    .insert({
      user_id: userId,
      role: input.role,
      scenario_type: input.scenario_type,
      current_step: 1,
      status: "in_progress",
      progress_percent: 0,
    })
    .select("id").single();
  if (error) throw new Error(error.message);
  return { id: (data as { id: string }).id };
}

export async function stepTraining(
  client: AnyClient, userId: string, id: string,
  body: { step?: number; progress?: number; mistake?: unknown },
): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (body.step != null) patch.current_step = body.step;
  if (body.progress != null) patch.progress_percent = body.progress;
  if (body.mistake) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (client.from("edo_training_sessions") as any)
      .select("mistakes_json").eq("id", id).eq("user_id", userId).maybeSingle();
    const arr = ((data as { mistakes_json?: unknown[] } | null)?.mistakes_json ?? []) as unknown[];
    patch.mistakes_json = [...arr, body.mistake];
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (client.from("edo_training_sessions") as any)
    .update(patch).eq("id", id).eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function completeTraining(
  client: AnyClient, userId: string, id: string,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (client.from("edo_training_sessions") as any).update({
    status: "completed",
    progress_percent: 100,
    completed_at: new Date().toISOString(),
  }).eq("id", id).eq("user_id", userId);
  if (error) throw new Error(error.message);
}
