// Тёмный вертикальный layout кабинета AI-диспетчера.
// Используется на всех страницах /dispatcher/* кроме публичных
// /dispatcher/register/$token, /dispatcher/invite/$token, /dispatcher/join.
//
// Замена AppHeader в этом контуре. Сохраняет тот же набор сервисных меню
// (профиль, выход, уведомления), но даёт обособленный кабинет с боковым
// меню и фирменным брендингом «RADIUS TRACK / AI Dispatcher».
import { Link, useLocation } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import {
  LayoutDashboard,
  MapPin,
  PackageSearch,
  Building2,
  User,
  Truck,
  Briefcase,
  Wallet,
  ListChecks,
  FileText,
  Settings,
  Sparkles,
  Bell,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { NotificationsBell } from "@/components/NotificationsBell";
import { useAuth } from "@/lib/auth/auth-context";
import { cn } from "@/lib/utils";

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  match?: (p: string) => boolean;
};

const NAV: readonly NavItem[] = [
  { to: "/dispatcher", label: "Обзор", icon: LayoutDashboard, match: (p) => p === "/dispatcher" || p === "/dispatcher/" },
  { to: "/dispatcher/map", label: "Карта машин", icon: MapPin },
  { to: "/dispatcher/freights", label: "Найденные грузы", icon: PackageSearch },
  { to: "/dispatcher/carriers", label: "Перевозчики", icon: Building2 },
  { to: "/dispatcher/drivers", label: "Водители", icon: User },
  { to: "/dispatcher/vehicles", label: "Транспорт", icon: Truck },
  { to: "/dispatcher/deals", label: "Рейсы / Сделки", icon: Briefcase },
  { to: "/dispatcher/commissions", label: "Комиссии", icon: Wallet },
  { to: "/dispatcher/tasks", label: "Задачи", icon: ListChecks },
  { to: "/dispatcher/documents", label: "Документы", icon: FileText },
  { to: "/dispatcher/settings", label: "Настройки", icon: Settings },
];

function SidebarContent({ onItemClick }: { onItemClick?: () => void }) {
  const pathname = useLocation({ select: (l) => l.pathname });
  return (
    <div className="flex h-full flex-col bg-[#121212] text-white">
      {/* Бренд */}
      <div className="flex items-center gap-2.5 px-5 pt-5 pb-6">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#FFC107] text-[#121212]">
          <Sparkles className="h-5 w-5" strokeWidth={2.5} />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-bold leading-tight tracking-tight">RADIUS TRACK</div>
          <div className="text-[11px] uppercase tracking-wider text-white/55">AI Dispatcher</div>
        </div>
      </div>

      {/* Меню */}
      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        <ul className="space-y-1">
          {NAV.map((item) => {
            const Icon = item.icon;
            const isActive = item.match
              ? item.match(pathname)
              : pathname === item.to || pathname.startsWith(item.to + "/");
            return (
              <li key={item.to}>
                <Link
                  to={item.to}
                  onClick={onItemClick}
                  className={cn(
                    "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-[#FFC107] text-[#121212]"
                      : "text-white/75 hover:bg-white/[0.06] hover:text-white",
                  )}
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* AI-помощник */}
      <div className="m-3 rounded-xl bg-white/[0.04] p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-[#FFC107]" />
          AI-помощник
        </div>
        <p className="mt-2 text-xs leading-relaxed text-white/60">
          Найдёт грузы, предложит маршруты и поможет принять решение
        </p>
        <Button
          asChild
          size="sm"
          className="mt-3 w-full bg-[#FFC107] text-[#121212] hover:bg-[#ffcb33]"
        >
          <Link to="/dispatcher/ai-analyze" onClick={onItemClick}>
            Спросить AI
          </Link>
        </Button>
      </div>
    </div>
  );
}

export function DispatcherShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { profile, signOut } = useAuth();

  const displayName =
    profile?.full_name?.trim() || profile?.email || "AI-Диспетчер";

  return (
    <div className="flex min-h-screen w-full bg-[#F5F6F7]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 lg:block">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 border-0 bg-[#121212] p-0 text-white">
          <SheetTitle className="sr-only">Меню AI-диспетчера</SheetTitle>
          <SidebarContent onItemClick={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Right side */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-background/95 px-3 backdrop-blur sm:px-6">
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Открыть меню"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>

          <div className="ml-auto flex items-center gap-2">
            <NotificationsBell />
            <div className="hidden items-center gap-2 rounded-lg px-2 py-1 sm:flex">
              <div className="grid h-8 w-8 place-items-center rounded-full bg-[#FFC107]/20 text-[#121212]">
                <User className="h-4 w-4" />
              </div>
              <div className="min-w-0 text-right leading-tight">
                <div className="truncate text-sm font-medium text-foreground">{displayName}</div>
                <div className="text-[11px] text-muted-foreground">AI-Диспетчер</div>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => void signOut()}
              aria-label="Выйти"
              title="Выйти"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

export default DispatcherShell;
