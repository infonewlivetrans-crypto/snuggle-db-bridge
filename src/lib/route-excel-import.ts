// Тяжёлая библиотека `xlsx` подключается лениво внутри функций.
// Импорт маршрутного Excel выполняется на сервере (/api/route-import),
// здесь — только парсинг файла и отправка строк.
import { apiPost } from "@/lib/api-client";

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
  status: DriverLinkStatus;
  inviteUrl?: string;
};

export type RouteImportResult = {
  totalRows: number;
  routesCreated: number;
  pointsCreated: number;
  deliveryRouteIds: string[];
  driverLinks?: DriverLink[];
  errors: Array<{ row: number; message: string }>;
};

const HEADER_MAP: Record<string, keyof RouteImportRow> = {
  "номер маршрута": "route_number",
  "маршрут": "route_number",
  "route_number": "route_number",
  "водитель": "driver",
  "driver": "driver",
  "driver_name": "driver",
  "телефон водителя": "driver_phone",
  "driver_phone": "driver_phone",
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


export async function parseRouteWorkbook(file: ArrayBuffer): Promise<RouteImportRow[]> {
  const XLSX = await import("xlsx");
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
  const rows = await parseRouteWorkbook(buf);
  if (rows.length === 0) throw new Error("Файл пуст или не распознан");
  // Импорт может быть длительным (создание маршрута + точек + invite) — увеличенный таймаут.
  return await apiPost<RouteImportResult>("/api/route-import", { rows }, 60000);
}

export async function downloadRouteTemplate() {
  const XLSX = await import("xlsx");
  const headers = [
    "route_number",
    "driver_name",
    "driver_phone",
    "vehicle_number",
    "order_number",
    "customer_name",
    "customer_phone",
    "delivery_address",
    "map_link",
    "coordinates",
    "amount_to_collect",
    "payment_type",
    "prepaid",
    "requires_qr",
    "marketplace",
    "manager_comment",
  ];
  const example = [
    ["М-001", "Иванов И.И.", "+7 900 111-22-33", "А123БВ77", "ORD-1001", "ООО Ромашка", "+7 999 123-45-67",
     "г. Москва, ул. Ленина, 1", "https://yandex.ru/maps/?pt=37.6173,55.7558", "55.7558, 37.6173",
     4500, "наличные", "нет", "нет", "", "Позвонить за час"],
    ["М-001", "Иванов И.И.", "+7 900 111-22-33", "А123БВ77", "ORD-1002", "ИП Петров", "+7 999 222-33-44",
     "г. Москва, ул. Мира, 5", "", "", 0, "онлайн", "да", "да", "Ozon", ""],
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, ...example]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Маршрут");
  XLSX.writeFile(wb, "route_template.xlsx");
}
