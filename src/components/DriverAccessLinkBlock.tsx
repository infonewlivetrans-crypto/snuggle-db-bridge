import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link2, Copy, Plus, Power, PowerOff, Calendar } from "lucide-react";
import { toast } from "sonner";
import { useMemo } from "react";

type Row = {
  driver_access_token: string | null;
  driver_access_created_at: string | null;
  driver_access_created_by: string | null;
  driver_access_enabled: boolean;
};

function generateToken(): string {
  // 32 hex chars
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function DriverAccessLinkBlock({ deliveryRouteId }: { deliveryRouteId: string }) {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["driver-access-link", deliveryRouteId],
    queryFn: async (): Promise<Row | null> => {
      const { data, error } = await (supabase
        .from("delivery_routes")
        .select(
          "driver_access_token, driver_access_created_at, driver_access_created_by, driver_access_enabled",
        )
        .eq("id", deliveryRouteId)
        .maybeSingle() as unknown as Promise<{ data: Row | null; error: Error | null }>);
      if (error) throw error;
      return data;
    },
  });

  const fullUrl = useMemo(() => {
    if (!data?.driver_access_token) return "";
    if (typeof window === "undefined") return `/d/${data.driver_access_token}`;
    return `${window.location.origin}/d/${data.driver_access_token}`;
  }, [data?.driver_access_token]);

  const create = useMutation({
    mutationFn: async () => {
      const token = generateToken();
      const { error } = await (supabase
        .from("delivery_routes")
        .update({
          driver_access_token: token,
          driver_access_created_at: new Date().toISOString(),
          driver_access_created_by: "Менеджер",
          driver_access_enabled: true,
        })
        .eq("id", deliveryRouteId) as unknown as Promise<{ error: Error | null }>);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Ссылка для водителя создана");
      qc.invalidateQueries({ queryKey: ["driver-access-link", deliveryRouteId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await (supabase
        .from("delivery_routes")
        .update({ driver_access_enabled: enabled })
        .eq("id", deliveryRouteId) as unknown as Promise<{ error: Error | null }>);
      if (error) throw error;
    },
    onSuccess: (_d, enabled) => {
      toast.success(enabled ? "Доступ открыт" : "Доступ к маршруту закрыт");
      qc.invalidateQueries({ queryKey: ["driver-access-link", deliveryRouteId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const copyLink = async () => {
    if (!fullUrl) return;
    try {
      await navigator.clipboard.writeText(fullUrl);
      toast.success("Ссылка скопирована");
    } catch {
      toast.error("Не удалось скопировать");
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Link2 className="h-4 w-4 text-primary" />
        Доступ водителя по ссылке
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Загрузка…</div>
      ) : !data?.driver_access_token ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Создайте уникальную ссылку — водитель откроет только этот маршрут, без доступа к
            другим маршрутам и настройкам.
          </p>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => create.mutate()}
            disabled={create.isPending}
          >
            <Plus className="h-4 w-4" />
            Создать ссылку для водителя
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input value={fullUrl} readOnly className="text-xs sm:text-sm" />
            <Button size="sm" variant="outline" className="gap-1.5" onClick={copyLink}>
              <Copy className="h-4 w-4" />
              Скопировать ссылку
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {data.driver_access_created_at && (
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                Создана:{" "}
                {new Date(data.driver_access_created_at).toLocaleString("ru-RU", {
                  dateStyle: "short",
                  timeStyle: "short",
                })}
              </span>
            )}
            <span>
              Статус:{" "}
              <span
                className={
                  data.driver_access_enabled
                    ? "font-medium text-emerald-700 dark:text-emerald-300"
                    : "font-medium text-rose-700 dark:text-rose-300"
                }
              >
                {data.driver_access_enabled ? "доступ открыт" : "доступ закрыт"}
              </span>
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            {data.driver_access_enabled ? (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-rose-700 hover:text-rose-800 dark:text-rose-300"
                onClick={() => toggle.mutate(false)}
                disabled={toggle.isPending}
              >
                <PowerOff className="h-4 w-4" />
                Закрыть доступ водителю
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => toggle.mutate(true)}
                disabled={toggle.isPending}
              >
                <Power className="h-4 w-4" />
                Открыть доступ
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => create.mutate()}
              disabled={create.isPending}
            >
              Перевыпустить ссылку
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
