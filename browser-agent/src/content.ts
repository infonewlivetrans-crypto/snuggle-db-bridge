// Radius Track Browser Agent — content script.
// Работает только на ati.su (см. manifest host_permissions).
// API ATI не используется. Никаких скрытых сетевых запросов.
// Читает только видимую пользователю выдачу.
/* global chrome */
import { detectPage } from "./ati/detectPage";
import { extractVisibleLoads } from "./ati/extractVisibleLoads";
import { applyHighlights, clearHighlights } from "./ati/highlightLoads";
import { showOverlay, hideOverlay } from "./ati/agentOverlay";
import type { BgToContentMessage, ContentToBgMessage } from "./ati/contentMessages";

function send(msg: ContentToBgMessage): void {
  try { (chrome as unknown as { runtime: { sendMessage: (m: unknown) => void } })
    .runtime.sendMessage(msg); } catch { /* ignore */ }
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
(chrome as any).runtime.onMessage.addListener((msg: BgToContentMessage, _s: unknown, respond: (r: unknown) => void) => {
  try {
    if (!msg || typeof msg !== "object") return;
    switch (msg.type) {
      case "RT_READ_VISIBLE_LOADS": handleRead(); respond({ ok: true }); return;
      case "RT_HIGHLIGHT_LOADS": {
        const n = applyHighlights(msg.scores ?? []);
        respond({ ok: true, applied: n });
        return;
      }
      case "RT_CLEAR_HIGHLIGHTS": clearHighlights(); respond({ ok: true }); return;
      case "RT_FOCUS_LOAD": handleFocus(msg.hint ?? {}); respond({ ok: true }); return;
      case "RT_SHOW_OVERLAY":
        showOverlay(
          {
            sent_count: msg.state?.sent,
            suitable_count: msg.state?.suitable,
            task_id: msg.state?.task_id ?? null,
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

// Автоматически покажем маленькую панель только на выдаче.
try {
  const page = detectPage();
  if (page.isLoadsSearchPage) showOverlay({ task_id: null });
} catch { /* ignore */ }

console.log("[radius-track-agent] content loaded");
export {};
