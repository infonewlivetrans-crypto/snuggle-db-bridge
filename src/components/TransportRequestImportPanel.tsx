import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { authHeaders } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  FileSpreadsheet,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ChevronLeft,
} from "lucide-react";
import { toast } from "sonner";
import {
  parseTransportRequestXlsx,
  type ParsedTransportRequest,
} from "@/lib/transport-request-parser";
import {
  parseOrderItemsFile,
  parseOrderItemsText,
  type OrderItemsParseResult,
} from "@/lib/order-items-parser";

type Step = "upload" | "preview" | "importing" | "done";

type ImportResponse = {
  ok: boolean;
  routeId: string;
  routeNumber: string;
  ordersCreated: number;
  pointsCreated: number;
  itemsCreated: number;
  itemsUnmatched: number;
  ordersWithoutItems: string[];
  summary: {
    requestNumber: string | null;
    requestDate: string | null;
    loadingDate: string | null;
    loadingTime: string | null;
    loadingAddress: string | null;
    unloadingAddress: string | null;
    unloadingGeo: { lat: number; lng: number; formatted_address: string | null } | null;
    cargo: string | null;
    weightKg: number | null;
    volumeM3: number | null;
    placesCount: number | null;
    orderNumbers: string[];
  };
  warnings: string[];
  unrecognized: string[];
};

/**
 * Импорт одиночного файла «Заявка на транспорт» (xlsx) — создаёт черновик
 * routes (source='transport_request'). См. /api/import-transport-request.
 */
