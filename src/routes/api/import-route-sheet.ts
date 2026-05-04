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
  deliveryPeriod?: string | null;
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
  contract?: string | null;
  driverName: string | null;
  driverPhone: string | null;
  vehiclePlate: string | null;
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

const ADDRESS_PLACEHOLDER = "Требует заполнения";

type ImportedRow = {
  rowIndex: number;
  orderId: string | null;
  orderNumber: string;
  customer: string | null;
  missingFields: string[];
  reason?: string;
};

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
        const headerMissing: string[] = [];
        if (!payload.routeNumber) headerMissing.push("Номер маршрутного листа");
        if (!payload.routeDate) headerMissing.push("Дата");
        if (!payload.carrier) headerMissing.push("Перевозчик");
        if (!payload.driverName) headerMissing.push("Водитель");
        if (!payload.driverPhone) headerMissing.push("Телефон водителя");
        if (!payload.vehiclePlate) headerMissing.push("Номер ТС");
        if (!payload.contract) headerMissing.push("Договор");

        // 1. Перевозчик (тихий upsert)
        let carrierId: string | null = null;
        if (payload.carrier) {
          try {
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
              if (cErr) warnings.push(`Перевозчик: ${cErr.message}`);
              else if (created) carrierId = (created as { id: string }).id;
            }
          } catch (e) {
            warnings.push(
              `Перевозчик: ${e instanceof Error ? e.message : "ошибка"}`,
            );
          }
        }

        // 2. Водитель
        let driverId: string | null = null;
        if (payload.driverName && carrierId) {
          try {
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
                  .update({
                    phone:
                      normalizeRuPhone(payload.driverPhone) ?? payload.driverPhone,
                  } as never)
                  .eq("id", driverId);
              }
            } else {
              const { data: createdDr, error: dErr } = await sb
                .from("drivers")
                .insert({
                  carrier_id: carrierId,
                  full_name: payload.driverName,
                  phone: payload.driverPhone
                    ? (normalizeRuPhone(payload.driverPhone) ??
                      payload.driverPhone)
                    : null,
                } as never)
                .select("id")
                .single();
              if (dErr) warnings.push(`Водитель: ${dErr.message}`);
              else if (createdDr) driverId = (createdDr as { id: string }).id;
            }
          } catch (e) {
            warnings.push(
              `Водитель: ${e instanceof Error ? e.message : "ошибка"}`,
            );
          }
        }

        // 3. ТС
        let vehicleId: string | null = null;
        if (payload.vehiclePlate && carrierId) {
          try {
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
              if (vErr) warnings.push(`ТС: ${vErr.message}`);
              else if (createdVh) vehicleId = (createdVh as { id: string }).id;
            }
          } catch (e) {
            warnings.push(`ТС: ${e instanceof Error ? e.message : "ошибка"}`);
          }
        }

        // 4. Маршрут — ВСЕГДА создаём как черновик
        const routeNumber =
          payload.routeNumber?.trim() || `RL-${Date.now().toString().slice(-8)}`;
        const routeDate = payload.routeDate || todayIso();

        const headerNote = headerMissing.length
          ? `Требует заполнения: ${headerMissing.join(", ")}`
          : null;

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
            transport_comment: headerNote,
            request_status_comment: headerNote,
          } as never)
          .select("id")
          .single();

        if (rErr || !route) {
          return jsonResponse(
            {
              error: `Не удалось создать заявку: ${rErr?.message ?? "неизвестная ошибка"}`,
            },
            { status: 500 },
          );
        }
        const routeId = (route as { id: string }).id;

        // 5. Заказы + клиенты + точки
        const importedRows: ImportedRow[] = [];
        const failedRows: Array<{ rowIndex: number; reason: string }> = [];
        const clientsNeedingFill = new Map<
          string,
          { name: string; clientId: string | null; missing: Set<string> }
        >();
        let inserted = 0;
        let pointNumber = 1;

        for (let i = 0; i < payload.orders.length; i++) {
          const o = payload.orders[i];
          const missing: string[] = [];
          try {
            const orderNumber = suffixOrderNumber(o.orderNumber, i);
            const phoneNorm = o.contactPhone
              ? (normalizeRuPhone(o.contactPhone) ?? o.contactPhone)
              : null;

            // === Клиент: ищем по имени или телефону ===
            let clientRow: {
              id: string;
              name: string;
              phone: string | null;
              address: string | null;
              client_type: string | null;
              works_weekends: boolean;
              access_notes: string | null;
              unloading_notes: string | null;
              preferred_delivery_time: string | null;
              driver_instructions: string | null;
              extra_attrs: Record<string, unknown> | null;
            } | null = null;

            if (o.customer) {
              const { data: byName } = await sb
                .from("clients")
                .select(
                  "id, name, phone, address, client_type, works_weekends, access_notes, unloading_notes, preferred_delivery_time, driver_instructions, extra_attrs",
                )
                .ilike("name", o.customer)
                .maybeSingle();
              if (byName) clientRow = byName as never;
            }
            if (!clientRow && phoneNorm) {
              const { data: byPhone } = await sb
                .from("clients")
                .select(
                  "id, name, phone, address, client_type, works_weekends, access_notes, unloading_notes, preferred_delivery_time, driver_instructions, extra_attrs",
                )
                .eq("phone", phoneNorm)
                .maybeSingle();
              if (byPhone) clientRow = byPhone as never;
            }

            // Создать клиента если не найден
            if (!clientRow && o.customer) {
              const { data: createdCl, error: clErr } = await sb
                .from("clients")
                .insert({
                  name: o.customer,
                  phone: phoneNorm,
                  address: o.deliveryAddress,
                  source: "route_sheet",
                } as never)
                .select(
                  "id, name, phone, address, client_type, works_weekends, access_notes, unloading_notes, preferred_delivery_time, driver_instructions, extra_attrs",
                )
                .single();
              if (!clErr && createdCl) clientRow = createdCl as never;
            }

            // Автоподстановка из справочника
            const finalAddress =
              o.deliveryAddress?.trim() || clientRow?.address || null;
            const finalPhone = phoneNorm || clientRow?.phone || null;
            const defaultsExtra =
              (clientRow?.extra_attrs as { default_payment_type?: string } | null) ?? null;
            const defaultPaymentType = defaultsExtra?.default_payment_type as
              | "cash"
              | "qr"
              | "online"
              | "card"
              | undefined;
            const paymentType =
              o.paymentKind === "unknown" && defaultPaymentType
                ? defaultPaymentType
                : paymentToDb(o.paymentKind);
            const requiresQr =
              o.requiresQr ||
              o.paymentKind === "qr" ||
              defaultPaymentType === "qr";

            // Список недостающих полей по строке (не блокируем импорт)
            if (!o.customer) missing.push("Покупатель");
            if (!finalAddress) missing.push("Адрес доставки");
            if (!finalPhone) missing.push("Телефон получателя");
            if (o.paymentKind === "unknown" && !defaultPaymentType)
              missing.push("Тип оплаты");
            if (!o.orderNumber) missing.push("Номер заказа");

            const orderPayload = {
              order_number: orderNumber,
              onec_order_number: o.orderNumber,
              contact_name: o.customer,
              contact_phone: finalPhone,
              // Триггер требует адрес ИЛИ координаты — ставим placeholder.
              delivery_address: finalAddress ?? ADDRESS_PLACEHOLDER,
              payment_type: paymentType,
              requires_qr: requiresQr,
              amount_due:
                o.paymentKind === "cash" ? o.amountToCollect : null,
              goods_amount: o.amountToCollect,
              client_works_weekends: clientRow?.works_weekends ?? false,
              client_type: (clientRow?.client_type as never) ?? null,
              delivery_time_comment:
                o.deliveryPeriod ?? clientRow?.preferred_delivery_time ?? null,
              access_instructions:
                clientRow?.access_notes ?? null,
              comment: [
                o.comment,
                o.paymentRaw ? `Оплата: ${o.paymentRaw}` : null,
                clientRow?.unloading_notes
                  ? `Выгрузка: ${clientRow.unloading_notes}`
                  : null,
                clientRow?.driver_instructions
                  ? `Водителю: ${clientRow.driver_instructions}`
                  : null,
                missing.length
                  ? `⚠ Требует заполнения: ${missing.join(", ")}`
                  : null,
              ]
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
              importedRows.push({
                rowIndex: o.rowIndex,
                orderId: null,
                orderNumber,
                customer: o.customer,
                missingFields: missing,
                reason: oErr?.message ?? "Не удалось создать заказ",
              });
              continue;
            }

            const orderId = (ord as { id: string }).id;

            const { error: pErr } = await sb.from("route_points").insert({
              route_id: routeId,
              order_id: orderId,
              point_number: pointNumber,
            } as never);

            if (pErr) {
              failedRows.push({ rowIndex: o.rowIndex, reason: pErr.message });
            } else {
              pointNumber++;
              inserted++;
            }

            importedRows.push({
              rowIndex: o.rowIndex,
              orderId,
              orderNumber,
              customer: o.customer,
              missingFields: missing,
            });

            // Копим missing-поля по контрагентам
            if (missing.length && o.customer) {
              const key = (o.customer || "").toLowerCase().trim();
              const entry = clientsNeedingFill.get(key) ?? {
                name: o.customer,
                clientId: clientRow?.id ?? null,
                missing: new Set<string>(),
              };
              for (const m of missing) entry.missing.add(m);
              clientsNeedingFill.set(key, entry);
            }
          } catch (e) {
            const reason =
              e instanceof Error ? e.message : "Неизвестная ошибка";
            failedRows.push({ rowIndex: o.rowIndex, reason });
            importedRows.push({
              rowIndex: o.rowIndex,
              orderId: null,
              orderNumber: suffixOrderNumber(o.orderNumber, i),
              customer: o.customer,
              missingFields: missing,
              reason,
            });
          }
        }

        // 6. Уведомления менеджеру по каждому контрагенту с пробелами
        try {
          for (const { name, clientId, missing } of clientsNeedingFill.values()) {
            const list = Array.from(missing);
            await sb.from("notifications").insert({
              kind: "client_data_missing",
              title: `Заполнить данные по контрагенту: ${name}`,
              body: `Не хватает: ${list.join(", ")}. Добавьте данные в карточку контрагента — при следующих импортах они подставятся автоматически.`,
              route_id: routeId,
              payload: {
                recipients: ["manager"],
                client_id: clientId,
                client_name: name,
                missing: list,
                route_id: routeId,
                route_number: routeNumber,
              },
            } as never);
          }
        } catch (e) {
          warnings.push(
            `Уведомления: ${e instanceof Error ? e.message : "ошибка"}`,
          );
        }

        const totalMissing = importedRows.filter(
          (r) => r.missingFields.length > 0,
        ).length;

        return jsonResponse({
          ok: true,
          routeId,
          routeNumber,
          inserted,
          total: payload.orders.length,
          failedRows,
          warnings,
          headerMissing,
          rows: importedRows,
          missingRowsCount: totalMissing,
          clientsNeedingFill: Array.from(clientsNeedingFill.values()).map(
            (c) => ({
              name: c.name,
              clientId: c.clientId,
              missing: Array.from(c.missing),
            }),
          ),
          needsReview:
            headerMissing.length > 0 || totalMissing > 0 || failedRows.length > 0,
        });
      },
    },
  },
});
