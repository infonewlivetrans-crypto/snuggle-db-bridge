import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { normalizeRuPhone } from "@/lib/phone";
import {
  resolveManagerForImport,
  type ResolvedManager,
} from "@/server/managers-resolve.server";
import { ensureDefaultCarrierId } from "@/server/carriers.server";
import { geocodeOrderRow } from "@/server/order-geocode.server";
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

type IncomingItem = {
  sourceLine: number;
  lineNumber: number | null;
  nomenclature: string;
  characteristic: string | null;
  quality: string | null;
  unit: string | null;
  qty: number | null;
  weight_kg: number | null;
  volume_m3: number | null;
  comment: string | null;
  raw_text: string;
  needsReview: boolean;
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
  /** Опциональный товарный состав: ключ — нормализованный номер заказа. */
  itemsByOrderNumber?: Record<string, IncomingItem[]>;
};

function paymentToDb(
  kind: PaymentKind,
): "cash" | "qr" | "online" | "card" | "bank_transfer" {
  if (kind === "qr") return "qr";
  if (kind === "cash") return "cash";
  if (kind === "paid") return "online";
  if (kind === "bank") return "bank_transfer";
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
        const auth = await requireAnyRole(request, ["admin", "logist", "manager"]);
        if (auth instanceof Response) return auth;
        const sb = auth.client;
        const authUserId = auth.userId;

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
                  carrier_type: "self_employed",
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

        // Фоллбек: если перевозчик не указан или не удалось создать —
        // используем «Без перевозчика». Импорт не блокируем.
        if (!carrierId) {
          try {
            carrierId = await ensureDefaultCarrierId();
            warnings.push(
              payload.carrier
                ? `Перевозчик «${payload.carrier}» не создан — использован «Без перевозчика», можно изменить вручную.`
                : `Перевозчик в маршрутном листе не указан — использован «Без перевозчика», можно изменить вручную.`,
            );
          } catch (e) {
            warnings.push(
              `Перевозчик: не удалось получить fallback (${e instanceof Error ? e.message : "ошибка"})`,
            );
          }
        }

        // 2. Водитель (после того, как carrierId гарантированно есть)
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
        if (!driverId) {
          warnings.push("Водитель не найден, можно назначить вручную.");
        }

        // 3. ТС (после того, как carrierId гарантированно есть)
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
        if (!vehicleId) {
          warnings.push("Авто не найдено, можно назначить вручную.");
        }

        // 3a. default_geocode_region из system_settings (для геокодера).
        let defaultRegion: string | null = null;
        try {
          const { data: ds } = await sb
            .from("system_settings")
            .select("setting_value")
            .eq("setting_key", "default_geocode_region")
            .maybeSingle();
          const v = ds?.setting_value;
          defaultRegion =
            typeof v === "string"
              ? v
              : v && typeof v === "object" && "value" in (v as Record<string, unknown>) &&
                  typeof (v as Record<string, unknown>).value === "string"
                ? ((v as Record<string, unknown>).value as string)
                : null;
        } catch {
          defaultRegion = null;
        }
        // Бюджет геокодирования: максимум 50 адресов на один импорт.
        let geocodeBudget = 50;

        // 4. Маршрут — ВСЕГДА создаём как черновик
        const routeNumber =
          payload.routeNumber?.trim() || `RL-${Date.now().toString().slice(-8)}`;
        const routeDate = payload.routeDate || todayIso();

        const headerNote = headerMissing.length
          ? `Требует заполнения: ${headerMissing.join(", ")}`
          : null;

        // 4a. Идемпотентность: ищем существующий route с таким номером
        let routeId: string | null = null;
        if (payload.routeNumber?.trim()) {
          const { data: existingRoute } = await sb
            .from("routes")
            .select("id")
            .eq("route_number", routeNumber)
            .maybeSingle();
          if (existingRoute) {
            const existingId = (existingRoute as { id: string }).id;
            // Если уже есть route_points — импорт ранее завершился, дублей не плодим
            const { count: pointsCount } = await sb
              .from("route_points")
              .select("id", { count: "exact", head: true })
              .eq("route_id", existingId);
            if ((pointsCount ?? 0) > 0) {
              return jsonResponse(
                {
                  error: `Заявка по маршрутному листу №${routeNumber} уже создана`,
                  code: "route_already_imported",
                  routeId: existingId,
                  routeNumber,
                },
                { status: 409 },
              );
            }
            // Незавершённый импорт — переиспользуем существующий route
            routeId = existingId;
            warnings.push(
              `Найден незавершённый импорт маршрута №${routeNumber} — продолжаем дозапись.`,
            );
          }
        }

        if (!routeId) {
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
            console.error("[import-route-sheet] routes.insert failed (full error):", rErr);
            // Гонка по уникальному индексу — отдаём 409, а не 500
            if (rErr?.code === "23505") {
              return jsonResponse(
                {
                  error: `Заявка по маршрутному листу №${routeNumber} уже создана`,
                  code: "route_already_imported",
                  routeNumber,
                },
                { status: 409 },
              );
            }
            return jsonResponse(
              {
                error: `Не удалось создать заявку: ${rErr?.message ?? "неизвестная ошибка"}`,
                message: rErr?.message,
                details: rErr?.details,
                hint: rErr?.hint,
                code: rErr?.code,
              },
              { status: 500 },
            );
          }
          routeId = (route as { id: string }).id;
        }

        // 5. Заказы + клиенты + точки
        const importedRows: ImportedRow[] = [];
        const failedRows: Array<{ rowIndex: number; reason: string }> = [];
        const clientsNeedingFill = new Map<
          string,
          { name: string; clientId: string | null; missing: Set<string> }
        >();
        // Кэш менеджеров на время одного импорта: ключ = нормализованное ФИО (lowercase).
        // Предотвращает повторные запросы и параллельное создание дубликатов.
        const managerCache = new Map<string, ResolvedManager | null>();
        async function resolveManagerCached(
          name: string | null | undefined,
          phone: string | null | undefined,
        ): Promise<ResolvedManager | null> {
          const key = (name ?? "").trim().toLowerCase();
          if (!key) return null;
          if (managerCache.has(key)) return managerCache.get(key) ?? null;
          try {
            const r = await resolveManagerForImport({
              sb,
              rawName: name,
              rawPhone: phone,
              userId: authUserId,
            });
            managerCache.set(key, r);
            return r;
          } catch (e) {
            warnings.push(
              `Менеджер «${name}»: ${e instanceof Error ? e.message : "ошибка"}`,
            );
            managerCache.set(key, null);
            return null;
          }
        }
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
            type ClientRow = {
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
            };
            const CLIENT_COLS =
              "id, name, phone, address, client_type, works_weekends, access_notes, unloading_notes, preferred_delivery_time, driver_instructions, extra_attrs";
            let clientRow: ClientRow | null = null;

            if (o.customer) {
              const { data: byName } = await sb
                .from("clients")
                .select(CLIENT_COLS)
                .ilike("name", o.customer)
                .maybeSingle();
              if (byName) clientRow = byName as unknown as ClientRow;
            }
            if (!clientRow && phoneNorm) {
              const { data: byPhone } = await sb
                .from("clients")
                .select(CLIENT_COLS)
                .eq("phone", phoneNorm)
                .maybeSingle();
              if (byPhone) clientRow = byPhone as unknown as ClientRow;
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
                .select(CLIENT_COLS)
                .single();
              if (!clErr && createdCl)
                clientRow = createdCl as unknown as ClientRow;
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
              | "bank_transfer"
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

            // Менеджер из маршрутного листа: ищем существующего по
            // нормализованному ФИО, иначе создаём и сразу выпускаем invite.
            const managerResolved = await resolveManagerCached(
              o.managerName,
              o.managerPhone,
            );
            if (!managerResolved && o.managerName) {
              missing.push("Менеджер");
            }

            // Геокодирование адреса (если есть реальный адрес и есть бюджет).
            let geoLat: number | null = null;
            let geoLng: number | null = null;
            if (
              finalAddress &&
              finalAddress !== ADDRESS_PLACEHOLDER &&
              geocodeBudget > 0
            ) {
              geocodeBudget--;
              try {
                const outcome = await geocodeOrderRow(sb, finalAddress, {
                  clientAddress: clientRow?.address ?? null,
                  defaultRegion: defaultRegion ?? "Краснодарский край",
                });
                if (outcome) {
                  geoLat = outcome.lat;
                  geoLng = outcome.lng;
                }
              } catch (e) {
                warnings.push(
                  `Геокодер (стр. ${o.rowIndex}): ${e instanceof Error ? e.message : "ошибка"}`,
                );
              }
            }

            const orderPayload = {
              order_number: orderNumber,
              onec_order_number: o.orderNumber,
              contact_name: o.customer,
              contact_phone: finalPhone,
              // Триггер требует адрес ИЛИ координаты — ставим placeholder.
              delivery_address: finalAddress ?? ADDRESS_PLACEHOLDER,
              latitude: geoLat,
              longitude: geoLng,
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
              manager_id: managerResolved?.id ?? null,
              manager_name: managerResolved?.fullName ?? o.managerName ?? null,
              client_id: clientRow?.id ?? null,
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
              console.error("[import-route-sheet] orders.insert failed (full error):", {
                rowIndex: o.rowIndex,
                payload: orderPayload,
                error: oErr,
              });
              const reason = [
                oErr?.message,
                oErr?.details ? `details: ${oErr.details}` : null,
                oErr?.hint ? `hint: ${oErr.hint}` : null,
                oErr?.code ? `code: ${oErr.code}` : null,
              ]
                .filter(Boolean)
                .join(" · ") || "Не удалось создать заказ";
              failedRows.push({ rowIndex: o.rowIndex, reason });
              importedRows.push({
                rowIndex: o.rowIndex,
                orderId: null,
                orderNumber,
                customer: o.customer,
                missingFields: missing,
                reason,
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
              console.error("[import-route-sheet] route_points.insert failed (full error):", {
                rowIndex: o.rowIndex,
                routeId,
                orderId,
                error: pErr,
              });
              const reason = [
                pErr.message,
                pErr.details ? `details: ${pErr.details}` : null,
                pErr.hint ? `hint: ${pErr.hint}` : null,
                pErr.code ? `code: ${pErr.code}` : null,
              ]
                .filter(Boolean)
                .join(" · ");
              failedRows.push({ rowIndex: o.rowIndex, reason });
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
          managers: Array.from(managerCache.entries())
            .filter((entry): entry is [string, ResolvedManager] => entry[1] !== null)
            .map(([, m]) => ({
              id: m.id,
              fullName: m.fullName,
              createdManager: m.createdManager,
              inviteCreated: m.inviteCreated,
              inviteUrl: m.inviteUrl,
            })),
          needsReview:
            headerMissing.length > 0 || totalMissing > 0 || failedRows.length > 0,
        });
      },
    },
  },
});