export function TransportRequestImportPanel({
  onClose,
}: {
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedTransportRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [itemsText, setItemsText] = useState("");
  const [itemsParsed, setItemsParsed] =
    useState<OrderItemsParseResult | null>(null);

  const reset = () => {
    setStep("upload");
    setFile(null);
    setParsed(null);
    setBusy(false);
    setError(null);
    setResult(null);
    setItemsText("");
    setItemsParsed(null);
  };

  const handleParse = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const name = file.name.toLowerCase();
      if (!name.endsWith(".xlsx") && !name.endsWith(".xls")) {
        throw new Error("Поддерживаются только Excel-файлы (.xlsx, .xls).");
      }
      const data = await parseTransportRequestXlsx(file);
      setParsed(data);
      setStep("preview");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Не удалось распознать файл";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async () => {
    if (!parsed) return;
    setBusy(true);
    setStep("importing");
    setError(null);
    try {
      const res = await fetch("/api/import-transport-request", {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          ...parsed,
          itemsByOrderNumber: itemsParsed?.byOrderNumber ?? {},
        }),
      });
      const text = await res.text();
      let json: Partial<ImportResponse> & {
        error?: string;
        code?: string;
        routeNumber?: string;
        routeId?: string;
      } = {};
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        /* keep empty */
      }
      if (res.status === 409 && json.code === "transport_request_already_imported") {
        const msg = `Заявка на транспорт №${json.routeNumber ?? parsed.requestNumber ?? ""} уже импортирована`;
        setError(msg);
        toast.info(msg);
        setStep("preview");
        setBusy(false);
        return;
      }
      if (!res.ok || !json.ok || !json.routeId) {
        const msg = json.error ?? `Не удалось создать заявку (${res.status})`;
        setError(msg);
        toast.error(msg);
        setStep("preview");
        setBusy(false);
        return;
      }
      setResult(json as ImportResponse);
      setStep("done");
      qc.invalidateQueries({ queryKey: ["logist-routes"] });
      qc.invalidateQueries({ queryKey: ["transport-requests"] });
      toast.success("Заявка на транспорт создана");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Ошибка сети";
      setError(msg);
      toast.error(msg);
      setStep("preview");
    } finally {
      setBusy(false);
    }
  };

  const goToRequest = () => {
    if (!result) return;
    onClose();
    reset();
    navigate({
      to: "/transport-requests/$requestId",
      params: { requestId: result.routeId },
    });
  };

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-auto">
      {step === "upload" && (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="tr-file">Файл «Заявка на транспорт»</Label>
            <Input
              id="tr-file"
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setError(null);
              }}
            />
            <p className="text-xs text-muted-foreground">
              Например: «Заявка на транспорт № 000003855.xlsx». Это отдельный
              документ — не маршрутный лист и не товарный состав.
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
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-xs">{error}</AlertDescription>
            </Alert>
          )}
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Отмена
            </Button>
            <Button onClick={handleParse} disabled={!file || busy} className="gap-2">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Распознать
            </Button>
          </div>
        </div>
      )}

      {step === "preview" && parsed && (
        <div className="space-y-3">
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>
              Распознана заявка
              {parsed.requestNumber ? <> №<b>{parsed.requestNumber}</b></> : null}
              {parsed.warnings.length > 0 && (
                <> · замечаний: <b className="text-amber-600">{parsed.warnings.length}</b></>
              )}
            </AlertDescription>
          </Alert>

          <div className="grid gap-2 sm:grid-cols-2 text-sm">
            <Field label="Номер заявки" value={parsed.requestNumber} />
            <Field label="Дата заявки" value={parsed.requestDate} />
            <Field label="Дата погрузки" value={parsed.loadingDate} />
            <Field label="Время погрузки" value={parsed.loadingTime} />
            <Field label="Адрес погрузки" value={parsed.loadingAddress} wide />
            <Field label="Адрес выгрузки" value={parsed.unloadingAddress} wide />
            <Field label="Грузоотправитель" value={parsed.shipper} />
            <Field label="Грузополучатель" value={parsed.consignee} />
            <Field label="Контактное лицо" value={parsed.contactPerson} />
            <Field label="Телефон" value={parsed.contactPhone} />
            <Field label="Груз" value={parsed.cargoDescription} wide />
            <Field label="Вес, кг" value={parsed.weightKg?.toString() ?? null} />
            <Field label="Объём, м³" value={parsed.volumeM3?.toString() ?? null} />
            <Field label="Мест" value={parsed.placesCount?.toString() ?? null} />
            <Field label="Перевозчик" value={parsed.carrier} />
            <Field label="Водитель" value={parsed.driverName} />
            <Field label="Тел. водителя" value={parsed.driverPhone} />
            <Field label="Авто" value={parsed.vehiclePlate} />
            <Field label="Требования к ТС" value={parsed.vehicleRequirements} wide />
            <Field label="Организация" value={parsed.organization} />
          </div>

          {parsed.orderNumbers.length > 0 && (
            <div className="rounded-md border bg-muted/30 p-2 text-xs">
              <div className="font-medium mb-1">Найдены номера заказов:</div>
              <div className="flex flex-wrap gap-1">
                {parsed.orderNumbers.map((n) => (
                  <Badge key={n} variant="outline" className="font-mono">
                    {n}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {parsed.warnings.length > 0 && (
            <Alert className="border-amber-500/40">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription>
                <div className="font-medium">Замечания парсера</div>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-xs">
                  {parsed.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {/* Товарный состав (опционально) — текст или Excel/CSV */}
          <div className="rounded-md border bg-card p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">Товарный состав (опционально)</div>
              {itemsParsed && (
                <div className="text-xs text-muted-foreground">
                  Распознано <b>{itemsParsed.totals.items}</b> строк по{" "}
                  <b>{itemsParsed.totals.orders}</b> заказам
                </div>
              )}
            </div>
            <Textarea
              placeholder="Вставьте текст из 1С (блоки «Заказ покупателя КП_… от …»)"
              value={itemsText}
              onChange={(e) => setItemsText(e.target.value)}
              className="min-h-[80px] text-xs font-mono"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (!itemsText.trim()) return;
                  try {
                    setItemsParsed(parseOrderItemsText(itemsText));
                  } catch (e) {
                    toast.error(
                      e instanceof Error ? e.message : "Не удалось разобрать товары",
                    );
                  }
                }}
                disabled={!itemsText.trim()}
              >
                Распознать текст
              </Button>
              <Label className="text-xs text-muted-foreground">или файл:</Label>
              <Input
                type="file"
                accept=".xlsx,.xls,.csv,.txt"
                className="h-8 text-xs file:mr-2 file:rounded file:border-0 file:bg-secondary file:px-2 file:py-1"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  try {
                    setItemsParsed(await parseOrderItemsFile(f));
                  } catch (err) {
                    toast.error(
                      err instanceof Error ? err.message : "Файл не распознан",
                    );
                  }
                }}
              />
              {itemsParsed && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setItemsParsed(null);
                    setItemsText("");
                  }}
                >
                  Очистить
                </Button>
              )}
            </div>
            {itemsParsed && itemsParsed.totals.orders > 0 && (
              <div className="text-xs text-muted-foreground">
                Заказы:{" "}
                {Object.entries(itemsParsed.byOrderNumber)
                  .map(([k, v]) => `${k} (${v.length})`)
                  .join(", ")}
              </div>
            )}
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-xs">{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setStep("upload")} disabled={busy}>
              <ChevronLeft className="h-4 w-4" /> Назад
            </Button>
            <Button onClick={handleImport} disabled={busy} className="gap-2">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Создать заявку
            </Button>
          </div>
        </div>
      )}

      {step === "importing" && (
        <div className="flex flex-col items-center justify-center gap-3 py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Создаём заявку…</p>
        </div>
      )}

      {step === "done" && result && (
        <div className="space-y-3">
          <Alert className="border-status-success/40">
            <CheckCircle2 className="h-4 w-4 text-status-success" />
            <AlertDescription>
              <div className="font-medium">
                Заявка №{result.routeNumber} создана как черновик
              </div>
              <div className="text-sm text-muted-foreground">
                Назначьте перевозчика/водителя/авто в карточке заявки.
              </div>
            </AlertDescription>
          </Alert>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 text-center text-sm">
            <Stat label="Заказов" value={result.ordersCreated} />
            <Stat label="Точек" value={result.pointsCreated} />
            <Stat label="Товаров" value={result.itemsCreated} />
            <Stat
              label="Без коорд."
              value={result.summary.unloadingGeo ? 0 : result.pointsCreated}
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-2 text-sm">
            <Field label="Дата погрузки" value={result.summary.loadingDate} />
            <Field label="Время погрузки" value={result.summary.loadingTime} />
            <Field label="Адрес погрузки" value={result.summary.loadingAddress} wide />
            <Field label="Адрес выгрузки" value={result.summary.unloadingAddress} wide />
            <Field label="Груз" value={result.summary.cargo} wide />
            <Field label="Вес, кг" value={result.summary.weightKg?.toString() ?? null} />
            <Field label="Объём, м³" value={result.summary.volumeM3?.toString() ?? null} />
            <Field label="Мест" value={result.summary.placesCount?.toString() ?? null} />
            {result.summary.unloadingGeo && (
              <Field
                label="Координаты выгрузки"
                value={`${result.summary.unloadingGeo.lat.toFixed(5)}, ${result.summary.unloadingGeo.lng.toFixed(5)}`}
                wide
              />
            )}
          </div>

          {result.summary.orderNumbers.length > 0 && (
            <div className="rounded-md border bg-muted/30 p-2 text-xs">
              <div className="font-medium mb-1">Заказы из файла:</div>
              <div className="flex flex-wrap gap-1">
                {result.summary.orderNumbers.map((n) => (
                  <Badge key={n} variant="outline" className="font-mono">
                    {n}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {result.unrecognized.length > 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription>
                <div className="font-medium">Не распознано в файле</div>
                <div className="text-xs text-muted-foreground">
                  {result.unrecognized.join(", ")}
                </div>
              </AlertDescription>
            </Alert>
          )}

          {result.warnings.length > 0 && (
            <Alert className="border-amber-500/40">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription>
                <div className="font-medium">Предупреждения ({result.warnings.length})</div>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-xs">
                  {result.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => { reset(); }}>
              <FileSpreadsheet className="h-4 w-4" /> Загрузить ещё одну
            </Button>
            <Button variant="outline" onClick={() => { onClose(); reset(); }}>
              Закрыть
            </Button>
            <Button onClick={goToRequest}>Перейти в заявку</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: string | null;
  wide?: boolean;
}) {
  return (
    <div className={`rounded-md border bg-card p-2 ${wide ? "sm:col-span-2" : ""}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium break-words">{value || "—"}</div>
    </div>
  );
}
