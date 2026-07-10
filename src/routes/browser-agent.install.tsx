// Установка Radius Track Agent — подробный мастер из 6 шагов.
// Скачивание прямо со страницы, без ручных операций с dist/.
import { createFileRoute } from "@tanstack/react-router";
import { DispatcherShell } from "@/components/dispatcher/DispatcherShell";
import { Card } from "@/components/ui/card";
import { AgentDownloadButton } from "@/components/ai-dispatcher/AgentDownloadButton";
import {
  useAgentRelease,
  formatBytes,
} from "@/lib/ai-dispatcher/agent-release";
import { detectDeviceSupport } from "@/lib/ai-dispatcher/device-support";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/browser-agent/install")({
  head: () => ({
    meta: [
      { title: "Установка Radius Track Agent" },
      { name: "description", content: "Скачивание и пошаговая установка расширения Radius Track Agent для Chrome." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: InstallPage,
});

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="flex-none w-7 h-7 rounded-full bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center">
        {n}
      </div>
      <div className="flex-1 space-y-2 pt-0.5">
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-sm text-muted-foreground space-y-2">{children}</div>
      </div>
    </div>
  );
}

function InstallPage() {
  const { release, loading, error } = useAgentRelease();
  const support = detectDeviceSupport();

  return (
    <DispatcherShell>
      <main className="mx-auto w-full max-w-[760px] px-4 py-6 sm:px-6 space-y-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">
            Установка Radius Track Agent
          </h1>
          <p className="text-sm text-muted-foreground">
            Radius Track Agent — это расширение для Chrome, которое автоматически
            ищет подходящие грузы на ATI. Установите его один раз, затем агент
            подключается автоматически при каждом входе в Радиус Трек.
          </p>
        </div>

        {!support.supported && (
          <Card className="p-3 border-amber-300 bg-amber-50 dark:bg-amber-950/20">
            <div className="flex items-start gap-2 text-sm text-amber-900 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                Похоже, вы открыли страницу в{" "}
                <strong>{support.browserLabel}</strong>. Расширение работает только в{" "}
                <strong>Chrome</strong> (или другом Chromium-браузере) на компьютере.
                Скачать архив можно и сейчас, но установка возможна только в Chrome.
              </div>
            </div>
          </Card>
        )}

        {error && (
          <Card className="p-3 border-destructive/40 bg-destructive/10">
            <div className="flex items-start gap-2 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                Не удалось получить сведения о последней версии агента. Обновите
                страницу или попробуйте позже.
              </div>
            </div>
          </Card>
        )}

        <Card className="p-4 space-y-5">
          <Step n={1} title="Скачайте архив с расширением">
            <p>
              Нажмите кнопку ниже. Мы предлагаем последнюю совместимую версию
              агента.
            </p>
            <div className="pt-1">
              <AgentDownloadButton release={release} loading={loading} />
            </div>
            {release && (
              <p className="text-xs text-muted-foreground pt-1">
                Файл: <code>{release.fileName}</code> · размер{" "}
                {formatBytes(release.sizeBytes)} · SHA-256{" "}
                <code className="break-all">{release.sha256.slice(0, 16)}…</code>
              </p>
            )}
          </Step>

          <Step n={2} title="Распакуйте архив">
            <p>
              Найдите скачанный <code>.zip</code>-файл и распакуйте его в удобную
              постоянную папку — например, <code>Документы/RadiusTrackAgent</code>.
              Не удаляйте эту папку после установки: Chrome загружает расширение
              напрямую из неё.
            </p>
          </Step>

          <Step n={3} title="Откройте страницу расширений Chrome">
            <p>
              В адресной строке Chrome введите{" "}
              <code className="text-foreground">chrome://extensions</code> и
              нажмите Enter.
            </p>
          </Step>

          <Step n={4} title="Включите «Режим разработчика»">
            <p>
              В правом верхнем углу страницы расширений включите переключатель{" "}
              <strong>«Режим разработчика»</strong>. Появятся дополнительные кнопки.
            </p>
          </Step>

          <Step n={5} title="Загрузите распакованное расширение">
            <p>
              Нажмите <strong>«Загрузить распакованное расширение»</strong> и
              выберите папку, куда вы распаковали архив на шаге 2. В списке
              появится <strong>Radius Track Browser Agent</strong>.
            </p>
          </Step>

          <Step n={6} title="Вернитесь в Радиус Трек и подключите агент">
            <p>
              Откройте AI-диспетчер в Радиус Треке и нажмите{" "}
              <strong>«Подключить агент»</strong>. Дальше расширение подключается
              автоматически при каждом входе.
            </p>
          </Step>
        </Card>

        <Card className="p-4">
          <div className="flex items-start gap-2 text-sm">
            <CheckCircle2 className="h-5 w-5 mt-0.5 shrink-0 text-primary" />
            <div className="space-y-1">
              <div className="font-semibold">Обновления</div>
              <p className="text-sm text-muted-foreground">
                Когда выйдет новая версия, Радиус Трек предложит скачать её на этой
                же странице. Обновление ставится тем же способом: скачать → заменить
                файлы в папке → нажать «Обновить» на <code>chrome://extensions</code>.
              </p>
            </div>
          </div>
        </Card>

        <p className="text-xs text-muted-foreground">
          Работает только в Chrome и других Chromium-браузерах (Edge, Brave, Yandex)
          на компьютере. API ATI не используется, пароли и cookies ATI не читаются.
        </p>
      </main>
    </DispatcherShell>
  );
}
