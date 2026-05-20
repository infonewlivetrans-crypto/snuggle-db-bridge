import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchAppVersion,
  type SystemSetting,
  type AppVersion,
  APP_CLIENT_PLATFORM,
} from "@/lib/system-settings";
import { fetchSystemSettingsViaApi } from "@/lib/api-client";

const SETTINGS_QUERY_KEY = ["system-settings"] as const;
const VERSION_QUERY_KEY = ["app-version", APP_CLIENT_PLATFORM] as const;

// system_settings — кэш 30 минут (через сервер): меняются редко,
// дёргать на каждом переходе по разделам не нужно.
const STALE_TIME = 30 * 60 * 1000;
const GC_TIME = 60 * 60 * 1000;

const DEFAULT_SETTINGS: SystemSetting[] = [];

interface SettingsContextValue {
  settings: Map<string, SystemSetting>;
  isLoading: boolean;
  getSetting: <T = unknown>(key: string, fallback?: T) => T;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

/**
 * Подгружает системные настройки один раз, кэширует через React Query
 * и подписывается на realtime-изменения, чтобы инвалидация происходила
 * автоматически без перезапросов из компонентов.
 */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: SETTINGS_QUERY_KEY,
    queryFn: async () => {
      try {
        return await fetchSystemSettingsViaApi<SystemSetting>();
      } catch {
        // Если system_settings долго не отвечает — используем дефолты.
        return DEFAULT_SETTINGS;
      }
    },
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    retry: 1,
  });

  // Префетч версии приложения с тем же кэшем — её слушает AppVersionGate.
  useQuery({
    queryKey: VERSION_QUERY_KEY,
    queryFn: () => fetchAppVersion(),
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  // Realtime отключён намеренно: production backend на radius-track.ru не
  // отдаёт WebSocket-канал Supabase, и попытка прямого подключения из
  // браузера к wss://*.supabase.co/realtime/* приводила к
  // ERR_CONNECTION_REFUSED и каскадным ошибкам в консоли на каждой странице.
  // Актуальность system_settings/app_versions поддерживается обычными
  // react-query refetch'ами (staleTime/refetchOnWindowFocus).
  useEffect(() => {
    return;
  }, [queryClient]);

  const value = useMemo<SettingsContextValue>(() => {
    const map = new Map<string, SystemSetting>();
    for (const s of data ?? []) map.set(s.setting_key, s);
    return {
      settings: map,
      isLoading,
      getSetting: <T,>(key: string, fallback?: T): T => {
        const s = map.get(key);
        return (s ? (s.setting_value as T) : (fallback as T));
      },
    };
  }, [data, isLoading]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

/** Получить все системные настройки (Map по ключу). */
export function useSystemSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSystemSettings must be used inside <SettingsProvider>");
  return ctx;
}

/** Получить значение одной настройки с типобезопасным fallback. */
export function useSetting<T = unknown>(key: string, fallback?: T): T {
  const { getSetting } = useSystemSettings();
  return getSetting<T>(key, fallback);
}
