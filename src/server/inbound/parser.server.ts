// Универсальный разбор входящих документов (PDF / DOCX / DOC / TXT / изображения).
// Использует существующий heuristic parser freight-parse для извлечения данных рейса.
// Сканы / изображения: OCR в MVP не подключён, файл уходит в needs_review.

import { parseIncomingFreightText, type ParsedFreightFields } from "@/lib/dispatcher/freight-parse";

export type DocumentKind =
  | "signed_order"
  | "contract_request"
  | "application"
  | "requisites"
  | "other";

export interface InboundParseResult {
  text: string;
  warnings: string[];
  needsReview: boolean;
  fields: ParsedFreightFields;
  missing: string[];
  confidence: number;
  documentKind: DocumentKind;
}

const IMAGE_MIME_PREFIX = "image/";

function inferDocumentKind(filename: string | null, text: string): DocumentKind {
  const f = (filename ?? "").toLowerCase();
  const t = text.toLowerCase();
  if (/договор[- ]?заявк/.test(f) || /договор[- ]?заявк/.test(t)) return "contract_request";
  if (/заявк/.test(f) || /заявк/.test(t)) return "signed_order";
  if (/реквизит/.test(f) || /реквизит/.test(t)) return "requisites";
  if (/приложен/.test(f) || /приложен/.test(t)) return "application";
  return "other";
}

async function extractPdf(buf: Buffer): Promise<{ text: string; warnings: string[] }> {
  try {
    // pdf-parse имеет CommonJS entry; импортируем динамически чтобы не ломать SSR/типы.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await import("pdf-parse");
    const fn = mod?.default ?? mod;
    const res = await fn(buf);
    const text = String(res?.text ?? "").trim();
    if (!text) return { text: "", warnings: ["PDF не содержит текстового слоя — возможно скан"] };
    return { text, warnings: [] };
  } catch (e) {
    return { text: "", warnings: [`Не удалось прочитать PDF: ${e instanceof Error ? e.message : String(e)}`] };
  }
}

async function extractDocx(buf: Buffer): Promise<{ text: string; warnings: string[] }> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await import("mammoth");
    const fn = mod?.extractRawText ?? mod?.default?.extractRawText;
    const res = await fn({ buffer: buf });
    const text = String(res?.value ?? "").trim();
    return { text, warnings: text ? [] : ["DOCX пустой"] };
  } catch (e) {
    return { text: "", warnings: [`Не удалось прочитать DOC/DOCX: ${e instanceof Error ? e.message : String(e)}`] };
  }
}

/**
 * Принимает буфер вложения + mime + filename и возвращает результат разбора.
 * Всегда возвращает структуру, никогда не бросает.
 */
export async function parseInboundAttachment(
  buf: Buffer,
  mime: string | null,
  filename: string | null,
): Promise<InboundParseResult> {
  const warnings: string[] = [];
  let text = "";
  const m = (mime ?? "").toLowerCase();
  const fname = (filename ?? "").toLowerCase();

  if (m === "application/pdf" || fname.endsWith(".pdf")) {
    const r = await extractPdf(buf);
    text = r.text;
    warnings.push(...r.warnings);
  } else if (
    m === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    m === "application/msword" ||
    fname.endsWith(".docx") ||
    fname.endsWith(".doc")
  ) {
    const r = await extractDocx(buf);
    text = r.text;
    warnings.push(...r.warnings);
  } else if (m.startsWith(IMAGE_MIME_PREFIX) || /\.(jpe?g|png|heic|tif?f|bmp|webp)$/i.test(fname)) {
    warnings.push("Документ похож на скан/изображение — требуется ручная проверка");
  } else if (m === "text/plain" || fname.endsWith(".txt")) {
    text = buf.toString("utf8");
  } else {
    warnings.push(`Неподдерживаемый формат вложения (${mime ?? "?"})`);
  }

  const parsed = text ? parseIncomingFreightText(text) : null;
  const fields = parsed?.fields ?? parseIncomingFreightText("").fields;
  const missing = parsed?.missing ?? [];
  // confidence = доля найденных ключевых полей
  const keyFields = [
    fields.loading_city,
    fields.unloading_city,
    fields.loading_date,
    fields.cargo_name,
    fields.weight_kg,
    fields.rate,
  ];
  const filled = keyFields.filter((v) => v !== null && v !== undefined).length;
  const confidence = Number((filled / keyFields.length).toFixed(2));

  const documentKind = inferDocumentKind(filename, text);
  const needsReview = !text || confidence < 0.5;

  if (text && !fields.loading_city) warnings.push("Не найден город/адрес загрузки");
  if (text && !fields.unloading_city) warnings.push("Не найден город/адрес выгрузки");
  if (text && !fields.loading_date) warnings.push("Не найдена дата загрузки");
  if (text && !fields.rate) warnings.push("Не найдена ставка перевозки");
  if (text && !fields.cargo_name) warnings.push("Не найдено наименование груза");

  return { text, warnings, needsReview, fields, missing, confidence, documentKind };
}
