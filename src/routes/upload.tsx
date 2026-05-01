import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import {
  Upload, FileText, FileSpreadsheet, FileJson, FileType2, File as FileIcon,
  Trash2, Eye, Settings2, CheckCircle2, AlertTriangle, Clock, Inbox,
} from "lucide-react";
import {
  addUpload, listUploads, removeUpload, updateUpload,
  buildPreview, importWithMapping, listDemoOrders,
  FORMAT_LABEL, STATUS_LABEL, formatBytes, TARGET_FIELDS,
  type UploadRecord, type FilePreview, type ColumnMapping, type SupportedFormat,
} from "@/lib/file-uploads-store";

export const Route = createFileRoute("/upload")({
  head: () => ({
    meta: [
      { title: "Импорт данных — загрузка файлов" },
      { name: "description", content: "Универсальная загрузка файлов: Excel, CSV, JSON, TXT, PDF" },
    ],
  }),
  component: UploadPage,
});

const FORMAT_ICON: Record<SupportedFormat, React.ComponentType<{ className?: string }>> = {
  xlsx: FileSpreadsheet,
  xls: FileSpreadsheet,
  csv: FileSpreadsheet,
  json: FileJson,
  txt: FileType2,
  pdf: FileText,
  unknown: FileIcon,
};

const STATUS_VARIANT: Record<UploadRecord["status"], "default" | "secondary" | "destructive" | "outline"> = {
  uploaded: "secondary",
  needs_mapping: "outline",
  processed: "default",
  error: "destructive",
};

const STATUS_ICON: Record<UploadRecord["status"], React.ComponentType<{ className?: string }>> = {
  uploaded: Inbox,
  needs_mapping: Clock,
  processed: CheckCircle2,
  error: AlertTriangle,
};

