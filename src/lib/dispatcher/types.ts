// DTO для UI/API. Поля совпадают с колонками dispatcher_*_ext.

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

export interface ListResponse<T> {
  rows: T[];
  total: number;
}
