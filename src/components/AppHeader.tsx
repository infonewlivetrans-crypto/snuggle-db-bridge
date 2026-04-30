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
  PlayCircle,
  ArrowLeftRight,
  FileSpreadsheet,
  ChevronDown,
  Users as UsersIcon,
  LogOut,
} from "lucide-react";
import { useState } from "react";
import { BrandLogo, BrandMark } from "@/components/BrandLogo";
import { Sheet, SheetContent, SheetTitle, SheetDescription, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { NotificationsBell } from "@/components/NotificationsBell";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth/auth-context";
import { canAccess, ROLE_LABELS } from "@/lib/auth/roles";

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  match: (p: string) => boolean;
};

// Основные разделы — показываются на широком экране (5 пунктов)
const PRIMARY_NAV: readonly NavItem[] = [
  { to: "/", label: "Заказы", icon: BarChart3, match: (p) => p === "/" },
  { to: "/transport-requests", label: "Заявки на транспорт", icon: ClipboardList, match: (p) => p.startsWith("/transport-requests") && !p.startsWith("/transport-requests/picker") },
  { to: "/transport-requests/picker", label: "Подбор заказов", icon: ClipboardList, match: (p) => p.startsWith("/transport-requests/picker") },
  { to: "/delivery-routes", label: "Маршруты", icon: RouteIcon, match: (p) => p.startsWith("/delivery-routes") },
  { to: "/logist", label: "Кабинет логиста", icon: ClipboardList, match: (p) => p.startsWith("/logist") },
];

// Второстепенные — в выпадающем меню «Ещё»
const MORE_NAV: readonly NavItem[] = [
  { to: "/route-reports", label: "Отчёты", icon: FileText, match: (p) => p.startsWith("/route-reports") },
  { to: "/director", label: "Отчёт руководителя", icon: BarChart3, match: (p) => p.startsWith("/director") },
  { to: "/routes", label: "Маршруты (план)", icon: RouteIcon, match: (p) => p.startsWith("/routes") },
  { to: "/carriers", label: "Перевозчики", icon: Building2, match: (p) => p.startsWith("/carriers") },
  { to: "/drivers", label: "Водители", icon: User, match: (p) => p.startsWith("/drivers") },
  { to: "/vehicles", label: "Авто", icon: Truck, match: (p) => p.startsWith("/vehicles") },
  { to: "/warehouses", label: "Склады", icon: Warehouse, match: (p) => p.startsWith("/warehouses") },
  { to: "/warehouse-today", label: "Склад сегодня", icon: Warehouse, match: (p) => p.startsWith("/warehouse-today") },
  { to: "/supply", label: "Снабжение", icon: PackageSearch, match: (p) => p.startsWith("/supply") },
  { to: "/data-import", label: "Импорт данных", icon: FileSpreadsheet, match: (p) => p.startsWith("/data-import") && !p.startsWith("/data-import/history") },
];

// Полный список — для бургер-меню (никакие страницы не теряются)
const ALL_NAV: readonly NavItem[] = [
  { to: "/workspace", label: "Рабочий стол", icon: BarChart3, match: (p) => p.startsWith("/workspace") },
  ...PRIMARY_NAV,
  ...MORE_NAV,
  { to: "/warehouse-settings", label: "Настройки склада", icon: Settings, match: (p) => p.startsWith("/warehouse-settings") },
  { to: "/warehouse-schedule", label: "График отгрузок", icon: ClipboardList, match: (p) => p.startsWith("/warehouse-schedule") },
  { to: "/warehouse-returns", label: "Возвраты", icon: ClipboardList, match: (p) => p.startsWith("/warehouse-returns") },
  { to: "/warehouse-inbound", label: "Приём товара", icon: PackageSearch, match: (p) => p.startsWith("/warehouse-inbound") },
  { to: "/warehouse-report", label: "Отчёт склада", icon: FileText, match: (p) => p.startsWith("/warehouse-report") },
  { to: "/warehouse-stock", label: "Остатки", icon: PackageSearch, match: (p) => p.startsWith("/warehouse-stock") },
  { to: "/warehouse-movements", label: "Движение товара", icon: ClipboardList, match: (p) => p.startsWith("/warehouse-movements") },
  { to: "/warehouse-transfers", label: "Перемещения", icon: ArrowLeftRight, match: (p) => p.startsWith("/warehouse-transfers") },
  { to: "/data-import/history", label: "История импорта", icon: FileSpreadsheet, match: (p) => p.startsWith("/data-import/history") },
  { to: "/notifications", label: "Уведомления", icon: Bell, match: (p) => p.startsWith("/notifications") },
  { to: "/admin/tariffs", label: "Тарифы", icon: Receipt, match: (p) => p.startsWith("/admin/tariffs") },
  { to: "/admin/settings", label: "Настройки", icon: Settings, match: (p) => p.startsWith("/admin") && !p.startsWith("/admin/tariffs") },
  { to: "/first-run", label: "Первый запуск", icon: PlayCircle, match: (p) => p.startsWith("/first-run") },
  { to: "/pilot", label: "Пилотный запуск", icon: PlayCircle, match: (p) => p.startsWith("/pilot") },
  { to: "/system-test", label: "Тест системы", icon: ClipboardList, match: (p) => p.startsWith("/system-test") },
  { to: "/system-issues", label: "Ошибки и доработки", icon: ClipboardList, match: (p) => p.startsWith("/system-issues") },
  { to: "/users", label: "Пользователи", icon: UsersIcon, match: (p) => p.startsWith("/users") },
];

