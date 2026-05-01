import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  listSystemErrorsFn,
  updateSystemErrorFn,
} from "@/lib/server-functions/system-errors.functions";
import { useAuth } from "@/lib/auth/auth-context";
import { ErrorState } from "@/components/ErrorState";

export const Route = createFileRoute("/system-errors")({
  head: () => ({ meta: [{ title: "Ошибки системы — Радиус Трек" }] }),
  component: SystemErrorsPage,
});

const ANY = "__any__";

const SEVERITY_LABEL: Record<string, string> = {
  info: "Инфо",
  warning: "Предупреждение",
  error: "Ошибка",
  critical: "Критическая",
};
const SEVERITY_TONE: Record<string, string> = {
  info: "bg-secondary text-foreground",
  warning: "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200",
  error: "bg-destructive/10 text-destructive",
  critical: "bg-destructive text-destructive-foreground",
};

const STATUS_LABEL: Record<string, string> = {
  new: "Новая",
  in_progress: "В работе",
  resolved: "Исправлена",
};

type Row = {
  id: string;
  created_at: string;
  last_seen_at: string;
  code: string;
  title: string;
  message: string | null;
  technical: string | null;
  section: string | null;
  action: string | null;
  severity: "info" | "warning" | "error" | "critical";
  status: "new" | "in_progress" | "resolved";
  user_name: string | null;
  user_role: string | null;
  ip_address: string | null;
  user_agent: string | null;
  url: string | null;
  occurrences: number;
  admin_note: string | null;
};

