import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/system-issues")({
  head: () => ({
    meta: [
      { title: "Ошибки и доработки — Радиус Трек" },
      { name: "description", content: "Список ошибок и доработок для тестирования системы." },
    ],
  }),
  component: SystemIssuesPage,
});

type Role = "driver" | "manager" | "logist" | "director";
type Severity = "low" | "medium" | "high" | "critical";
type Status = "new" | "in_progress" | "fixed" | "deferred";

type Issue = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  role: Role;
  severity: Severity;
  status: Status;
  comment: string | null;
  created_at: string;
};

const ROLE_LABEL: Record<Role, string> = {
  driver: "Водитель",
  manager: "Менеджер",
  logist: "Логист",
  director: "Руководитель",
};

const SEVERITY_LABEL: Record<Severity, string> = {
  low: "Низкая",
  medium: "Средняя",
  high: "Высокая",
  critical: "Критическая",
};

const STATUS_LABEL: Record<Status, string> = {
  new: "Новая",
  in_progress: "В работе",
  fixed: "Исправлена",
  deferred: "Отложена",
};

const SEVERITY_CLASS: Record<Severity, string> = {
  low: "bg-slate-100 text-slate-700 border-slate-200",
  medium: "bg-blue-100 text-blue-700 border-blue-200",
  high: "bg-orange-100 text-orange-700 border-orange-200",
  critical: "bg-red-100 text-red-700 border-red-200",
};

const STATUS_CLASS: Record<Status, string> = {
  new: "bg-amber-100 text-amber-800 border-amber-200",
  in_progress: "bg-blue-100 text-blue-800 border-blue-200",
  fixed: "bg-green-100 text-green-800 border-green-200",
  deferred: "bg-slate-100 text-slate-700 border-slate-200",
};

