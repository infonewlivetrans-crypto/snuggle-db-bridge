import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { authHeaders } from "@/lib/api-client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  FileSpreadsheet,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ChevronLeft,
} from "lucide-react";
import { toast } from "sonner";
import { formatRuPhone } from "@/lib/phone";
import {
  parseRouteSheetXlsx,
  type ParsedRouteSheet,
} from "@/lib/route-sheet-parser";
import {
  parseTransportRequestXlsx,
  type ParsedTransportRequest,
} from "@/lib/transport-request-parser";
import {
  parseOrderItemsFile,
  parseOrderItemsText,
  type OrderItemsParseResult,
} from "@/lib/order-items-parser";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  extractErrorDetails,
  type ErrorDetails,
} from "@/lib/supabaseError";
import { ErrorDetailsPanel } from "@/components/ErrorDetailsPanel";

type Step = "upload" | "preview" | "importing" | "done";

type ApiErrorShape = {
  error?: unknown;
  message?: unknown;
  details?: unknown;
  hint?: unknown;
  code?: unknown;
  status?: unknown;
  statusCode?: unknown;
  table?: unknown;
  operation?: unknown;
  payload?: unknown;
  response?: unknown;
  body?: unknown;
};

type ImportDiagnostics = {
  status: number | null;
  statusCode: number | null;
  table: string | null;
  operation: string | null;
  payload: unknown;
  error: {
    message: string | null;
    details: string | null;
    hint: string | null;
    code: string | null;
  };
  responseBody: string | null;
  rawError: unknown;
};

function asCleanString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value.trim() || null;
  if (value instanceof Error) return value.message.trim() || null;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return String(value);
  return null;
}

function asRecord(value: unknown): ApiErrorShape {
  return value && typeof value === "object" ? (value as ApiErrorShape) : {};
}

function asStatus(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function bodyToText(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value.trim() || null;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function bodyToRecord(value: unknown): ApiErrorShape {
  if (typeof value === "string") {
    try {
      return asRecord(JSON.parse(value));
    } catch {
      return {};
    }
  }
  return asRecord(value);
}

function firstText(...values: unknown[]): string | null {
  for (const value of values) {
    const text = asCleanString(value);
    if (text) return text;
  }
  return null;
}

function compactText(value: unknown, max = 1200): string | null {
  const text = bodyToText(value);
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function isSchemaErrorText(value: string): boolean {
  return (
    /Could not find the '[^']+' column of '[^']+' in the schema cache/i.test(value) ||
    /Could not find the table '[^']+' in the schema cache/i.test(value) ||
    /relation "[^"]+" does not exist/i.test(value) ||
    /missing table\s+[^\s.;,]+/i.test(value)
  );
}

function firstSchemaAwareText(...values: unknown[]): string | null {
  const texts = values.map(asCleanString).filter(Boolean) as string[];
  return texts.find(isSchemaErrorText) ?? texts[0] ?? null;
}

function clarifySchemaError(message: string): string {
  const columnMatch = message.match(
    /Could not find the '([^']+)' column of '([^']+)' in the schema cache/i,
  );
  if (columnMatch) {
    const [, column, table] = columnMatch;
    return `Не хватает колонки ${table}.${column} — ${message}`;
  }

  const tableMatch =
    message.match(/Could not find the table '([^']+)' in the schema cache/i) ??
    message.match(/relation "([^"]+)" does not exist/i) ??
    message.match(/missing table\s+([^\s.;,]+)/i);
  if (tableMatch) {
    return `Не хватает таблицы ${tableMatch[1]} — ${message}`;
  }

  return message;
}

function inferDbProblem(message: string, table: string | null): string {
  const columnMatch = message.match(
    /Could not find the '([^']+)' column of '([^']+)' in the schema cache/i,
  );
  if (columnMatch) return `Не хватает колонки ${columnMatch[2]}.${columnMatch[1]}`;

  const relationMatch = message.match(/relation "(?:public\.)?([^"]+)" does not exist/i);
  if (relationMatch) return `Не хватает таблицы ${relationMatch[1]}`;

  const tableMatch = message.match(/Could not find the table '([^']+)' in the schema cache/i);
  if (tableMatch) return `Не хватает таблицы ${tableMatch[1]}`;

  if (/permission denied|row-level security|violates row-level security|not authorized|forbidden/i.test(message)) {
    return table ? `Нет доступа к таблице ${table}` : "Нет доступа к таблице";
  }

  return message;
}

