import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, Circle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/system-test")({
  head: () => ({
    meta: [
      { title: "Тест системы — Радиус Трек" },
      { name: "description", content: "Чек-лист проверки минимального рабочего контура: водитель → отчёт → менеджер." },
    ],
  }),
  component: SystemTestPage,
});

type Status = "pending" | "ok" | "error";

type Item = {
  id: string;
  title: string;
  hint?: string;
};

type State = Record<string, { status: Status; comment: string }>;

const ITEMS: Item[] = [
  { id: "1", title: "Создать маршрут", hint: "Кабинет логиста / Маршруты → Создать" },
  { id: "2", title: "Добавить точки", hint: "В карточке маршрута — добавить точки доставки" },
  { id: "3", title: "Назначить водителя и машину" },
  { id: "4", title: "Проверить маршрут", hint: "Перевести в статус «Проверен»" },
  { id: "5", title: "Выдать маршрут водителю", hint: "Статус «Выдан водителю»" },
  { id: "6", title: "Открыть ссылку водителя", hint: "Создать ссылку и открыть её" },
  { id: "7", title: "Закрыть одну точку как «Доставлено»" },
  { id: "8", title: "Закрыть одну точку как «Не доставлено»" },
  { id: "9", title: "Закрыть одну точку как «Возврат на склад»" },
  { id: "10", title: "Завершить маршрут" },
  { id: "11", title: "Проверить уведомление менеджеру", hint: "Раздел «Уведомления»" },
  { id: "12", title: "Проверить отчёт по маршруту", hint: "Раздел «Отчёты по маршрутам»" },
  { id: "13", title: "Проверить отчёт руководителя", hint: "Раздел «Отчёт руководителя»" },
];

const STORAGE_KEY = "system_test_checklist_v1";

function loadState(): State {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as State;
  } catch {
    /* ignore */
  }
  return {};
}

function SystemTestPage() {
  const [state, setState] = useState<State>({});

  useEffect(() => {
    setState(loadState());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [state]);

  const setStatus = (id: string, status: Status) => {
    setState((s) => ({ ...s, [id]: { status, comment: s[id]?.comment ?? "" } }));
  };
  const setComment = (id: string, comment: string) => {
    setState((s) => ({ ...s, [id]: { status: s[id]?.status ?? "pending", comment } }));
  };

  const counts = ITEMS.reduce(
    (acc, it) => {
      const st = state[it.id]?.status ?? "pending";
      acc[st] += 1;
      return acc;
    },
    { pending: 0, ok: 0, error: 0 } as Record<Status, number>,
  );

  const reset = () => {
    if (confirm("Сбросить все отметки?")) setState({});
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Тест системы</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Чек-лист проверки минимального рабочего контура: водитель → отчёт → менеджер.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={reset}>
          <RotateCcw className="mr-2 h-4 w-4" /> Сбросить
        </Button>
      </div>

      <div className="mb-6 grid grid-cols-3 gap-2 text-sm">
        <div className="rounded-md border border-border bg-card px-3 py-2">
          <div className="text-xs text-muted-foreground">Выполнено</div>
          <div className="text-xl font-semibold text-green-600">{counts.ok}</div>
        </div>
        <div className="rounded-md border border-border bg-card px-3 py-2">
          <div className="text-xs text-muted-foreground">Ошибки</div>
          <div className="text-xl font-semibold text-red-600">{counts.error}</div>
        </div>
        <div className="rounded-md border border-border bg-card px-3 py-2">
          <div className="text-xs text-muted-foreground">Не проверено</div>
          <div className="text-xl font-semibold">{counts.pending}</div>
        </div>
      </div>

      <ol className="space-y-3">
        {ITEMS.map((it, idx) => {
          const cur = state[it.id] ?? { status: "pending" as Status, comment: "" };
          return (
            <li
              key={it.id}
              className="rounded-lg border border-border bg-card p-4 shadow-sm"
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 text-muted-foreground">
                  {cur.status === "ok" ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  ) : cur.status === "error" ? (
                    <XCircle className="h-5 w-5 text-red-600" />
                  ) : (
                    <Circle className="h-5 w-5" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium">
                    {idx + 1}. {it.title}
                  </div>
                  {it.hint && (
                    <div className="mt-0.5 text-xs text-muted-foreground">{it.hint}</div>
                  )}

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={cur.status === "ok" ? "default" : "outline"}
                      className={cur.status === "ok" ? "bg-green-600 hover:bg-green-700 text-white" : ""}
                      onClick={() => setStatus(it.id, cur.status === "ok" ? "pending" : "ok")}
                    >
                      Выполнено
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={cur.status === "error" ? "default" : "outline"}
                      className={cur.status === "error" ? "bg-red-600 hover:bg-red-700 text-white" : ""}
                      onClick={() => setStatus(it.id, cur.status === "error" ? "pending" : "error")}
                    >
                      Ошибка
                    </Button>
                  </div>

                  <Textarea
                    value={cur.comment}
                    onChange={(e) => setComment(it.id, e.target.value)}
                    placeholder="Комментарий…"
                    className="mt-3 min-h-[60px]"
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
