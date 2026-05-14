// Парсер маршрутного листа из 1С (xlsx).
// Распознаёт шапку (организация, грузоотправитель, перевозчик, договор,
// водитель, телефон, ТС, № и дата ML) и таблицу заказов.
//
// Структура листа стабильна, но координаты ячеек могут немного «гулять»,
// поэтому ищем шапку поиском по подписям, а заголовки таблицы — по строке,
// в которой есть «№», «Реализация», «Покупатель», «Адрес доставки».

export type RouteSheetPaymentKind = "cash" | "qr" | "paid" | "bank" | "unknown";

export type ParsedRouteSheetOrder = {
  rowIndex: number; // номер строки в файле (для подсветки)
  lineNumber: number | null; // № п/п из колонки «№»
  saleDoc: string | null; // «Реализация товаров и услуг ...»
  orderNumber: string | null; // выделенный номер документа (например КП_ЮФ_03602)
  orderDate: string | null; // дата документа (если выделена)
  customer: string | null; // покупатель
  deliveryAddress: string | null;
  contactPhone: string | null;
  deliveryPeriod: string | null; // «Первая половина дня» и т.п.
  amountToCollect: number | null; // «Взять с клиента»
  paymentRaw: string | null; // как написано в файле
  paymentKind: RouteSheetPaymentKind;
  requiresQr: boolean;
  managerName: string | null;
  managerPhone: string | null;
  organization: string | null;
  comment: string | null;
  // флаг для подсветки в UI
  hasIssues: boolean;
  issues: string[];
};

export type ParsedRouteSheet = {
  // Шапка
  routeNumber: string | null; // 000003408
  routeDate: string | null; // ISO yyyy-mm-dd
  organization: string | null;
  shipper: string | null; // Грузоотправитель
  carrier: string | null; // Перевозчик
  contract: string | null; // Договор
  driverName: string | null;
  driverPhone: string | null;
  vehiclePlate: string | null;
  // Заказы
  orders: ParsedRouteSheetOrder[];
  // Сводка для предпросмотра
  totals: {
    ordersCount: number;
    cashSum: number;
    qrCount: number;
    paidCount: number;
    issuesCount: number;
  };
};

const HEADER_ALIASES: Record<string, string> = {
  "№": "n",
  "n": "n",
  "номер": "n",
  "реализация товаров услуг": "sale",
  "реализация товаров и услуг": "sale",
  "реализация": "sale",
  "покупатель": "customer",
  "адрес доставки": "address",
  "адрес": "address",
  "телефон получателя": "phone",
  "телефон": "phone",
  "период доставки": "period",
  "взять с клиента": "amount",
  "сумма": "amount",
  "оплата": "payment",
  "менеджер": "manager",
  "телефон менеджера": "managerPhone",
  "организация": "organization",
  "комментарий": "comment",
};

function norm(v: unknown): string {
  return String(v ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).replace(/\s+/g, " ").trim();
  return s === "" ? null : s;
}

function parseAmount(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  // допускаем "70 600", "70 600,00", "70.600,00"
  const cleaned = String(v)
    .replace(/[\s\u00A0]/g, "")
    .replace(/,/g, ".");
  // Если есть несколько точек — оставляем последнюю как десятичную
  const lastDot = cleaned.lastIndexOf(".");
  let normNum = cleaned;
  if (lastDot >= 0 && cleaned.indexOf(".") !== lastDot) {
    normNum = cleaned.slice(0, lastDot).replace(/\./g, "") + cleaned.slice(lastDot);
  }
  const n = parseFloat(normNum);
  return Number.isFinite(n) ? n : null;
}

function detectPayment(raw: string | null): {
  kind: RouteSheetPaymentKind;
  requiresQr: boolean;
} {
  const n = (raw ?? "").toLowerCase();
  if (!n) return { kind: "unknown", requiresQr: false };
  if (n.includes("qr") || n.includes("qr-код") || n.includes("по qr"))
    return { kind: "qr", requiresQr: true };
  if (n.includes("налич")) return { kind: "cash", requiresQr: false };
  if (n.includes("оплачен") || n.includes("оплата онлайн"))
    return { kind: "paid", requiresQr: false };
  if (n.includes("безнал") || n.includes("банк") || n.includes("р/с"))
    return { kind: "bank", requiresQr: false };
  return { kind: "unknown", requiresQr: false };
}

