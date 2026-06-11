import { z } from "zod";

const emptyStringToNull = (value: unknown) => value === "" ? null : value;

const paymentTypeSchema = z
  .preprocess(emptyStringToNull, z.enum(PAYMENT_TYPES).nullable().optional())
  .transform((v) => v ?? null);


const blankToUndefined = (value: unknown) => value === "" ? undefined : value;
import {
  CARRIER_KINDS,
  CARRIER_STATUSES,
  COMMISSION_STATUSES,
  DEAL_STATUSES,
  DRIVER_STATUSES,
  FREIGHT_KINDS,
  FREIGHT_STATUSES,
  LOAD_METHODS,
  PAYMENT_STATUSES,
  PAYMENT_TYPES,
  RELATED_ENTITY_TYPES,
  TASK_PRIORITIES,
  TASK_STATUSES,
  TASK_TYPES,
  VEHICLE_STATUSES,
} from "./statuses";

const nullableText = (max = 255) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v == null || v === "" ? null : v));

const optionalUuid = z.preprocess(
  (v) => (v === "" || v === "none" || v == null ? null : v),
  z.string().uuid().nullable(),
);

const optionalNumber = z
  .union([z.number(), z.string()])
  .optional()
  .nullable()
  .transform((v) => {
    if (v == null || v === "") return null;
    const n = typeof v === "string" ? Number(v) : v;
    return Number.isFinite(n) ? n : null;
  });

const optionalInt = z
  .union([z.number(), z.string()])
  .optional()
  .nullable()
  .transform((v) => {
    if (v == null || v === "") return null;
    const n = typeof v === "string" ? Number(v) : v;
    return Number.isFinite(n) ? Math.trunc(n) : null;
  });

const optionalDate = z
  .string()
  .optional()
  .nullable()
  .transform((v) => (v == null || v === "" ? null : v));

// =================== Carrier ===================
const innSchema = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v == null || v === "" ? null : v))
  .refine((v) => v === null || /^\d{10}$|^\d{12}$/.test(v), {
    message: "ИНН: 10 или 12 цифр",
  });

const ogrnSchema = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v == null || v === "" ? null : v))
  .refine((v) => v === null || /^\d{13}$|^\d{15}$/.test(v), {
    message: "ОГРН — 13 цифр, ОГРНИП — 15 цифр",
  });

const phoneSchema = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v == null || v === "" ? null : v))
  .refine((v) => v === null || /^[+\d][\d\s()\-]{5,30}$/.test(v), {
    message: "Некорректный телефон",
  });

const emailSchema = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v == null || v === "" ? null : v))
  .refine((v) => v === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), {
    message: "Некорректный email",
  });

export const carrierCreateSchema = z.object({
  name: z.string().trim().min(1, "Название обязательно").max(255),
  carrier_kind: z.enum(CARRIER_KINDS),
  tax_regime: nullableText(50),
  inn: innSchema,
  ogrn: ogrnSchema,
  phone: phoneSchema,
  email: emailSchema,
  city: nullableText(100),
  ati_id: nullableText(50),
  ati_phone: phoneSchema,
  ati_email: emailSchema,
  whatsapp: nullableText(100),
  telegram: nullableText(100),
  max_messenger: nullableText(255),
  bank_name: nullableText(255),
  bank_account: nullableText(50),
  bank_bik: nullableText(20),
  bank_corr_account: nullableText(50),
  commission_rate: z
    .union([z.number(), z.string()])
    .optional()
    .transform((v) => (v == null || v === "" ? 0.05 : Number(v)))
    .refine((n) => Number.isFinite(n) && n >= 0 && n <= 1, "0..1"),
  payment_method: nullableText(100),
  commission_payment_method: nullableText(100),
  commission_agreed: z.boolean().optional().default(false),
  verification_status: z.enum(CARRIER_STATUSES).optional().default("new"),
  dispatcher_comment: nullableText(2000),
  production_carrier_id: optionalUuid,
});
export type CarrierCreateInput = z.infer<typeof carrierCreateSchema>;

export const carrierUpdateSchema = carrierCreateSchema.partial();
export type CarrierUpdateInput = z.infer<typeof carrierUpdateSchema>;

// =================== Driver ===================
export const driverCreateSchema = z.object({
  full_name: z.string().trim().min(1, "ФИО обязательно").max(255),
  phone: nullableText(50),
  email: nullableText(255),
  whatsapp: nullableText(100),
  telegram: nullableText(100),
  max_messenger: nullableText(255),
  city: nullableText(100),
  dispatcher_carrier_ext_id: optionalUuid,
  dispatcher_status: z.enum(DRIVER_STATUSES).optional().default("new"),
  docs_verified: z.boolean().optional().default(false),
  dispatcher_comment: nullableText(2000),
  production_driver_id: optionalUuid,
});
export type DriverCreateInput = z.infer<typeof driverCreateSchema>;

