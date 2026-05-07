import { useNavigate } from "@tanstack/react-router";
import { LogOut, UserCheck } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { toast } from "sonner";

export function ImpersonationBanner() {
  const { impersonation, stopImpersonation, realProfile } = useAuth();
  const navigate = useNavigate();

  if (!impersonation) return null;

  const name =
    impersonation.profile.full_name ||
    impersonation.profile.email ||
    impersonation.targetUserId;
  const roleLabel =
    impersonation.roles.length > 0
      ? impersonation.roles.map((r) => ROLE_LABELS[r] ?? r).join(", ")
      : "—";

  const handleExit = async () => {
    try {
      await stopImpersonation();
      toast.success("Возврат в админ-панель");
      navigate({ to: "/users" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось выйти из режима");
    }
  };

  return (
    <div className="sticky top-0 z-[60] w-full bg-amber-500 text-amber-950 shadow-md">
      <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center gap-3 px-3 py-2 text-sm">
        <UserCheck className="h-4 w-4 shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="font-semibold">Вы вошли как:</span>{" "}
          <span className="truncate">{name}</span>{" "}
          <span className="opacity-80">({roleLabel})</span>
          <span className="ml-2 rounded bg-amber-900/20 px-1.5 py-0.5 text-xs">
            только просмотр
          </span>
          {realProfile?.full_name && (
            <span className="ml-2 hidden text-xs opacity-70 sm:inline">
              · админ: {realProfile.full_name}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleExit}
          className="inline-flex items-center gap-1.5 rounded-md bg-amber-950 px-3 py-1.5 text-xs font-medium text-amber-50 hover:bg-amber-900"
        >
          <LogOut className="h-3.5 w-3.5" />
          Вернуться в админ-панель
        </button>
      </div>
    </div>
  );
}