export function AppHeader() {
  const location = useLocation();
  const path = location.pathname;
  const [open, setOpen] = useState(false);
  const { user, profile, roles, signOut } = useAuth();

  // Фильтруем пункты по ролям пользователя
  const visibleAll = ALL_NAV.filter((it) => canAccess(it.to, roles));
  const visiblePrimary = PRIMARY_NAV.filter((it) => canAccess(it.to, roles));
  const visibleMore = MORE_NAV.filter((it) => canAccess(it.to, roles));

  const moreActive = visibleMore.find((it) => it.match(path));
  const activeItem = visibleAll.find((it) => it.match(path));

  const initials = (profile?.full_name ?? user?.email ?? "?")
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const roleLabel = roles.length > 0 ? ROLE_LABELS[roles[0]] : "Пользователь";

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background">
      <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center justify-between gap-2 px-3 sm:gap-4 sm:px-4 lg:px-6 xl:h-[68px]">
        {/* Левая часть: бургер (на узких) + логотип */}
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          {/* Бургер: показывается на экранах < 1440px */}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 min-[1367px]:hidden"
                aria-label="Открыть меню"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-80 max-w-[85vw] p-0">
              <SheetTitle className="sr-only">Навигация</SheetTitle>
              <SheetDescription className="sr-only">
                Главное меню приложения «Радиус Трек»
              </SheetDescription>
              <div className="border-b border-border px-5 py-4">
                <BrandLogo size={32} />
              </div>
              <nav className="flex max-h-[calc(100vh-72px)] flex-col gap-1 overflow-y-auto p-3">
                {visibleAll.map((item) => {
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

          {/*
            Логотип в шапке.
            Требования:
            - высота: 36px на мобильном, 40px на ноутбуке, 44px на десктопе
            - min-width блока: 110 / 130 / 150 px
            - не сжимается, выровнен по центру
            - вторая строка скрывается при нехватке места
          */}
          <Link
            to="/"
            search={{ orderId: undefined }}
            className="flex shrink-0 items-center gap-2 self-center min-w-[110px] sm:gap-2.5 lg:min-w-[130px] xl:min-w-[150px]"
            aria-label="На главную — Радиус Трек"
          >
            {/* Знак — всегда видимый, читаемый размер */}
            <BrandMark
              size={36}
              className="shrink-0 lg:!h-10 lg:!w-10 xl:!h-11 xl:!w-11"
            />
            {/* Текстовая часть бренда — независимо от логотипа-картинки,
                чтобы корректно скрывать вторую строку и оставаться читаемой */}
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-[15px] font-extrabold tracking-tight text-foreground lg:text-base xl:text-[17px]">
                Радиус&nbsp;Трек
              </span>
              {/* Вторая строка — только на широких экранах, где есть место */}
              <span className="hidden truncate text-[10px] uppercase tracking-[0.14em] text-muted-foreground xl:inline">
                Логистика · Трекинг
              </span>
            </span>
          </Link>

          {/* Активный раздел — текстовый индикатор только на узких экранах */}
          {activeItem ? (
            <div className="ml-2 min-w-0 truncate text-sm font-semibold text-foreground min-[1367px]:hidden">
              {activeItem.label}
            </div>
          ) : null}
        </div>

        {/* Горизонтальная навигация — только на широком экране (>= 1440px) */}
        <nav className="hidden min-w-0 flex-1 items-center justify-center gap-1 min-[1367px]:flex">
          {visiblePrimary.map((item) => {
            const active = item.match(path);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-foreground text-background"
                    : "text-foreground hover:bg-secondary"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="whitespace-nowrap">{item.label}</span>
              </Link>
            );
          })}

          {/* Меню «Ещё» */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className={`h-9 shrink-0 gap-1 px-3 text-sm font-medium ${
                  moreActive ? "bg-foreground text-background hover:bg-foreground/90 hover:text-background" : ""
                }`}
              >
                <span className="whitespace-nowrap">
                  {moreActive ? moreActive.label : "Ещё"}
                </span>
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              {visibleMore.map((item) => {
                const Icon = item.icon;
                const active = item.match(path);
                return (
                  <DropdownMenuItem key={item.to} asChild>
                    <Link
                      to={item.to}
                      className={`flex w-full cursor-pointer items-center gap-2 ${
                        active ? "bg-secondary font-semibold" : ""
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>

        {/* Правая часть */}
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <NotificationsBell />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 rounded-full pr-1 transition-colors hover:bg-secondary">
                <div className="hidden text-right md:block">
                  <div className="text-sm font-medium leading-tight text-foreground">
                    {profile?.full_name ?? user?.email ?? "Пользователь"}
                  </div>
                  <div className="text-xs text-muted-foreground">{roleLabel}</div>
                </div>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-foreground text-sm font-semibold text-background">
                  {initials || "?"}
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                {profile?.email ?? user?.email}
              </div>
              <DropdownMenuSeparator />
              {roles.includes("admin") ? (
                <DropdownMenuItem asChild>
                  <Link to="/users" className="flex cursor-pointer items-center gap-2">
                    <UsersIcon className="h-4 w-4" />
                    Пользователи
                  </Link>
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onClick={() => signOut()} className="cursor-pointer text-destructive focus:text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                Выйти
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
