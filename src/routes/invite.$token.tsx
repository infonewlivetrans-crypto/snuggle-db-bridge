import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SplashScreen } from "@/components/SplashScreen";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import { landingPathForRoles, type AppRole } from "@/lib/auth/roles";

export const Route = createFileRoute("/invite/$token")({
  head: () => ({ meta: [{ title: "Вход по ссылке — Радиус Трек" }] }),
  component: InviteLoginPage,
});

function InviteLoginPage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const triedRef = useRef(false);

  useEffect(() => {
    if (triedRef.current) return;
    triedRef.current = true;

    (async () => {
      try {
        const res = await fetch("/api/invite-login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const body = (await res.json().catch(() => null)) as
          | {
              access_token?: string;
              refresh_token?: string;
              role?: AppRole;
              error?: string;
            }
          | null;

        if (!res.ok || !body?.access_token || !body?.refresh_token) {
          throw new Error(body?.error || "Ссылка недействительна");
        }

        const { error: setErr } = await supabase.auth.setSession({
          access_token: body.access_token,
          refresh_token: body.refresh_token,
        });
        if (setErr) throw setErr;

        const role = body.role ?? "driver";
        const dest = landingPathForRoles([role as AppRole]);
        navigate({ to: dest, replace: true });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Не удалось войти по ссылке";
        console.error("[invite] login failed", e);
        setError(msg);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md text-center">
          <AlertTriangle className="mx-auto h-10 w-10 text-amber-500" />
          <h1 className="mt-3 text-xl font-semibold text-foreground">
            Не удалось войти по ссылке
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Попросите администратора перевыпустить ссылку или проверьте, что
            ссылка скопирована полностью.
          </p>
          <Button
            className="mt-4"
            variant="outline"
            onClick={() => window.location.reload()}
          >
            Повторить
          </Button>
        </div>
      </div>
    );
  }

  return <SplashScreen />;
}
