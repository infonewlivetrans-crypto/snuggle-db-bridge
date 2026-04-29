import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ArrowLeft, History, Loader2, RefreshCw, RotateCcw, Download } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SCHEMAS, importParsed, type ImportEntity, type ImportSource, type ParsedRow } from "@/lib/data-excel-import";

export const Route = createFileRoute("/data-import/history")({
  head: () => ({
    meta: [
      { title: "История импорта — Радиус Трек" },
      { name: "description", content: "Журнал импорта Excel: статусы, ошибки, повтор загрузки" },
    ],
  }),
  component: HistoryPage,
});

type LogStatus = "loaded" | "partial" | "error" | "cancelled";

interface ImportLog {
  id: string;
  entity: ImportEntity;
  file_name: string | null;
  source: string;
  imported_by: string | null;
  total_rows: number;
  inserted_rows: number;
  failed_rows: number;
  status: LogStatus;
  created_at: string;
}

interface ImportLogRow {
  id: string;
  import_log_id: string;
  row_number: number;
  status: "inserted" | "failed";
  error_message: string | null;
  raw_data: Record<string, unknown>;
  created_at: string;
}

const STATUS_LABEL: Record<LogStatus, string> = {
  loaded: "Загружен",
  partial: "Частично загружен",
  error: "Ошибка",
  cancelled: "Отменён",
};

function statusBadge(s: LogStatus) {
  if (s === "loaded") return <Badge variant="secondary">{STATUS_LABEL[s]}</Badge>;
  if (s === "partial") return <Badge className="bg-amber-500 text-white hover:bg-amber-500">{STATUS_LABEL[s]}</Badge>;
  if (s === "error") return <Badge variant="destructive">{STATUS_LABEL[s]}</Badge>;
  return <Badge variant="outline">{STATUS_LABEL[s]}</Badge>;
}

function entityLabel(e: string): string {
  return (SCHEMAS as Record<string, { title: string }>)[e]?.title ?? e;
}

