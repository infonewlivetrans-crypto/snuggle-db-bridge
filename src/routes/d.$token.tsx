import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Lock } from "lucide-react";

export const Route = createFileRoute("/d/$token")({
  head: () => ({
    meta: [
      { title: "Маршрут водителя — Радиус Трек" },
      { name: "description", content: "Доступ водителя к маршруту по ссылке" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: DriverTokenGate,
});

type Resolved = {
  id: string;
  driver_access_enabled: boolean;
};

function DriverTokenGate() {
  const { token } = Route.useParams();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["driver-access-resolve", token],
    queryFn: async (): Promise<Resolved | null> => {
      const { data, error } = await (supabase
        .from("delivery_routes")
        .select("id, driver_access_enabled")
        .eq("driver_access_token", token)
        .maybeSingle() as unknown as Promise<{
        data: Resolved | null;
        error: Error | null;
      }>);
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        Загрузка…
      </div>
    );
  }

  if (isError || !data) {
    return <AccessClosed message="Ссылка недействительна" />;
  }

  if (!data.driver_access_enabled) {
    return <AccessClosed message="Доступ к маршруту закрыт" />;
  }

  return (
    <Navigate
      to="/driver/$deliveryRouteId"
      params={{ deliveryRouteId: data.id }}
      replace
    />
  );
}

function AccessClosed({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="max-w-sm rounded-lg border border-border bg-card p-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-300">
          <Lock className="h-6 w-6" />
        </div>
        <div className="text-base font-semibold">{message}</div>
        <div className="mt-1 text-sm text-muted-foreground">
          Обратитесь к менеджеру для получения новой ссылки.
        </div>
      </div>
    </div>
  );
}
