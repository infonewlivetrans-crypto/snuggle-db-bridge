// Единый список сообщений между background и content-script.
// API ATI не используется. Никаких network-запросов внутри content.

export type BgToContentMessage =
  | { type: "RT_READ_VISIBLE_LOADS" }
  | { type: "RT_HIGHLIGHT_LOADS"; scores: Array<{
      source_row_index?: number | null;
      source_external_ref?: string | null;
      text_hash?: string | null;
      candidate_id?: string | null;
      match_score?: number | null;
      status?: string | null;
      ai_warnings?: unknown;
    }> }
  | { type: "RT_FOCUS_LOAD"; hint: {
      source_row_index?: number | null;
      source_external_ref?: string | null;
      source_card_anchor?: string | null;
      text_hash?: string | null;
      href?: string | null;
    } }
  | { type: "RT_CLEAR_HIGHLIGHTS" }
  | { type: "RT_APPLY_FILTERS"; filters: Record<string, unknown> }
  | { type: "RT_DIAGNOSTICS" }
  | { type: "RT_SHOW_OVERLAY"; state?: { sent?: number; suitable?: number; task_id?: string | null } }
  | { type: "RT_HIDE_OVERLAY" };

export type ContentToBgMessage =
  | { type: "RT_VISIBLE_LOADS_EXTRACTED"; page: unknown; loads: unknown[] }
  | { type: "RT_LOAD_FOCUSED"; ok: boolean; matched_by?: string }
  | { type: "RT_PAGE_NOT_SUPPORTED"; url: string }
  | { type: "RT_EXTRACTION_FAILED"; error: string }
  | { type: "RT_OVERLAY_READY" };

