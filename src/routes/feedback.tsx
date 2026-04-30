import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, MessageSquare, Send, Star } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth/auth-context";
import { ROLE_LABELS, type AppRole } from "@/lib/auth/roles";
import { listFeedbackFn, submitFeedbackFn } from "@/server/feedback.functions";

export const Route = createFileRoute("/feedback")({
  head: () => ({ meta: [{ title: "Обратная связь — Радиус Трек" }] }),
  component: FeedbackPage,
});

const FEEDBACK_ROLES: AppRole[] = ["driver", "logist", "manager", "warehouse", "director"];

type FormState = {
  good: string;
  bad: string;
  broken: string;
  unclear: string;
  needed: string;
  comment: string;
  routeLabel: string;
  ratingConvenience: number;
  ratingSpeed: number;
  ratingStability: number;
  severity: "normal" | "critical" | "suggestion";
};

const EMPTY: FormState = {
  good: "",
  bad: "",
  broken: "",
  unclear: "",
  needed: "",
  comment: "",
  routeLabel: "",
  ratingConvenience: 5,
  ratingSpeed: 5,
  ratingStability: 5,
  severity: "normal",
};

function StarPicker({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className="rounded p-1 transition-colors hover:bg-secondary"
            aria-label={`${n} из 5`}
          >
            <Star
              className={`h-6 w-6 ${
                n <= value ? "fill-amber-400 text-amber-500" : "text-muted-foreground"
              }`}
            />
          </button>
        ))}
        <span className="ml-2 text-sm text-muted-foreground">{value}/5</span>
      </div>
    </div>
  );
}

