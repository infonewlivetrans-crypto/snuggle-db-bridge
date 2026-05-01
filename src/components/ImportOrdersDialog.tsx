import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FileSpreadsheet, Download, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import {
  importOrdersFromFile,
  downloadOrdersTemplate,
  type ImportResult,
} from "@/lib/excel-import";
import { toast } from "sonner";

export function ImportOrdersDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const reset = () => {
    setFile(null);
    setResult(null);
  };

  const handleImport = async () => {
    if (!file) return;
    setBusy(true);
    setResult(null);
    try {
      const r = await importOrdersFromFile(file);
      setResult(r);
      qc.invalidateQueries({ queryKey: ["orders"] });
      if (r.errors.length === 0) {
        toast.success(`Импортировано заказов: ${r.inserted}`);
      } else {
        toast.warning(`Импортировано ${r.inserted} из ${r.total}, ошибок: ${r.errors.length}`);
      }
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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Импорт заказов из Excel
          </DialogTitle>
          <DialogDescription>
            Загрузите .xlsx с колонками: номер, клиент, телефон, адрес, координаты, товар, вес,
            объём, сумма, тип оплаты.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => { void downloadOrdersTemplate(); }}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            Скачать шаблон
          </Button>

          <div className="space-y-2">
            <Label htmlFor="excel-file">Файл Excel</Label>
            <Input
              id="excel-file"
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setResult(null);
              }}
            />
          </div>

          {result && (
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
                  Загружено {result.inserted} из {result.total} строк
                </div>
                {result.errors.length > 0 && (
                  <details className="mt-2 text-sm">
                    <summary className="cursor-pointer">
                      Ошибок: {result.errors.length}
                    </summary>
                    <ul className="mt-2 max-h-40 list-disc space-y-1 overflow-auto pl-5">
                      {result.errors.slice(0, 50).map((e, i) => (
                        <li key={i}>
                          Строка {e.row}: {e.message}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Закрыть
          </Button>
          <Button onClick={handleImport} disabled={!file || busy} className="gap-2">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
            Импортировать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
