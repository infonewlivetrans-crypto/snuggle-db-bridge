// Pure-логика защиты pagination adapter от бесконечных циклов.
// Хранит fingerprints посещённых страниц и решает, безопасно ли идти дальше.

export function createPaginationGuard({ maxPages = 500, transitionTimeoutMs = 20000 } = {}) {
  const visited = new Set();
  let lastTransitionAt = 0;
  return {
    /** Записать fingerprint только что прочитанной страницы. */
    recordPage(fp) {
      const key = String(fp);
      if (visited.has(key)) return { ok: false, reason: "pagination_loop_detected" };
      visited.add(key);
      if (visited.size > maxPages) return { ok: false, reason: "pagination_max_pages" };
      return { ok: true, pagesRead: visited.size };
    },
    markTransitionStart(now = Date.now()) {
      lastTransitionAt = now;
    },
    checkTransitionTimeout(now = Date.now()) {
      if (!lastTransitionAt) return { ok: true };
      if (now - lastTransitionAt > transitionTimeoutMs) {
        return { ok: false, reason: "page_transition_timeout" };
      }
      return { ok: true };
    },
    pagesRead() {
      return visited.size;
    },
    reset() {
      visited.clear();
      lastTransitionAt = 0;
    },
  };
}