export const driverUpdateSchema = driverCreateSchema.partial();
export type DriverUpdateInput = z.infer<typeof driverUpdateSchema>;

// =================== Vehicle ===================
export const vehicleCreateSchema = z.object({
  vehicle_kind: nullableText(100),
  body_type: nullableText(100),
  payload_kg: optionalNumber,
  volume_m3: optionalNumber,
  length_m: optionalNumber,
  width_m: optionalNumber,
  height_m: optionalNumber,
  load_methods: z
    .array(z.string().trim().min(1))
    .optional()
    .default([]),
  home_city: nullableText(100),
  current_city: nullableText(100).optional(),
  current_lat: optionalNumber.optional(),
  current_lng: optionalNumber.optional(),
  ready_to_cities: z
    .array(z.string().trim().min(1).max(100))
    .optional()
    .default([]),
  ready_date: optionalDate,
  ready_comment: nullableText(1000).optional(),
  dispatcher_driver_ext_id: optionalUuid,
  dispatcher_carrier_ext_id: optionalUuid,
  dispatcher_status: z.enum(VEHICLE_STATUSES).optional().default("new"),
  minimum_trip_rate: optionalNumber,
  minimum_km_rate: optionalNumber,
  city_rate: optionalNumber,
  point_rate: optionalNumber,
  rate_comment: nullableText(1000),
  dispatcher_comment: nullableText(2000),
  production_vehicle_id: optionalUuid,
  load_status: z.enum(["empty", "partial", "loaded", "unavailable", "repair", "resting"]).optional(),
  free_payload_kg: optionalNumber.optional(),
  free_volume_m3: optionalNumber.optional(),
  partial_route_from: nullableText(255).optional(),
  partial_route_to: nullableText(255).optional(),
  loading_restrictions: nullableText(1000).optional(),
});
export type VehicleCreateInput = z.infer<typeof vehicleCreateSchema>;

export const vehicleUpdateSchema = vehicleCreateSchema.partial();
export type VehicleUpdateInput = z.infer<typeof vehicleUpdateSchema>;

// Готовность машины от перевозчика/водителя.
export const vehicleReadinessSchema = z.object({
  current_city: nullableText(100).optional(),
  ready_to_cities: z.array(z.string().trim().min(1).max(100)).optional(),
  ready_comment: nullableText(1000).optional(),
  ready_date: optionalDate.optional(),
  load_status: z.enum(["empty", "partial", "loaded", "unavailable", "repair", "resting"]).optional(),
  free_payload_kg: optionalNumber.optional(),
  free_volume_m3: optionalNumber.optional(),
  partial_route_from: nullableText(255).optional(),
  partial_route_to: nullableText(255).optional(),
  loading_restrictions: nullableText(1000).optional(),
});
export type VehicleReadinessInput = z.infer<typeof vehicleReadinessSchema>;

// =================== Freight ===================
export const freightCreateSchema = z.object({
  title: nullableText(255),
  loading_city: nullableText(100),
  unloading_city: nullableText(100),
  loading_date: optionalDate,
  unloading_date: optionalDate,
  cargo_name: nullableText(255),
  weight_kg: optionalNumber,
  volume_m3: optionalNumber,
  body_type: nullableText(100),
  load_methods: z.array(z.enum(LOAD_METHODS)).optional().default([]),
  rate: optionalNumber,
  payment_type: paymentTypeSchema,
  payment_delay_days: optionalInt,
  source: nullableText(255),
  source_url: nullableText(1024),
  source_type: nullableText(64).optional(),
  contact_name: nullableText(255),
  contact_phone: nullableText(50),
  contact_whatsapp: nullableText(100),
  contact_telegram: nullableText(100),
  contact_max_messenger: nullableText(255),
  customer_name: nullableText(255).optional(),
  customer_phone: nullableText(50).optional(),
  customer_email: nullableText(255).optional(),
  customer_emails: z.array(z.string().trim().min(1).max(255)).optional(),
  customer_send_comment: nullableText(2000).optional(),
  comment: nullableText(2000),
  dispatcher_status: z.preprocess(blankToUndefined, z.enum(FREIGHT_STATUSES).optional().default("new")),
  freight_kind: z.preprocess(blankToUndefined, z.enum(FREIGHT_KINDS).optional().default("main")),
  assigned_carrier_ext_id: optionalUuid.optional(),
  assigned_driver_ext_id: optionalUuid.optional(),
  assigned_vehicle_ext_id: optionalUuid.optional(),
});
export type FreightCreateInput = z.infer<typeof freightCreateSchema>;

