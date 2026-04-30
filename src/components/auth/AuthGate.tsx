import type { ReactNode } from "react";
import { useLocation } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth/auth-context";
import { LoginPage } from "@/components/auth/LoginPage";
import { canAccess } from "@/lib/auth/roles";
import { AppHeader } from "@/components/AppHeader";

const PUBLIC_PREFIXES = ["/d/"]; // публичные ссылки водителя по токену

export function AuthGate({ children }: { children: ReactNode }) {
  const { loading, user, profile, roles } = useAuth();
  const location = useLocation();
  const path = location.pathname;

  // Публичные маршруты — без проверки
  if (PUBLIC_PREFIXES.some((p) => path.startsWith(p))) return <>{children}</>;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Загрузка…
      </div>
    );
  }

  if (!user) return <LoginPage />;

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

  return <>{children}</>;
}