function extractOrderNumberAndDate(saleDoc: string | null): {
  number: string | null;
  date: string | null;
} {
  if (!saleDoc) return { number: null, date: null };
  // Пример: «Реализация товаров и услуг КП_ЮФ_03602 от 29.04.2026 10:01:43»
  const m = saleDoc.match(/([A-ZА-Я]{1,4}_[\wА-ЯA-Z]+_?\d+)\s+от\s+(\d{2}\.\d{2}\.\d{4})/i);
  if (m) {
    const [d, mo, y] = m[2].split(".");
    return { number: m[1], date: `${y}-${mo}-${d}` };
  }
  const m2 = saleDoc.match(/(\d{2}\.\d{2}\.\d{4})/);
  if (m2) {
    const [d, mo, y] = m2[1].split(".");
    return { number: null, date: `${y}-${mo}-${d}` };
  }
  return { number: null, date: null };
}

function extractRouteNumberAndDate(s: string | null): {
  number: string | null;
  date: string | null;
} {
  if (!s) return { number: null, date: null };
  // «Маршрутный лист № 000003408 от 30.04.2026»
  const m = s.match(/№\s*([\d]+).*?от\s*(\d{2}\.\d{2}\.\d{4})/i);
  if (!m) return { number: null, date: null };
  const [d, mo, y] = m[2].split(".");
  return { number: m[1], date: `${y}-${mo}-${d}` };
}

type Aoa = unknown[][];

/** Строим карту значений по подписям из шапки (ищем «Перевозчик», берём ячейку справа). */
function findValueByLabel(grid: Aoa, label: string): string | null {
  const target = norm(label);
  for (let r = 0; r < Math.min(grid.length, 20); r++) {
    const row = grid[r] ?? [];
    for (let c = 0; c < row.length; c++) {
      if (norm(row[c]) === target) {
        // Берём ближайшую непустую ячейку справа
        for (let cc = c + 1; cc < row.length; cc++) {
          const v = str(row[cc]);
          if (v) return v;
        }
      }
    }
  }
  return null;
}

/** Ищем строку с заголовками таблицы заказов. */
function findHeaderRowIndex(grid: Aoa): number {
  for (let r = 0; r < Math.min(grid.length, 30); r++) {
    const row = grid[r] ?? [];
    const labels = row.map((c) => norm(c));
    const has = (k: string) => labels.some((l) => l === k || l.includes(k));
    if (has("реализация товаров услуг") && has("покупатель") && has("адрес доставки")) {
      return r;
    }
  }
  return -1;
}

/** Сопоставляем колонки заголовка с каноническими ключами. */
function buildColumnMap(headerRow: unknown[]): Record<string, number> {
  const map: Record<string, number> = {};
  headerRow.forEach((cell, idx) => {
    const key = HEADER_ALIASES[norm(cell)];
    if (key && map[key] === undefined) map[key] = idx;
  });
  return map;
}

/** Строка считается строкой заказа, если в колонке № стоит число и есть «Реализация». */
function isOrderRow(row: unknown[], cols: Record<string, number>): boolean {
  if (cols.n === undefined || cols.sale === undefined) return false;
  const n = row[cols.n];
  const sale = str(row[cols.sale]);
  const isNum = typeof n === "number" || (typeof n === "string" && /^\d+$/.test(n.trim()));
  return isNum && !!sale && /реализац/i.test(sale);
}

