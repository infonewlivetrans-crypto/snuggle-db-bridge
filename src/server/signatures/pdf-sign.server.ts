// Серверная вставка печати и подписи в PDF через pdf-lib.
// Использует только PNG с прозрачным фоном (клиент готовит PNG c alpha
// каналом), поэтому в документ не попадает белый прямоугольник.
import { PDFDocument } from "pdf-lib";
import type { Placement } from "@/lib/signatures/types";

export interface AnchorResult {
  page: number;            // 1-based
  needsManual: boolean;
  reason?: string;
}

/**
 * Ищет в извлечённом тексте PDF страницу с блоком перевозчика.
 * Простая эвристика по текстовым якорям. Координаты не возвращает —
 * только номер страницы и флаг нужен ли ручной режим.
 */
export function findCarrierPage(
  extractedText: string | null,
  carrierName?: string | null,
  carrierInn?: string | null,
  pageCount = 1,
): AnchorResult {
  const text = (extractedText ?? "").trim();
  if (!text) {
    return { page: pageCount, needsManual: true, reason: "no_text" };
  }

  // Грубо делим по «\f» или маркерам страниц, fallback — равными кусками.
  const chunks = text.split(/\f|\n-{3,}page-{3,}\n|\n=== PAGE \d+ ===\n/i);
  const pages = chunks.length > 1 ? chunks : [text];

  const carrierPatterns: RegExp[] = [
    /Перевозчик/i,
    /Исполнитель-?\s*перевозчик/i,
    /Исполнитель/i,
  ];
  if (carrierName) carrierPatterns.push(new RegExp(escapeRegex(carrierName), "i"));
  if (carrierInn) carrierPatterns.push(new RegExp(`\\b${escapeRegex(carrierInn)}\\b`));

  let best = -1;
  let bestScore = 0;
  pages.forEach((chunk, i) => {
    let score = 0;
    for (const r of carrierPatterns) if (r.test(chunk)) score += 1;
    if (/М\.\s*П\./i.test(chunk)) score += 0.5;
    if (/подпис/i.test(chunk)) score += 0.5;
    // Последняя страница чаще содержит блок подписей — небольшой бонус.
    if (i === pages.length - 1) score += 0.2;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });

  if (best === -1 || bestScore < 1.5) {
    return { page: Math.max(1, pageCount), needsManual: true, reason: "low_confidence" };
  }
  // Если страница совпадает с реальным pageCount — используем её, иначе fallback на последнюю.
  const page = Math.min(best + 1, Math.max(1, pageCount));
  return { page, needsManual: bestScore < 2.5 };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface SignPdfInput {
  sourcePdf: Uint8Array;
  stampPng: Uint8Array | null;
  signaturePng: Uint8Array | null;
  placement: Placement;
}

export async function signPdf({
  sourcePdf,
  stampPng,
  signaturePng,
  placement,
}: SignPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.load(sourcePdf);
  const pages = doc.getPages();
  const idx = Math.max(0, Math.min(pages.length - 1, placement.page - 1));
  const page = pages[idx];
  const { width: pw, height: ph } = page.getSize();

  // Координаты Placement используем в системе «верх-левый», pdf-lib работает в системе «низ-левый».
  // Переводим: y_pdf = ph - y_top - h.

  if (stampPng && stampPng.length > 0) {
    const img = await doc.embedPng(stampPng);
    const w = clamp(placement.stamp.w, 20, pw);
    const h = (img.height / img.width) * w;
    const x = clamp(placement.stamp.x, 0, pw - w);
    const yTop = clamp(placement.stamp.y, 0, ph - h);
    page.drawImage(img, { x, y: ph - yTop - h, width: w, height: h, opacity: 1 });
  }

  if (signaturePng && signaturePng.length > 0) {
    const img = await doc.embedPng(signaturePng);
    const w = clamp(placement.signature.w, 20, pw);
    const h = (img.height / img.width) * w;
    const x = clamp(placement.signature.x, 0, pw - w);
    const yTop = clamp(placement.signature.y, 0, ph - h);
    page.drawImage(img, { x, y: ph - yTop - h, width: w, height: h, opacity: 1 });
  }

  return await doc.save();
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

/**
 * Размер первой страницы для дефолтного placement.
 */
export async function getPdfMeta(buf: Uint8Array): Promise<{ pageCount: number; firstPage: { w: number; h: number } }> {
  const doc = await PDFDocument.load(buf);
  const pages = doc.getPages();
  const first = pages[0].getSize();
  return { pageCount: pages.length, firstPage: { w: first.width, h: first.height } };
}
