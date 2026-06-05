import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sun,
  Sunrise,
  Sunset,
  Plus,
  Sparkles,
  CheckCircle2,
  Play,
  X,
  ArrowRight,
  ClipboardList,
} from "lucide-react";
import { tasksApi } from "@/lib/dispatcher/api";
import type { TaskDTO } from "@/lib/dispatcher/types";
import {
  RELATED_ENTITY_LABELS,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  TASK_TYPES,
  TASK_TYPE_LABELS,
  relatedEntityRoute,
  taskPriorityBadgeClass,
  taskStatusBadgeClass,
  type TaskPriority,
  type TaskStatus,
  type TaskType,
} from "@/lib/dispatcher/statuses";

export const Route = createFileRoute("/dispatcher/tasks")({
  component: DispatcherTasksPage,
});

type FilterTab =
  | "all"
  | "open"
  | "in_progress"
  | "done"
  | "urgent"
  | "today"
  | "overdue";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function DispatcherTasksPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<FilterTab>("open");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const queryParams = useMemo(() => {
    const p: Record<string, unknown> = { limit: 200 };
    if (typeFilter !== "all") p.task_type = typeFilter;
    switch (tab) {
      case "open":
        p.status = "open";
        break;
      case "in_progress":
        p.status = "in_progress";
        break;
      case "done":
        p.status = "done";
        break;
      case "urgent":
        p.priority = "urgent";
        break;
      case "today":
        p.due_date = todayStr();
        break;
      case "overdue":
        p.overdue = "1";
        break;
      default:
        break;
    }
    return p;
  }, [tab, typeFilter]);

  const { data, isLoading } = useQuery({
    queryKey: ["dispatcher-tasks", queryParams],
    queryFn: () => tasksApi.list(queryParams),
    refetchInterval: 60_000,
  });

  async function doAction(
    id: string,
    fn: () => Promise<unknown>,
    okMsg: string,
  ) {
    if (busyId) return;
    setBusyId(id);
    try {
      await fn();
      toast.success(okMsg);
      qc.invalidateQueries({ queryKey: ["dispatcher-tasks"] });
      qc.invalidateQueries({ queryKey: ["dispatcher-dashboard"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusyId(null);
    }
  }

  async function handleGenerate() {
    if (generating) return;
    setGenerating(true);
    try {
      const res = await tasksApi.generateDaily();
      toast.success(
        res.created > 0
          ? `Создано задач: ${res.created}`
          : "Новых задач нет — всё актуально",
      );
      qc.invalidateQueries({ queryKey: ["dispatcher-tasks"] });
      qc.invalidateQueries({ queryKey: ["dispatcher-dashboard"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setGenerating(false);
    }
  }

  const rows = data?.rows ?? [];

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
              <ClipboardList className="h-6 w-6" />
              Задачи диспетчера
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Регламент дня и список текущих задач
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleGenerate}
              disabled={generating}
            >
              <Sparkles className="mr-1 h-4 w-4" />
              {generating ? "Генерация…" : "Сгенерировать задачи на сегодня"}
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1 h-4 w-4" />
              Добавить задачу
            </Button>
          </div>
        </div>

        {/* Регламент дня */}
        <DailyRegulationBlock />

        {/* Filters */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {(
            [
              ["all", "Все"],
              ["open", "Открытые"],
              ["in_progress", "В работе"],
              ["done", "Выполненные"],
              ["urgent", "Срочные"],
              ["today", "На сегодня"],
              ["overdue", "Просрочено"],
            ] as Array<[FilterTab, string]>
          ).map(([k, label]) => (
            <Button
              key={k}
              size="sm"
              variant={tab === k ? "default" : "outline"}
              onClick={() => setTab(k)}
            >
              {label}
            </Button>
          ))}
          <div className="ml-auto w-full sm:w-auto">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full sm:w-[260px]">
                <SelectValue placeholder="Тип задачи" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все типы задач</SelectItem>
                {TASK_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {TASK_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* List */}
        {isLoading ? (
          <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            Загрузка…
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card/50 p-8 text-center text-sm text-muted-foreground">
            Нет задач в этой выборке
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((t) => (
              <TaskCard
                key={t.id}
                t={t}
                busy={busyId === t.id}
                onComplete={() =>
                  doAction(t.id, () => tasksApi.complete(t.id), "Задача выполнена")
                }
                onInProgress={() =>
                  doAction(
                    t.id,
                    () => tasksApi.update(t.id, { task_status: "in_progress" }),
                    "В работе",
                  )
                }
                onCancel={() =>
                  doAction(t.id, () => tasksApi.remove(t.id), "Задача отменена")
                }
              />
            ))}
          </div>
        )}
      </main>

      <CreateTaskDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          qc.invalidateQueries({ queryKey: ["dispatcher-tasks"] });
        }}
      />
    </div>
  );
}

function TaskCard({
  t,
  busy,
  onComplete,
  onInProgress,
  onCancel,
}: {
  t: TaskDTO;
  busy: boolean;
  onComplete: () => void;
  onInProgress: () => void;
  onCancel: () => void;
}) {
  const status = t.task_status as TaskStatus;
  const priority = t.priority as TaskPriority;
  const isDone = status === "done" || status === "cancelled";
  const relatedHref = t.action_url ?? relatedEntityRoute(t.related_entity_type);

  return (
    <div className="flex flex-col rounded-lg border border-border bg-card p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="outline" className={taskPriorityBadgeClass(priority)}>
          {TASK_PRIORITY_LABELS[priority] ?? priority}
        </Badge>
        <Badge variant="outline" className={taskStatusBadgeClass(status)}>
          {TASK_STATUS_LABELS[status] ?? status}
        </Badge>
        <Badge variant="outline">
          {TASK_TYPE_LABELS[t.task_type as TaskType] ?? t.task_type}
        </Badge>
        {t.due_date ? (
          <span className="ml-auto text-xs text-muted-foreground">
            до {new Date(t.due_date).toLocaleDateString("ru-RU")}
          </span>
        ) : null}
      </div>
      <div className="mt-2 text-sm font-semibold text-foreground">{t.title}</div>
      {t.description ? (
        <div className="mt-1 text-xs text-muted-foreground">{t.description}</div>
      ) : null}
      {t.related_entity_type && t.related_entity_type !== "none" ? (
        <div className="mt-1 text-xs text-muted-foreground">
          Объект: {RELATED_ENTITY_LABELS[t.related_entity_type as keyof typeof RELATED_ENTITY_LABELS] ?? t.related_entity_type}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {!isDone ? (
          <>
            <Button
              size="sm"
              variant="secondary"
              onClick={onComplete}
              disabled={busy}
            >
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
              Выполнено
            </Button>
            {status !== "in_progress" ? (
              <Button
                size="sm"
                variant="outline"
                onClick={onInProgress}
                disabled={busy}
              >
                <Play className="mr-1 h-3.5 w-3.5" />В работу
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              onClick={onCancel}
              disabled={busy}
            >
              <X className="mr-1 h-3.5 w-3.5" />
              Отменить
            </Button>
          </>
        ) : null}
        {t.related_entity_type && t.related_entity_type !== "none" ? (
          <Button asChild size="sm" variant="outline" className="ml-auto">
            <Link to={relatedHref}>
              Открыть объект
              <ArrowRight className="ml-1 h-3 w-3" />
            </Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function DailyRegulationBlock() {
  return (
    <section className="mb-6 grid gap-3 md:grid-cols-3">
      <RegulationCard
        title="Утро"
        icon={<Sunrise className="h-4 w-4" />}
        items={[
          "Проверить свободные машины",
          "Проверить новые грузы",
          "Подобрать машины под грузы",
          "Создать сделки по подходящим связкам",
        ]}
      />
      <RegulationCard
        title="День"
        icon={<Sun className="h-4 w-4" />}
        items={[
          "Контролировать загрузки",
          "Проверять выгрузки",
          "Искать догрузы",
          "Созваниваться с водителями и перевозчиками",
        ]}
      />
      <RegulationCard
        title="Вечер"
        icon={<Sunset className="h-4 w-4" />}
        items={[
          "Проверить оплаты",
          "Проверить комиссии",
          "Закрыть выполненные сделки",
          "Сформировать задачи на завтра",
        ]}
      />
    </section>
  );
}

function RegulationCard({
  title,
  icon,
  items,
}: {
  title: string;
  icon: React.ReactNode;
  items: string[];
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        {icon}
        {title}
      </div>
      <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
        {items.map((it) => (
          <li key={it} className="flex gap-2">
            <span className="text-muted-foreground/60">•</span>
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CreateTaskDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [taskType, setTaskType] = useState<TaskType>("custom");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [dueDate, setDueDate] = useState<string>(todayStr());
  const [saving, setSaving] = useState(false);

  function reset() {
    setTitle("");
    setDescription("");
    setTaskType("custom");
    setPriority("normal");
    setDueDate(todayStr());
  }

  async function handleSubmit() {
    if (!title.trim()) {
      toast.error("Введите название");
      return;
    }
    setSaving(true);
    try {
      await tasksApi.create({
        title: title.trim(),
        description: description.trim() || null,
        task_type: taskType,
        priority,
        task_status: "open",
        due_date: dueDate || null,
        related_entity_type: "none",
      });
      toast.success("Задача создана");
      reset();
      onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Новая задача</DialogTitle>
          <DialogDescription>
            Создать произвольную задачу для диспетчера
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="task-title">Название</Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Что нужно сделать"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="task-desc">Описание</Label>
            <Textarea
              id="task-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Подробности (необязательно)"
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Тип</Label>
              <Select
                value={taskType}
                onValueChange={(v) => setTaskType(v as TaskType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TASK_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Приоритет</Label>
              <Select
                value={priority}
                onValueChange={(v) => setPriority(v as TaskPriority)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {TASK_PRIORITY_LABELS[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="task-due">Срок</Label>
            <Input
              id="task-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Отмена
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? "Сохраняем…" : "Создать"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Avoid unused-import warnings for status list constant
void TASK_STATUSES;
