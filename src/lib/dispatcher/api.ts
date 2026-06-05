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
export const dealsApi = {
  list: (params: Record<string, unknown> = {}) =>
    apiGet<ListResponse<DealDTO>>(`/api/dispatcher/deals${qs(params)}`, { auth: true }),
  get: (id: string) => apiGet<{ row: DealDTO }>(`/api/dispatcher/deals/${id}`, { auth: true }),
  create: (body: DealCreateInput) => apiPost<{ row: DealDTO }>("/api/dispatcher/deals", body),
  update: (id: string, body: DealUpdateInput) =>
    apiPatch<{ row: DealDTO }>(`/api/dispatcher/deals/${id}`, body),
  archive: (id: string) => apiDelete<{ ok: true }>(`/api/dispatcher/deals/${id}`),
  fromMatch: (body: DealFromMatchInput) =>
    apiPost<{ row: DealDTO; already_exists?: boolean }>("/api/dispatcher/deals/from-match", body),
};