function SystemErrorsPage() {
  const { roles } = useAuth();
  const isAdmin = roles.includes("admin");
  const [tab, setTab] = useState<"new" | "frequent" | "critical" | "all">("new");
  const [statusFilter, setStatusFilter] = useState<string>(ANY);
  const [severityFilter, setSeverityFilter] = useState<string>(ANY);
  const [section, setSection] = useState("");
  const [editing, setEditing] = useState<Row | null>(null);
  const [editStatus, setEditStatus] = useState<"new" | "in_progress" | "resolved">("new");
  const [editNote, setEditNote] = useState("");

  const queryClient = useQueryClient();

  const filters = useMemo(() => {
    const base: Record<string, string | null | number> = { limit: 500 };
    if (statusFilter !== ANY) base.status = statusFilter;
    if (severityFilter !== ANY) base.severity = severityFilter;
    if (section.trim()) base.section = section.trim();
    if (tab === "critical") base.severity = "critical";
    if (tab === "new") base.status = "new";
    return base;
  }, [statusFilter, severityFilter, section, tab]);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["system-errors", filters],
    queryFn: async () => (await listSystemErrorsFn({ data: filters })) as Row[],
  });

  const view = useMemo(() => {
    const rows = data ?? [];
    if (tab === "frequent") {
      return [...rows].sort((a, b) => (b.occurrences ?? 1) - (a.occurrences ?? 1)).slice(0, 100);
    }
    return rows;
  }, [data, tab]);

  const updateMut = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      await updateSystemErrorFn({
        data: { id: editing.id, status: editStatus, note: editNote || null },
      });
    },
    onSuccess: () => {
      toast.success("Статус обновлён");
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ["system-errors"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Ошибки системы
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Все ошибки, зафиксированные в системе. Доступно администратору и руководителю; менять статус может только администратор.
          </p>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {[
            { id: "new", label: "Новые" },
            { id: "frequent", label: "Частые" },
            { id: "critical", label: "Критические" },
            { id: "all", label: "Все" },
          ].map((t) => (
            <Button
              key={t.id}
              size="sm"
              variant={tab === t.id ? "default" : "outline"}
              onClick={() => setTab(t.id as typeof tab)}
            >
              {t.label}
            </Button>
          ))}
        </div>

        <div className="mb-4 grid grid-cols-1 gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Статус</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Все</SelectItem>
                <SelectItem value="new">Новая</SelectItem>
                <SelectItem value="in_progress">В работе</SelectItem>
                <SelectItem value="resolved">Исправлена</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Серьёзность</Label>
            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Все</SelectItem>
                <SelectItem value="info">Инфо</SelectItem>
                <SelectItem value="warning">Предупреждение</SelectItem>
                <SelectItem value="error">Ошибка</SelectItem>
                <SelectItem value="critical">Критическая</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Раздел</Label>
            <Input value={section} onChange={(e) => setSection(e.target.value)} placeholder="напр. orders" />
          </div>
          <div className="flex items-end justify-end">
            <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? "Обновление…" : "Обновить"}
            </Button>
          </div>
        </div>

        {error ? (
          <ErrorState error={error} section="system-errors" action="load" onRetry={() => refetch()} />
        ) : null}

        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/50 hover:bg-secondary/50">
                <TableHead className="whitespace-nowrap">Когда</TableHead>
                <TableHead>Заголовок</TableHead>
                <TableHead>Раздел</TableHead>
                <TableHead>Серьёзность</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead className="text-right">Повторов</TableHead>
                <TableHead>Пользователь</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={8} className="py-12 text-center text-muted-foreground">Загрузка…</TableCell></TableRow>
              ) : view.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="py-12 text-center text-muted-foreground">Ошибок нет</TableCell></TableRow>
              ) : (
                view.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {new Date(r.last_seen_at).toLocaleString("ru-RU")}
                    </TableCell>
                    <TableCell className="max-w-[360px]">
                      <div className="font-medium text-foreground">{r.title}</div>
                      {r.message ? (
                        <div className="truncate text-xs text-muted-foreground" title={r.message}>{r.message}</div>
                      ) : null}
                      <div className="text-[11px] text-muted-foreground">код: {r.code}</div>
                    </TableCell>
                    <TableCell className="text-sm">{r.section ?? "—"}{r.action ? <span className="text-muted-foreground"> · {r.action}</span> : null}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${SEVERITY_TONE[r.severity] ?? ""}`}>
                        {SEVERITY_LABEL[r.severity] ?? r.severity}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.status === "resolved" ? "secondary" : r.status === "in_progress" ? "default" : "destructive"}>
                        {STATUS_LABEL[r.status] ?? r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{r.occurrences}</TableCell>
                    <TableCell className="text-sm">
                      <div>{r.user_name ?? "—"}</div>
                      {r.user_role ? <div className="text-xs text-muted-foreground">{r.user_role}</div> : null}
                    </TableCell>
                    <TableCell className="text-right">
                      {isAdmin ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditing(r);
                            setEditStatus(r.status);
                            setEditNote(r.admin_note ?? "");
                          }}
                        >
                          Изменить
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => { setEditing(r); }}>
                          Подробно
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </main>

      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing?.title}</DialogTitle>
            <DialogDescription>
              {editing?.section ? `Раздел: ${editing.section}. ` : ""}
              {editing?.action ? `Действие: ${editing.action}.` : ""}
            </DialogDescription>
          </DialogHeader>
          {editing ? (
            <div className="space-y-3">
              {editing.message ? (
                <div>
                  <Label className="text-xs">Сообщение</Label>
                  <div className="mt-1 rounded border border-border bg-secondary/40 p-2 text-sm">{editing.message}</div>
                </div>
              ) : null}
              {editing.technical ? (
                <div>
                  <Label className="text-xs">Технические детали</Label>
                  <pre className="mt-1 max-h-60 overflow-auto rounded border border-border bg-secondary/40 p-2 text-[11px] leading-snug">{editing.technical}</pre>
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                <div>URL: {editing.url ?? "—"}</div>
                <div>IP: {editing.ip_address ?? "—"}</div>
                <div className="col-span-2 truncate">User-Agent: {editing.user_agent ?? "—"}</div>
              </div>
              {isAdmin ? (
                <>
                  <div>
                    <Label className="text-xs">Статус</Label>
                    <Select value={editStatus} onValueChange={(v) => setEditStatus(v as typeof editStatus)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="new">Новая</SelectItem>
                        <SelectItem value="in_progress">В работе</SelectItem>
                        <SelectItem value="resolved">Исправлена</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Заметка администратора</Label>
                    <Textarea value={editNote} onChange={(e) => setEditNote(e.target.value)} rows={3} />
                  </div>
                </>
              ) : editing.admin_note ? (
                <div>
                  <Label className="text-xs">Заметка администратора</Label>
                  <div className="mt-1 rounded border border-border bg-secondary/40 p-2 text-sm">{editing.admin_note}</div>
                </div>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Закрыть</Button>
            {isAdmin ? (
              <Button onClick={() => updateMut.mutate()} disabled={updateMut.isPending}>
                {updateMut.isPending ? "Сохранение…" : "Сохранить"}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
