import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Database, Download, Loader2, RefreshCw, RotateCcw } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth/auth-context";
import { createBackupFn, getBackupUrlFn, listBackupsFn, restoreBackupFn } from "@/server/backups.functions";

export const Route = createFileRoute("/backups")({
  head: () => ({ meta: [{ title: "Резервные копии — Радиус Трек" }] }),
  component: BackupsPage,
});

function formatSize(bytes: number | null | undefined): string {
  if (!bytes && bytes !== 0) return "—";
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} ГБ`;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    success: { label: "Успешно", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" },
    error: { label: "Ошибка", cls: "bg-destructive/15 text-destructive" },
    running: { label: "Выполняется", cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" },
  };
  const v = map[status] ?? { label: status, cls: "bg-muted text-muted-foreground" };
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${v.cls}`}>{v.label}</span>;
}

function BackupsPage() {
  const { roles } = useAuth();
  const isAdmin = roles.includes("admin");
  const isDirector = roles.includes("director");
  const qc = useQueryClient();
  const [comment, setComment] = useState("");

  const { data, isLoading, error, isFetching, refetch } = useQuery({
    queryKey: ["backups"],
    queryFn: () => listBackupsFn(),
  });

  const create = useMutation({
    mutationFn: () => createBackupFn({ data: { comment: comment.trim() || null } }),
    onSuccess: () => {
      toast.success("Резервная копия создана");
      setComment("");
      qc.invalidateQueries({ queryKey: ["backups"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const download = useMutation({
    mutationFn: (id: string) => getBackupUrlFn({ data: { id } }),
    onSuccess: ({ url }) => {
      window.open(url, "_blank", "noopener");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [restoreTarget, setRestoreTarget] = useState<null | { id: string; created_at: string }>(null);
  const [confirmText, setConfirmText] = useState("");
  const restore = useMutation({
    mutationFn: (id: string) => restoreBackupFn({ data: { id, confirm: confirmText } }),
    onSuccess: () => {
      toast.success("Данные восстановлены из резервной копии");
      setRestoreTarget(null);
      setConfirmText("");
      qc.invalidateQueries({ queryKey: ["backups"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const last = useMemo(() => (data && data.length > 0 ? data[0] : null), [data]);
  const lastSuccess = useMemo(() => (data ?? []).find((b) => b.status === "success") ?? null, [data]);
  const isStale = useMemo(() => {
    if (!lastSuccess) return true;
    const ageMs = Date.now() - new Date(lastSuccess.created_at).getTime();
    return ageMs > 24 * 60 * 60 * 1000;
  }, [lastSuccess]);

  if (!isAdmin && !isDirector) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="mx-auto max-w-2xl px-4 py-12 text-center">
          <h1 className="text-2xl font-bold">Нет доступа к этому разделу</h1>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              <Database className="h-6 w-6" /> Резервные копии
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Контроль резервного копирования данных системы.
            </p>
          </div>
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            Обновить
          </Button>
        </div>

        {isStale ? (
          <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="text-sm">
              <div className="font-semibold">Резервная копия давно не создавалась</div>
              <div>
                {lastSuccess
                  ? `Последняя успешная копия: ${new Date(lastSuccess.created_at).toLocaleString("ru-RU")}.`
                  : "Успешные копии ещё не создавались."}{" "}
                Рекомендуется создать копию вручную.
              </div>
            </div>
          </div>
        ) : null}

        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground">Дата последней копии</div>
            <div className="mt-1 text-sm font-semibold">
              {last ? new Date(last.created_at).toLocaleString("ru-RU") : "не выполнялось"}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground">Статус</div>
            <div className="mt-1">{last ? <StatusBadge status={last.status} /> : <StatusBadge status="—" />}</div>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground">Размер</div>
            <div className="mt-1 text-sm font-semibold">{last ? formatSize(last.size_bytes) : "—"}</div>
          </div>
        </div>

        {isAdmin ? (
          <div className="mb-6 rounded-lg border border-border bg-card p-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <div className="space-y-1.5">
                <Label htmlFor="comment" className="text-xs">Комментарий (необязательно)</Label>
                <Input
                  id="comment"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Например: перед обновлением системы"
                  maxLength={500}
                  disabled={create.isPending}
                />
              </div>
              <Button onClick={() => create.mutate()} disabled={create.isPending}>
                {create.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Database className="mr-2 h-4 w-4" />}
                Создать резервную копию вручную
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              В копию входят: заказы, маршруты, заявки на транспорт, пользователи, склад, остатки, снабжение,
              импортированные данные, отчёты, журнал действий.
            </p>
          </div>
        ) : null}

        {error ? (
          <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {(error as Error).message}
          </div>
        ) : null}

        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/50 hover:bg-secondary/50">
                <TableHead>Дата</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Размер</TableHead>
                <TableHead>Кто запустил</TableHead>
                <TableHead>Тип</TableHead>
                <TableHead>Комментарий</TableHead>
                {isAdmin ? <TableHead className="text-right">Действия</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={isAdmin ? 7 : 6} className="py-12 text-center text-muted-foreground">Загрузка…</TableCell></TableRow>
              ) : (data ?? []).length === 0 ? (
                <TableRow><TableCell colSpan={isAdmin ? 7 : 6} className="py-12 text-center text-muted-foreground">Резервные копии ещё не создавались</TableCell></TableRow>
              ) : (
                (data ?? []).map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {new Date(b.created_at).toLocaleString("ru-RU")}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={b.status} />
                      {b.status === "error" && b.error_message ? (
                        <div className="mt-1 max-w-[260px] truncate text-xs text-destructive" title={b.error_message}>
                          {b.error_message}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-sm">{formatSize(b.size_bytes)}</TableCell>
                    <TableCell className="text-sm">{b.triggered_by_name ?? "—"}</TableCell>
                    <TableCell className="text-sm">{b.trigger_kind === "manual" ? "Вручную" : "По расписанию"}</TableCell>
                    <TableCell className="max-w-[260px] truncate text-sm text-muted-foreground" title={b.comment ?? ""}>
                      {b.comment ?? "—"}
                    </TableCell>
                    {isAdmin ? (
                      <TableCell className="text-right">
                        {b.status === "success" && b.storage_path ? (
                          <div className="flex flex-wrap justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => download.mutate(b.id)}
                              disabled={download.isPending}
                            >
                              <Download className="mr-1 h-3.5 w-3.5" /> Скачать
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => {
                                setConfirmText("");
                                setRestoreTarget({ id: b.id, created_at: b.created_at });
                              }}
                              disabled={restore.isPending}
                            >
                              <RotateCcw className="mr-1 h-3.5 w-3.5" /> Восстановить
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <Dialog open={!!restoreTarget} onOpenChange={(o) => { if (!o) { setRestoreTarget(null); setConfirmText(""); } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Восстановление из резервной копии</DialogTitle>
              <DialogDescription>
                Восстановление заменит текущие данные. Продолжить?
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              {restoreTarget ? (
                <div className="rounded-md border border-border bg-secondary/40 p-3 text-xs">
                  Копия от: <span className="font-medium">{new Date(restoreTarget.created_at).toLocaleString("ru-RU")}</span>
                </div>
              ) : null}
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                Внимание: текущее содержимое таблиц (заказы, маршруты, склад, остатки, снабжение, пользователи, журнал и др.)
                будет заменено данными из выбранной копии.
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm-restore" className="text-xs">
                  Для подтверждения введите слово <span className="font-mono font-bold">ВОССТАНОВИТЬ</span>
                </Label>
                <Input
                  id="confirm-restore"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="ВОССТАНОВИТЬ"
                  autoComplete="off"
                  disabled={restore.isPending}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => { setRestoreTarget(null); setConfirmText(""); }}
                disabled={restore.isPending}
              >
                Отмена
              </Button>
              <Button
                variant="destructive"
                onClick={() => restoreTarget && restore.mutate(restoreTarget.id)}
                disabled={restore.isPending || confirmText !== "ВОССТАНОВИТЬ"}
              >
                {restore.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
                Восстановить
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
