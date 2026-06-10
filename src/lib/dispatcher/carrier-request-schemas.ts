import { z } from "zod";

export const CARRIER_REQUEST_STATUSES = [
  "draft",
  "sent",
  "viewed",
  "accepted",
  "declined",
  "cancelled",
  "archive",
] as const;
export const CARRIER_REQUEST_PAYMENT_TYPES = [
  "prepayment",
  "on_loading",
  "on_unloading",
  "delayed",
  "mixed",
  "other",
] as const;

// Принимаем строку или число для numeric/date, нормализуем nullable.
const nstr = z.string().trim().max(500).nullable().optional();
const nnum = z
  .union([z.number(), z.string().trim()])
  .nullable()
  .optional()
  .transform((v) => {
    if (v == null || v === "") return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  });
const ndate = z
  .string()
  .trim()
  .nullable()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null));

export const carrierRequestCreateSchema = z.object({
  dispatcher_carrier_ext_id: z.string().uuid(),
  dispatcher_driver_ext_id: z.string().uuid().nullable().optional(),
  dispatcher_vehicle_ext_id: z.string().uuid().nullable().optional(),
  dispatcher_deal_id: z.string().uuid().nullable().optional(),
  request_number: nstr,
  cargo_name: nstr,
  loading_city: nstr,
  loading_address: nstr,
  loading_date: ndate,
  unloading_city: nstr,
  unloading_address: nstr,
  unloading_date: ndate,
  customer_name: nstr,
  customer_contact: nstr,
  customer_email: nstr,
  customer_phone: nstr,
  rate_amount: nnum,
  rate_currency: z.string().trim().max(10).default("RUB"),
  payment_type: z.enum(CARRIER_REQUEST_PAYMENT_TYPES).nullable().optional(),
  payment_delay_days: z
    .union([z.number(), z.string()])
    .nullable()
    .optional()
    .transform((v) => {
      if (v == null || v === "") return null;
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? Math.trunc(n) : null;
    }),
  commission_percent: nnum,
  terms_text: z.string().trim().max(5000).nullable().optional(),
  dispatcher_comment: z.string().trim().max(5000).nullable().optional(),
  request_status: z.enum(CARRIER_REQUEST_STATUSES).default("draft"),
});

export const carrierRequestPatchSchema = carrierRequestCreateSchema.partial();

export const carrierRespondSchema = z.object({
  request_status: z.enum(["accepted", "declined", "viewed"]),
  carrier_comment: z.string().trim().max(5000).nullable().optional(),
});

export type CarrierRequestCreateInput = z.infer<typeof carrierRequestCreateSchema>;
export type CarrierRequestPatchInput = z.infer<typeof carrierRequestPatchSchema>;

/**
 * Вычисляет сумму комиссии по сумме ставки и проценту.
 * Если ставка не задана — null. commission_percent по умолчанию 5.
 */
export function computeCommissionAmount(
  rateAmount: number | null | undefined,
  commissionPercent: number | null | undefined,
): number | null {
  if (rateAmount == null || !Number.isFinite(rateAmount)) return null;
  const pct = commissionPercent == null || !Number.isFinite(commissionPercent) ? 5 : commissionPercent;
  return Math.round(rateAmount * pct) / 100;
}