function FeedbackForm({ role }: { role: AppRole }) {
  const [form, setForm] = useState<FormState>(EMPTY);

  const submit = useMutation({
    mutationFn: () =>
      submitFeedbackFn({
        data: {
          role: role as "driver" | "logist" | "manager" | "warehouse" | "director",
          routeLabel: form.routeLabel.trim() || null,
          good: form.good.trim() || null,
          bad: form.bad.trim() || null,
          broken: form.broken.trim() || null,
          unclear: form.unclear.trim() || null,
          needed: form.needed.trim() || null,
          comment: form.comment.trim() || null,
          ratingConvenience: form.ratingConvenience,
          ratingSpeed: form.ratingSpeed,
          ratingStability: form.ratingStability,
          severity: form.severity,
        },
      }),
    onSuccess: () => {
      toast.success("Спасибо! Ваш отзыв сохранён.");
      setForm(EMPTY);
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Не удалось отправить отзыв");
    },
  });

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <MessageSquare className="h-5 w-5" />
          Форма для роли «{ROLE_LABELS[role]}»
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="route">Маршрут / задача (если относится)</Label>
            <Input
              id="route"
              value={form.routeLabel}
              onChange={(e) => set("routeLabel", e.target.value)}
              placeholder="Например, маршрут №1024"
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="good">Что удобно</Label>
            <Textarea
              id="good"
              value={form.good}
              onChange={(e) => set("good", e.target.value)}
              rows={2}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="bad">Что неудобно</Label>
            <Textarea
              id="bad"
              value={form.bad}
              onChange={(e) => set("bad", e.target.value)}
              rows={2}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="broken">Что ломается</Label>
            <Textarea
              id="broken"
              value={form.broken}
              onChange={(e) => set("broken", e.target.value)}
              rows={2}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="unclear">Что непонятно</Label>
            <Textarea
              id="unclear"
              value={form.unclear}
              onChange={(e) => set("unclear", e.target.value)}
              rows={2}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="needed">Что нужно добавить</Label>
            <Textarea
              id="needed"
              value={form.needed}
              onChange={(e) => set("needed", e.target.value)}
              rows={2}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="comment">Комментарий</Label>
            <Textarea
              id="comment"
              value={form.comment}
              onChange={(e) => set("comment", e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <div className="grid gap-4 rounded-lg border border-border bg-muted/30 p-4 sm:grid-cols-3">
          <StarPicker
            label="Удобство"
            value={form.ratingConvenience}
            onChange={(v) => set("ratingConvenience", v)}
          />
          <StarPicker
            label="Скорость"
            value={form.ratingSpeed}
            onChange={(v) => set("ratingSpeed", v)}
          />
          <StarPicker
            label="Стабильность"
            value={form.ratingStability}
            onChange={(v) => set("ratingStability", v)}
          />
        </div>

        <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label>Категория отзыва</Label>
            <Select
              value={form.severity}
              onValueChange={(v) => set("severity", v as FormState["severity"])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Обычный отзыв</SelectItem>
                <SelectItem value="critical">Критическая проблема</SelectItem>
                <SelectItem value="suggestion">Предложение</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={() => submit.mutate()}
            disabled={submit.isPending}
            className="sm:min-w-[200px]"
          >
            {submit.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Отправить отзыв
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AdminSummary() {
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["feedback-list", roleFilter, severityFilter],
    queryFn: () =>
      listFeedbackFn({
        data: {
          role: roleFilter === "all" ? null : (roleFilter as AppRole as "driver"),
          severity:
            severityFilter === "all"
              ? null
              : (severityFilter as "normal" | "critical" | "suggestion"),
        },
      }),
  });

  const summary = data?.summary;
  const items = data?.items ?? [];

  // Подсчёт «частых проблем» — топ повторяющихся фраз из «что ломается / неудобно»
  const frequent = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of items as Array<{ broken?: string | null; bad?: string | null }>) {
      for (const v of [r.broken, r.bad]) {
        const t = (v ?? "").trim().toLowerCase();
        if (t.length >= 4) counts.set(t, (counts.get(t) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .filter(([, n]) => n >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  }, [items]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Роль</Label>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все роли</SelectItem>
              {FEEDBACK_ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {ROLE_LABELS[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Категория</Label>
          <Select value={severityFilter} onValueChange={setSeverityFilter}>
            <SelectTrigger className="w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все</SelectItem>
              <SelectItem value="normal">Обычные</SelectItem>
              <SelectItem value="critical">Критические</SelectItem>
              <SelectItem value="suggestion">Предложения</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Обновить
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Всего отзывов</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{summary?.total ?? 0}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Критические</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold text-destructive">
            {summary?.critical ?? 0}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Предложения</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{summary?.suggestions ?? 0}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Средние оценки</CardTitle>
          </CardHeader>
          <CardContent className="space-y-0.5 text-sm">
            <div>Удобство: <b>{(summary?.avgConvenience ?? 0).toFixed(1)}</b></div>
            <div>Скорость: <b>{(summary?.avgSpeed ?? 0).toFixed(1)}</b></div>
            <div>Стабильность: <b>{(summary?.avgStability ?? 0).toFixed(1)}</b></div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Частые проблемы</CardTitle>
          </CardHeader>
          <CardContent>
            {frequent.length === 0 ? (
              <div className="text-sm text-muted-foreground">Повторяющихся жалоб не обнаружено.</div>
            ) : (
              <ul className="space-y-1.5">
                {frequent.map(([text, n]) => (
                  <li key={text} className="flex items-start justify-between gap-2 text-sm">
                    <span className="line-clamp-2">{text}</span>
                    <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold">
                      ×{n}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">По ролям</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5 text-sm">
              {FEEDBACK_ROLES.map((r) => (
                <li key={r} className="flex justify-between">
                  <span>{ROLE_LABELS[r]}</span>
                  <b>{summary?.byRole?.[r] ?? 0}</b>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Последние отзывы</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Загрузка…
            </div>
          ) : items.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">Пока нет отзывов</div>
          ) : (
            (items as Array<Record<string, unknown>>).slice(0, 50).map((row) => {
              const r = row as {
                id: string;
                created_at: string;
                user_name: string | null;
                role: string;
                route_label: string | null;
                good: string | null;
                bad: string | null;
                broken: string | null;
                unclear: string | null;
                needed: string | null;
                comment: string | null;
                rating_convenience: number;
                rating_speed: number;
                rating_stability: number;
                severity: string;
              };
              return (
                <div key={r.id} className="rounded-lg border border-border p-3 text-sm">
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{new Date(r.created_at).toLocaleString("ru-RU")}</span>
                    <span>·</span>
                    <span>{r.user_name ?? "—"}</span>
                    <span>·</span>
                    <span className="rounded bg-secondary px-1.5 py-0.5 font-medium text-foreground">
                      {ROLE_LABELS[r.role as AppRole] ?? r.role}
                    </span>
                    {r.route_label ? <span>· Маршрут: {r.route_label}</span> : null}
                    {r.severity === "critical" ? (
                      <span className="rounded bg-destructive/15 px-1.5 py-0.5 text-destructive">
                        Критическое
                      </span>
                    ) : null}
                    {r.severity === "suggestion" ? (
                      <span className="rounded bg-blue-100 px-1.5 py-0.5 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
                        Предложение
                      </span>
                    ) : null}
                    <span>· У: {r.rating_convenience} · С: {r.rating_speed} · Ст: {r.rating_stability}</span>
                  </div>
                  <div className="grid gap-1 sm:grid-cols-2">
                    {r.good ? <div><b>Удобно:</b> {r.good}</div> : null}
                    {r.bad ? <div><b>Неудобно:</b> {r.bad}</div> : null}
                    {r.broken ? <div><b>Ломается:</b> {r.broken}</div> : null}
                    {r.unclear ? <div><b>Непонятно:</b> {r.unclear}</div> : null}
                    {r.needed ? <div><b>Добавить:</b> {r.needed}</div> : null}
                    {r.comment ? <div><b>Комментарий:</b> {r.comment}</div> : null}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function FeedbackPage() {
  const { roles } = useAuth();
  const isAdmin = roles.includes("admin") || roles.includes("director");

  // Роль по умолчанию — первая подходящая роль пользователя, иначе driver
  const defaultRole = useMemo<AppRole>(() => {
    const found = FEEDBACK_ROLES.find((r) => roles.includes(r));
    return found ?? "driver";
  }, [roles]);

  const [tab, setTab] = useState<string>(defaultRole);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto w-full max-w-[1200px] px-3 py-6 sm:px-4 lg:px-6">
        <div className="mb-5">
          <h1 className="text-2xl font-bold">Обратная связь</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Расскажите о пилотном запуске: что удобно, что мешает, что нужно улучшить.
          </p>
        </div>

        <Tabs value={tab} onValueChange={setTab} className="space-y-4">
          <TabsList className="flex h-auto flex-wrap">
            {FEEDBACK_ROLES.map((r) => (
              <TabsTrigger key={r} value={r}>
                {ROLE_LABELS[r]}
              </TabsTrigger>
            ))}
            {isAdmin ? <TabsTrigger value="summary">Сводка</TabsTrigger> : null}
          </TabsList>

          {FEEDBACK_ROLES.map((r) => (
            <TabsContent key={r} value={r}>
              <FeedbackForm role={r} />
            </TabsContent>
          ))}

          {isAdmin ? (
            <TabsContent value="summary">
              <AdminSummary />
            </TabsContent>
          ) : null}
        </Tabs>
      </main>
    </div>
  );
}
