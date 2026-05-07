import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchListViaApi } from "@/lib/api-client";
import { APP_ROLES, ROLE_LABELS, type AppRole } from "@/lib/auth/roles";
import { useAuth } from "@/lib/auth/auth-context";
import { toast } from "sonner";
import { LogIn, Search, UserCheck, ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/admin/impersonate")({
  head: () => ({ meta: [{ title: "Войти как пользователь — Радиус Трек" }] }),
  beforeLoad: ({ context }) => {
    // Контекст auth тут недоступен на старте; жёсткий guard — внутри компонента.
    void context;
  },
  component: ImpersonatePage,
});

type UserRow = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  is_active: boolean;
  roles?: AppRole[];
  phone?: string | null;
  status?: "invited" | "active" | "blocked";
};

function ImpersonatePage() {
  const { user, roles: myRoles, startImpersonation, impersonation } = useAuth();
  const isAdmin = myRoles.includes("admin");

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<AppRole | "all">("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["impersonate-users", user?.id ?? null],
    enabled: isAdmin && !!user,
    queryFn: async () => {
      const res = await fetchListViaApi<UserRow>("/api/users", { limit: 200 });
      return Array.isArray(res.rows) ? res.rows : [];
    },
  });

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows
      .filter((u) => u.user_id !== user?.id)
      .filter((u) => (u.status ?? "active") !== "invited")
      .filter((u) => {
        if (roleFilter === "all") return true;
        return (u.roles ?? []).includes(roleFilter);
      })
      .filter((u) => {
        if (!s) return true;
        return (
          (u.full_name ?? "").toLowerCase().includes(s) ||
          (u.email ?? "").toLowerCase().includes(s) ||
          (u.phone ?? "").toLowerCase().includes(s)
        );
      });
  }, [rows, search, roleFilter, user?.id]);

  const impersonateMut = useMutation({
    mutationFn: async (targetUserId: string) => {
      setBusyId(targetUserId);
      await startImpersonation(targetUserId);
    },
    onSuccess: () => {
      toast.success("Включен режим просмотра");
      setTimeout(() => window.location.assign("/"), 200);
    },
    onError: (e: Error) => {
      setBusyId(null);
      toast.error(e.message || "Не удалось войти как пользователь");
    },
  });

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="mx-auto max-w-2xl px-4 py-12">
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
            <ShieldAlert className="mx-auto mb-3 h-8 w-8 text-destructive" />
            <h1 className="text-lg font-semibold">Доступ запрещён</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Раздел доступен только администраторам.
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold">
              <UserCheck className="h-6 w-6" />
              Войти как пользователь
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Откройте кабинет любого пользователя в режиме просмотра. JWT и сессия не подменяются — действия логируются в аудит.
            </p>
          </div>
          {impersonation && (
            <Badge variant="outline" className="border-amber-500 text-amber-700">
              Сейчас активен режим: {impersonation.profile.full_name ?? impersonation.profile.email}
            </Badge>
          )}
        </div>

        <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_220px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по ФИО, email или телефону…"
              className="pl-9"
            />
          </div>
          <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as AppRole | "all")}>
            <SelectTrigger>
              <SelectValue placeholder="Все роли" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все роли</SelectItem>
              {APP_ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {ROLE_LABELS[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-lg border bg-card">
          {isLoading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Загрузка…</div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Пользователи не найдены
            </div>
          ) : (
            <ul className="divide-y">
              {filtered.map((u) => {
                const userRoles = (u.roles ?? []) as AppRole[];
                const blocked = !u.is_active;
                return (
                  <li
                    key={u.user_id}
                    className="flex flex-wrap items-center gap-3 p-3 sm:p-4"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">
                          {u.full_name ?? u.email ?? "Без имени"}
                        </span>
                        {blocked && (
                          <Badge variant="destructive" className="text-[10px]">
                            заблокирован
                          </Badge>
                        )}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {u.email ?? "—"}
                        {u.phone ? ` · ${u.phone}` : ""}
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {userRoles.length === 0 ? (
                          <Badge variant="outline" className="text-[10px]">
                            без роли
                          </Badge>
                        ) : (
                          userRoles.map((r) => (
                            <Badge key={r} variant="secondary" className="text-[10px]">
                              {ROLE_LABELS[r] ?? r}
                            </Badge>
                          ))
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      className="gap-1.5"
                      disabled={
                        impersonateMut.isPending || busyId === u.user_id || userRoles.length === 0
                      }
                      title={
                        userRoles.length === 0
                          ? "У пользователя нет ролей"
                          : "Открыть кабинет (только просмотр)"
                      }
                      onClick={() => impersonateMut.mutate(u.user_id)}
                    >
                      <LogIn className="h-4 w-4" />
                      {busyId === u.user_id ? "Открываем…" : "Открыть как пользователя"}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          Найдено: {filtered.length} из {rows.length}
        </p>
      </main>
    </div>
  );
}

// suppress unused redirect import in case TanStack tree-shakes
void redirect;
