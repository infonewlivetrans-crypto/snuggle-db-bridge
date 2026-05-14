// Нормализация ФИО для сопоставления (без учёта регистра/пробелов/пунктуации).
// "Прядкин О.Н." и "прядкин  о. н ." → "прядкин о.н."

export function normalizeFullName(input: string | null | undefined): string {
  if (!input) return "";
  return String(input)
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[\u00A0\s]+/g, " ")
    .replace(/\s*\.\s*/g, ".")
    .replace(/[^\p{L}\p{N}.\s-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
