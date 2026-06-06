import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import { cn } from "@/lib/utils";

// Layout личного кабинета перевозчика.
// Дочерние страницы: /carrier (overview), /carrier/vehicles, /carrier/drivers,
// /carrier/trips. Доступ ограничен ролью carrier (см. src/lib/auth/roles.ts).

export const Route = createFileRoute("/carrier")({
  head: () => ({ meta: [{ title: "Кабинет перевозчика — Радиус Трек" }] }),
  component: CarrierLayout,
});

const TABS: Array<{ to: "/carrier" | "/carrier/vehicles" | "/carrier/drivers" | "/carrier/trips"; label: string; exact: boolean }> = [
  { to: "/carrier", label: "Мои данные", exact: true },
  { to: "/carrier/vehicles", label: "Мой транспорт", exact: false },
  { to: "/carrier/drivers", label: "Мои водители", exact: false },
  { to: "/carrier/trips", label: "Задания / рейсы", exact: false },
];

function CarrierLayout() {
  const location = useLocation();
  const path = location.pathname;
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto w-full max-w-[1200px] px-3 py-6 sm:px-4 lg:px-6">
        <div className="mb-5">
          <h1 className="text-2xl font-bold">Кабинет перевозчика</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Управляйте своими данными, транспортом, водителями и заданиями.
          </p>
        </div>
        <nav className="mb-5 flex flex-wrap gap-1 border-b border-border">
          {TABS.map((t) => {
            const active = t.exact ? path === t.to : path.startsWith(t.to);
            return (
              <Link
                key={t.to}
                to={t.to}
                className={cn(
                  "rounded-t-md border-b-2 px-3 py-2 text-sm transition",
                  active
                    ? "border-primary font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
        <Outlet />
      </main>
    </div>
  );
}
