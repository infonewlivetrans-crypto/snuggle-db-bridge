import { createFileRoute, Link } from "@tanstack/react-router";
import { DispatcherShell } from "@/components/dispatcher/DispatcherShell";
import { Settings as SettingsIcon, Link2, Users as UsersIcon } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";

export const Route = createFileRoute("/dispatcher/settings")({
  component: DispatcherSettingsPage,
});

function DispatcherSettingsPage() {
  const { roles } = useAuth();
  const isAdmin = roles.includes("admin");

  return (
    <DispatcherShell>
      <div className="mx-auto w-full max-w-[1100px] px-4 py-6 sm:px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Настройки</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Личные настройки кабинета AI-диспетчера.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <SettingsIcon className="h-4 w-4 text-[#FFC107]" />
              Профиль
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Управление личным профилем и уведомлениями.
            </p>
            <Link
              to="/workspace"
              className="mt-3 inline-block text-sm font-medium text-[#121212] underline-offset-4 hover:underline"
            >
              Открыть профиль →
            </Link>
          </div>

          {isAdmin ? (
            <>
              <div className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <UsersIcon className="h-4 w-4 text-[#FFC107]" />
                  Диспетчеры
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Пригласить нового диспетчера в кабинет.
                </p>
                <Link
                  to="/users/dispatchers"
                  className="mt-3 inline-block text-sm font-medium text-[#121212] underline-offset-4 hover:underline"
                >
                  Управление диспетчерами →
                </Link>
              </div>

              <div className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Link2 className="h-4 w-4 text-[#FFC107]" />
                  Инвайты перевозчиков
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Ссылки-приглашения для перевозчиков и водителей.
                </p>
                <Link
                  to="/users/invites"
                  className="mt-3 inline-block text-sm font-medium text-[#121212] underline-offset-4 hover:underline"
                >
                  Открыть инвайты →
                </Link>
              </div>
            </>
          ) : null}
        </div>

        <div className="mt-6 rounded-xl border border-dashed border-border bg-card/40 p-6 text-sm text-muted-foreground">
          Расширенные настройки кабинета AI-диспетчера появятся в следующих
          обновлениях: шаблоны документов, источники грузов, правила автоматических задач.
        </div>
      </div>
    </DispatcherShell>
  );
}
