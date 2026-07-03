// Radius Track Browser Agent — bearer-token auth helper.
// Никакого service_role. Никакого отключения RLS.
// Проверка идёт через SECURITY DEFINER функцию agent_verify_token(hash).
import { createHash, randomBytes } from "node:crypto";
import { makeAnonClient, jsonResponse, getBearerToken } from "@/server/api-helpers.server";

export function hashAgentSecret(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function generateAgentToken(): { raw: string; hash: string } {
  const raw = "rta_" + randomBytes(32).toString("hex");
  return { raw, hash: hashAgentSecret(raw) };
}

export function generatePairingCode(): string {
  const part = () =>
    Array.from({ length: 4 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join("");
  return `RT-${part()}-${part()}`;
}

export interface AgentAuthCtx {
  sessionId: string;
  dispatcherId: string;
  tokenHash: string;
}

export async function requireAgentToken(request: Request): Promise<AgentAuthCtx | Response> {
  const raw = getBearerToken(request);
  if (!raw) return jsonResponse({ error: "missing_agent_token" }, { status: 401 });
  const tokenHash = hashAgentSecret(raw);
  const client = makeAnonClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client as any).rpc("agent_verify_token", { _token_hash: tokenHash });
  if (error || !data || !data.length) {
    return jsonResponse({ error: "invalid_agent_token" }, { status: 401 });
  }
  const row = data[0] as { session_id: string; dispatcher_id: string };
  return { sessionId: row.session_id, dispatcherId: row.dispatcher_id, tokenHash };
}

export function agentClient() {
  return makeAnonClient();
}
