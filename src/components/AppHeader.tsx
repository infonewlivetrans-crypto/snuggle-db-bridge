import { Link, useLocation } from "@tanstack/react-router";
import {
  BarChart3,
  Route as RouteIcon,
  Building2,
  User,
  Truck,
  Warehouse,
  Settings,
  Menu,
  PackageSearch,
  Receipt,
  ClipboardList,
  Bell,
  FileText,
} from "lucide-react";
import { useState } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { Sheet, SheetContent, SheetTitle, SheetDescription, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { NotificationsBell } from "@/components/NotificationsBell";

const NAV_ITEMS = [
  { to: "/", label: "Заказы", icon: BarChart3, match: (p: string) => p === "/" },
  { to: "/transport-requests", label: "Заявки на транспорт", icon: ClipboardList, match: (p: string) => p.startsWith("/transport-requests") },
  { to: "/delivery-routes", label: "Маршруты", icon: RouteIcon, match: (p: string) => p.startsWith("/delivery-routes") },
  { to: "/logist", label: "Кабинет логиста", icon: ClipboardList, match: (p: string) => p.startsWith("/logist") },
  { to: "/route-reports", label: "Отчёты по маршрутам", icon: FileText, match: (p: string) => p.startsWith("/route-reports") },
  { to: "/director", label: "Отчёт руководителя", icon: BarChart3, match: (p: string) => p.startsWith("/director") },
  { to: "/routes", label: "Маршруты (план)", icon: RouteIcon, match: (p: string) => p.startsWith("/routes") },
  { to: "/carriers", label: "Перевозчики", icon: Building2, match: (p: string) => p.startsWith("/carriers") },
  { to: "/drivers", label: "Водители", icon: User, match: (p: string) => p.startsWith("/drivers") },
  { to: "/vehicles", label: "Авто", icon: Truck, match: (p: string) => p.startsWith("/vehicles") },
  { to: "/warehouses", label: "Склады", icon: Warehouse, match: (p: string) => p.startsWith("/warehouses") },
  { to: "/supply", label: "Снабжение", icon: PackageSearch, match: (p: string) => p.startsWith("/supply") },
  { to: "/notifications", label: "Уведомления", icon: Bell, match: (p: string) => p.startsWith("/notifications") },
  { to: "/admin/tariffs", label: "Тарифы", icon: Receipt, match: (p: string) => p.startsWith("/admin/tariffs") },
  { to: "/admin/settings", label: "Настройки", icon: Settings, match: (p: string) => p.startsWith("/admin") && !p.startsWith("/admin/tariffs") },
] as const;

export function AppHeader() {
  const location = useLocation();
  const path = location.pathname;
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:gap-6 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3 md:gap-8">
          {/* Мобильное меню — гамбургер */}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label="Открыть меню"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetTitle className="sr-only">Навигация</SheetTitle>
              <SheetDescription className="sr-only">
                Главное меню приложения «Радиус Трек»
              </SheetDescription>
              <div className="border-b border-border px-5 py-4">
                <BrandLogo size={32} />
              </div>
              <nav className="flex flex-col gap-1 p-3">
                {NAV_ITEMS.map((item) => {
                  const active = item.match(path);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={() => setOpen(false)}
                      className={`inline-flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
                        active
                          ? "bg-foreground text-background"
                          : "text-foreground hover:bg-secondary"
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  );
                })}
              </nav>
            </SheetContent>
          </Sheet>

          <Link to="/" search={{ orderId: undefined }} className="flex min-w-0 items-center">
            {/* На самых узких показываем только знак, чтобы не ломать шапку */}
            <span className="md:hidden">
              <BrandLogo size={32} />
            </span>
            <span className="hidden md:inline-flex">
              <BrandLogo size={36} />
            </span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {NAV_ITEMS.map((item) => {
              const active = item.match(path);
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    active
                      ? "bg-foreground text-background"
                      : "text-foreground hover:bg-secondary"
                  }`}
                >
                  <span className="inline-flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <NotificationsBell />
          <div className="hidden text-right sm:block">
            <div className="text-sm font-medium text-foreground">Менеджер логистики</div>
            <div className="text-xs text-muted-foreground">Радиус Трек</div>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-foreground text-sm font-semibold text-background">
            МЛ
          </div>
        </div>
      </div>
    </header>
  );
}
