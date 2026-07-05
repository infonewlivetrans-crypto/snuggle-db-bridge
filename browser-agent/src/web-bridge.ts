// Radius Track Browser Agent — content script моста Web ↔ Extension.
// Работает ТОЛЬКО на разрешённых Web-страницах Радиус Трек (см. manifest.json content_scripts.matches).
// НЕ имеет доступа к странице ATI. НЕ читает cookies/localStorage/DOM пользователя.
// Проверяет event.source, event.origin, requestId, nonce. Никогда не отправляет agent_token в page.
/* global chrome, window */
import { isTrustedAgentOrigin } from "./agent-origins";

const MSG_NS = "RT_BRIDGE";
const PAGE_ORIGIN = window.location.origin;

interface EnvelopeReq {
  ns: string;
  dir: string;
  requestId: string;
  nonce: string;
  type: string;
  payload?: Record<string, unknown>;
}

interface EnvelopeResp {
  ns: string;
  dir: "ext->web";
  requestId: string;
  ok: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

function isReq(x: unknown): x is EnvelopeReq {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    o.ns === MSG_NS &&
    o.dir === "web->ext" &&
    typeof o.requestId === "string" &&
    typeof o.nonce === "string" &&
    typeof o.type === "string"
  );
}

function respond(requestId: string, ok: boolean, data?: Record<string, unknown>, error?: string): void {
  const resp: EnvelopeResp = { ns: MSG_NS, dir: "ext->web", requestId, ok, data, error };
  window.postMessage(resp, PAGE_ORIGIN);
}

// Whitelist разрешённых типов — всё остальное игнорируем.
const ALLOWED_TYPES = new Set([
  "RT_AGENT_PING",
  "RT_AGENT_STATUS",
  "RT_AGENT_CONNECT_REQUEST",
  "RT_AGENT_DISCONNECT",
]);

function sendToBackground(payload: unknown): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (chrome as any).runtime.sendMessage(payload, (resp: Record<string, unknown> | undefined) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const err = (chrome as any).runtime?.lastError;
        if (err) return resolve(null);
        resolve(resp ?? null);
      });
    } catch {
      resolve(null);
    }
  });
}

// Санитайзер ответа фона: убираем любые следы token/secret.
const FORBIDDEN_KEYS = new Set([
  "agent_token", "token", "agent_token_hash", "token_hash",
  "pairing_code", "pairing_code_hash", "challenge_secret",
  "Authorization", "authorization", "cookie", "cookies",
  "password", "login",
]);

function sanitize(v: unknown): unknown {
  if (!v || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(sanitize);
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (FORBIDDEN_KEYS.has(k)) continue;
    out[k] = sanitize(val);
  }
  return out;
}

window.addEventListener("message", async (ev: MessageEvent) => {
  if (ev.source !== window) return;
  if (ev.origin !== PAGE_ORIGIN) return;
  if (!isTrustedAgentOrigin(ev.origin)) return;
  if (!isReq(ev.data)) return;
  const req = ev.data;
  if (!ALLOWED_TYPES.has(req.type)) return;

  try {
    const resp = await sendToBackground({
      type: "rt/bridge",
      bridgeType: req.type,
      requestId: req.requestId,
      nonce: req.nonce,
      origin: PAGE_ORIGIN,
      payload: req.payload ?? {},
    });
    if (!resp) {
      respond(req.requestId, false, { installed: true, connected: false }, "bridge_no_response");
      return;
    }
    respond(req.requestId, Boolean(resp.ok), sanitize(resp.data ?? resp) as Record<string, unknown>, typeof resp.error === "string" ? resp.error : undefined);
  } catch (e) {
    respond(req.requestId, false, { installed: true }, String((e as Error).message ?? e));
  }
});

// Сообщаем странице, что мост загружен (без секретов).
try {
  window.postMessage(
    { ns: MSG_NS, dir: "ext->web", requestId: "bridge-ready", ok: true, data: { installed: true } },
    PAGE_ORIGIN,
  );
} catch { /* ignore */ }

export {};
