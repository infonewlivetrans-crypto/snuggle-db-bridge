import { createFileRoute, Link } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";

export const Route = createFileRoute("/dispatcher/")({
  component: DispatcherHome,
});

const SECTIONS = [
  { to: "/dispatcher/freights", title: "Найденные грузы", desc: "Список грузов, добавленных вручную или через ИИ-анализ" },
  { to: "/dispatcher/deals", title: "Рейсы / сделки", desc: "Сделки с авто-расчётом комиссии 5%" },
  { to: "/dispatcher/commissions", title: "Комиссии", desc: "Контроль ожидаемых и просроченных комиссий" },
  { to: "/dispatcher/tasks", title: "Задачи на сегодня", desc: "Короткие задачи диспетчера" },
  { to: "/dispatcher/carriers", title: "Перевозчики", desc: "Справочник перевозчиков для подбора" },
  { to: "/dispatcher/drivers", title: "Водители", desc: "Свободные/занятые водители" },
  { to: "/dispatcher/vehicles", title: "Транспорт", desc: "Доступный транспорт по городам и типу кузова" },
  { to: "/dispatcher/ai-analyze", title: "ИИ-анализ груза", desc: "Вставьте текст груза — ИИ разберёт поля" },
];

function DispatcherHome() {
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-bold tracking-tight">AI-диспетчер</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Упрощённый режим работы — подбор грузов, контроль комиссий, задачи диспетчера.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SECTIONS.map((s) => (
            <Link
              key={s.to}
              to={s.to}
              className="rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary hover:bg-secondary"
            >
              <div className="text-base font-semibold text-foreground">{s.title}</div>
              <div className="mt-1 text-sm text-muted-foreground">{s.desc}</div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
