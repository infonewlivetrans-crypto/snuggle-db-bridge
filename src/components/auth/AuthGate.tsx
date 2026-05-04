import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "@tanstack/react-router";
import { getAuthMode, useAuth } from "@/lib/auth/auth-context";
import { LoginPage } from "@/components/auth/LoginPage";
import { SplashScreen } from "@/components/SplashScreen";
import { FirstAdminSetup } from "@/components/auth/FirstAdminSetup";
import { canAccess } from "@/lib/auth/roles";
import { AppHeader } from "@/components/AppHeader";
import { useEnabledModules, isPathEnabled, pathBelongsToModule, MODULE_LABELS, useLaunchMode, isPathVisibleInLaunchMode } from "@/lib/modules";

const PUBLIC_PREFIXES = ["/d/", "/invite/"]; // публичные ссылки: /d/ — токен водителя, /invite/ — обмен инвайт-токена на сессию

export function AuthGate({ children }: { children: ReactNode }) {
  const { loading, user, profile, roles, loadError, refresh } = useAuth();
  const location = useLocation();
  const path = location.pathname;
  const enabledModules = useEnabledModules();
  const launchMode = useLaunchMode();

  const [hasAdmin, setHasAdmin] = useState<boolean | null>(null);

  const checkAdmin = async () => {
    try {
      const res = await fetch("/api/auth/has-admin", { credentials: "same-origin" });
      const body = (await res.json().catch(() => null)) as { has_admin?: boolean } | null;
      setHasAdmin(Boolean(body?.has_admin ?? true));
    } catch {
      setHasAdmin(true);
    }
  };

  useEffect(() => {
    if (PUBLIC_PREFIXES.some((p) => path.startsWith(p))) return;
    if (getAuthMode() === "preview") {
      setHasAdmin(true);
      return;
    }
    if (user) {
      setHasAdmin(true);
      return;
    }
    checkAdmin();
  }, [user, path]);

  // Публичные маршруты — без проверки
  if (PUBLIC_PREFIXES.some((p) => path.startsWith(p))) return <>{children}</>;

  if (loading || hasAdmin === null) {
    return <SplashScreen />;
  }

  // Первый запуск — нет ни одного админа и пользователь не вошёл
  if (!user && !hasAdmin) {
    return (
      <FirstAdminSetup
        onCreated={async () => {
          setHasAdmin(true);
          await refresh();
        }}
      />
    );
  }

  if (!user) return <LoginPage />;

  if (loadError && !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold text-foreground">Не удалось загрузить профиль</h1>
          <p className="mt-2 text-sm text-muted-foreground">{loadError}</p>
          <button
            onClick={() => { void refresh(); }}
            className="mt-4 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Повторить
          </button>
        </div>
      </div>
    );
  }

  if (profile && profile.is_active === false) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold text-foreground">Учётная запись заблокирована</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Обратитесь к администратору системы.
          </p>
        </div>
      </div>
    );
  }

  if (!canAccess(path, roles)) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="mx-auto max-w-3xl px-4 py-16 text-center">
          <h1 className="text-2xl font-bold text-foreground">Нет доступа к этому разделу</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            У вашей роли нет прав на просмотр этой страницы.
          </p>
        </main>
      </div>
    );
  }

  // Модуль выключен в системных настройках — скрываем раздел даже при прямом переходе по URL
  if (!isPathEnabled(path, enabledModules)) {
    const moduleKey = pathBelongsToModule(path);
    const moduleLabel = moduleKey ? MODULE_LABELS[moduleKey] : "этот";
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="mx-auto max-w-3xl px-4 py-16 text-center">
          <h1 className="text-2xl font-bold text-foreground">Модуль отключён</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Раздел «{moduleLabel}» сейчас отключён в настройках системы.
            Включите модуль в «Настройки → Модули», чтобы продолжить работу.
          </p>
        </main>
      </div>
    );
  }

  // Минимальный режим запуска — скрываем всё, что не входит в базовый сценарий
  if (!isPathVisibleInLaunchMode(path, launchMode)) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="mx-auto max-w-3xl px-4 py-16 text-center">
          <h1 className="text-2xl font-bold text-foreground">Раздел недоступен</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Сейчас включён режим «Минимальный запуск». Этот раздел скрыт.
            Переключите режим в «Настройки → Модули», чтобы открыть полный набор разделов.
          </p>
        </main>
      </div>
    );
  }

  return <>{children}</>;
}
