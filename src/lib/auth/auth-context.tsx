import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { fetchProfileViaApi, fetchUserRolesViaApi } from "@/lib/api-client";
import type { AppRole } from "./roles";

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
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

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
    throw new Error(msg);
  }
  return data;
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
      await postJson("/api/auth/login", { email, password });
      await refreshSession();
    },
    [refreshSession],
  );

  const signOut = useCallback(async () => {
    try {
      await postJson("/api/auth/logout", {});
    } catch {
      /* ignore */
    }
    setUser(null);
    setProfile(null);
    setRoles([]);
  }, []);

  const refresh = useCallback(async () => {
    await refreshSession();
  }, [refreshSession]);

  return (
    <AuthContext.Provider
      value={{ loading, user, profile, roles, loadError, signIn, signOut, refresh }}
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
