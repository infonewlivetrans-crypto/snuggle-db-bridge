// DTO для UI/API. Поля совпадают с колонками dispatcher_*_ext / dispatcher_freights.

export interface CarrierDTO {
  id: string;
  name: string | null;
  carrier_kind: string | null;
  inn: string | null;
  ogrn: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  whatsapp: string | null;
  telegram: string | null;
  max_messenger: string | null;
  bank_name: string | null;
  bank_account: string | null;
  bank_bik: string | null;
  bank_corr_account: string | null;
  commission_rate: number;
  payment_method: string | null;
  commission_agreed: boolean;
  commission_agreed_at: string | null;
  commission_agreed_by: string | null;
  commission_agreement_text: string | null;
  commission_payment_method: string | null;
  verification_status: string;
  dispatcher_comment: string | null;
  production_carrier_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface DriverDTO {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  whatsapp: string | null;
  telegram: string | null;
  max_messenger: string | null;
  city: string | null;
  dispatcher_carrier_ext_id: string | null;
  dispatcher_status: string;
  docs_verified: boolean;
  dispatcher_comment: string | null;
  production_driver_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface VehicleDTO {
  id: string;
  vehicle_kind: string | null;
  body_type: string | null;
  payload_kg: number | null;
  volume_m3: number | null;
  length_m: number | null;
  width_m: number | null;
  height_m: number | null;
  load_methods: string[] | null;
  home_city: string | null;
  ready_to_cities: string[] | null;
  ready_date: string | null;
  dispatcher_driver_ext_id: string | null;
  dispatcher_carrier_ext_id: string | null;
  dispatcher_status: string;
  minimum_trip_rate: number | null;
  minimum_km_rate: number | null;
  city_rate: number | null;
  point_rate: number | null;
  rate_comment: string | null;
  dispatcher_comment: string | null;
  production_vehicle_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface FreightDTO {
  id: string;
  title: string | null;
  loading_city: string | null;
  unloading_city: string | null;
  loading_date: string | null;
  unloading_date: string | null;
  cargo_name: string | null;
  weight_kg: number | null;
  volume_m3: number | null;
  body_type: string | null;
  load_methods: string[] | null;
  rate: number | null;
  payment_type: string | null;
  payment_delay_days: number | null;
  source: string | null;
  source_url: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_whatsapp: string | null;
  contact_telegram: string | null;
  contact_max_messenger: string | null;
  comment: string | null;
  dispatcher_status: string;
  freight_kind: string;
  created_at: string;
  updated_at: string;
}

export type MatchVerdict = "fit" | "partial" | "no_fit";

export interface MatchResult {
  vehicle_id: string;
  vehicle_kind: string | null;
  body_type: string | null;
  payload_kg: number | null;
  volume_m3: number | null;
  home_city: string | null;
  ready_date: string | null;
  dispatcher_status: string;
  driver_id: string | null;
  driver_name: string | null;
  carrier_id: string | null;
  carrier_name: string | null;
  minimum_trip_rate: number | null;
  minimum_km_rate: number | null;
  freight_rate: number | null;
  commission: number | null;
  verdict: MatchVerdict;
  reasons: string[];
}

export interface ListResponse<T> {
  rows: T[];
  total: number;
}

export interface DealDTO {
  id: string;
  deal_number: string | null;
  main_freight_id: string | null;
  carrier_id: string | null;
  driver_id: string | null;
  vehicle_id: string | null;
  route_from: string | null;
  route_to: string | null;
  loading_date: string | null;
  unloading_date: string | null;
  total_rate: number;
  commission_rate: number;
  commission_amount: number | null;
  payment_type: string | null;
  payment_delay_days: number | null;
  expected_payment_date: string | null;
  payment_due: string | null;
  carrier_payment_received_at: string | null;
  commission_paid_at: string | null;
  deal_status: string;
  payment_status: string;
  commission_status: string;
  comment: string | null;
  created_at: string;
  updated_at: string;
  // joined display fields
  carrier_name?: string | null;
  carrier_phone?: string | null;
  carrier_max_messenger?: string | null;
  carrier_whatsapp?: string | null;
  carrier_telegram?: string | null;
  driver_name?: string | null;
  driver_phone?: string | null;
  driver_max_messenger?: string | null;
  driver_whatsapp?: string | null;
  driver_telegram?: string | null;
  vehicle_kind?: string | null;
  vehicle_body_type?: string | null;
  freight_title?: string | null;
}

export interface TaskDTO {
  id: string;
  task_type: string;
  title: string;
  description: string | null;
  priority: string;
  task_status: string;
  due_date: string | null;
  due_at: string | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
  dispatcher_carrier_ext_id: string | null;
  dispatcher_driver_ext_id: string | null;
  dispatcher_vehicle_ext_id: string | null;
  dispatcher_freight_id: string | null;
  dispatcher_deal_id: string | null;
  action_url: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  // joined display
  related_label?: string | null;
}
