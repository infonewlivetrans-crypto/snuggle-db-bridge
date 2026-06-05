import { z } from "zod";
import {
  CARRIER_KINDS,
  CARRIER_STATUSES,
  DRIVER_STATUSES,
  LOAD_METHODS,
  VEHICLE_STATUSES,
} from "./statuses";

// Поля общие для обоих направлений (client + server).

const nullableText = (max = 255) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v == null || v === "" ? null : v));

const optionalUuid = z
  .string()
  .uuid()
  .optional()
  .nullable()
  .transform((v) => v ?? null);

const optionalNumber = z
  .union([z.number(), z.string()])
  .optional()
  .nullable()
  .transform((v) => {
    if (v == null || v === "") return null;
    const n = typeof v === "string" ? Number(v) : v;
    return Number.isFinite(n) ? n : null;
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
  load_methods: z.array(z.enum(LOAD_METHODS)).optional().default([]),
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