function UploadPage() {
  const [items, setItems] = useState<UploadRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<UploadRecord | null>(null);
  const [preview, setPreview] = useState<FilePreview | null>(null);
  const [mappingMode, setMappingMode] = useState(false);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [demoCount, setDemoCount] = useState(0);

  useEffect(() => {
    setItems(listUploads());
    setDemoCount(listDemoOrders().length);
  }, []);

  const refreshList = () => {
    setItems(listUploads());
    setDemoCount(listDemoOrders().length);
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      for (const f of Array.from(files)) {
        await addUpload(f);
      }
      refreshList();
      toast.success(`Загружено файлов: ${files.length}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось загрузить файл");
    } finally {
      setBusy(false);
    }
  };

  const openPreview = async (rec: UploadRecord) => {
    setSelected(rec);
    setMappingMode(false);
    setMapping(rec.mapping ?? {});
    setPreview(null);
    try {
      const p = await buildPreview(rec);
      setPreview(p);
    } catch (e) {
      setPreview({ kind: "card", message: e instanceof Error ? e.message : "Ошибка предпросмотра" });
    }
  };

  const handleDelete = async (rec: UploadRecord) => {
    if (!confirm(`Удалить файл «${rec.name}»?`)) return;
    await removeUpload(rec.id);
    if (selected?.id === rec.id) {
      setSelected(null);
      setPreview(null);
    }
    refreshList();
  };

  const startMapping = () => {
    if (!selected) return;
    if (!preview || preview.kind !== "table") {
      toast.error("Сопоставление колонок доступно только для табличных файлов.");
      return;
    }
    setMappingMode(true);
    // Авто-предложения
    if (Object.keys(mapping).length === 0) {
      const suggest: ColumnMapping = {};
      const lower = preview.headers.map((h) => h.toLowerCase());
      const findCol = (...keys: string[]) => {
        const i = lower.findIndex((h) => keys.some((k) => h.includes(k)));
        return i >= 0 ? preview.headers[i] : "";
      };
      suggest.client = findCol("клиент", "заказчик", "client", "customer");
      suggest.route = findCol("маршрут", "route");
      suggest.pickup_address = findCol("загруз", "адрес погр", "pickup", "from");
      suggest.delivery_address = findCol("выгруз", "доставк", "адрес дост", "delivery", "to");
      suggest.cargo = findCol("груз", "товар", "cargo");
      suggest.weight = findCol("вес", "weight", "тонн");
      suggest.rate = findCol("ставк", "цена", "стоим", "rate", "price");
      suggest.pickup_date = findCol("дата загр", "погруз", "pickup_date");
      suggest.delivery_date = findCol("дата дост", "deliv");
      suggest.contact = findCol("контакт", "телефон", "phone", "contact");
      setMapping(suggest);
    }
  };

  const runImport = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const r = await importWithMapping(selected, mapping);
      toast.success(`Создано демо-записей: ${r.imported}`);
      setMappingMode(false);
      refreshList();
      const updated = listUploads().find((u) => u.id === selected.id);
      if (updated) setSelected(updated);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка импорта");
      if (selected) {
        updateUpload(selected.id, { status: "error", errorMessage: e instanceof Error ? e.message : "Ошибка" });
        refreshList();
      }
    } finally {
      setBusy(false);
    }
  };

  const tableHeaders = useMemo(
    () => (preview && preview.kind === "table" ? preview.headers : []),
    [preview],
  );

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="container mx-auto px-4 py-6 space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold">Импорт данных</h1>
            <p className="text-muted-foreground text-sm">
              Загрузите файл любого формата. Excel, CSV и JSON можно сопоставить с полями системы и создать демо-заказы.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">Демо-записей: {demoCount}</Badge>
            <Label htmlFor="file-input" className="cursor-pointer">
              <input
                id="file-input"
                type="file"
                multiple
                className="hidden"
                accept=".xlsx,.xls,.csv,.txt,.json,.pdf"
                onChange={(e) => {
                  void handleFiles(e.target.files);
                  e.target.value = "";
                }}
                disabled={busy}
              />
              <Button asChild disabled={busy}>
                <span><Upload className="mr-2 h-4 w-4" /> Загрузить файл</span>
              </Button>
            </Label>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Загруженные файлы</CardTitle>
            <CardDescription>
              Поддерживаются Excel (.xlsx, .xls), CSV, TXT, JSON и PDF (как хранение).
            </CardDescription>
          </CardHeader>
          <CardContent>
            {items.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Inbox className="mx-auto h-10 w-10 mb-2 opacity-50" />
                Пока нет загруженных файлов.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Файл</TableHead>
                      <TableHead>Формат</TableHead>
                      <TableHead>Размер</TableHead>
                      <TableHead>Загружен</TableHead>
                      <TableHead>Статус</TableHead>
                      <TableHead className="text-right">Действия</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((it) => {
                      const Icon = FORMAT_ICON[it.format];
                      const SIcon = STATUS_ICON[it.status];
                      return (
                        <TableRow key={it.id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <Icon className="h-4 w-4 text-muted-foreground" />
                              <span className="truncate max-w-[260px]">{it.name}</span>
                            </div>
                          </TableCell>
                          <TableCell>{FORMAT_LABEL[it.format]}</TableCell>
                          <TableCell>{formatBytes(it.size)}</TableCell>
                          <TableCell>{new Date(it.uploadedAt).toLocaleString("ru-RU")}</TableCell>
                          <TableCell>
                            <Badge variant={STATUS_VARIANT[it.status]} className="gap-1">
                              <SIcon className="h-3 w-3" />
                              {STATUS_LABEL[it.status]}
                              {it.status === "processed" && it.rowsImported != null && ` · ${it.rowsImported}`}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm" onClick={() => openPreview(it)}>
                              <Eye className="h-4 w-4 mr-1" /> Открыть
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleDelete(it)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {selected && (
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <CardTitle>Предпросмотр: {selected.name}</CardTitle>
                  <CardDescription>
                    {FORMAT_LABEL[selected.format]} · {formatBytes(selected.size)} ·{" "}
                    {STATUS_LABEL[selected.status]}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  {preview?.kind === "table" && !mappingMode && (
                    <Button onClick={startMapping}>
                      <Settings2 className="mr-2 h-4 w-4" /> Сопоставить колонки
                    </Button>
                  )}
                  {mappingMode && (
                    <>
                      <Button variant="outline" onClick={() => setMappingMode(false)}>Отмена</Button>
                      <Button onClick={runImport} disabled={busy}>Импортировать</Button>
                    </>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {!preview ? (
                <div className="text-muted-foreground">Загружаем предпросмотр…</div>
              ) : preview.kind === "card" ? (
                <Alert>
                  <FileIcon className="h-4 w-4" />
                  <AlertDescription>{preview.message}</AlertDescription>
                </Alert>
              ) : preview.kind === "text" ? (
                <pre className="bg-muted rounded-md p-3 text-xs overflow-auto max-h-96 whitespace-pre-wrap">
                  {preview.content}
                </pre>
              ) : (
                <>
                  {!mappingMode ? (
                    <div className="overflow-x-auto">
                      <div className="text-xs text-muted-foreground mb-2">
                        Показано {preview.rows.length} из {preview.totalRows} строк
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            {preview.headers.map((h, i) => (
                              <TableHead key={i}>{h || `Колонка ${i + 1}`}</TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {preview.rows.map((r, ri) => (
                            <TableRow key={ri}>
                              {r.map((c, ci) => (
                                <TableCell key={ci} className="text-sm">{c}</TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <Alert>
                        <Settings2 className="h-4 w-4" />
                        <AlertDescription>
                          Укажите, какая колонка из файла соответствует каждому полю системы. Поля можно оставить пустыми.
                        </AlertDescription>
                      </Alert>
                      <div className="grid sm:grid-cols-2 gap-3">
                        {TARGET_FIELDS.map((f) => (
                          <div key={f.key} className="space-y-1">
                            <Label className="text-xs">{f.label}</Label>
                            <Select
                              value={mapping[f.key] ?? "__none__"}
                              onValueChange={(v) =>
                                setMapping((m) => ({ ...m, [f.key]: v === "__none__" ? "" : v }))
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="— не использовать —" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">— не использовать —</SelectItem>
                                {tableHeaders.map((h, i) => (
                                  <SelectItem key={i} value={h}>{h || `Колонка ${i + 1}`}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