function SystemIssuesPage() {
  const qc = useQueryClient();
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);

  const { data: issues = [], isLoading } = useQuery({
    queryKey: ["system_issues"],
    queryFn: async (): Promise<Issue[]> => {
      const { data, error } = await supabase
        .from("system_issues")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Issue[];
    },
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Issue> }) => {
      const { error } = await supabase.from("system_issues").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["system_issues"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("system_issues").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["system_issues"] });
      toast.success("Удалено");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = issues.filter((i) => {
    if (roleFilter !== "all" && i.role !== roleFilter) return false;
    if (severityFilter !== "all" && i.severity !== severityFilter) return false;
    if (statusFilter !== "all" && i.status !== statusFilter) return false;
    return true;
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:py-10">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ошибки и доработки</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Список задач по тестированию минимального рабочего контура.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> Добавить ошибку / доработку
            </Button>
          </DialogTrigger>
          <CreateIssueDialog onCreated={() => setOpen(false)} />
        </Dialog>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <FilterSelect
          label="Роль"
          value={roleFilter}
          onChange={setRoleFilter}
          options={[["all", "Все роли"], ...Object.entries(ROLE_LABEL)]}
        />
        <FilterSelect
          label="Важность"
          value={severityFilter}
          onChange={setSeverityFilter}
          options={[["all", "Любая"], ...Object.entries(SEVERITY_LABEL)]}
        />
        <FilterSelect
          label="Статус"
          value={statusFilter}
          onChange={setStatusFilter}
          options={[["all", "Любой"], ...Object.entries(STATUS_LABEL)]}
        />
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Загрузка…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Нет записей. Нажмите «Добавить ошибку / доработку».
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((i) => (
            <li key={i.id} className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{i.title}</div>
                  {i.description && (
                    <div className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                      {i.description}
                    </div>
                  )}
                  {i.location && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      Где: <span className="text-foreground">{i.location}</span>
                    </div>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    if (confirm("Удалить запись?")) deleteMut.mutate(i.id);
                  }}
                  aria-label="Удалить"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <Badge className="border bg-muted text-foreground">{ROLE_LABEL[i.role]}</Badge>
                <Badge className={`border ${SEVERITY_CLASS[i.severity]}`}>
                  {SEVERITY_LABEL[i.severity]}
                </Badge>
                <Badge className={`border ${STATUS_CLASS[i.status]}`}>
                  {STATUS_LABEL[i.status]}
                </Badge>
                <span className="ml-auto text-muted-foreground">
                  {new Date(i.created_at).toLocaleString("ru-RU")}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <div className="mb-1 text-xs text-muted-foreground">Статус</div>
                  <Select
                    value={i.status}
                    onValueChange={(v) =>
                      updateMut.mutate({ id: i.id, patch: { status: v as Status } })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(STATUS_LABEL).map(([k, l]) => (
                        <SelectItem key={k} value={k}>
                          {l}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <div className="mb-1 text-xs text-muted-foreground">Важность</div>
                  <Select
                    value={i.severity}
                    onValueChange={(v) =>
                      updateMut.mutate({ id: i.id, patch: { severity: v as Severity } })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(SEVERITY_LABEL).map(([k, l]) => (
                        <SelectItem key={k} value={k}>
                          {l}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="mt-3">
                <div className="mb-1 text-xs text-muted-foreground">Комментарий</div>
                <Textarea
                  defaultValue={i.comment ?? ""}
                  onBlur={(e) => {
                    const v = e.target.value;
                    if (v !== (i.comment ?? "")) {
                      updateMut.mutate({ id: i.id, patch: { comment: v } });
                    }
                  }}
                  placeholder="Комментарий…"
                  className="min-h-[60px]"
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Badge({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${className ?? ""}`}>
      {children}
    </span>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <div>
      <div className="mb-1 text-xs text-muted-foreground">{label}</div>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([k, l]) => (
            <SelectItem key={k} value={k}>
              {l}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function CreateIssueDialog({ onCreated }: { onCreated: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [role, setRole] = useState<Role>("manager");
  const [severity, setSeverity] = useState<Severity>("medium");
  const [status, setStatus] = useState<Status>("new");
  const [comment, setComment] = useState("");

  const createMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("system_issues").insert({
        title: title.trim(),
        description: description.trim() || null,
        location: location.trim() || null,
        role,
        severity,
        status,
        comment: comment.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["system_issues"] });
      toast.success("Добавлено");
      setTitle("");
      setDescription("");
      setLocation("");
      setRole("manager");
      setSeverity("medium");
      setStatus("new");
      setComment("");
      onCreated();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Новая ошибка / доработка</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <div className="mb-1 text-xs text-muted-foreground">Название *</div>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Кратко" />
        </div>
        <div>
          <div className="mb-1 text-xs text-muted-foreground">Описание</div>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Что не так / что нужно сделать"
            className="min-h-[80px]"
          />
        </div>
        <div>
          <div className="mb-1 text-xs text-muted-foreground">Где обнаружено</div>
          <Input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Раздел / экран / шаг"
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <div className="mb-1 text-xs text-muted-foreground">Роль</div>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(ROLE_LABEL).map(([k, l]) => (
                  <SelectItem key={k} value={k}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <div className="mb-1 text-xs text-muted-foreground">Важность</div>
            <Select value={severity} onValueChange={(v) => setSeverity(v as Severity)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(SEVERITY_LABEL).map(([k, l]) => (
                  <SelectItem key={k} value={k}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <div className="mb-1 text-xs text-muted-foreground">Статус</div>
            <Select value={status} onValueChange={(v) => setStatus(v as Status)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(STATUS_LABEL).map(([k, l]) => (
                  <SelectItem key={k} value={k}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <div className="mb-1 text-xs text-muted-foreground">Комментарий</div>
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="min-h-[60px]"
          />
        </div>
      </div>
      <DialogFooter>
        <Button
          onClick={() => createMut.mutate()}
          disabled={!title.trim() || createMut.isPending}
        >
          Сохранить
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
