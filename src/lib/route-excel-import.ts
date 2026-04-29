import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";

export type RouteImportRow = {
  route_number?: string;
  driver?: string;
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

export type RouteImportResult = {
  totalRows: number;
  routesCreated: number;
  pointsCreated: number;
  deliveryRouteIds: string[];
  errors: Array<{ row: number; message: string }>;
};

const HEADER_MAP: Record<string, keyof RouteImportRow> = {
  "номер маршрута": "route_number",
  "маршрут": "route_number",
  "route_number": "route_number",
  "водитель": "driver",
  "driver": "driver",
  "driver_name": "driver",
  "машина": "vehicle",
  "транспорт": "vehicle",
  "vehicle": "vehicle",
  "vehicle_number": "vehicle",
  "номер заказа": "order_number",
  "номер": "order_number",
  "order_number": "order_number",
  "клиент": "client",
  "client": "client",
  "customer_name": "client",
  "телефон": "phone",
  "phone": "phone",
  "customer_phone": "phone",
  "адрес": "address",
  "address": "address",
  "delivery_address": "address",
  "ссылка на карту": "map_link",
  "карта": "map_link",
  "map_link": "map_link",
  "широта": "latitude",
  "lat": "latitude",
  "latitude": "latitude",
  "долгота": "longitude",
  "lng": "longitude",
  "lon": "longitude",
  "longitude": "longitude",
  "координаты": "map_link",
  "coordinates": "map_link",
  "сумма к получению": "amount_due",
  "сумма": "amount_due",
  "amount": "amount_due",
  "amount_due": "amount_due",
  "amount_to_collect": "amount_due",
  "тип оплаты": "payment_type",
  "оплата": "payment_type",
  "payment_type": "payment_type",
  "оплачено заранее": "prepaid",
  "предоплата": "prepaid",
  "prepaid": "prepaid",
  "нужен qr-код": "requires_qr",
  "нужен qr": "requires_qr",
  "qr": "requires_qr",
  "requires_qr": "requires_qr",
  "маркетплейс": "marketplace",
  "marketplace": "marketplace",
  "комментарий менеджера": "manager_comment",
  "комментарий": "manager_comment",
  "comment": "manager_comment",
  "manager_comment": "manager_comment",
};

const PAYMENT_MAP: Record<string, "cash" | "card" | "online" | "qr"> = {
  "наличные": "cash",
  "нал": "cash",
  "cash": "cash",
  "карта": "card",
  "card": "card",
  "онлайн": "online",
  "online": "online",
  "qr": "qr",
  "qr-код": "qr",
};

function normalizeKey(k: string): string {
  return k.trim().toLowerCase().replace(/\s+/g, " ");
}

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).replace(",", ".").replace(/\s+/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function toBool(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  const s = String(v).trim().toLowerCase();
  return ["да", "yes", "y", "true", "1", "+", "v", "✓"].includes(s);
}

function parseCoords(s: string | undefined): { lat: number | null; lon: number | null } {
  if (!s) return { lat: null, lon: null };
  const m = s.match(/(-?\d+[.,]\d+)[\s,;]+(-?\d+[.,]\d+)/);
  if (!m) return { lat: null, lon: null };
  return { lat: toNumber(m[1]), lon: toNumber(m[2]) };
}

export function parseRouteWorkbook(file: ArrayBuffer): RouteImportRow[] {
  const wb = XLSX.read(file, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  return raw.map((row) => {
    const out: RouteImportRow = {};
    for (const [k, v] of Object.entries(row)) {
      const key = HEADER_MAP[normalizeKey(k)];
      if (!key) continue;
      if (key === "latitude" || key === "longitude" || key === "amount_due") {
        (out as Record<string, unknown>)[key] = toNumber(v);
      } else {
        const s = String(v ?? "").trim();
        (out as Record<string, unknown>)[key] = s || undefined;
      }
    }
    return out;
  });
}

export async function importRouteFromFile(file: File): Promise<RouteImportResult> {
  const buf = await file.arrayBuffer();
  const rows = parseRouteWorkbook(buf);
  const result: RouteImportResult = {
    totalRows: rows.length,
    routesCreated: 0,
    pointsCreated: 0,
    deliveryRouteIds: [],
    errors: [],
  };

  if (rows.length === 0) throw new Error("Файл пуст или не распознан");

  // Группируем строки по номеру маршрута (или один маршрут на весь файл)
  const groups = new Map<string, { rows: RouteImportRow[]; firstIndex: number }>();
  rows.forEach((r, i) => {
    const key = (r.route_number || "__default__").trim();
    if (!groups.has(key)) groups.set(key, { rows: [], firstIndex: i });
    groups.get(key)!.rows.push(r);
  });

  // (auto numbering removed — order_number теперь обязателен)

  for (const [routeKey, group] of groups.entries()) {
    const baseRow = group.rows[0];
    try {
      // Проверка обязательных полей маршрута
      const missing: string[] = [];
      if (!baseRow.route_number) missing.push("номер маршрута");
      if (!baseRow.driver) missing.push("водитель");
      if (missing.length > 0)
        throw new Error("Не заполнены обязательные данные: " + missing.join(", "));

      // 1. routes (заявка-родитель)
      const { data: routeNumData, error: routeNumErr } = await supabase.rpc("generate_route_number");
      if (routeNumErr) throw routeNumErr;

      const { data: routeRow, error: routeErr } = await supabase
        .from("routes")
        .insert({
          route_number: routeNumData as string,
          driver_name: baseRow.driver,
          route_date: new Date().toISOString().slice(0, 10),
          request_type: "client_delivery",
          status: "planned",
          comment: baseRow.manager_comment || null,
        })
        .select("id, route_number")
        .single();
      if (routeErr) throw routeErr;

      // 2. Создаём заказы и точки
      const pointsToInsert: Array<{ order_id: string; point_number: number }> = [];
      let pointNum = 1;
      for (const r of group.rows) {
        try {
          const rowMissing: string[] = [];
          if (!r.order_number?.trim()) rowMissing.push("номер заказа");
          if (!r.client?.trim()) rowMissing.push("клиент");
          if (!r.address && !r.map_link && r.latitude == null && r.longitude == null)
            rowMissing.push("адрес или координаты");
          if (rowMissing.length > 0)
            throw new Error("Не заполнены обязательные данные: " + rowMissing.join(", "));
          const orderNumber = r.order_number!.trim();
          const paymentRaw = r.payment_type ? normalizeKey(r.payment_type) : "";
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

          const { data: order, error: orderErr } = await supabase
            .from("orders")
            .insert({
              order_number: orderNumber,
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
              source: "manual",
              status: "ready_for_delivery",
            })
            .select("id")
            .single();
          if (orderErr) throw orderErr;

          pointsToInsert.push({ order_id: order.id, point_number: pointNum++ });
        } catch (e) {
          result.errors.push({
            row: group.firstIndex + group.rows.indexOf(r) + 2,
            message: e instanceof Error ? e.message : String(e),
          });
        }
      }

      if (pointsToInsert.length === 0) {
        // Откатим пустой маршрут
        await supabase.from("routes").delete().eq("id", routeRow.id);
        throw new Error("Не создано ни одной точки маршрута");
      }

      const { error: pErr } = await supabase
        .from("route_points")
        .insert(
          pointsToInsert.map((p) => ({
            route_id: routeRow.id,
            order_id: p.order_id,
            point_number: p.point_number,
            status: "pending" as const,
          })),
        );
      if (pErr) throw pErr;

      // 3. delivery_routes (для интерфейса водителя)
      const { data: dr, error: drErr } = await supabase
        .from("delivery_routes")
        .insert({
          route_number: "",
          source_request_id: routeRow.id,
          route_date: new Date().toISOString().slice(0, 10),
          status: "formed",
          assigned_driver: baseRow.driver,
          assigned_vehicle: baseRow.vehicle ?? null,
          comment: baseRow.manager_comment ?? null,
        })
        .select("id")
        .single();
      if (drErr) throw drErr;

      result.routesCreated++;
      result.pointsCreated += pointsToInsert.length;
      result.deliveryRouteIds.push(dr.id);
    } catch (e) {
      result.errors.push({
        row: group.firstIndex + 2,
        message: `Маршрут "${routeKey}": ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }

  return result;
}

export function downloadRouteTemplate() {
  const headers = [
    "Номер маршрута",
    "Водитель",
    "Машина",
    "Номер заказа",
    "Клиент",
    "Телефон",
    "Адрес",
    "Ссылка на карту",
    "Сумма к получению",
    "Тип оплаты",
    "Оплачено заранее",
    "Нужен QR-код",
    "Комментарий менеджера",
  ];
  const example = [
    ["М-001", "Иванов И.И.", "А123БВ77", "ORD-1001", "ООО Ромашка", "+7 999 123-45-67",
     "г. Москва, ул. Ленина, 1", "55.7558, 37.6173", 4500, "наличные", "нет", "нет", "Позвонить за час"],
    ["М-001", "Иванов И.И.", "А123БВ77", "ORD-1002", "ИП Петров", "+7 999 222-33-44",
     "г. Москва, ул. Мира, 5", "", 0, "онлайн", "да", "да", ""],
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, ...example]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Маршрут");
  XLSX.writeFile(wb, "route_template.xlsx");
}
