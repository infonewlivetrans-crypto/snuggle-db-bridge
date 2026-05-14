// Server: создание маршрута + заказов + точек + delivery_route из строк маршрутного Excel.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { normalizeRuPhone } from "@/lib/phone";
import { inviteUrl } from "@/lib/invite-url";

import { ensureDefaultCarrierId } from "./carriers.server";
import {
  adminCreateInvite,
  findReusableDriverInvite,
} from "./invites.server";

export type RouteImportRow = {
  route_number?: string;
  driver?: string;
  driver_phone?: string;
  vehicle?: string;
  order_number?: string;
  client?: string;
  phone?: string;
  address?: string;
  map_link?: string;
  latitude?: number | null;
  longitude?: number | null;
  amount_due?: number | null;
  payment_type?: string;
  prepaid?: string;
  requires_qr?: string;
  marketplace?: string;
  manager_comment?: string;
};

export type DriverLinkStatus =
  | "linked_existing_active"
  | "linked_existing_invite"
  | "linked_new_invite"
  | "no_phone"
  | "invite_failed";

export type DriverLink = {
  deliveryRouteId: string;
  driverId: string | null;
  driverFullName: string;
  driverPhone: string | null;
  status: DriverLinkStatus;
  inviteId?: string | null;
  inviteToken?: string | null;
  message?: string;
};

export type RouteImportResult = {
  totalRows: number;
  routesCreated: number;
  pointsCreated: number;
  deliveryRouteIds: string[];
  driverLinks: DriverLink[];
  errors: Array<{ row: number; message: string }>;
};

const PAYMENT_MAP: Record<string, "cash" | "card" | "online" | "qr"> = {
  "наличные": "cash", "нал": "cash", "cash": "cash",
  "карта": "card", "card": "card",
  "онлайн": "online", "online": "online",
  "qr": "qr", "qr-код": "qr",
};

function toBool(v: unknown): boolean {
  if (v == null) return false;
  return ["да", "yes", "y", "true", "1", "+", "v", "✓"].includes(
    String(v).trim().toLowerCase(),
  );
}
function parseCoords(s?: string): { lat: number | null; lon: number | null } {
  if (!s) return { lat: null, lon: null };
  const m = s.match(/(-?\d+[.,]\d+)[\s,;]+(-?\d+[.,]\d+)/);
  if (!m) return { lat: null, lon: null };
  return { lat: Number(m[1].replace(",", ".")), lon: Number(m[2].replace(",", ".")) };
}

type ResolvedDriver = {
  id: string;
  fullName: string;
  phone: string | null;
  hasUser: boolean;
};

/**
 * По нормализованному телефону ищет или создаёт водителя.
 * Возвращает null, если телефон отсутствует/не валиден.
 */
async function resolveDriverByPhone(
  driverFullName: string,
  rawPhone: string | null | undefined,
): Promise<{ driver: ResolvedDriver | null; phone: string | null }> {
  const phone = normalizeRuPhone(rawPhone ?? null);
  if (!phone) return { driver: null, phone: null };

  // Согласованная логика: автосопоставление ТОЛЬКО по carrier_id + phone.
  // Поиск по ФИО запрещён — иначе можно привязать маршрут не тому человеку.
  const carrierId = await ensureDefaultCarrierId();

  // 1) Поиск по carrier_id + нормализованному телефону
  const { data: byPhone, error: phErr } = await supabaseAdmin
    .from("drivers")
    .select("id, full_name, phone, user_id")
    .eq("carrier_id", carrierId)
    .eq("phone", phone)
    .limit(1)
    .maybeSingle();
  if (phErr) throw new Error(phErr.message);
  if (byPhone) {
    const row = byPhone as { id: string; full_name: string; phone: string | null; user_id: string | null };
    return {
      driver: { id: row.id, fullName: row.full_name, phone: row.phone, hasUser: !!row.user_id },
      phone,
    };
  }

  // 2) Не найден — создаём нового водителя
  const { data: ins, error: insErr } = await supabaseAdmin
    .from("drivers")
    .insert({
      full_name: driverFullName.trim(),
      carrier_id: carrierId,
      phone,
      is_active: true,
      source: "route-import",
    } as never)
    .select("id, full_name, phone, user_id")
    .single();
  if (insErr) throw new Error(insErr.message);
  const row = ins as { id: string; full_name: string; phone: string | null; user_id: string | null };
  return {
    driver: { id: row.id, fullName: row.full_name, phone: row.phone, hasUser: !!row.user_id },
    phone,
  };
}