function HistoryPage() {
  const [logs, setLogs] = useState<ImportLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [openLog, setOpenLog] = useState<ImportLog | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("import_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) toast.error(error.message);
    setLogs((data ?? []) as ImportLog[]);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
              <History className="h-6 w-6 text-muted-foreground" />
              История импорта
            </h1>
            <p className="text-sm text-muted-foreground">
              Журнал всех импортов Excel: дата, тип, файл, статус и ошибки.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void load()} disabled={loading} className="gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Обновить
            </Button>
            <Button asChild variant="outline" className="gap-2">
              <Link to="/data-import">
                <ArrowLeft className="h-4 w-4" />
                К импорту
              </Link>
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Импорты ({logs.length})</CardTitle>
            <CardDescription>Кликните по строке, чтобы посмотреть детали.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Дата и время</TableHead>
                    <TableHead>Тип</TableHead>
                    <TableHead>Файл</TableHead>
                    <TableHead>Кто загрузил</TableHead>
                    <TableHead className="text-right">Всего</TableHead>
                    <TableHead className="text-right">Успех</TableHead>
                    <TableHead className="text-right">Ошибок</TableHead>
                    <TableHead>Статус</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                        {loading ? "Загрузка…" : "Импортов пока нет"}
                      </TableCell>
                    </TableRow>
                  )}
                  {logs.map((l) => (
                    <TableRow key={l.id} className="cursor-pointer" onClick={() => setOpenLog(l)}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {new Date(l.created_at).toLocaleString("ru-RU")}
                      </TableCell>
                      <TableCell className="text-sm">{entityLabel(l.entity)}</TableCell>
                      <TableCell className="font-mono text-xs">{l.file_name ?? "—"}</TableCell>
                      <TableCell className="text-sm">{l.imported_by ?? "—"}</TableCell>
                      <TableCell className="text-right">{l.total_rows}</TableCell>
                      <TableCell className="text-right text-status-success">{l.inserted_rows}</TableCell>
                      <TableCell className="text-right text-destructive">{l.failed_rows}</TableCell>
                      <TableCell>{statusBadge(l.status)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </main>

      <LogDetailDialog log={openLog} onClose={() => setOpenLog(null)} onChanged={load} />
    </div>
  );
}

function LogDetailDialog({
  log,
  onClose,
  onChanged,
}: {
  log: ImportLog | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [rows, setRows] = useState<ImportLogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (!log) { setRows([]); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("import_log_rows")
        .select("*")
        .eq("import_log_id", log.id)
        .order("row_number", { ascending: true });
      if (error) toast.error(error.message);
      if (!cancelled) setRows((data ?? []) as ImportLogRow[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [log]);

  const failedRows = useMemo(() => rows.filter((r) => r.status === "failed"), [rows]);
  const okRows = useMemo(() => rows.filter((r) => r.status === "inserted"), [rows]);

  const retryFailed = async () => {
    if (!log || failedRows.length === 0) return;
    setRetrying(true);
    try {
      const parsedLike = {
        rows: failedRows.map<ParsedRow>((r) => ({
          rowNumber: r.row_number,
          data: r.raw_data ?? {},
          errors: [],
        })),
        missingColumns: [],
        totalRows: failedRows.length,
        validRows: failedRows.length,
        invalidRows: 0,
      };
      const r = await importParsed(
        log.entity,
        parsedLike,
        (log.source as ImportSource) ?? "excel",
        { fileName: log.file_name ? `${log.file_name} (повтор ошибок)` : "повтор ошибок" },
      );
      if (r.failed === 0) toast.success(`Успешно повторно загружено: ${r.inserted}`);
      else toast.warning(`Повтор: загружено ${r.inserted}, ошибок ${r.failed}`);
      onChanged();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка повтора");
    } finally {
      setRetrying(false);
    }
  };

  const cancelLog = async () => {
    if (!log) return;
    const { error } = await supabase
      .from("import_logs")
      .update({ status: "cancelled" })
      .eq("id", log.id);
    if (error) toast.error(error.message);
    else { toast.success("Импорт отмечен как отменён"); onChanged(); onClose(); }
  };

  return (
    <Dialog open={!!log} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-auto">
        {log && (
          <>
            <DialogHeader>
              <DialogTitle>
                Импорт {entityLabel(log.entity)} от {new Date(log.created_at).toLocaleString("ru-RU")}
              </DialogTitle>
              <DialogDescription>
                Файл: <span className="font-mono">{log.file_name ?? "—"}</span> · Источник: {log.source} · Статус: {STATUS_LABEL[log.status]}
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat title="Всего строк" value={log.total_rows} />
              <Stat title="Успешно" value={log.inserted_rows} accent="text-status-success" />
              <Stat title="Ошибок" value={log.failed_rows} accent="text-destructive" />
              <Stat title="Статус" value={STATUS_LABEL[log.status]} />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void retryFailed()} disabled={failedRows.length === 0 || retrying} className="gap-2">
                {retrying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                Повторить импорт ошибок ({failedRows.length})
              </Button>
              {log.status !== "cancelled" && (
                <Button variant="outline" onClick={() => void cancelLog()}>Отметить как отменён</Button>
              )}
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => exportRowsCsv(log, rows)}
                disabled={rows.length === 0}
              >
                <Download className="h-4 w-4" /> Скачать CSV
              </Button>
            </div>

            {loading ? (
              <div className="py-10 text-center text-sm text-muted-foreground">Загрузка строк…</div>
            ) : (
              <>
                <Section title={`Строки с ошибками (${failedRows.length})`}>
                  <RowsTable rows={failedRows} entity={log.entity} showError />
                </Section>
                <Section title={`Успешно загружено (${okRows.length})`}>
                  <RowsTable rows={okRows} entity={log.entity} />
                </Section>
              </>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stat({ title, value, accent }: { title: string; value: number | string; accent?: string }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-xs text-muted-foreground">{title}</div>
      <div className={`text-lg font-semibold ${accent ?? ""}`}>{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">{title}</div>
      {children}
    </div>
  );
}

function RowsTable({ rows, entity, showError }: { rows: ImportLogRow[]; entity: ImportEntity; showError?: boolean }) {
  const cols = SCHEMAS[entity].columns;
  if (rows.length === 0) {
    return <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">Нет строк</div>;
  }
  return (
    <div className="overflow-auto rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">Стр.</TableHead>
            {showError && <TableHead className="w-64">Ошибка</TableHead>}
            {cols.map((c) => <TableHead key={c.key}>{c.key}</TableHead>)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="font-mono text-xs">{r.row_number}</TableCell>
              {showError && (
                <TableCell className="text-xs text-destructive">{r.error_message ?? "—"}</TableCell>
              )}
              {cols.map((c) => (
                <TableCell key={c.key} className="text-xs">
                  {((): string => {
                    const v = (r.raw_data ?? {})[c.key];
                    if (v == null) return "—";
                    return String(v);
                  })()}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function exportRowsCsv(log: ImportLog, rows: ImportLogRow[]) {
  const cols = SCHEMAS[log.entity].columns;
  const headers = ["row_number", "status", "error_message", ...cols.map(c => c.key)];
  const lines = [headers.join(",")];
  for (const r of rows) {
    const vals = [
      String(r.row_number),
      r.status,
      JSON.stringify(r.error_message ?? ""),
      ...cols.map((c) => JSON.stringify((r.raw_data ?? {})[c.key] ?? "")),
    ];
    lines.push(vals.join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `import_${log.entity}_${log.id}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
