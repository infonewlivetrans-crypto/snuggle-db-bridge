import { createFileRoute } from "@tanstack/react-router";
import {
  getBearerToken,
  jsonResponse,
  requireUser,
} from "@/server/api-helpers.server";
import { normalizeRuPhone } from "@/lib/phone";

type PaymentKind = "cash" | "qr" | "paid" | "bank" | "unknown";

type IncomingOrder = {
  rowIndex: number;
  orderNumber: string | null;
  orderDate: string | null;
  customer: string | null;
  deliveryAddress: string | null;
  contactPhone: string | null;
  amountToCollect: number | null;
  paymentRaw: string | null;
  paymentKind: PaymentKind;
  requiresQr: boolean;
  managerName: string | null;
  managerPhone: string | null;
  organization: string | null;
  comment: string | null;
};

type IncomingPayload = {
  routeNumber: string | null;
  routeDate: string | null;
  organization: string | null;
  shipper: string | null;
  carrier: string | null;
  driverName: string | null;
  driverPhone: string | null;
  vehiclePlate: string | null;
  contract: string | null;
  orders: IncomingOrder[];
};

function paymentToDb(kind: PaymentKind): "cash" | "qr" | "online" | "card" {
  if (kind === "qr") return "qr";
  if (kind === "cash") return "cash";
  if (kind === "paid" || kind === "bank") return "online";
  return "cash";
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function suffixOrderNumber(base: string | null, idx: number): string {
  if (base && base.trim()) return base.trim();
  return `RL-${Date.now().toString().slice(-6)}-${idx + 1}`;
}

export const Route = createFileRoute("/api/import-route-sheet")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = getBearerToken(request);
        if (!token) return jsonResponse({ error: "Не авторизован" }, { status: 401 });
        const auth = await requireUser(token);
        if (!auth) return jsonResponse({ error: "Не авторизован" }, { status: 401 });
        const sb = auth.client;

        let payload: IncomingPayload;
        try {
          payload = (await request.json()) as IncomingPayload;
        } catch {
          return jsonResponse(
            { error: "Не удалось прочитать данные импорта" },
            { status: 400 },
          );
        }

        if (!payload || !Array.isArray(payload.orders)) {
          return jsonResponse(
            { error: "Файл маршрутного листа не содержит заказов" },
            { status: 400 },
          );
        }

        const warnings: string[] = [];

        // 1. Перевозчик (upsert по company_name)
        let carrierId: string | null = null;
        if (payload.carrier) {
          const { data: existing } = await sb
            .from("carriers")
            .select("id")
            .ilike("company_name", payload.carrier)
            .maybeSingle();
          if (existing) {
            carrierId = (existing as { id: string }).id;
          } else {
            const { data: created, error: cErr } = await sb
              .from("carriers")
              .insert({
                company_name: payload.carrier,
                carrier_type: "ooo",
                source: "route_sheet",
              } as never)
              .select("id")
              .single();
            if (cErr) {
              warnings.push(`Не удалось создать перевозчика: ${cErr.message}`);
            } else if (created) {
              carrierId = (created as { id: string }).id;
            }
          }
        }

        // 2. Водитель (upsert по ФИО + перевозчик)
        let driverId: string | null = null;
        if (payload.driverName && carrierId) {
          const { data: existingDr } = await sb
            .from("drivers")
            .select("id")
            .eq("carrier_id", carrierId)
            .ilike("full_name", payload.driverName)
            .maybeSingle();
          if (existingDr) {
            driverId = (existingDr as { id: string }).id;
            if (payload.driverPhone) {
              await sb
                .from("drivers")
                .update({ phone: normalizeRuPhone(payload.driverPhone) ?? payload.driverPhone } as never)
                .eq("id", driverId);
            }
          } else {
            const { data: createdDr, error: dErr } = await sb
              .from("drivers")
              .insert({
                carrier_id: carrierId,
                full_name: payload.driverName,
                phone: payload.driverPhone
                  ? (normalizeRuPhone(payload.driverPhone) ?? payload.driverPhone)
                  : null,
              } as never)
              .select("id")
              .single();
            if (dErr) warnings.push(`Не удалось создать водителя: ${dErr.message}`);
            else if (createdDr) driverId = (createdDr as { id: string }).id;
          }
        }

        // 3. ТС (upsert по plate_number + перевозчик)
        let vehicleId: string | null = null;
        if (payload.vehiclePlate && carrierId) {
          const plate = payload.vehiclePlate.trim();
          const { data: existingVh } = await sb
            .from("vehicles")
            .select("id")
            .eq("carrier_id", carrierId)
            .ilike("plate_number", plate)
            .maybeSingle();
          if (existingVh) {
            vehicleId = (existingVh as { id: string }).id;
          } else {
            const { data: createdVh, error: vErr } = await sb
              .from("vehicles")
              .insert({
                carrier_id: carrierId,
                plate_number: plate,
                body_type: "tent",
              } as never)
              .select("id")
              .single();
            if (vErr) warnings.push(`Не удалось создать ТС: ${vErr.message}`);
            else if (createdVh) vehicleId = (createdVh as { id: string }).id;
          }
        }

        // 4. Создаём маршрут (заявку)
        const routeNumber =
          payload.routeNumber?.trim() ||
          `RL-${Date.now().toString().slice(-8)}`;
        const routeDate = payload.routeDate || todayIso();

        const { data: route, error: rErr } = await sb
          .from("routes")
          .insert({
            route_number: routeNumber,
            route_date: routeDate,
            request_type: "client_delivery",
            status: "planned",
            request_status: "draft",
            source: "route_sheet",
            organization: payload.organization,
            onec_request_number: payload.routeNumber,
            carrier_id: carrierId,
            driver_id: driverId,
            vehicle_id: vehicleId,
            driver_name: payload.driverName,
          } as never)
          .select("id")
          .single();

        if (rErr || !route) {
          return jsonResponse(
            { error: `Не удалось создать заявку: ${rErr?.message ?? "неизвестная ошибка"}` },
            { status: 500 },
          );
        }
        const routeId = (route as { id: string }).id;

        // 5. Заказы и точки маршрута
        const failedRows: Array<{ rowIndex: number; reason: string }> = [];
        let inserted = 0;
        let pointNumber = 1;

        for (let i = 0; i < payload.orders.length; i++) {
          const o = payload.orders[i];
          try {
            const orderNumber = suffixOrderNumber(o.orderNumber, i);
            const phone = o.contactPhone
              ? (normalizeRuPhone(o.contactPhone) ?? o.contactPhone)
              : null;

            // Клиент: upsert по имени
            if (o.customer) {
              const { data: existingCl } = await sb
                .from("clients")
                .select("id")
                .ilike("name", o.customer)
                .maybeSingle();
              if (!existingCl) {
                await sb
                  .from("clients")
                  .insert({
                    name: o.customer,
                    phone,
                    address: o.deliveryAddress,
                  } as never);
              }
            }

            const paymentType = paymentToDb(o.paymentKind);
            const requiresQr = o.requiresQr || o.paymentKind === "qr";

            const orderPayload = {
              order_number: orderNumber,
              onec_order_number: o.orderNumber,
              contact_name: o.customer,
              contact_phone: phone,
              delivery_address: o.deliveryAddress,
              payment_type: paymentType,
              requires_qr: requiresQr,
              amount_due: o.paymentKind === "cash" ? o.amountToCollect : null,
              goods_amount: o.amountToCollect,
              comment: [o.comment, o.paymentRaw ? `Оплата: ${o.paymentRaw}` : null]
                .filter(Boolean)
                .join(" · ") || null,
              source: "route_sheet",
            };

            const { data: ord, error: oErr } = await sb
              .from("orders")
              .insert(orderPayload as never)
              .select("id")
              .single();

            if (oErr || !ord) {
              failedRows.push({
                rowIndex: o.rowIndex,
                reason: oErr?.message ?? "Не удалось создать заказ",
              });
              continue;
            }

            const { error: pErr } = await sb.from("route_points").insert({
              route_id: routeId,
              order_id: (ord as { id: string }).id,
              point_number: pointNumber,
            } as never);

            if (pErr) {
              failedRows.push({ rowIndex: o.rowIndex, reason: pErr.message });
              continue;
            }
            pointNumber++;
            inserted++;
          } catch (e) {
            failedRows.push({
              rowIndex: o.rowIndex,
              reason: e instanceof Error ? e.message : "Неизвестная ошибка",
            });
          }
        }

        return jsonResponse({
          ok: true,
          routeId,
          routeNumber,
          inserted,
          total: payload.orders.length,
          failedRows,
          warnings,
        });
      },
    },
  },
});
