// Определение «плохого рейтинга» перевозчика в карточке груза ATI.
// Pure: получает набор сигналов (aria-label, title, text, className,
// dataAttrs, starsCount, negativeCount, computedColor?) и возвращает решение.
// Никаких DOM-запросов — вызывающий код собирает сигналы сам.

const NEG_KEYWORDS = [
  "отрицат",
  "негатив",
  "плохой",
  "низкий рейтинг",
  "чёрный",
  "черный",
];

function hasNegKeyword(str) {
  const s = String(str || "").toLowerCase();
  return NEG_KEYWORDS.some((k) => s.includes(k));
}

/**
 * @param {{
 *   ariaLabel?: string, title?: string, text?: string, className?: string,
 *   dataAttrs?: Record<string,string>, starsCount?: number|null,
 *   negativeCount?: number|null, computedColor?: string|null,
 *   minStars?: number
 * }} signals
 */
export function detectRating(signals) {
  const s = signals || {};
  const reasons = [];
  let confidence = 0;
  let negative = false;

  const semantic =
    hasNegKeyword(s.ariaLabel) ||
    hasNegKeyword(s.title) ||
    hasNegKeyword(s.text) ||
    hasNegKeyword(s.className);
  if (semantic) {
    negative = true;
    reasons.push("semantic_negative_keyword");
    confidence += 0.5;
  }

  if (s.dataAttrs) {
    for (const [k, v] of Object.entries(s.dataAttrs)) {
      if (/negative|bad|black/i.test(k) && (v === "true" || v === "1")) {
        negative = true;
        reasons.push(`data_attr:${k}`);
        confidence += 0.4;
      }
    }
  }

  if (typeof s.negativeCount === "number" && s.negativeCount > 0) {
    negative = true;
    reasons.push("negative_count>0");
    confidence += 0.4;
  }

  const minStars = typeof s.minStars === "number" ? s.minStars : null;
  if (
    minStars !== null &&
    typeof s.starsCount === "number" &&
    s.starsCount < minStars
  ) {
    negative = true;
    reasons.push(`stars<${minStars}`);
    confidence += 0.3;
  }

  // Цвет — только вспомогательный сигнал, никогда не решающий сам по себе.
  if (
    s.computedColor &&
    /rgb\(\s*(?:2[0-9]{2}|1[89][0-9])\s*,\s*[0-6][0-9]?\s*,\s*[0-6][0-9]?\s*\)/i.test(
      s.computedColor,
    )
  ) {
    reasons.push("red_color_hint");
    confidence += 0.1;
  }

  if (confidence > 1) confidence = 1;
  return {
    negative,
    confidence: Number(confidence.toFixed(2)),
    reasons,
    starsCount: s.starsCount ?? null,
    negativeCount: s.negativeCount ?? null,
  };
}
