// Radius Track Browser Agent — content script.
// Работает только на ati.su (см. manifest host_permissions).
// API ATI не используется. Никаких скрытых сетевых запросов.
// Читает только видимую пользователю выдачу.
/* global chrome */
import { detectPage } from "./ati/detectPage";
import { extractVisibleLoads } from "./ati/extractVisibleLoads";
import { applyHighlights, clearHighlights } from "./ati/highlightLoads";
import { showOverlay, hideOverlay } from "./ati/agentOverlay";
import { applySearchFilters, type AtiFilters } from "./ati/applySearchFilters";
import { collectFormDiagnostics } from "./ati/formDiagnostics";
import type { BgToContentMessage, ContentToBgMessage } from "./ati/contentMessages";
import { detectAtiAuthState, type AtiAuthState } from "./ati/detectAuthState";
import {
  normalizeAuthState, shouldEmitLoginRequired, shouldEmitLoginDetected,
} from "./shared/auth-state-transition.mjs";

function send(msg: ContentToBgMessage | Record<string, unknown>): void {
  try { (chrome as unknown as { runtime: { sendMessage: (m: unknown) => void } })
    .runtime.sendMessage(msg); } catch { /* ignore */ }
}

let lastAuthState: AtiAuthState = "unknown";
let authDebounceTimer: ReturnType<typeof setTimeout> | null = null;

function safePageUrl(): string {
  try {
    const u = new URL(location.href);
    // Отбрасываем query — там могут быть чувствительные параметры
    return `${u.origin}${u.pathname}`;
  } catch { return ""; }
}

function checkAuthAndEmit(): void {
  const det = detectAtiAuthState();
  const prev = lastAuthState;
  const curr = normalizeAuthState(det.status) as AtiAuthState;
  if (curr === prev) return;
  const emitLogin = shouldEmitLoginRequired(prev, curr);
  const emitDetected = shouldEmitLoginDetected(prev, curr);
  lastAuthState = curr;
  if (!emitLogin && !emitDetected && curr === "unknown") return;
  send({
    type: "RT_ATI_AUTH_STATE_CHANGED",
    previousState: prev,
    currentState: curr,
    strategy: det.strategy ?? null,
    confidence: det.confidence ?? null,
    pageUrl: safePageUrl(),
    detectedAt: new Date().toISOString(),
    emitLoginRequired: emitLogin,
    emitLoginDetected: emitDetected,
  });
}

function scheduleAuthCheck(): void {
  if (authDebounceTimer) clearTimeout(authDebounceTimer);
  authDebounceTimer = setTimeout(() => { authDebounceTimer = null; checkAuthAndEmit(); }, 700);
}


function handleRead(): void {
  const page = detectPage();
  if (!page.isAtiPage || !page.isLoadsSearchPage) {
    send({ type: "RT_PAGE_NOT_SUPPORTED", url: page.pageUrl });
    return;
  }
  try {
    const { loads } = extractVisibleLoads();
    send({ type: "RT_VISIBLE_LOADS_EXTRACTED", page, loads });
  } catch (e) {
    send({ type: "RT_EXTRACTION_FAILED", error: String((e as Error).message ?? e) });
  }
}

function findRowByHint(hint: {
  source_row_index?: number | null;
  source_external_ref?: string | null;
  source_card_anchor?: string | null;
  text_hash?: string | null;
  href?: string | null;
}): { el: Element; by: string } | null {
  const { loads } = extractVisibleLoads();
  if (hint.source_external_ref) {
    const i = loads.findIndex((l) => l.source_external_ref === hint.source_external_ref);
    if (i >= 0) return findByIndex(i, "external_ref");
  }
  if (hint.source_card_anchor) {
    const el = document.getElementById(String(hint.source_card_anchor));
    if (el) return { el, by: "anchor" };
  }
  if (hint.text_hash) {
    const i = loads.findIndex((l) => l.agent_open_hint_json?.textHash === hint.text_hash);
    if (i >= 0) return findByIndex(i, "text_hash");
  }
  if (typeof hint.source_row_index === "number") {
    return findByIndex(hint.source_row_index, "row_index");
  }
  return null;
}

