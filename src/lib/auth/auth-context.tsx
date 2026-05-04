import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  authHeaders,
  fetchProfileViaApi,
  fetchUserRolesViaApi,
  setLocalSessionTokens,
  clearLocalSessionTokens,
} from "@/lib/api-client";
import { APP_ROLES, type AppRole } from "./roles";

type Profile = {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  is_active: boolean;
  carrier_id?: string | null;
};

type SessionUser = { id: string; email: string | null };

type AuthContextValue = {
  loading: boolean;
  user: SessionUser | null;
  /** @deprecated cookie-сессия, поле оставлено для обратной совместимости компонентов */
  session: { access_token?: string } | null;
  profile: Profile | null;
  roles: AppRole[];
  loadError: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  diagnoseSignIn: (
    email: string,
    password: string,
    onStep: (message: string) => void,
  ) => Promise<{ user: SessionUser; roles: AppRole[] }>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

type AuthMeResponse = {
  id?: string | null;
  email?: string | null;
  name?: string | null;
  role?: AppRole | string | null;
};

function toFriendlyAuthError(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error || "");
  const lower = msg.toLowerCase();
  if (lower.includes("invalid") || lower.includes("неверн")) {
    return "Неверный email или пароль";
  }
  if (lower.includes("failed to fetch") || lower.includes("network")) {
    return "Ошибка авторизации: сервер недоступен";
  }
  return msg || "Ошибка авторизации";
}

async function postJson(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    credentials: "same-origin",
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      (data as { error?: string } | null)?.error || `HTTP ${res.status}`;
    console.error(`[auth] POST ${path} failed:`, res.status, data);
    throw new Error(msg);
  }
  return data;
}

async function fetchAuthMe(): Promise<{ status: number; body: AuthMeResponse | null }> {
  const res = await fetch("/api/auth/me", {
    credentials: "same-origin",
    headers: { accept: "application/json", ...authHeaders() },
  });
  const body = (await res.json().catch(() => null)) as AuthMeResponse | null;
  return { status: res.status, body };
}

function normalizeRole(role: AuthMeResponse["role"]): AppRole | null {
  return typeof role === "string" && (APP_ROLES as readonly string[]).includes(role)
    ? (role as AppRole)
    : null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadProfileAndRoles = useCallback(async () => {
    try {
      setLoadError(null);
      const [prof, rolesData] = await Promise.all([
        fetchProfileViaApi(),
        fetchUserRolesViaApi(),
      ]);
      setProfile((prof as Profile | null) ?? null);
      setRoles((rolesData as AppRole[]) ?? []);
    } catch (e) {
      setLoadError(
        e instanceof Error
          ? e.message
          : "Не удалось загрузить профиль. Проверьте соединение.",
      );
    }
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/session", {
        credentials: "same-origin",
      });
      const body = (await res.json().catch(() => null)) as {
        user_id?: string | null;
      } | null;
      const uid = body?.user_id ?? null;
      if (uid) {
        setUser({ id: uid, email: null });
        await loadProfileAndRoles();
      } else {
        setUser(null);
        setProfile(null);
        setRoles([]);
      }
    } catch {
      setUser(null);
      setProfile(null);
      setRoles([]);
    }
  }, [loadProfileAndRoles]);

  // Подмешиваем email из профиля в user, чтобы не ломать компоненты, читающие user.email.
  useEffect(() => {
    if (!user) return;
    if (profile?.email && profile.email !== user.email) {
      setUser({ id: user.id, email: profile.email });
    }
  }, [profile, user]);

  useEffect(() => {
    refreshSession().finally(() => setLoading(false));
  }, [refreshSession]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const result = (await postJson("/api/auth/login", {
        email,
        password,
      })) as {
        ok?: boolean;
        access_token?: string;
        refresh_token?: string;
      } | null;
      // Сохраняем токены в localStorage как fallback для окружений,
      // где httpOnly cookie блокируется (например, Lovable preview iframe).
      if (result?.access_token && result.refresh_token) {
        setLocalSessionTokens({
          access_token: result.access_token,
          refresh_token: result.refresh_token,
        });
      }
      await refreshSession();
    },
    [refreshSession],
  );

  const signOut = useCallback(async () => {
    try {
      await postJson("/api/auth/logout", {});
    } catch (e) {
      console.error("[auth] logout failed", e);
    }
    clearLocalSessionTokens();
    setUser(null);
    setProfile(null);
    setRoles([]);
  }, []);

  const refresh = useCallback(async () => {
    await refreshSession();
  }, [refreshSession]);

  return (
    <AuthContext.Provider
      value={{
        loading,
        user,
        session: user ? {} : null,
        profile,
        roles,
        loadError,
        signIn,
        signOut,
        refresh,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
