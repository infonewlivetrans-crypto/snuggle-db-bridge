import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, ClipboardList, Send } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ROLE_LABELS, type AppRole } from "@/lib/auth/roles";
import {
  addTaskCommentFn,
  createPilotTaskFn,
  listPilotTasksFn,
  listTaskCommentsFn,
  updatePilotTaskFn,
} from "@/lib/server-functions/pilot-tasks.functions";

export const Route = createFileRoute("/pilot-tasks")({
  head: () => ({ meta: [{ title: "Задачи и доработки — Радиус Трек" }] }),
  component: PilotTasksPage,
});

const PRIORITY_LABEL: Record<string, string> = {
  critical: "Критично",
  important: "Важно",
  later: "Можно позже",
};
const STATUS_LABEL: Record<string, string> = {
  new: "Новая",
  in_progress: "В работе",
  review: "Проверка",
  done: "Выполнено",
};
const PRIORITY_CLASS: Record<string, string> = {
  critical: "bg-destructive/15 text-destructive border-destructive/30",
  important: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-900/30 dark:text-amber-200",
  later: "bg-secondary text-foreground border-border",
};
const STATUS_CLASS: Record<string, string> = {
  new: "bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-900/30 dark:text-blue-200",
  in_progress: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-900/30 dark:text-amber-200",
  review: "bg-purple-100 text-purple-900 border-purple-300 dark:bg-purple-900/30 dark:text-purple-200",
  done: "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-200",
};

const FEEDBACK_ROLES: AppRole[] = ["driver", "logist", "manager", "warehouse", "director"];

type Task = {
  id: string;
  title: string;
  description: string | null;
  what_broke: string | null;
  where_broke: string | null;
  how_to_reproduce: string | null;
  source: string;
  reporter_name: string | null;
  reporter_role: string | null;
  route_label: string | null;
  priority: string;
  status: string;
  assignee: string | null;
  created_at: string;
  closed_at: string | null;
};

function CreateTaskDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    whatBroke: "",
    whereBroke: "",
    howToReproduce: "",
    priority: "important" as "critical" | "important" | "later",
    assignee: "admin",
  });

  const m = useMutation({
    mutationFn: () =>
      createPilotTaskFn({
        data: {
          title: form.title.trim(),
          description: form.description.trim() || null,
          whatBroke: form.whatBroke.trim() || null,
          whereBroke: form.whereBroke.trim() || null,
          howToReproduce: form.howToReproduce.trim() || null,
          priority: form.priority,
          assignee: form.assignee,
        },
      }),
    onSuccess: () => {
      toast.success("Задача создана");
      setOpen(false);
      setForm({
        title: "",
        description: "",
        whatBroke: "",
        whereBroke: "",
        howToReproduce: "",
        priority: "important",
        assignee: "admin",
      });
      qc.invalidateQueries({ queryKey: ["pilot-tasks"] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Не удалось создать задачу"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" /> Новая задача
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Новая задача</DialogTitle>
          <DialogDescription>Опишите проблему или доработку.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label>Название</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Что сломалось</Label>
              <Textarea
                rows={2}
                value={form.whatBroke}
                onChange={(e) => setForm((p) => ({ ...p, whatBroke: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Где сломалось</Label>
              <Input
                value={form.whereBroke}
                onChange={(e) => setForm((p) => ({ ...p, whereBroke: e.target.value }))}
                placeholder="Раздел/страница"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Как воспроизвести</Label>
            <Textarea
              rows={2}
              value={form.howToReproduce}
              onChange={(e) => setForm((p) => ({ ...p, howToReproduce: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Описание / детали</Label>
            <Textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Приоритет</Label>
              <Select
                value={form.priority}
                onValueChange={(v) =>
                  setForm((p) => ({ ...p, priority: v as typeof form.priority }))
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="critical">Критично</SelectItem>
                  <SelectItem value="important">Важно</SelectItem>
                  <SelectItem value="later">Можно позже</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Ответственный</Label>
              <Select
                value={form.assignee}
                onValueChange={(v) => setForm((p) => ({ ...p, assignee: v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Администратор</SelectItem>
                  <SelectItem value="developer">Разработчик</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending || form.title.trim().length < 2}>
            {m.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Создать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TaskComments({ taskId }: { taskId: string }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["pilot-task-comments", taskId],
    queryFn: () => listTaskCommentsFn({ data: { taskId } }),
  });
  const add = useMutation({
    mutationFn: () => addTaskCommentFn({ data: { taskId, body: text.trim() } }),
    onSuccess: () => {
      setText("");
      qc.invalidateQueries({ queryKey: ["pilot-task-comments", taskId] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Не удалось отправить"),
  });

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">Комментарии</div>
      {isLoading ? (
        <div className="text-xs text-muted-foreground">Загрузка…</div>
      ) : (data ?? []).length === 0 ? (
        <div className="text-xs text-muted-foreground">Пока нет комментариев</div>
      ) : (
        <ul className="space-y-1.5">
          {(data as Array<{ id: string; created_at: string; author_name: string | null; body: string }>).map(
            (c) => (
              <li key={c.id} className="rounded border border-border bg-background p-2 text-sm">
                <div className="mb-0.5 text-xs text-muted-foreground">
                  {new Date(c.created_at).toLocaleString("ru-RU")} · {c.author_name ?? "—"}
                </div>
                <div>{c.body}</div>
              </li>
            ),
          )}
        </ul>
      )}
      <div className="flex gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Добавить комментарий…"
        />
        <Button
          size="sm"
          onClick={() => add.mutate()}
          disabled={add.isPending || text.trim().length === 0}
        >
          {add.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

function TaskCard({ task }: { task: Task }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const upd = useMutation({
    mutationFn: (patch: { status?: string; priority?: string; assignee?: string }) =>
      updatePilotTaskFn({
        data: {
          id: task.id,
          status: patch.status as "new" | "in_progress" | "review" | "done" | undefined,
          priority: patch.priority as "critical" | "important" | "later" | undefined,
          assignee: patch.assignee,
        },
      }),
    onSuccess: () => {
      toast.success("Сохранено");
      qc.invalidateQueries({ queryKey: ["pilot-tasks"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Ошибка"),
  });

  return (
    <Card className="overflow-hidden">
      <CardContent className="space-y-2 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-semibold">{task.title}</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <span>{new Date(task.created_at).toLocaleString("ru-RU")}</span>
              {task.reporter_name ? <span>· {task.reporter_name}</span> : null}
              {task.reporter_role ? (
                <span>· {ROLE_LABELS[task.reporter_role as AppRole] ?? task.reporter_role}</span>
              ) : null}
              {task.route_label ? <span>· Маршрут: {task.route_label}</span> : null}
              {task.source === "feedback" ? <span>· из обратной связи</span> : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className={PRIORITY_CLASS[task.priority]}>
              {PRIORITY_LABEL[task.priority]}
            </Badge>
            <Badge variant="outline" className={STATUS_CLASS[task.status]}>
              {STATUS_LABEL[task.status]}
            </Badge>
          </div>
        </div>

        {task.what_broke || task.where_broke || task.how_to_reproduce || task.description ? (
          <div className="grid gap-1 rounded-md bg-muted/40 p-2 text-sm">
            {task.what_broke ? <div><b>Что сломалось:</b> {task.what_broke}</div> : null}
            {task.where_broke ? <div><b>Где сломалось:</b> {task.where_broke}</div> : null}
            {task.how_to_reproduce ? <div><b>Как воспроизвести:</b> {task.how_to_reproduce}</div> : null}
            {task.description ? <div className="text-muted-foreground">{task.description}</div> : null}
          </div>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-xs">Статус</Label>
            <Select value={task.status} onValueChange={(v) => upd.mutate({ status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="new">Новая</SelectItem>
                <SelectItem value="in_progress">В работе</SelectItem>
                <SelectItem value="review">Проверка</SelectItem>
                <SelectItem value="done">Выполнено</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Приоритет</Label>
            <Select value={task.priority} onValueChange={(v) => upd.mutate({ priority: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="critical">Критично</SelectItem>
                <SelectItem value="important">Важно</SelectItem>
                <SelectItem value="later">Можно позже</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Ответственный</Label>
            <Select
              value={task.assignee ?? "admin"}
              onValueChange={(v) => upd.mutate({ assignee: v })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Администратор</SelectItem>
                <SelectItem value="developer">Разработчик</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Button variant="ghost" size="sm" onClick={() => setOpen((v) => !v)}>
            {open ? "Скрыть комментарии" : "Комментарии"}
          </Button>
          {open ? <div className="mt-2"><TaskComments taskId={task.id} /></div> : null}
        </div>
      </CardContent>
    </Card>
  );
}

function PilotTasksPage() {
  const [priority, setPriority] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [role, setRole] = useState<string>("all");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["pilot-tasks", priority, status, role, from, to],
    queryFn: () =>
      listPilotTasksFn({
        data: {
          priority: priority === "all" ? null : (priority as "critical"),
          status: status === "all" ? null : (status as "new"),
          role: role === "all" ? null : role,
          from: from ? new Date(from).toISOString() : null,
          to: to ? new Date(to + "T23:59:59").toISOString() : null,
        },
      }),
  });

  const items = (data?.items ?? []) as Task[];
  const s = data?.summary;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto w-full max-w-[1200px] px-3 py-6 sm:px-4 lg:px-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold">
              <ClipboardList className="h-6 w-6" /> Задачи и доработки
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Задачи создаются вручную или автоматически из обратной связи (критические + «что ломается»).
            </p>
          </div>
          <CreateTaskDialog />
        </div>

        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Всего</CardTitle></CardHeader>
            <CardContent className="text-2xl font-semibold">{s?.total ?? 0}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Критические</CardTitle></CardHeader>
            <CardContent className="text-2xl font-semibold text-destructive">{s?.critical ?? 0}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">В работе</CardTitle></CardHeader>
            <CardContent className="text-2xl font-semibold">{s?.inProgress ?? 0}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Закрыто</CardTitle></CardHeader>
            <CardContent className="text-2xl font-semibold text-emerald-700 dark:text-emerald-400">{s?.done ?? 0}</CardContent>
          </Card>
        </div>

        <Card className="mb-4">
          <CardContent className="flex flex-wrap items-end gap-3 p-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Приоритет</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все</SelectItem>
                  <SelectItem value="critical">Критично</SelectItem>
                  <SelectItem value="important">Важно</SelectItem>
                  <SelectItem value="later">Можно позже</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Статус</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все</SelectItem>
                  <SelectItem value="new">Новая</SelectItem>
                  <SelectItem value="in_progress">В работе</SelectItem>
                  <SelectItem value="review">Проверка</SelectItem>
                  <SelectItem value="done">Выполнено</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Роль автора</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все роли</SelectItem>
                  {FEEDBACK_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">С даты</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-[160px]" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">По дату</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-[160px]" />
            </div>
            <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Обновить
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Загрузка…
            </div>
          ) : items.length === 0 ? (
            <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Задач не найдено</CardContent></Card>
          ) : (
            items.map((t) => <TaskCard key={t.id} task={t} />)
          )}
        </div>
      </main>
    </div>
  );
}