export async function importRouteRowsServer(
  sb: SupabaseClient<Database>,
  rows: RouteImportRow[],
  userId?: string | null,
): Promise<RouteImportResult> {
  const result: RouteImportResult = {
    totalRows: rows.length,
    routesCreated: 0,
    pointsCreated: 0,
    deliveryRouteIds: [],
    driverLinks: [],
    errors: [],
  };
  if (rows.length === 0) throw new Error("Файл пуст или не распознан");

  const groups = new Map<string, { rows: RouteImportRow[]; firstIndex: number }>();
  rows.forEach((r, i) => {
    const key = (r.route_number || "__default__").trim();
    if (!groups.has(key)) groups.set(key, { rows: [], firstIndex: i });
    groups.get(key)!.rows.push(r);
  });

  for (const [routeKey, group] of groups.entries()) {
    const baseRow = group.rows[0];
    try {
      const missing: string[] = [];
      if (!baseRow.route_number) missing.push("номер маршрута");
      if (!baseRow.driver) missing.push("водитель");
      if (missing.length) throw new Error("Не заполнены обязательные данные: " + missing.join(", "));

      // Готовим водителя ДО создания маршрута, чтобы при ошибке не плодить routes/orders.
      let resolvedDriver: ResolvedDriver | null = null;
      let resolvedPhone: string | null = null;
      try {
        const r = await resolveDriverByPhone(baseRow.driver!, baseRow.driver_phone ?? null);
        resolvedDriver = r.driver;
        resolvedPhone = r.phone;
      } catch (e) {
        // Не валим весь маршрут, если поиск/создание водителя сорвалось — просто пометим как no_phone.
        console.error("[route-import] resolveDriverByPhone failed:", e);
        resolvedDriver = null;
        resolvedPhone = null;
      }

      const { data: routeNumData, error: rnErr } = await sb.rpc("generate_route_number");
      if (rnErr) throw rnErr;

      const { data: routeRow, error: routeErr } = await sb
        .from("routes")
        .insert({
          route_number: routeNumData as string,
          driver_name: baseRow.driver,
          route_date: new Date().toISOString().slice(0, 10),
          request_type: "client_delivery",
          status: "planned",
          comment: baseRow.manager_comment || null,
        } as never)
        .select("id, route_number")
        .single();
      if (routeErr) throw routeErr;

      const pointsToInsert: Array<{ order_id: string; point_number: number }> = [];
      let pointNum = 1;
      for (const r of group.rows) {
        try {
          const rowMissing: string[] = [];
          if (!r.order_number?.trim()) rowMissing.push("номер заказа");
          if (!r.client?.trim()) rowMissing.push("клиент");
          if (!r.address && !r.map_link && r.latitude == null && r.longitude == null)
            rowMissing.push("адрес или координаты");
          if (rowMissing.length)
            throw new Error("Не заполнены обязательные данные: " + rowMissing.join(", "));

          const paymentRaw = (r.payment_type ?? "").trim().toLowerCase();
          const payment_type = PAYMENT_MAP[paymentRaw] || "cash";
          const requiresQr = toBool(r.requires_qr) || payment_type === "qr";
          const prepaid = toBool(r.prepaid);

          let latitude = r.latitude ?? null;
          let longitude = r.longitude ?? null;
          if ((latitude == null || longitude == null) && r.map_link) {
            const c = parseCoords(r.map_link);
            latitude = latitude ?? c.lat;
            longitude = longitude ?? c.lon;
          }

          const { data: order, error: orderErr } = await sb
            .from("orders")
            .insert({
              order_number: r.order_number!.trim(),
              delivery_address: r.address ?? null,
              latitude,
              longitude,
              map_link: r.map_link ?? null,
              contact_name: r.client ?? null,
              contact_phone: r.phone ?? null,
              payment_type,
              requires_qr: requiresQr,
              amount_due: r.amount_due ?? null,
              payment_status: prepaid ? "paid" : "not_paid",
              comment: r.manager_comment ?? null,
              marketplace: r.marketplace ?? null,
              source: "manual",
              status: "ready_for_delivery",
            } as never)
            .select("id")
            .single();
          if (orderErr) throw orderErr;

          pointsToInsert.push({ order_id: (order as { id: string }).id, point_number: pointNum++ });
        } catch (e) {
          result.errors.push({
            row: group.firstIndex + group.rows.indexOf(r) + 2,
            message: e instanceof Error ? e.message : String(e),
          });
        }
      }

      if (pointsToInsert.length === 0) {
        await sb.from("routes").delete().eq("id", (routeRow as { id: string }).id);
        throw new Error("Не создано ни одной точки маршрута");
      }

      const { error: pErr } = await sb
        .from("route_points")
        .insert(pointsToInsert.map((p) => ({
          route_id: (routeRow as { id: string }).id,
          order_id: p.order_id,
          point_number: p.point_number,
          status: "pending" as const,
        })) as never);
      if (pErr) throw pErr;

      const assignedDriverName = resolvedDriver?.fullName ?? baseRow.driver!;
      const { data: dr, error: drErr } = await sb
        .from("delivery_routes")
        .insert({
          route_number: "",
          source_request_id: (routeRow as { id: string }).id,
          route_date: new Date().toISOString().slice(0, 10),
          status: "formed",
          assigned_driver: assignedDriverName,
          assigned_vehicle: baseRow.vehicle ?? null,
          comment: baseRow.manager_comment ?? null,
          driver_id: resolvedDriver?.id ?? null,
        } as never)
        .select("id")
        .single();
      if (drErr) throw drErr;

      const deliveryRouteId = (dr as { id: string }).id;
      result.routesCreated++;
      result.pointsCreated += pointsToInsert.length;
      result.deliveryRouteIds.push(deliveryRouteId);

      // Driver-link: только после успешного создания delivery_route.
      if (!resolvedDriver || !resolvedPhone) {
        result.driverLinks.push({
          deliveryRouteId,
          driverId: resolvedDriver?.id ?? null,
          driverFullName: assignedDriverName,
          driverPhone: null,
          status: "no_phone",
          message: "Телефон водителя не указан или некорректен — invite-ссылка не создана.",
        });
      } else if (resolvedDriver.hasUser) {
        result.driverLinks.push({
          deliveryRouteId,
          driverId: resolvedDriver.id,
          driverFullName: resolvedDriver.fullName,
          driverPhone: resolvedPhone,
          status: "linked_existing_active",
        });
      } else {
        try {
          const reusable = await findReusableDriverInvite(resolvedDriver.id);
          let invite: InviteRow;
          let status: DriverLinkStatus;
          if (reusable) {
            invite = reusable;
            status = "linked_existing_invite";
          } else {
            invite = await adminCreateInvite({
              fullName: resolvedDriver.fullName,
              phone: resolvedPhone,
              role: "driver",
              driverId: resolvedDriver.id,
              createdBy: userId ?? null,
            });
            status = "linked_new_invite";
          }
          result.driverLinks.push({
            deliveryRouteId,
            driverId: resolvedDriver.id,
            driverFullName: resolvedDriver.fullName,
            driverPhone: resolvedPhone,
            status,
            inviteId: invite.id,
            inviteToken: invite.token,
          });
        } catch (e) {
          // Маршрут уже создан в БД — НЕ откатываем его. Фиксируем invite_failed
          // и добавляем понятное сообщение в result.errors, чтобы UI не показал
          // «успех», а пользователь увидел, что invite-ссылка не создана.
          const msg = e instanceof Error ? e.message : String(e);
          console.error("[route-import] adminCreateInvite failed:", e);
          result.driverLinks.push({
            deliveryRouteId,
            driverId: resolvedDriver.id,
            driverFullName: resolvedDriver.fullName,
            driverPhone: resolvedPhone,
            status: "invite_failed",
            message: msg,
          });
          result.errors.push({
            row: group.firstIndex + 2,
            message: `Маршрут "${routeKey}": водитель привязан, но не удалось создать invite-ссылку: ${msg}`,
          });
        }
      }
    } catch (e) {
      result.errors.push({
        row: group.firstIndex + 2,
        message: `Маршрут "${routeKey}": ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }

  return result;
}
