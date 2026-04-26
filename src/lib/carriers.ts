export type CarrierType = "self_employed" | "ip" | "ooo";
export type CarrierVerificationStatus = "new" | "in_review" | "approved" | "rejected";
export type BodyType =
  | "tent"
  | "isotherm"
  | "refrigerator"
  | "flatbed"
  | "closed_van"
  | "manipulator"
  | "tipper"
  | "container"
  | "car_carrier"
  | "other";

export type Carrier = {
  id: string;
  carrier_type: CarrierType;
  company_name: string;
  inn: string | null;
  ogrn: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  contact_person: string | null;
  bank_name: string | null;
  bank_account: string | null;
  bank_bik: string | null;
  bank_corr_account: string | null;
  verification_status: CarrierVerificationStatus;
  verification_comment: string | null;
  created_at: string;
  updated_at: string;
};

export type Driver = {
  id: string;
  carrier_id: string;
  full_name: string;
  phone: string | null;
  passport_series: string | null;
  passport_number: string | null;
  passport_issued_by: string | null;
  passport_issued_date: string | null;
  license_number: string | null;
  license_issued_date: string | null;
  license_expires_date: string | null;
  license_categories: string | null;
  photo_url: string | null;
  is_active: boolean;
  comment: string | null;
  created_at: string;
  updated_at: string;
};

export type Vehicle = {
  id: string;
  carrier_id: string;
  plate_number: string;
  brand: string | null;
  model: string | null;
  body_type: BodyType;
  capacity_kg: number | null;
  volume_m3: number | null;
  body_length_m: number | null;
  body_width_m: number | null;
  body_height_m: number | null;
  tie_rings_count: number;
  has_straps: boolean;
  has_tent: boolean;
  has_manipulator: boolean;
  comment: string | null;
  photo_front_url: string | null;
  photo_back_url: string | null;
  photo_left_url: string | null;
  photo_right_url: string | null;
  photo_inside_url: string | null;
  photo_documents_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export const CARRIER_TYPE_LABELS: Record<CarrierType, string> = {
  self_employed: "Самозанятый",
  ip: "ИП",
  ooo: "ООО",
};

export const CARRIER_TYPE_ORDER: CarrierType[] = ["self_employed", "ip", "ooo"];

export const VERIFICATION_LABELS: Record<CarrierVerificationStatus, string> = {
  new: "Новый",
  in_review: "На проверке",
  approved: "Подтверждён",
  rejected: "Отклонён",
};

export const VERIFICATION_ORDER: CarrierVerificationStatus[] = [
  "new",
  "in_review",
  "approved",
  "rejected",
];

export const VERIFICATION_STYLES: Record<CarrierVerificationStatus, string> = {
  new: "bg-blue-100 text-blue-900 border-blue-200",
  in_review: "bg-amber-100 text-amber-900 border-amber-200",
  approved: "bg-green-100 text-green-900 border-green-200",
  rejected: "bg-red-100 text-red-900 border-red-200",
};

export const BODY_TYPE_LABELS: Record<BodyType, string> = {
  tent: "Тент",
  isotherm: "Изотерм",
  refrigerator: "Рефрижератор",
  flatbed: "Бортовой",
  closed_van: "Фургон",
  manipulator: "Манипулятор",
  tipper: "Самосвал",
  container: "Контейнеровоз",
  car_carrier: "Автовоз",
  other: "Другое",
};

export const BODY_TYPE_ORDER: BodyType[] = [
  "tent",
  "isotherm",
  "refrigerator",
  "flatbed",
  "closed_van",
  "manipulator",
  "tipper",
  "container",
  "car_carrier",
  "other",
];
