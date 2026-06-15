import { apiDelete, apiGet, apiPatch, apiPost, authHeaders } from "@/lib/api-client";
import type {
  CarrierCreateInput,
  CarrierUpdateInput,
  DealCreateInput,
  DealFromMatchInput,
  DealUpdateInput,
  DriverCreateInput,
  DriverUpdateInput,
  FreightCreateInput,
  FreightUpdateInput,
  TaskCreateInput,
  TaskUpdateInput,
  VehicleCreateInput,
  VehicleUpdateInput,
} from "./schemas";
import type {
  CarrierDTO,
  DealDTO,
  DriverDTO,
  FreightDTO,
  ListResponse,
  MatchResult,
  TaskDTO,
  VehicleDTO,
} from "./types";

function qs(params: Record<string, unknown>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "" || v === "all") continue;
    q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

// ========== carriers ==========
export const carriersApi = {
  list: (params: Record<string, unknown> = {}) =>
    apiGet<ListResponse<CarrierDTO>>(`/api/dispatcher/carriers${qs(params)}`, { auth: true }),
  get: (id: string) => apiGet<{ row: CarrierDTO }>(`/api/dispatcher/carriers/${id}`, { auth: true }),
  create: (body: CarrierCreateInput) => apiPost<{ row: CarrierDTO }>("/api/dispatcher/carriers", body),
  update: (id: string, body: CarrierUpdateInput) =>
    apiPatch<{ row: CarrierDTO }>(`/api/dispatcher/carriers/${id}`, body),
  archive: (id: string) => apiDelete<{ ok: true }>(`/api/dispatcher/carriers/${id}`),
};

// ========== drivers ==========
export const driversApi = {
  list: (params: Record<string, unknown> = {}) =>
    apiGet<ListResponse<DriverDTO>>(`/api/dispatcher/drivers${qs(params)}`, { auth: true }),
  get: (id: string) => apiGet<{ row: DriverDTO }>(`/api/dispatcher/drivers/${id}`, { auth: true }),
  create: (body: DriverCreateInput) => apiPost<{ row: DriverDTO }>("/api/dispatcher/drivers", body),
  update: (id: string, body: DriverUpdateInput) =>
    apiPatch<{ row: DriverDTO }>(`/api/dispatcher/drivers/${id}`, body),
  archive: (id: string) => apiDelete<{ ok: true }>(`/api/dispatcher/drivers/${id}`),
};

// ========== vehicles ==========
export const vehiclesApi = {
  list: (params: Record<string, unknown> = {}) =>
    apiGet<ListResponse<VehicleDTO>>(`/api/dispatcher/vehicles${qs(params)}`, { auth: true }),
  get: (id: string) => apiGet<{ row: VehicleDTO }>(`/api/dispatcher/vehicles/${id}`, { auth: true }),
  create: (body: VehicleCreateInput) => apiPost<{ row: VehicleDTO }>("/api/dispatcher/vehicles", body),
  update: (id: string, body: VehicleUpdateInput) =>
    apiPatch<{ row: VehicleDTO }>(`/api/dispatcher/vehicles/${id}`, body),
  archive: (id: string) => apiDelete<{ ok: true }>(`/api/dispatcher/vehicles/${id}`),
};

// ========== free-vehicles workboard ==========
export interface FreeVehicleRow {
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
  current_city: string | null;
  current_lat: number | null;
  current_lng: number | null;
  location_updated_at: string | null;
  location_source: string | null;
  has_coordinates: boolean;
  ready_to_cities: string[] | null;
  ready_date: string | null;
  ready_from: string | null;
  ready_comment: string | null;
  ready_radius_km: number | null;
  ready_mode: string | null;
  ready_weekdays: number[] | null;
  load_status: string | null;
  free_payload_kg: number | null;
  free_volume_m3: number | null;
  partial_route_from: string | null;
  partial_route_to: string | null;
  loading_restrictions: string | null;
  dispatcher_status: string | null;
  dispatcher_work_status: string | null;
  dispatcher_taken_by: string | null;
  dispatcher_taken_at: string | null;
  minimum_trip_rate: number | null;
  minimum_km_rate: number | null;
  city_rate: number | null;
  point_rate: number | null;
  rate_comment: string | null;
  dispatcher_comment: string | null;
  docs_status: string | null;
  driver: {
    id: string;
    full_name: string | null;
    phone: string | null;
    email: string | null;
    whatsapp: string | null;
    telegram: string | null;
    max_messenger: string | null;
    city: string | null;
    docs_status: string | null;
  } | null;
  carrier: {
    id: string;
    name: string | null;
    inn: string | null;
    phone: string | null;
    email: string | null;
    whatsapp: string | null;
    telegram: string | null;
    max_messenger: string | null;
    city: string | null;
    ati_id: string | null;
    ati_phone: string | null;
    verification_status: string | null;
  } | null;
  taken_by_self: boolean;
  taken_by_profile: { full_name: string | null; email: string | null } | null;
}
export const freeVehiclesApi = {
  list: (params: Record<string, unknown> = {}) =>
    apiGet<{ rows: FreeVehicleRow[]; total: number; user_id: string }>(
      `/api/dispatcher/free-vehicles${qs(params)}`,
      { auth: true },
    ),
  takeWork: (id: string) =>
    apiPost<{ ok: true; row: unknown }>(`/api/dispatcher/vehicles/${id}/take-work`),
  releaseWork: (id: string) =>
    apiPost<{ ok: true; row: unknown }>(`/api/dispatcher/vehicles/${id}/release-work`),
};