function createImportDiagnostics(args: {
  error: unknown;
  status?: number;
  statusText?: string;
  responseBody?: unknown;
  table?: string;
  operation?: string;
  payload?: unknown;
}): ImportDiagnostics {
  const errorObj = asRecord(args.error);
  const responseObj = asRecord(errorObj.response);
  const nestedErrorObj = asRecord(errorObj.error);
  const bodyObj = bodyToRecord(args.responseBody ?? errorObj.body);
  const status =
    asStatus(args.status) ??
    asStatus(errorObj.status) ??
    asStatus(responseObj.status) ??
    asStatus(bodyObj.status);
  const statusCode =
    asStatus(errorObj.statusCode) ??
    asStatus(responseObj.statusCode) ??
    asStatus(bodyObj.statusCode) ??
    status;

  return {
    status,
    statusCode,
    table: firstText(bodyObj.table, responseObj.table, errorObj.table, args.table),
    operation: firstText(bodyObj.operation, responseObj.operation, errorObj.operation, args.operation),
    payload: bodyObj.payload ?? responseObj.payload ?? errorObj.payload ?? args.payload ?? null,
    error: {
      message: firstSchemaAwareText(
        errorObj.message,
        nestedErrorObj.message,
        bodyObj.message,
        responseObj.message,
        bodyObj.error,
        responseObj.error,
      ),
      details: firstText(errorObj.details, nestedErrorObj.details, bodyObj.details, responseObj.details),
      hint: firstText(errorObj.hint, nestedErrorObj.hint, bodyObj.hint, responseObj.hint),
      code: firstText(errorObj.code, nestedErrorObj.code, bodyObj.code, responseObj.code),
    },
    responseBody: compactText(args.responseBody ?? errorObj.body),
    rawError: args.error,
  };
}

function getRouteInsertPayloadForDiagnostics(parsed: ParsedRouteSheet | null) {
  if (!parsed) return { route_number: "<unknown>", source: "transport_request" };
  const routeNumber = parsed.routeNumber?.trim() || "RL-<generated>";
  const routeDate = parsed.routeDate || "<today>";
  const headerMissing: string[] = [];
  if (!parsed.routeNumber) headerMissing.push("Номер маршрутного листа");
  if (!parsed.routeDate) headerMissing.push("Дата");
  if (!parsed.carrier) headerMissing.push("Перевозчик");
  if (!parsed.driverName) headerMissing.push("Водитель");
  if (!parsed.driverPhone) headerMissing.push("Телефон водителя");
  if (!parsed.vehiclePlate) headerMissing.push("Номер ТС");
  if (!parsed.contract) headerMissing.push("Договор");
  const headerNote = headerMissing.length ? `Требует заполнения: ${headerMissing.join(", ")}` : null;

  return {
    route_number: routeNumber,
    route_date: routeDate,
    request_type: "client_delivery",
    status: "planned",
    request_status: "draft",
    source: "route_sheet",
    organization: parsed.organization,
    onec_request_number: parsed.routeNumber,
    carrier_id: "<resolved on server>",
    driver_id: "<resolved on server>",
    vehicle_id: "<resolved on server>",
    driver_name: parsed.driverName,
    transport_comment: headerNote,
    request_status_comment: headerNote,
  };
}

