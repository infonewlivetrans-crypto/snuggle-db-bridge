import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
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
import {
  parseRouteSheetXlsx,
  type ParsedRouteSheet,
} from "@/lib/route-sheet-parser";

type Step = "upload" | "preview" | "importing" | "done";

function errorText(e: unknown): string {
  if (!e) return "Неизвестная ошибка";
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  if (typeof e === "object") {
    const obj = e as { message?: unknown; error?: unknown };
    if (typeof obj.message === "string") return obj.message;
    if (typeof obj.error === "string") return obj.error;
    try {
      return JSON.stringify(e);
    } catch {
      return "Неизвестная ошибка";
    }
  }
  return String(e);
}

export function RouteSheetImportWizard({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedRouteSheet | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<{
    routeId: string;
    routeNumber: string;
    inserted: number;
    total: number;
    failedRows: Array<{ rowIndex: number; reason: string }>;
    headerMissing: string[];
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

  const reset = () => {
    setStep("upload");
    setFile(null);
    setParsed(null);
    setBusy(false);
    setErrorMsg(null);
    setResult(null);
  };

  const handleParse = async () => {
    if (!file) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const name = file.name.toLowerCase();
      if (!name.endsWith(".xlsx") && !name.endsWith(".xls")) {
        throw new Error(
          "Поддерживаются только Excel-файлы (.xlsx, .xls). PDF/CSV — в разработке.",
        );
      }
      const data = await parseRouteSheetXlsx(file);
      if (data.orders.length === 0) {
        throw new Error(
          "Не удалось распознать заказы в маршрутном листе. Проверьте формат файла.",
        );
      }
      setParsed(data);
      setStep("preview");
    } catch (e) {
      const msg = errorText(e);
      console.error("Route sheet parse error:", e);
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async () => {
    if (!parsed) return;
    setBusy(true);
    setStep("importing");
    setErrorMsg(null);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Сессия истекла. Войдите заново.");

      const res = await fetch("/api/import-route-sheet", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(parsed),
      });

      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        routeId?: string;
        routeNumber?: string;
        inserted?: number;
        total?: number;
        failedRows?: Array<{ rowIndex: number; reason: string }>;
        headerMissing?: string[];
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
      };

      if (!res.ok || !json.ok || !json.routeId) {
        throw new Error(json.error || `Ошибка сервера (${res.status})`);
      }

      setResult({
        routeId: json.routeId,
        routeNumber: json.routeNumber ?? "",
        inserted: json.inserted ?? 0,
        total: json.total ?? parsed.orders.length,
        failedRows: json.failedRows ?? [],
        headerMissing: json.headerMissing ?? [],
        rows: json.rows ?? [],
        clientsNeedingFill: json.clientsNeedingFill ?? [],
        needsReview: Boolean(json.needsReview),
      });
      setStep("done");
      if (json.needsReview) {
        toast.warning("Заявка создана, но требует заполнения данных");
      } else {
        toast.success("Заявка на транспорт создана");
      }
    } catch (e) {
      const msg = errorText(e);
      console.error("Route sheet import error:", e);
      setErrorMsg(msg);
      toast.error(msg);
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
            Загрузить маршрутный лист
          </DialogTitle>
          <DialogDescription>
            Excel из 1С — заявка на транспорт создастся автоматически
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="rs-file">Файл маршрутного листа</Label>
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
                Поддерживаются Excel-файлы из 1С (.xlsx, .xls)
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
            {errorMsg && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{errorMsg}</AlertDescription>
              </Alert>
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

            {errorMsg && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{errorMsg}</AlertDescription>
              </Alert>
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
              <Button onClick={handleParse} disabled={!file || busy} className="gap-2">
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
