import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Download, FileSpreadsheet, Loader2, AlertTriangle, CheckCircle2, Info, Upload, History } from "lucide-react";
import { toast } from "sonner";
import {
  SCHEMAS,
  downloadTemplate,
  parseFile,
  importParsed,
  type ImportEntity,
  type ImportSource,
  type ParseResult,
  type ImportResult as DataImportResult,
  type DuplicateAction,
} from "@/lib/data-excel-import";

export const Route = createFileRoute("/data-import")({
  head: () => ({
    meta: [
      { title: "Импорт данных — Радиус Трек" },
      { name: "description", content: "Импорт заказов, товаров, остатков, маршрутов и заявок из Excel" },
    ],
  }),
  component: DataImportPage,
});

const ENTITIES: ImportEntity[] = ["orders", "products", "stock", "routes", "transport_requests"];

function DataImportPage() {
  const [entity, setEntity] = useState<ImportEntity>("orders");
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
              <FileSpreadsheet className="h-6 w-6 text-muted-foreground" />
              Импорт данных
            </h1>
            <p className="text-sm text-muted-foreground">
              Импорт Excel. Скачайте шаблон, заполните, проверьте предпросмотр и загрузите.
            </p>
          </div>
          <Button asChild variant="outline" className="gap-2">
            <Link to="/data-import/history">
              <History className="h-4 w-4" />
              История импорта
            </Link>
          </Button>
        </div>

        <Alert className="mb-6">
          <Info className="h-4 w-4" />
          <AlertDescription>
            Поддерживаются .xlsx и .xls. Источник данных сохраняется у каждой записи (manual / excel / 1c).
            Интеграция с 1С будет добавлена позже — структура импорта подготовлена заранее.
          </AlertDescription>
        </Alert>

        <Tabs value={entity} onValueChange={(v) => setEntity(v as ImportEntity)}>
          <TabsList className="flex h-auto flex-wrap justify-start gap-1">
            {ENTITIES.map((e) => (
              <TabsTrigger key={e} value={e}>
                {SCHEMAS[e].title}
              </TabsTrigger>
            ))}
          </TabsList>
          {ENTITIES.map((e) => (
            <TabsContent key={e} value={e} className="mt-4">
              <ImportPanel entity={e} />
            </TabsContent>
          ))}
        </Tabs>
      </main>
    </div>
  );
}