function makeImportErrorDetails(args: {
  error: unknown;
  status?: number;
  statusText?: string;
  responseBody?: unknown;
  table?: string;
  operation?: string;
  payload?: unknown;
}): ErrorDetails {
  const diagnostics = createImportDiagnostics(args);
  const authStatus = diagnostics.status === 401 || diagnostics.status === 403 || diagnostics.statusCode === 401 || diagnostics.statusCode === 403;
  const message = authStatus
    ? "Сессия истекла. Войдите заново."
    : firstSchemaAwareText(
        diagnostics.error.message,
        diagnostics.error.details,
        diagnostics.responseBody,
      );

  const primary = message
    ? inferDbProblem(clarifySchemaError(message), diagnostics.table)
    : "Не удалось создать заявку";
  const parts = [
    primary,
    diagnostics.error.details ? `details: ${diagnostics.error.details}` : null,
    diagnostics.error.hint ? `hint: ${diagnostics.error.hint}` : null,
    diagnostics.error.code ? `code: ${diagnostics.error.code}` : null,
    diagnostics.status ? `status: ${diagnostics.status}` : null,
    diagnostics.statusCode ? `statusCode: ${diagnostics.statusCode}` : null,
    diagnostics.table ? `table: ${diagnostics.table}` : null,
    diagnostics.operation ? `operation: ${diagnostics.operation}` : null,
    diagnostics.payload ? `payload: ${compactText(diagnostics.payload, 500)}` : null,
  ].filter(Boolean) as string[];

  const raw = bodyToText({ statusText: args.statusText, ...diagnostics }) ?? "";
  return {
    summary: parts.join(" · "),
    message: primary,
    details: diagnostics.error.details,
    hint: diagnostics.error.hint,
    code: diagnostics.error.code,
    status: diagnostics.status,
    body: diagnostics.responseBody,
    raw,
  };
}

