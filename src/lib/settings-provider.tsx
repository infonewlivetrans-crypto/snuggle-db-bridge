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

// system_settings — кэш 10 минут (через сервер), realtime инвалидирует раньше.
const STALE_TIME = 10 * 60 * 1000;
const GC_TIME = 30 * 60 * 1000;

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
    queryFn: fetchAllSettings,
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
  });

  // Префетч версии приложения с тем же кэшем — её слушает AppVersionGate.
  useQuery({
    queryKey: VERSION_QUERY_KEY,
    queryFn: () => fetchAppVersion(),
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
  });

  // Realtime: одна подписка на провайдер, инвалидируем кэш при любых изменениях.
  useEffect(() => {
    const channel = supabase
      .channel("system-settings-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "system_settings" },
        () => {
          queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "app_versions" },
        () => {
          queryClient.invalidateQueries({ queryKey: VERSION_QUERY_KEY });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
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