function ImportPanel({ entity }: { entity: ImportEntity }) {
  const schema = SCHEMAS[entity];
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState<ImportSource>("excel");
  const [duplicateAction, setDuplicateAction] = useState<DuplicateAction>("skip");
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<DataImportResult | null>(null);

  const previewRows = useMemo(() => parsed?.rows.slice(0, 10) ?? [], [parsed]);

  const handleFile = async (f: File | null) => {
    setFile(f);
    setParsed(null);
    setResult(null);
    if (!f) return;
    setParsing(true);
    try {
      const r = await parseFile(f, entity);
      setParsed(r);
      if (r.missingColumns.length > 0) {
        toast.error(`Не хватает обязательных колонок: ${r.missingColumns.join(", ")}`);
      } else if (r.totalRows === 0) {
        toast.warning("Файл пуст");
      } else {
        toast.success(`Строк: ${r.totalRows} · новых: ${r.newRows} · дублей: ${r.duplicateRows} · ошибок: ${r.invalidRows}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка чтения файла");
    } finally {
      setParsing(false);
    }
  };

  const handleImport = async () => {
    if (!parsed) return;
    if (parsed.missingColumns.length > 0) {
      toast.error("Сначала исправьте обязательные колонки");
      return;
    }
    if (parsed.validRows === 0) {
      toast.error("Нет валидных строк для импорта");
      return;
    }
    setImporting(true);
    setResult(null);
    try {
      const r = await importParsed(entity, parsed, source, { fileName: file?.name ?? null, duplicateAction });
      setResult(r);
      if (r.failed === 0) toast.success(`Загружено: ${r.inserted} · обновлено: ${r.updated} · пропущено: ${r.skipped}`);
      else toast.warning(`Загружено: ${r.inserted}, ошибок: ${r.failed}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка импорта");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{schema.title}</CardTitle>
          <CardDescription>{schema.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Button onClick={() => downloadTemplate(entity)} variant="outline" className="gap-2">
              <Download className="h-4 w-4" />
              Скачать шаблон Excel
            </Button>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`file-${entity}`}>Файл Excel</Label>
            <Input
              id={`file-${entity}`}
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <div className="space-y-2">
            <Label>Источник данных (source)</Label>
            <Select value={source} onValueChange={(v) => setSource(v as ImportSource)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">manual — ручной ввод</SelectItem>
                <SelectItem value="excel">excel — импорт из Excel</SelectItem>
                <SelectItem value="1c">1c — выгрузка из 1С</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handleImport}
              disabled={!parsed || importing || parsing || (parsed?.validRows ?? 0) === 0 || (parsed?.missingColumns.length ?? 0) > 0}
              className="gap-2"
            >
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Импортировать
            </Button>
            {parsing && (
              <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Чтение файла…
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Колонки шаблона</CardTitle>
          <CardDescription>Обязательные поля помечены значком.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Колонка</TableHead>
                <TableHead>Описание</TableHead>
                <TableHead className="w-24">Обяз.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {schema.columns.map((c) => (
                <TableRow key={c.key}>
                  <TableCell className="font-mono text-xs">{c.key}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{c.label}</TableCell>
                  <TableCell>
                    {c.required ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
                        <AlertTriangle className="h-3 w-3" /> Да
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {parsed && (
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Предпросмотр и проверка</CardTitle>
            <CardDescription>
              Найдено строк: {parsed.totalRows} · Готово к загрузке: {parsed.validRows} · С ошибками: {parsed.invalidRows}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {parsed.missingColumns.length > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Не хватает обязательных колонок: <b>{parsed.missingColumns.join(", ")}</b>
                </AlertDescription>
              </Alert>
            )}
            {file && (
              <div className="text-xs text-muted-foreground">
                Файл: <span className="font-mono">{file.name}</span>
              </div>
            )}
            <div className="overflow-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Стр.</TableHead>
                    <TableHead className="w-24">Статус</TableHead>
                    {schema.columns.map((c) => (
                      <TableHead key={c.key}>{c.label}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewRows.map((r) => (
                    <TableRow key={r.rowNumber}>
                      <TableCell className="font-mono text-xs">{r.rowNumber}</TableCell>
                      <TableCell>
                        {r.errors.length === 0 ? (
                          <Badge variant="secondary" className="gap-1">
                            <CheckCircle2 className="h-3 w-3" /> OK
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="gap-1" title={r.errors.join("; ")}>
                            <AlertTriangle className="h-3 w-3" /> Ошибка
                          </Badge>
                        )}
                      </TableCell>
                      {schema.columns.map((c) => (
                        <TableCell key={c.key} className="text-sm">
                          {r.data[c.key] == null ? <span className="text-muted-foreground">—</span> : String(r.data[c.key])}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {parsed.totalRows > previewRows.length && (
              <div className="text-xs text-muted-foreground">
                Показаны первые {previewRows.length} из {parsed.totalRows} строк.
              </div>
            )}
            {parsed.invalidRows > 0 && (
              <div className="rounded-md border border-border">
                <div className="border-b border-border bg-muted/40 px-3 py-2 text-sm font-medium">
                  Строки с ошибками ({parsed.invalidRows})
                </div>
                <ul className="max-h-48 space-y-1 overflow-auto p-3 text-sm">
                  {parsed.rows.filter((r) => r.errors.length > 0).map((r) => (
                    <li key={r.rowNumber} className="flex gap-2">
                      <span className="font-mono text-xs text-muted-foreground">стр. {r.rowNumber}</span>
                      <span>{r.errors.join("; ")}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {result && (
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              {result.failed === 0 ? (
                <CheckCircle2 className="h-5 w-5 text-status-success" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-amber-500" />
              )}
              Результат импорта
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <div className="rounded-md border border-border p-3">
                <div className="text-xs text-muted-foreground">Загружено строк</div>
                <div className="text-xl font-semibold">{result.inserted}</div>
              </div>
              <div className="rounded-md border border-border p-3">
                <div className="text-xs text-muted-foreground">Ошибок</div>
                <div className="text-xl font-semibold">{result.failed}</div>
              </div>
              <div className="rounded-md border border-border p-3">
                <div className="text-xs text-muted-foreground">Источник</div>
                <div className="text-xl font-semibold">{source}</div>
              </div>
            </div>
            {result.failedRows.length > 0 && (
              <div className="rounded-md border border-border">
                <div className="border-b border-border bg-muted/40 px-3 py-2 text-sm font-medium">
                  Не загружены строки
                </div>
                <ul className="max-h-64 space-y-1 overflow-auto p-3 text-sm">
                  {result.failedRows.map((e: { row: number; message: string }, i: number) => (
                    <li key={i} className="flex gap-2">
                      <span className="font-mono text-xs text-muted-foreground">стр. {e.row}</span>
                      <span>{e.message}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
