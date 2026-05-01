import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FileSpreadsheet, Loader2, ChevronLeft, CheckCircle2, AlertTriangle } from "lucide-react";
import { parseFile, autoMap, TARGET_FIELDS, type ParsedTable, type TargetKey } from "@/lib/file-parser";
import { toast } from "sonner";

type Step = "upload" | "preview" | "mapping" | "done";

const NONE = "__none__";

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

export function RequestImportWizard({
  requestId,
  open,
  onOpenChange,
  startPointNumber,
}: {
  requestId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  startPointNumber: number;
}) {
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedTable | null>(null);
  const [mapping, setMapping] = useState<Record<TargetKey, string | null>>(
    {} as Record<TargetKey, string | null>,
  );
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ inserted: number; total: number; errors: string[] } | null>(null);

  const reset = () => {
    setStep("upload");
    setFile(null);
    setParsed(null);
    setMapping({} as Record<TargetKey, string | null>);
    setResult(null);
    setBusy(false);
  };

  const handleParse = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const p = await parseFile(file);
      if (p.rows.length === 0) {
        toast.error("Файл не содержит данных");
        setBusy(false);
        return;
      }
      setParsed(p);
      setMapping(autoMap(p.headers));
      setStep("preview");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка чтения файла");
    } finally {
      setBusy(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const { addUpload, updateUpload } = await import("@/lib/file-uploads-store");
      const rec = await addUpload(file);
      updateUpload(rec.id, { status: "needs_mapping" });
      toast.success("Файл сохранён в «Импорт данных», ожидает настройки");
      onOpenChange(false);
      reset();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось сохранить файл");
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async () => {
    if (!parsed) return;
    setBusy(true);
    setResult(null);
    const errors: string[] = [];
    let inserted = 0;
    let pointNum = startPointNumber;
    try {
      for (let i = 0; i < parsed.rows.length; i++) {
        const row = parsed.rows[i];
        const get = (key: TargetKey) => {
          const col = mapping[key];
          if (!col) return null;
          return row[col];
        };

        const orderNumber =
          str(get("order_number")) ?? `IMP-${Date.now().toString().slice(-6)}-${i + 1}`;

        const payload = {
          order_number: orderNumber,
          contact_name: str(get("contact_name")),
          contact_phone: str(get("contact_phone")),
          delivery_address: str(get("delivery_address")) ?? str(get("pickup_address")),
          total_weight_kg: num(get("total_weight_kg")),
          total_volume_m3: num(get("total_volume_m3")),
          goods_amount: num(get("goods_amount")),
          comment: str(get("comment")) ?? str(get("goods")),
          payment_type: "cash" as const,
          delivery_cost: 0,
          source: "import",
        };

        const { data: ord, error: ordErr } = await supabase
          .from("orders")
          .insert(payload as never)
          .select("id")
          .single();
        if (ordErr || !ord) {
          errors.push(`Строка ${i + 2}: ${ordErr?.message ?? "не удалось создать заказ"}`);
          continue;
        }

        const { error: rpErr } = await supabase.from("route_points").insert({
          route_id: requestId,
          order_id: (ord as { id: string }).id,
          point_number: pointNum,
        } as never);
        if (rpErr) {
          errors.push(`Строка ${i + 2}: ${rpErr.message}`);
          continue;
        }
        pointNum++;
        inserted++;
      }
      setResult({ inserted, total: parsed.rows.length, errors });
      qc.invalidateQueries({ queryKey: ["request-orders", requestId] });
      qc.invalidateQueries({ queryKey: ["transport-request", requestId] });
      qc.invalidateQueries({ queryKey: ["request-totals", requestId] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      setStep("done");
      if (errors.length === 0) toast.success(`Импортировано: ${inserted}`);
      else toast.warning(`Импортировано ${inserted} из ${parsed.rows.length}, ошибок: ${errors.length}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка импорта");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Импорт заказов в заявку
          </DialogTitle>
          <DialogDescription>
            Шаг {step === "upload" ? 1 : step === "preview" ? 2 : step === "mapping" ? 2 : 3} из 3 ·
            xlsx, xls, csv, txt, json
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4">
            <Label htmlFor="import-file">Файл</Label>
            <Input
              id="import-file"
              type="file"
              accept=".xlsx,.xls,.csv,.txt,.json"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file && (
              <div className="rounded-md border border-border bg-secondary/30 p-3 text-sm">
                <div className="font-medium">{file.name}</div>
                <div className="text-xs text-muted-foreground">
                  {(file.size / 1024).toFixed(1)} КБ ·{" "}
                  {file.name.split(".").pop()?.toUpperCase()}
                </div>
              </div>
            )}
          </div>
        )}

        {step === "preview" && parsed && (
          <div className="flex-1 overflow-hidden flex flex-col gap-3">
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                Распознано строк: <b>{parsed.rows.length}</b>, колонок:{" "}
                <b>{parsed.headers.length}</b>. Проверьте данные и сопоставьте колонки.
              </AlertDescription>
            </Alert>
            <div className="overflow-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    {parsed.headers.map((h, i) => (
                      <TableHead key={i} className="whitespace-nowrap">
                        {h}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsed.rows.slice(0, 10).map((r, idx) => (
                    <TableRow key={idx}>
                      {parsed.headers.map((h, i) => (
                        <TableCell key={i} className="whitespace-nowrap text-xs">
                          {String(r[h] ?? "")}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {parsed.rows.length > 10 && (
              <div className="text-xs text-muted-foreground">
                Показаны первые 10 строк из {parsed.rows.length}
              </div>
            )}
          </div>
        )}

        {step === "mapping" && parsed && (
          <div className="flex-1 overflow-auto space-y-3">
            <p className="text-sm text-muted-foreground">
              Сопоставьте колонки файла с полями заявки. Поля без сопоставления будут пропущены.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {TARGET_FIELDS.map((f) => (
                <div key={f.key} className="space-y-1">
                  <Label className="text-xs font-medium">{f.label}</Label>
                  <Select
                    value={mapping[f.key] ?? NONE}
                    onValueChange={(v) =>
                      setMapping((m) => ({ ...m, [f.key]: v === NONE ? null : v }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="— не использовать —" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>— не использовать —</SelectItem>
                      {parsed.headers.map((h) => (
                        <SelectItem key={h} value={h}>
                          {h}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === "done" && result && (
          <div className="space-y-3">
            <Alert
              variant={result.errors.length === 0 ? "default" : "destructive"}
              className={result.errors.length === 0 ? "rt-alert-success border-transparent" : ""}
            >
              {result.errors.length === 0 ? (
                <CheckCircle2 className="h-4 w-4 text-status-success" />
              ) : (
                <AlertTriangle className="h-4 w-4" />
              )}
              <AlertDescription>
                <div className="font-medium">
                  Импортировано {result.inserted} из {result.total}
                </div>
                {result.errors.length > 0 && (
                  <details className="mt-2 text-sm">
                    <summary className="cursor-pointer">Ошибок: {result.errors.length}</summary>
                    <ul className="mt-2 max-h-40 list-disc space-y-1 overflow-auto pl-5">
                      {result.errors.slice(0, 50).map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </AlertDescription>
            </Alert>
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
                Прочитать файл
              </Button>
            </>
          )}
          {step === "preview" && (
            <>
              <Button variant="ghost" onClick={() => setStep("upload")}>
                <ChevronLeft className="h-4 w-4" /> Назад
              </Button>
              <Button variant="outline" onClick={handleSaveDraft} disabled={busy}>
                Сохранить как черновик
              </Button>
              <Button onClick={() => setStep("mapping")}>Сопоставить колонки</Button>
            </>
          )}
          {step === "mapping" && (
            <>
              <Button variant="ghost" onClick={() => setStep("preview")}>
                <ChevronLeft className="h-4 w-4" /> Назад
              </Button>
              <Button onClick={handleImport} disabled={busy} className="gap-2">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Импортировать в заявку
              </Button>
            </>
          )}
          {step === "done" && (
            <Button
              onClick={() => {
                onOpenChange(false);
                reset();
              }}
            >
              Закрыть
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