// ========== freights ==========
export const freightsApi = {
  list: (params: Record<string, unknown> = {}) =>
    apiGet<ListResponse<FreightDTO>>(`/api/dispatcher/freights${qs(params)}`, { auth: true }),
  get: (id: string) => apiGet<{ row: FreightDTO }>(`/api/dispatcher/freights/${id}`, { auth: true }),
  create: (body: FreightCreateInput) => apiPost<{ row: FreightDTO }>("/api/dispatcher/freights", body),
  update: (id: string, body: FreightUpdateInput) =>
    apiPatch<{ row: FreightDTO }>(`/api/dispatcher/freights/${id}`, body),
  archive: (id: string) => apiDelete<{ ok: true }>(`/api/dispatcher/freights/${id}`),
  matchVehicles: (id: string) =>
    apiPost<{ rows: MatchResult[]; total: number }>(
      `/api/dispatcher/freights/${id}/match-vehicles`,
    ),
};

export { authHeaders };

// ========== deals ==========
export interface DealStatusUpdateInput {
  deal_status: string;
  comment?: string | null;
  cancel_reason?: string | null;
  customer_payment_due_date?: string | null;
  commission_due_date?: string | null;
  dispatcher_next_action?: string | null;
}

export const dealsApi = {
  list: (params: Record<string, unknown> = {}) =>
    apiGet<ListResponse<DealDTO>>(`/api/dispatcher/deals${qs(params)}`, { auth: true }),
  get: (id: string) => apiGet<{ row: DealDTO }>(`/api/dispatcher/deals/${id}`, { auth: true }),
  create: (body: DealCreateInput) => apiPost<{ row: DealDTO }>("/api/dispatcher/deals", body),
  update: (id: string, body: DealUpdateInput) =>
    apiPatch<{ row: DealDTO }>(`/api/dispatcher/deals/${id}`, body),
  updateStatus: (id: string, body: DealStatusUpdateInput) =>
    apiPatch<{ row: Partial<DealDTO>; created_task: { id: string; title: string } | null }>(
      `/api/dispatcher/deals/${id}/status`,
      body,
    ),
  archive: (id: string) => apiDelete<{ ok: true }>(`/api/dispatcher/deals/${id}`),
  fromMatch: (body: DealFromMatchInput) =>
    apiPost<{ row: DealDTO; already_exists?: boolean }>("/api/dispatcher/deals/from-match", body),
};

// ========== dashboard ==========
export interface DashboardKpis {
  available_vehicles_count: number;
  active_freights_count: number;
  active_deals_count: number;
  commissions_to_receive_sum: number;
  overdue_sum: number;
  received_month_sum: number;
}
export interface DashboardTask {
  id: string;
  type: string;
  title: string;
  target_kind: string;
  target_id: string | null;
  target_label: string | null;
  action_label: string;
  action_href: string;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface DashboardResponse {
  kpis: DashboardKpis;
  availableVehicles: Array<Record<string, unknown>>;
  activeFreights: Array<Record<string, unknown>>;
  activeDeals: DealDTO[];
  waitingPayments: DealDTO[];
  waitingCommissions: DealDTO[];
  overdueCommissions: DealDTO[];
  todayTasks: DashboardTask[];
  today: string;
}
export const dashboardApi = {
  get: () => apiGet<DashboardResponse>("/api/dispatcher/dashboard", { auth: true }),
};

// ========== tasks ==========
export const tasksApi = {
  list: (params: Record<string, unknown> = {}) =>
    apiGet<ListResponse<TaskDTO>>(`/api/dispatcher/tasks${qs(params)}`, { auth: true }),
  get: (id: string) => apiGet<{ row: TaskDTO }>(`/api/dispatcher/tasks/${id}`, { auth: true }),
  create: (body: TaskCreateInput) => apiPost<{ row: TaskDTO }>("/api/dispatcher/tasks", body),
  update: (id: string, body: TaskUpdateInput) =>
    apiPatch<{ row: TaskDTO }>(`/api/dispatcher/tasks/${id}`, body),
  remove: (id: string) => apiDelete<{ ok: true }>(`/api/dispatcher/tasks/${id}`),
  complete: (id: string) => apiPost<{ row: TaskDTO }>(`/api/dispatcher/tasks/${id}/complete`),
  generateDaily: () =>
    apiPost<{ created: number; total: number; today: string }>(
      "/api/dispatcher/tasks/generate-daily",
    ),
};

// ========== dispatcher commissions / earnings (Stage 11.14) ==========
export interface DispatcherEarningsRow extends DealDTO {
  source_request_number?: string | null;
}
export interface DispatcherEarningsSummary {
  total_count: number;
  dispatcher_total: number;
  platform_total: number;
  commission_total: number;
  dispatcher_pending: number;
  dispatcher_ready: number;
  dispatcher_paid: number;
}
export interface DispatcherEarningsResponse {
  rows: DispatcherEarningsRow[];
  total: number;
  summary: DispatcherEarningsSummary;
  is_admin: boolean;
  current_user_id: string;
}
export const dispatcherEarningsApi = {
  list: (params: Record<string, unknown> = {}) =>
    apiGet<DispatcherEarningsResponse>(
      `/api/dispatcher/commissions/earnings${qs(params)}`,
      { auth: true },
    ),
  setPayout: (
    dealId: string,
    body: {
      dispatcher_payout_status?: string;
      dispatcher_paid_at?: string | null;
      dispatcher_payout_due_date?: string | null;
      dispatcher_payout_comment?: string | null;
    },
  ) =>
    apiPatch<{ row: Record<string, unknown> }>(
      `/api/dispatcher/commissions/earnings/${dealId}/payout`,
      body,
    ),
};

