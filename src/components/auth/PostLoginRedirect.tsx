import { useEffect, useRef } from "react";
import { useNavigate, useLocation } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth/auth-context";
import { landingPathForRoles, canAccess } from "@/lib/auth/roles";

/**
 * После успешного входа отправляет пользователя в его «домашний» раздел —
 * один раз за сессию. Если пользователь уже на разрешённой странице, ничего не делает.
 */
export function PostLoginRedirect() {
  const { user, roles, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectedFor = useRef<string | null>(null);

  useEffect(() => {
    if (loading || !user) return;
    if (redirectedFor.current === user.id) return;
    redirectedFor.current = user.id;

    const path = location.pathname;
    // Если пользователь зашёл на корневую или ему сюда нельзя — редиректим
    if (path === "/" || !canAccess(path, roles)) {
      const target = landingPathForRoles(roles);
      if (target !== path) {
        navigate({ to: target, search: target === "/" ? { orderId: undefined } : undefined as never });
      }
    }
  }, [loading, user, roles, location.pathname, navigate]);

  return null;
}