export function RouteSheetImportWizard({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedRouteSheet | null>(null);
  const [trFile, setTrFile] = useState<File | null>(null);
  const [trParsed, setTrParsed] = useState<ParsedTransportRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<ErrorDetails | null>(null);
  const [result, setResult] = useState<{
    routeId: string;
    routeNumber: string;
    inserted: number;
    total: number;
    itemsCreated: number;
    itemsUnmatched: number;
    ordersWithoutItems: string[];
    failedRows: Array<{ rowIndex: number; reason: string }>;
    headerMissing: string[];
    warnings: string[];
    rows: Array<{
      rowIndex: number;
      orderNumber: string;
      customer: string | null;
      missingFields: string[];
      reason?: string;
    }>;
    clientsNeedingFill: Array<{
      name: string;
      clientId: string | null;
      missing: string[];
    }>;
    needsReview: boolean;
  } | null>(null);
  // Товарный состав
  const [itemsText, setItemsText] = useState("");
  const [itemsFile, setItemsFile] = useState<File | null>(null);
  const [itemsParsed, setItemsParsed] = useState<OrderItemsParseResult | null>(null);
  const [itemsBusy, setItemsBusy] = useState(false);
  const [itemsError, setItemsError] = useState<string | null>(null);

  const reset = () => {
    setStep("upload");
    setFile(null);
    setParsed(null);
    setTrFile(null);
    setTrParsed(null);
    setBusy(false);
    setErrorMsg(null);
    setErrorDetails(null);
    setResult(null);
    setItemsText("");
    setItemsFile(null);
    setItemsParsed(null);
    setItemsError(null);
  };

  const handleParse = async () => {
    if (!file && !trParsed) return;
    setBusy(true);
    setErrorMsg(null);
    setErrorDetails(null);
    try {
      let data: ParsedRouteSheet | null = null;
      if (file) {
        const name = file.name.toLowerCase();
        if (!name.endsWith(".xlsx") && !name.endsWith(".xls")) {
          throw new Error("Поддерживаются только Excel-файлы (.xlsx, .xls).");
        }
        data = await parseRouteSheetXlsx(file);
        if (data.orders.length === 0) {
          throw new Error(
            "Не удалось распознать заказы в маршрутном листе. Проверьте, что вы загрузили именно маршрутный лист, а не «Заявку на транспорт» — для заявки используйте отдельное поле ниже.",
          );
        }
      } else {
        // Только заявка на транспорт — синтезируем пустой ParsedRouteSheet
        // для предпросмотра, реальные orders создаст сервер из TR.orderNumbers.
        data = {
          routeNumber: trParsed?.requestNumber ?? null,
          routeDate: trParsed?.loadingDate ?? null,
          organization: trParsed?.organization ?? null,
          shipper: trParsed?.shipper ?? null,
          carrier: trParsed?.carrier ?? null,
          contract: null,
          driverName: trParsed?.driverName ?? null,
          driverPhone: trParsed?.driverPhone ?? null,
          vehiclePlate: trParsed?.vehiclePlate ?? null,
          orders: [],
          totals: {
            ordersCount: trParsed?.orderNumbers.length ?? 0,
            cashSum: 0,
            qrCount: 0,
            paidCount: 0,
            issuesCount: 0,
          },
        };
      }
      setParsed(data);
      setStep("preview");
    } catch (e) {
      const det = extractErrorDetails(e);
      console.error("Route sheet parse error (full):", e);
      setErrorMsg(det.summary);
      setErrorDetails(det);
      toast.error(det.summary);
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async () => {
    if (!parsed && !trParsed) return;
    setBusy(true);
    setStep("importing");
    setErrorMsg(null);
    setErrorDetails(null);
    try {
      const res = await fetch("/api/import-route-sheet", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({
          ...(parsed ?? {}),
          transportRequest: trParsed ?? null,
          itemsByOrderNumber: itemsParsed?.byOrderNumber ?? {},
        }),
      });

      const rawText = await res.text();
      let json: {
        ok?: boolean;
        routeId?: string;
        routeNumber?: string;
        inserted?: number;
        total?: number;
        itemsCreated?: number;
        itemsUnmatched?: number;
        ordersWithoutItems?: string[];
        failedRows?: Array<{ rowIndex: number; reason: string }>;
        headerMissing?: string[];
        warnings?: string[];
        rows?: Array<{
          rowIndex: number;
          orderNumber: string;
          customer: string | null;
          missingFields: string[];
          reason?: string;
        }>;
        clientsNeedingFill?: Array<{
          name: string;
          clientId: string | null;
          missing: string[];
        }>;
        needsReview?: boolean;
        error?: string;
        message?: string;
        details?: string;
        hint?: string;
        code?: string;
      } = {};
      try {
        json = rawText ? JSON.parse(rawText) : {};
      } catch {
        // оставим json пустым, тело попадёт в подробности
      }

      if (!res.ok || !json.ok || !json.routeId) {
        // Штатный сценарий: маршрут с таким номером уже импортирован.
        // Сервер отвечает 409 + code: "route_already_imported" или "transport_request_already_imported".
        // Не показываем технический дамп и не логируем как ошибку.
        const ALREADY_CODES = new Set(["route_already_imported", "transport_request_already_imported"]);
        if (res.status === 409 && json.code && ALREADY_CODES.has(json.code)) {
          const friendly = `Заявка №${json.routeNumber ?? parsed?.routeNumber ?? ""} уже создана`;
          setErrorMsg(friendly);
          setErrorDetails(null);
          toast.info(friendly);
          setStep("preview");
          setBusy(false);
          return;
        }
        const supabasePayload = getRouteInsertPayloadForDiagnostics(parsed);
        const diagnostics = createImportDiagnostics({
          error: json,
          status: res.status,
          statusText: res.statusText,
          responseBody: rawText || json,
          table: "routes",
          operation: "insert",
          payload: supabasePayload,
        });
        const det = makeImportErrorDetails({
          error: json,
          status: res.status,
          statusText: res.statusText,
          responseBody: rawText || json,
          table: "routes",
          operation: "insert",
          payload: supabasePayload,
        });
        console.error("[RouteSheetImport] transport request creation failed", {
          status: diagnostics.status,
          statusCode: diagnostics.statusCode,
          error: diagnostics.error,
          table: diagnostics.table,
          operation: diagnostics.operation,
          payload: diagnostics.payload,
          responseBody: diagnostics.responseBody,
          rawError: diagnostics.rawError,
        });
        setErrorDetails(det);
        setErrorMsg(det.summary);
        toast.error(det.summary);
        setStep("preview");
        setBusy(false);
        return;
      }

      setResult({
        routeId: json.routeId,
        routeNumber: json.routeNumber ?? "",
        inserted: json.inserted ?? 0,
        total: json.total ?? parsed?.orders.length ?? 0,
        itemsCreated: json.itemsCreated ?? 0,
        itemsUnmatched: json.itemsUnmatched ?? 0,
        ordersWithoutItems: json.ordersWithoutItems ?? [],
        failedRows: json.failedRows ?? [],
        headerMissing: json.headerMissing ?? [],
        warnings: json.warnings ?? [],
        rows: json.rows ?? [],
        clientsNeedingFill: json.clientsNeedingFill ?? [],
        needsReview: Boolean(json.needsReview),
      });
      setStep("done");
      // Чтобы новая заявка появилась в кабинете логиста и в списке заявок
      // на транспорт без ручного обновления страницы.
      queryClient.invalidateQueries({ queryKey: ["logist-routes"] });
      queryClient.invalidateQueries({ queryKey: ["transport-requests"] });
      if (json.needsReview) {
        toast.warning("Заявка создана, но требует заполнения данных");
      } else {
        toast.success("Заявка на транспорт создана");
      }
    } catch (e) {
      const supabasePayload = getRouteInsertPayloadForDiagnostics(parsed);
      const diagnostics = createImportDiagnostics({
        error: e,
        table: "routes",
        operation: "insert",
        payload: supabasePayload,
      });
      const det = makeImportErrorDetails({
        error: e,
        table: "routes",
        operation: "insert",
        payload: supabasePayload,
      });
      console.error("[RouteSheetImport] transport request creation failed", {
        status: diagnostics.status,
        statusCode: diagnostics.statusCode,
        error: diagnostics.error,
        table: diagnostics.table,
        operation: diagnostics.operation,
        payload: diagnostics.payload,
        responseBody: diagnostics.responseBody,
        rawError: diagnostics.rawError,
      });
      setErrorMsg(det.summary);
      setErrorDetails(det);
      toast.error(det.summary);
      setStep("preview");
    } finally {
      setBusy(false);
    }
  };

  const goToRequest = () => {
    if (!result) return;
    onOpenChange(false);
    reset();
    navigate({
      to: "/transport-requests/$requestId",
      params: { requestId: result.routeId },
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Импорт документов
          </DialogTitle>
          <DialogDescription>
            Маршрутный лист или одиночная заявка на транспорт из 1С (Excel)
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-1 flex-col overflow-hidden space-y-3">

        {step === "upload" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="rs-file">
                Файл маршрутного листа (основной)
              </Label>
              <Input
                id="rs-file"
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setErrorMsg(null);
                }}
              />
              <p className="text-xs text-muted-foreground">
                Например: «Маршрутный лист № 000003408.xlsx». Содержит таблицу заказов
                (Реализация, Покупатель, Адрес доставки и т.д.).
              </p>
            </div>
            {file && (
              <div className="rounded-md border bg-secondary/30 p-3 text-sm">
                <div className="font-medium">{file.name}</div>
                <div className="text-xs text-muted-foreground">
                  {(file.size / 1024).toFixed(1)} КБ
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="tr-file">
                Файл «Заявка на транспорт» (опционально, только если есть отдельный файл заявки)
              </Label>
              <Input
                id="tr-file"
                type="file"
                accept=".xlsx,.xls"
                onChange={async (e) => {
                  const f = e.target.files?.[0] ?? null;
                  setTrFile(f);
                  setTrParsed(null);
                  setErrorMsg(null);
                  if (!f) return;
                  try {
                    const d = await parseTransportRequestXlsx(f);
                    setTrParsed(d);
                    toast.success(
                      `Заявка №${d.requestNumber ?? "—"} распознана`,
                    );
                  } catch (err) {
                    const msg =
                      err instanceof Error ? err.message : "Файл не распознан";
                    setErrorMsg(msg);
                    toast.error(msg);
                  }
                }}
              />
              {trFile && trParsed && (
                <div className="rounded-md border bg-secondary/30 p-2 text-xs">
                  <b>{trFile.name}</b> · №{trParsed.requestNumber ?? "—"} ·
                  погрузка: {trParsed.loadingDate ?? "—"}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Не загружайте сюда маршрутный лист — для него отдельное поле выше.
              </p>
            </div>
            {errorMsg && (
              <ErrorDetailsPanel
                title="Не удалось обработать файл"
                details={errorDetails ?? { summary: errorMsg, message: errorMsg, details: null, hint: null, code: null, status: null, body: null, raw: errorMsg }}
              />
            )}
          </div>
        )}

        {step === "preview" && parsed && (
          <div className="flex-1 overflow-auto space-y-3">
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                Распознано: <b>{parsed.totals.ordersCount}</b> заказов
                {parsed.totals.issuesCount > 0 && (
                  <>
                    {" "}
                    · с замечаниями:{" "}
                    <b className="text-destructive">{parsed.totals.issuesCount}</b>
                  </>
                )}
              </AlertDescription>
            </Alert>

            <div className="grid gap-2 sm:grid-cols-2 text-sm">
              <Field label="Маршрутный лист" value={parsed.routeNumber} />
              <Field label="Дата" value={parsed.routeDate} />
              <Field label="Перевозчик" value={parsed.carrier} />
              <Field label="Водитель" value={parsed.driverName} />
              <Field label="Телефон водителя" value={parsed.driverPhone} />
              <Field label="Номер ТС" value={parsed.vehiclePlate} />
              <Field label="Грузоотправитель" value={parsed.shipper} />
              <Field label="Организация" value={parsed.organization} />
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <Stat label="Заказов" value={parsed.totals.ordersCount} />
              <Stat
                label="Сумма наличных"
                value={`${parsed.totals.cashSum.toLocaleString("ru-RU")} ₽`}
              />
              <Stat label="QR-оплат" value={parsed.totals.qrCount} />
            </div>

            <div className="overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>№</TableHead>
                    <TableHead>Заказ</TableHead>
                    <TableHead>Клиент</TableHead>
                    <TableHead>Адрес</TableHead>
                    <TableHead>Телефон</TableHead>
                    <TableHead>Оплата</TableHead>
                    <TableHead>Сумма</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsed.orders.map((o) => (
                    <TableRow
                      key={o.rowIndex}
                      className={o.hasIssues ? "bg-destructive/5" : ""}
                    >
                      <TableCell>{o.lineNumber ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {o.orderNumber ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs">{o.customer ?? "—"}</TableCell>
                      <TableCell className="text-xs max-w-[260px] truncate">
                        {o.deliveryAddress ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {o.contactPhone ? formatRuPhone(o.contactPhone) : "—"}
                      </TableCell>
                      <TableCell>
                        <PaymentBadge kind={o.paymentKind} raw={o.paymentRaw} />
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {o.amountToCollect != null
                          ? `${o.amountToCollect.toLocaleString("ru-RU")} ₽`
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Товарный состав (опционально) */}
            <div className="rounded-lg border bg-card p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium">Товарный состав (опционально)</div>
                {itemsParsed && (
                  <div className="text-xs text-muted-foreground">
                    Распознано <b>{itemsParsed.totals.items}</b> товарных строк
                    по <b>{itemsParsed.totals.orders}</b> заказам
                    {itemsParsed.totals.needsReview > 0 && (
                      <>
                        {" "}· требуют проверки:{" "}
                        <b className="text-amber-600">{itemsParsed.totals.needsReview}</b>
                      </>
                    )}
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Загрузите Excel/CSV/TXT с товарами или вставьте текст из 1С.
                Группировка по «Заказ покупателя КП_…». Без него заявка тоже создастся.
              </p>
              <Tabs defaultValue="text" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="text">Вставить текст</TabsTrigger>
                  <TabsTrigger value="file">Загрузить файл</TabsTrigger>
                </TabsList>
                <TabsContent value="text" className="space-y-2">
                  <Textarea
                    value={itemsText}
                    onChange={(e) => {
                      setItemsText(e.target.value);
                      setItemsError(null);
                    }}
                    placeholder="Заказ покупателя КП_ЮФ_02740 от 13.05.2026 0:00:00&#10;1&#10;BО1. Арочная Оптима Каркас 3*4&#10;Новый&#10;шт&#10;45&#10;1,000"
                    className="min-h-[140px] font-mono text-xs"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={!itemsText.trim() || itemsBusy}
                    onClick={() => {
                      setItemsBusy(true);
                      setItemsError(null);
                      try {
                        const r = parseOrderItemsText(itemsText);
                        setItemsParsed(r);
                        if (r.totals.items === 0) {
                          setItemsError(
                            r.warnings[0] ?? "Не распознано ни одной товарной строки",
                          );
                        }
                      } catch (e) {
                        setItemsError(e instanceof Error ? e.message : "Ошибка парсера");
                      } finally {
                        setItemsBusy(false);
                      }
                    }}
                  >
                    Распознать товары
                  </Button>
                </TabsContent>
                <TabsContent value="file" className="space-y-2">
                  <Input
                    type="file"
                    accept=".xlsx,.xls,.csv,.txt"
                    onChange={async (e) => {
                      const f = e.target.files?.[0] ?? null;
                      setItemsFile(f);
                      setItemsError(null);
                      if (!f) return;
                      setItemsBusy(true);
                      try {
                        const r = await parseOrderItemsFile(f);
                        setItemsParsed(r);
                        if (r.totals.items === 0) {
                          setItemsError(
                            r.warnings[0] ?? "Не распознано ни одной товарной строки",
                          );
                        }
                      } catch (err) {
                        setItemsError(err instanceof Error ? err.message : "Ошибка чтения файла");
                      } finally {
                        setItemsBusy(false);
                      }
                    }}
                  />
                  {itemsFile && (
                    <div className="text-xs text-muted-foreground">
                      {itemsFile.name} · {(itemsFile.size / 1024).toFixed(1)} КБ
                    </div>
                  )}
                </TabsContent>
              </Tabs>
              {itemsError && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="text-xs">{itemsError}</AlertDescription>
                </Alert>
              )}
              {itemsParsed && itemsParsed.totals.orders > 0 && (
                <div className="rounded-md border bg-muted/30 p-2 text-xs">
                  <div className="font-medium mb-1">Распознанные заказы:</div>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(itemsParsed.byOrderNumber).map(([k, v]) => (
                      <Badge key={k} variant="outline" className="font-mono">
                        {k} · {v.length}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {errorMsg && (
              <ErrorDetailsPanel
                title="Ошибка импорта маршрутного листа"
                details={errorDetails ?? { summary: errorMsg, message: errorMsg, details: null, hint: null, code: null, status: null, body: null, raw: errorMsg }}
              />
            )}
          </div>
        )}

        {step === "importing" && (
          <div className="flex flex-col items-center justify-center gap-3 py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              Создаём заявку и заказы…
            </p>
          </div>
        )}

        {step === "done" && result && (
          <div className="space-y-3 overflow-auto">
            <Alert
              className={
                result.needsReview
                  ? "border-amber-500/40"
                  : "border-status-success/40"
              }
            >
              {result.needsReview ? (
                <AlertTriangle className="h-4 w-4 text-amber-600" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-status-success" />
              )}
              <AlertDescription>
                <div className="font-medium">
                  {result.needsReview
                    ? "Заявка создана, но требует заполнения данных"
                    : "Заявка на транспорт создана"}
                </div>
                <div className="text-sm text-muted-foreground">
                  № {result.routeNumber} · импортировано {result.inserted} из{" "}
                  {result.total} заказов
                </div>
              </AlertDescription>
            </Alert>

            {/* Итоговые счётчики */}
            <div className="grid gap-2 sm:grid-cols-3">
              <Stat label="Заказов создано" value={result.inserted} />
              <Stat label="Точек маршрута" value={result.inserted} />
              <Stat label="Товарных строк" value={result.itemsCreated} />
              {result.itemsUnmatched > 0 && (
                <Stat label="Не сопоставлено товаров" value={result.itemsUnmatched} />
              )}
              {result.ordersWithoutItems.length > 0 && (
                <Stat
                  label="Заказы без товарного состава"
                  value={result.ordersWithoutItems.length}
                />
              )}
            </div>

            {result.ordersWithoutItems.length > 0 && (
              <div className="rounded-md border">
                <div className="border-b bg-secondary/40 px-3 py-2 text-sm font-medium">
                  Заказы без товарного состава
                </div>
                <div className="p-3 text-xs flex flex-wrap gap-1">
                  {result.ordersWithoutItems.slice(0, 100).map((n) => (
                    <Badge key={n} variant="outline" className="font-mono">
                      {n}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {result.headerMissing.length > 0 && (
              <Alert>
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertDescription>
                  <div className="font-medium">
                    Не заполнены данные шапки маршрутного листа
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {result.headerMissing.join(", ")}
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {result.warnings.length > 0 && (
              <Alert className="border-amber-500/40">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertDescription>
                  <div className="font-medium">
                    Предупреждения импорта ({result.warnings.length})
                  </div>
                  <ul className="mt-1 max-h-40 list-disc space-y-1 overflow-auto pl-5 text-xs">
                    {result.warnings.slice(0, 100).map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {result.rows.some((r) => r.missingFields.length > 0) && (
              <div className="rounded-md border">
                <div className="border-b bg-secondary/40 px-3 py-2 text-sm font-medium">
                  Строки, требующие заполнения
                </div>
                <ul className="max-h-48 space-y-1 overflow-auto p-3 text-xs">
                  {result.rows
                    .filter((r) => r.missingFields.length > 0)
                    .map((r) => (
                      <li key={r.rowIndex}>
                        <span className="font-mono">{r.orderNumber}</span>
                        {r.customer ? ` · ${r.customer}` : ""} —{" "}
                        <span className="text-amber-700 dark:text-amber-300">
                          {r.missingFields.join(", ")}
                        </span>
                      </li>
                    ))}
                </ul>
              </div>
            )}

            {result.clientsNeedingFill.length > 0 && (
              <div className="rounded-md border">
                <div className="border-b bg-secondary/40 px-3 py-2 text-sm font-medium">
                  Контрагенты, по которым нужно дополнить данные
                </div>
                <ul className="max-h-40 space-y-1 overflow-auto p-3 text-xs">
                  {result.clientsNeedingFill.map((c, i) => (
                    <li key={i}>
                      <b>{c.name}</b> — {c.missing.join(", ")}
                    </li>
                  ))}
                </ul>
                <div className="border-t px-3 py-2 text-xs text-muted-foreground">
                  Менеджеру отправлено уведомление по каждому контрагенту.
                  После заполнения карточки данные подтянутся автоматически
                  при следующем импорте.
                </div>
              </div>
            )}

            {result.failedRows.length > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <div className="font-medium">
                    Не удалось создать строк: {result.failedRows.length}
                  </div>
                  <ul className="mt-1 max-h-40 list-disc space-y-1 overflow-auto pl-5 text-xs">
                    {result.failedRows.slice(0, 50).map((f, i) => (
                      <li key={i}>
                        Строка {f.rowIndex}: {f.reason}
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 flex-wrap">
          {step === "upload" && (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
                Отмена
              </Button>
              <Button onClick={handleParse} disabled={(!file && !trParsed) || busy} className="gap-2">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Распознать
              </Button>
            </>
          )}
          {step === "preview" && (
            <>
              <Button variant="ghost" onClick={() => setStep("upload")} disabled={busy}>
                <ChevronLeft className="h-4 w-4" /> Назад
              </Button>
              <Button onClick={handleImport} disabled={busy} className="gap-2">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Создать заявку на транспорт
              </Button>
            </>
          )}
          {step === "done" && result && (
            <>
              <Button variant="outline" onClick={() => { onOpenChange(false); reset(); }}>
                Закрыть
              </Button>
              <Button onClick={goToRequest}>Перейти в заявку</Button>
            </>
          )}
        </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-md border bg-card p-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium truncate">{value || "—"}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border bg-secondary/40 p-2 text-center">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-base font-semibold">{value}</div>
    </div>
  );
}

function PaymentBadge({
  kind,
  raw,
}: {
  kind: "cash" | "qr" | "paid" | "bank" | "unknown";
  raw: string | null;
}) {
  const map = {
    cash: { text: "Наличные", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
    qr: { text: "QR", cls: "bg-blue-500/15 text-blue-700 dark:text-blue-300" },
    paid: { text: "Оплачен", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
    bank: { text: "Безнал", cls: "bg-purple-500/15 text-purple-700 dark:text-purple-300" },
    unknown: { text: raw || "?", cls: "bg-destructive/15 text-destructive" },
  } as const;
  const v = map[kind];
  return (
    <Badge variant="outline" className={`text-xs ${v.cls}`}>
      {v.text}
    </Badge>
  );
}
