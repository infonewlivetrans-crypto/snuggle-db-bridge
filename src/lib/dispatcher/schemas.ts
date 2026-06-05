import { z } from "zod";
import {
  CARRIER_KINDS,
  CARRIER_STATUSES,
  DRIVER_STATUSES,
  FREIGHT_KINDS,
  FREIGHT_STATUSES,
  LOAD_METHODS,
  PAYMENT_TYPES,
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
export const carrierCreateSchema = z.object({
  name: z.string().trim().min(1, "Название обязательно").max(255),
  carrier_kind: z.enum(CARRIER_KINDS),
  inn: nullableText(20),
  ogrn: nullableText(20),
  phone: nullableText(50),
  email: nullableText(255),
  city: nullableText(100),
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
  ready_to_cities: z
    .array(z.string().trim().min(1).max(100))
    .optional()
    .default([]),
  ready_date: optionalDate,
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
});
export type VehicleCreateInput = z.infer<typeof vehicleCreateSchema>;

export const vehicleUpdateSchema = vehicleCreateSchema.partial();
export type VehicleUpdateInput = z.infer<typeof vehicleUpdateSchema>;

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
  payment_type: z
    .enum(PAYMENT_TYPES)
    .optional()
    .nullable()
    .transform((v) => v ?? null),
  payment_delay_days: optionalInt,
  source: nullableText(255),
  source_url: nullableText(1024),
  contact_name: nullableText(255),
  contact_phone: nullableText(50),
  contact_whatsapp: nullableText(100),
  contact_telegram: nullableText(100),
  contact_max_messenger: nullableText(255),
  comment: nullableText(2000),
  dispatcher_status: z.enum(FREIGHT_STATUSES).optional().default("new"),
  freight_kind: z.enum(FREIGHT_KINDS).optional().default("main"),
});
export type FreightCreateInput = z.infer<typeof freightCreateSchema>;

export const freightUpdateSchema = freightCreateSchema.partial();
export type FreightUpdateInput = z.infer<typeof freightUpdateSchema>;