export async function parseRouteSheetXlsx(file: File): Promise<ParsedRouteSheet> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error("Файл не содержит листов");
  const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    blankrows: false,
    defval: "",
  }) as Aoa;

  // --- Шапка ---
  // Номер и дата маршрутного листа: ищем по подстроке «Маршрутный лист»
  let routeTitle: string | null = null;
  for (let r = 0; r < Math.min(grid.length, 20); r++) {
    const row = grid[r] ?? [];
    for (const cell of row) {
      const s = str(cell);
      if (s && /маршрутный\s+лист/i.test(s)) {
        routeTitle = s;
        break;
      }
    }
    if (routeTitle) break;
  }
  const { number: routeNumber, date: routeDate } = extractRouteNumberAndDate(routeTitle);

  const organization = findValueByLabel(grid, "Организация");
  const shipper = findValueByLabel(grid, "Грузоотправитель");
  const carrier = findValueByLabel(grid, "Перевозчик");
  const contract = findValueByLabel(grid, "Договор");
  const driverName = findValueByLabel(grid, "Водитель (ФИО)") ?? findValueByLabel(grid, "Водитель");
  const driverPhone = findValueByLabel(grid, "Телефон водителя");
  const vehiclePlate = findValueByLabel(grid, "Номер ТС");

  // --- Таблица заказов ---
  const orders: ParsedRouteSheetOrder[] = [];
  const headerRowIdx = findHeaderRowIndex(grid);
  if (headerRowIdx >= 0) {
    const cols = buildColumnMap(grid[headerRowIdx]);
    for (let r = headerRowIdx + 1; r < grid.length; r++) {
      const row = grid[r] ?? [];
      if (!isOrderRow(row, cols)) continue;
      const saleDoc = str(row[cols.sale]);
      const { number: orderNumber, date: orderDate } = extractOrderNumberAndDate(saleDoc);
      const paymentRaw = str(row[cols.payment]);
      const { kind, requiresQr } = detectPayment(paymentRaw);
      const amount = parseAmount(row[cols.amount]);
      const customer = str(row[cols.customer]);
      const address = str(row[cols.address]);
      const phone = str(row[cols.phone]);
      const issues: string[] = [];
      if (!customer) issues.push("Не распознан покупатель");
      if (!address) issues.push("Нет адреса доставки");
      if (!orderNumber) issues.push("Не выделен номер заказа");
      if (kind === "unknown" && paymentRaw) issues.push(`Тип оплаты не распознан: «${paymentRaw}»`);
      if (kind === "cash" && amount == null) issues.push("Не указана сумма наличных");

      orders.push({
        rowIndex: r + 1,
        lineNumber:
          typeof row[cols.n] === "number"
            ? (row[cols.n] as number)
            : parseInt(String(row[cols.n] ?? ""), 10) || null,
        saleDoc,
        orderNumber,
        orderDate,
        customer,
        deliveryAddress: address,
        contactPhone: phone,
        deliveryPeriod: str(row[cols.period]),
        amountToCollect: amount,
        paymentRaw,
        paymentKind: kind,
        requiresQr,
        managerName: str(row[cols.manager]),
        managerPhone: str(row[cols.managerPhone]),
        organization: str(row[cols.organization]) ?? organization,
        comment: str(row[cols.comment]),
        hasIssues: issues.length > 0,
        issues,
      });
    }
  }

  const totals = {
    ordersCount: orders.length,
    cashSum: orders
      .filter((o) => o.paymentKind === "cash")
      .reduce((acc, o) => acc + (o.amountToCollect ?? 0), 0),
    qrCount: orders.filter((o) => o.paymentKind === "qr").length,
    paidCount: orders.filter((o) => o.paymentKind === "paid").length,
    issuesCount: orders.filter((o) => o.hasIssues).length,
  };

  return {
    routeNumber,
    routeDate,
    organization,
    shipper,
    carrier,
    contract,
    driverName,
    driverPhone,
    vehiclePlate,
    orders,
    totals,
  };
}

/** Маппинг payment_kind → enum payment_type в БД. */
export function paymentKindToDbType(kind: RouteSheetPaymentKind): "cash" | "card" | "online" | "qr" {
  switch (kind) {
    case "qr":
      return "qr";
    case "cash":
      return "cash";
    case "paid":
      return "online";
    case "bank":
      return "online";
    default:
      return "cash";
  }
}