function findByIndex(idx: number, by: string): { el: Element; by: string } | null {
  // Достаём тот же список, что применяет highlight — согласовано через extractVisibleLoads.
  const { loads } = extractVisibleLoads();
  if (idx < 0 || idx >= loads.length) return null;
  // Элементы получаем повторно теми же селекторами, что и highlightLoads.
  // Простой путь — воспользоваться DOM-порядком через выделение первых N подходящих строк:
  const el = document.querySelectorAll<HTMLElement>('[data-rt-agent-highlighted]')[idx]
    ?? document.querySelectorAll<HTMLElement>('article,li,tr,div[class*="row"],div[class*="card"]')[idx];
  return el ? { el, by } : null;
}

function handleFocus(hint: {
  source_row_index?: number | null;
  source_external_ref?: string | null;
  source_card_anchor?: string | null;
  text_hash?: string | null;
  href?: string | null;
}): void {
  const found = findRowByHint(hint);
  if (!found) { send({ type: "RT_LOAD_FOCUSED", ok: false }); return; }
  found.el.scrollIntoView({ behavior: "smooth", block: "center" });
  (found.el as HTMLElement).style.outline = "3px solid #22c55e";
  (found.el as HTMLElement).style.outlineOffset = "-3px";
  send({ type: "RT_LOAD_FOCUSED", ok: true, matched_by: found.by });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(chrome as any).runtime.onMessage.addListener((msg: BgToContentMessage | { type: string }, _s: unknown, respond: (r: unknown) => void) => {
  try {
    if (!msg || typeof msg !== "object") return;
    // Auth detection запрос
    if ((msg as { type: string }).type === "RT_DETECT_ATI_AUTH") {
      const det = detectAtiAuthState();
      lastAuthState = normalizeAuthState(det.status) as AtiAuthState;
      respond({ ok: true, status: det.status, strategy: det.strategy, confidence: det.confidence });
      return;
    }
    switch ((msg as BgToContentMessage).type) {
      case "RT_READ_VISIBLE_LOADS": handleRead(); respond({ ok: true }); return;
      case "RT_HIGHLIGHT_LOADS": {
        const n = applyHighlights((msg as { scores?: unknown[] }).scores as never ?? []);
        respond({ ok: true, applied: n });
        return;
      }
      case "RT_CLEAR_HIGHLIGHTS": clearHighlights(); respond({ ok: true }); return;
      case "RT_FOCUS_LOAD": handleFocus((msg as { hint?: Record<string, unknown> }).hint ?? {}); respond({ ok: true }); return;
      case "RT_APPLY_FILTERS": {
        const r = applySearchFilters(((msg as { filters?: unknown }).filters ?? {}) as AtiFilters);
        respond({ ok: r.success, result: r }); return;
      }
      case "RT_DIAGNOSTICS": respond({ ok: true, diagnostics: collectFormDiagnostics() }); return;
      case "RT_SHOW_OVERLAY":
        showOverlay(
          {
            sent_count: (msg as { state?: { sent?: number } }).state?.sent,
            suitable_count: (msg as { state?: { suitable?: number } }).state?.suitable,
            task_id: (msg as { state?: { task_id?: string } }).state?.task_id ?? null,
          },
          (a) => {
            if (a === "hide") { hideOverlay(); return; }
            if (a === "read") handleRead();
            if (a === "send") handleRead();
          },
        );
        send({ type: "RT_OVERLAY_READY" });
        respond({ ok: true });
        return;
      case "RT_HIDE_OVERLAY": hideOverlay(); respond({ ok: true }); return;
    }
  } catch (e) {
    respond({ ok: false, error: String((e as Error).message ?? e) });
  }
});

// Автоматически покажем маленькую панель только на выдаче + запустим auth observer.
try {
  const page = detectPage();
  if (page.isLoadsSearchPage) showOverlay({ task_id: null });
  if (page.isAtiPage) {
    // initial detection
    lastAuthState = normalizeAuthState(detectAtiAuthState().status) as AtiAuthState;
    // Observer с debounce: не читаем формы/пароли, только смотрим на изменения DOM.
    const observer = new MutationObserver(() => scheduleAuthCheck());
    observer.observe(document.documentElement, { childList: true, subtree: true });
    // Первый актуальный emit после загрузки
    scheduleAuthCheck();
  }
} catch { /* ignore */ }

console.log("[radius-track-agent] content loaded");
export {};

