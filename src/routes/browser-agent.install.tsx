import { createFileRoute } from "@tanstack/react-router";
import { DispatcherShell } from "@/components/dispatcher/DispatcherShell";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/browser-agent/install")({
  head: () => ({
    meta: [
      { title: "Установка Radius Track Agent" },
      { name: "description", content: "Пошаговая установка расширения Radius Track Agent для Chrome." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: InstallPage,
});

function InstallPage() {
  return (
    <DispatcherShell>
      <main className="mx-auto w-full max-w-[720px] px-4 py-6 sm:px-6 space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Установка Radius Track Agent</h1>
        <p className="text-sm text-muted-foreground">
          Radius Track Agent — это расширение Chrome для автоматического поиска грузов на ATI.
          Установите его один раз, после этого агент подключается автоматически.
        </p>

        <Card className="p-4 space-y-3">
          <div className="text-sm font-semibold">Три шага</div>
          <ol className="text-sm list-decimal list-inside space-y-2 text-muted-foreground">
            <li>
              Скачайте или получите папку расширения{" "}
              <code className="text-foreground">browser-agent/dist</code>.
            </li>
            <li>
              Откройте <code className="text-foreground">chrome://extensions</code>,
              включите переключатель «Режим разработчика» в правом верхнем углу.
            </li>
            <li>
              Нажмите «Загрузить распакованное расширение» и выберите папку{" "}
              <code className="text-foreground">browser-agent/dist</code>.
            </li>
          </ol>
        </Card>

        <Card className="p-4 space-y-2">
          <div className="text-sm font-semibold">После установки</div>
          <p className="text-sm text-muted-foreground">
            Вернитесь в AI-диспетчер и нажмите «Подключить агент». Дальше расширение
            подключается автоматически при каждом входе.
          </p>
        </Card>

        <p className="text-xs text-muted-foreground">
          Работает только в Chrome (и Chromium-браузерах) на компьютере.
        </p>
      </main>
    </DispatcherShell>
  );
}
