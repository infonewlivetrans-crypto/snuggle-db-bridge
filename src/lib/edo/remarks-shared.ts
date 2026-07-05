// Client-safe types/constants for cargo acceptance remarks.
// Do NOT import server-only code here.

export const REMARK_TYPES = [
  "cargo_dirty",
  "cargo_damaged",
  "packaging_damaged",
  "quantity_mismatch",
  "weight_mismatch",
  "volume_mismatch",
  "marking_issue",
  "loading_issue",
  "vehicle_issue",
  "other",
] as const;
export type RemarkType = (typeof REMARK_TYPES)[number];

export const REMARK_TYPE_LABEL: Record<RemarkType, string> = {
  cargo_dirty: "Груз грязный",
  cargo_damaged: "Повреждение груза",
  packaging_damaged: "Повреждение упаковки",
  quantity_mismatch: "Несоответствие количества",
  weight_mismatch: "Несоответствие веса",
  volume_mismatch: "Несоответствие объёма",
  marking_issue: "Проблемы с маркировкой",
  loading_issue: "Проблемы с погрузкой",
  vehicle_issue: "Проблемы с транспортным средством",
  other: "Другое",
};

export type RemarkSeverity = "info" | "warning" | "critical";