// Update schema: НИКАКИХ defaults — отсутствующие поля остаются undefined и
// не перетирают существующие значения в БД.
export const freightUpdateSchema = z
  .object({
    title: nullableText(255).optional(),
    loading_city: nullableText(100).optional(),
    unloading_city: nullableText(100).optional(),
    loading_date: optionalDate.optional(),
    unloading_date: optionalDate.optional(),
    cargo_name: nullableText(255).optional(),
    weight_kg: optionalNumber.optional(),
    volume_m3: optionalNumber.optional(),
    body_type: nullableText(100).optional(),
    load_methods: z.array(z.enum(LOAD_METHODS)).optional(),
    rate: optionalNumber.optional(),
    payment_type: z
      .union([z.enum(PAYMENT_TYPES), z.literal(""), z.null()])
      .optional()
      .transform((v) => (v === "" || v === null ? null : v)),
    payment_delay_days: optionalInt.optional(),
    source: nullableText(255).optional(),
    source_url: nullableText(1024).optional(),
    contact_name: nullableText(255).optional(),
    contact_phone: nullableText(50).optional(),
    contact_whatsapp: nullableText(100).optional(),
    contact_telegram: nullableText(100).optional(),
    contact_max_messenger: nullableText(255).optional(),
    comment: nullableText(2000).optional(),
    dispatcher_status: z
      .union([z.enum(FREIGHT_STATUSES), z.literal("")])
      .optional()
      .transform((v) => (v === "" ? undefined : v)),
    freight_kind: z
      .union([z.enum(FREIGHT_KINDS), z.literal("")])
      .optional()
      .transform((v) => (v === "" ? undefined : v)),
    assigned_carrier_ext_id: optionalUuid.optional(),
    assigned_driver_ext_id: optionalUuid.optional(),
    assigned_vehicle_ext_id: optionalUuid.optional(),
    carrier_request_id: optionalUuid.optional(),
    deal_id: optionalUuid.optional(),
    signed_pdf_document_id: optionalUuid.optional(),
    signed_sent_at: nullableText(64).optional(),
    signed_sent_channel: nullableText(32).optional(),
    signed_sent_comment: nullableText(2000).optional(),
  })
  .strip();
export type FreightUpdateInput = z.infer<typeof freightUpdateSchema>;

// =================== Deal ===================
export const dealCreateSchema = z.object({
  main_freight_id: optionalUuid,
  carrier_id: optionalUuid,
  driver_id: optionalUuid,
  vehicle_id: optionalUuid,
  deal_number: nullableText(64),
  route_from: nullableText(255),
  route_to: nullableText(255),
  loading_date: optionalDate,
  unloading_date: optionalDate,
  total_rate: optionalNumber,
  commission_rate: z
    .union([z.number(), z.string()])
    .optional()
    .transform((v) => (v == null || v === "" ? 0.05 : Number(v)))
    .refine((n) => Number.isFinite(n) && n >= 0 && n <= 1, "0..1"),
  payment_type: paymentTypeSchema,
  payment_delay_days: optionalInt,
  expected_payment_date: optionalDate,
  payment_due: optionalDate,
  carrier_payment_received_at: optionalDate,
  commission_paid_at: optionalDate,
  deal_status: z.enum(DEAL_STATUSES).optional().default("draft"),
  payment_status: z.enum(PAYMENT_STATUSES).optional().default("waiting_customer_payment"),
  commission_status: z.enum(COMMISSION_STATUSES).optional().default("accrued"),
  comment: nullableText(2000),
});
export type DealCreateInput = z.infer<typeof dealCreateSchema>;

export const dealUpdateSchema = dealCreateSchema.partial();
export type DealUpdateInput = z.infer<typeof dealUpdateSchema>;

export const dealFromMatchSchema = z.object({
  freight_id: z.string().uuid(),
  vehicle_id: z.string().uuid(),
});
export type DealFromMatchInput = z.infer<typeof dealFromMatchSchema>;

// =================== Tasks ===================
export const taskCreateSchema = z.object({
  task_type: z.enum(TASK_TYPES).optional().default("custom"),
  title: z.string().trim().min(1, "Название обязательно").max(255),
  description: nullableText(2000),
  priority: z.enum(TASK_PRIORITIES).optional().default("normal"),
  task_status: z.enum(TASK_STATUSES).optional().default("open"),
  due_date: optionalDate,
  due_at: optionalDate,
  related_entity_type: z
    .enum(RELATED_ENTITY_TYPES)
    .optional()
    .nullable()
    .transform((v) => v ?? null),
  related_entity_id: optionalUuid,
  dispatcher_carrier_ext_id: optionalUuid,
  dispatcher_driver_ext_id: optionalUuid,
  dispatcher_vehicle_ext_id: optionalUuid,
  dispatcher_freight_id: optionalUuid,
  dispatcher_deal_id: optionalUuid,
  action_url: nullableText(1024),
});
export type TaskCreateInput = z.input<typeof taskCreateSchema>;

export const taskUpdateSchema = taskCreateSchema.partial();
export type TaskUpdateInput = z.input<typeof taskUpdateSchema>;
