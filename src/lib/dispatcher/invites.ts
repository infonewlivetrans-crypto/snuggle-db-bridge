// Типы и API-клиент для invite-токенов AI-диспетчера.
import { apiDelete, apiGet, apiPost } from "@/lib/api-client";

export const INVITE_TYPES = [
  "carrier_registration",
  "driver_registration",
  "vehicle_registration",
  "carrier_driver_registration",
] as const;
export type InviteType = (typeof INVITE_TYPES)[number];

export const INVITE_ENTITY_TYPES = ["carrier", "driver", "vehicle"] as const;
export type InviteEntityType = (typeof INVITE_ENTITY_TYPES)[number];

export interface InviteTokenDTO {
  id: string;
  token: string;
  invite_type: InviteType;
  related_entity_type: InviteEntityType;
  related_entity_id: string;
  expires_at: string | null;
  used_at: string | null;
  revoked_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface InviteCreateInput {
  invite_type: InviteType;
  related_entity_type: InviteEntityType;
  related_entity_id: string;
  expires_in_days?: number;
}

export interface InviteCreateResult {
  row: InviteTokenDTO;
  invite_url: string;
}

function qs(params: Record<string, unknown>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "" || v === "all") continue;
    q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

export const invitesApi = {
  list: (params: Record<string, unknown> = {}) =>
    apiGet<{ rows: InviteTokenDTO[]; total: number }>(
      `/api/dispatcher/invites${qs(params)}`,
      { auth: true },
    ),
  create: (body: InviteCreateInput) =>
    apiPost<InviteCreateResult>("/api/dispatcher/invites", body),
  revoke: (id: string) =>
    apiPost<{ row: InviteTokenDTO }>(`/api/dispatcher/invites/${id}/revoke`),
};

// Заглушка, чтобы линтер не ругался на неиспользованный импорт.
void apiDelete;

const DEFAULT_PUBLIC_APP_URL = "https://radius-track.ru";

function getPublicAppUrl(): string {
  const fromEnv =
    (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined) ?? undefined;
  const raw = (fromEnv && String(fromEnv).trim()) || DEFAULT_PUBLIC_APP_URL;
  return raw.replace(/\/+$/, "");
}

export function dispatcherInviteUrl(token: string): string {
  return `${getPublicAppUrl()}/dispatcher/register/${token}`;
}
