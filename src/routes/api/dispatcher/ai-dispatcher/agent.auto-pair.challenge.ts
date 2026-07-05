import { createFileRoute } from "@tanstack/react-router";
import { createHash, randomBytes } from "node:crypto";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { isTrustedAgentOrigin, normalizeOrigin } from "@/lib/ai-dispatcher/agent-origins";

// POST /api/dispatcher/ai-dispatcher/agent/auto-pair/challenge
// Создаёт одноразовый challenge, привязанный к текущему диспетчеру и origin.
// В ответе — challenge_id и одноразовый challenge_secret (в памяти страницы).
export const Route = createFileRoute("/api/dispatcher/ai-dispatcher/agent/auto-pair/challenge")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAnyRole(request, ["admin", "dispatcher"]);
        if (auth instanceof Response) return auth;

        let body: { origin?: string; ttl_seconds?: number } = {};
        try { body = (await request.json()) ?? {}; } catch { /* empty */ }

        const origin = normalizeOrigin(body.origin);
        if (!origin || !isTrustedAgentOrigin(origin)) {
          return jsonResponse({ error: "untrusted_origin" }, { status: 400 });
        }
        const ttl = Math.max(30, Math.min(600, Number(body.ttl_seconds ?? 120) | 0));

        const secret = "rtc_" + randomBytes(32).toString("hex");
        const secretHash = createHash("sha256").update(secret).digest("hex");

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const c: any = auth.client;
        const { data, error } = await c.rpc("agent_create_pair_challenge", {
          _challenge_secret_hash: secretHash,
          _origin: origin,
          _ttl_seconds: ttl,
        });
        if (error || !data || !data.length) {
          return jsonResponse({ error: "create_failed", detail: error?.message ?? null }, { status: 500 });
        }
        const row = data[0] as { id: string; expires_at: string };
        return jsonResponse({
          challenge_id: row.id,
          challenge_secret: secret,
          expires_at: row.expires_at,
        });
      },
    },
  },
});
