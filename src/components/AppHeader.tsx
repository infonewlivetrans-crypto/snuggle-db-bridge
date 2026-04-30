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
} from "lucide-react";
import { useState } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { Sheet, SheetContent, SheetTitle, SheetDescription, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { NotificationsBell } from "@/components/NotificationsBell";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  match: (p: string) => boolean;
};

// Основные разделы — показываются на широком экране
const PRIMARY_NAV: readonly NavItem[] = [
  { to: "/", label: "Заказы", icon: BarChart3, match: (p) => p === "/" },
  { to: "/transport-requests", label: "Заявки на транспорт", icon: ClipboardList, match: (p) => p.startsWith("/transport-requests") && !p.startsWith("/transport-requests/picker") },
  { to: "/transport-requests/picker", label: "Подбор заказов", icon: ClipboardList, match: (p) => p.startsWith("/transport-requests/picker") },
  { to: "/delivery-routes", label: "Маршруты", icon: RouteIcon, match: (p) => p.startsWith("/delivery-routes") },
  { to: "/logist", label: "Кабинет логиста", icon: ClipboardList, match: (p) => p.startsWith("/logist") },
  { to: "/route-reports", label: "Отчёты", icon: FileText, match: (p) => p.startsWith("/route-reports") },
];

// Второстепенные — в выпадающем меню «Ещё»
const MORE_NAV: readonly NavItem[] = [
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
];

export function AppHeader() {
  const location = useLocation();
  const path = location.pathname;
  const [open, setOpen] = useState(false);

  const moreActive = MORE_NAV.find((it) => it.match(path));
  const activeItem = ALL_NAV.find((it) => it.match(path));

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background">
      <div className="mx-auto flex h-14 w-full max-w-[1440px] items-center justify-between gap-2 px-3 sm:gap-4 sm:px-4 lg:px-6 xl:h-16">
        {/* Левая часть: бургер (на узких) + логотип */}
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          {/* Бургер: показывается на экранах < 1440px */}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 min-[1440px]:hidden"
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
                {ALL_NAV.map((item) => {
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

          {/* Логотип — фиксированная ширина, не сжимается */}
          <Link
            to="/"
            search={{ orderId: undefined }}
            className="flex w-[40px] shrink-0 items-center"
            aria-label="На главную"
          >
            <BrandLogo size={32} />
          </Link>

          {/* Активный раздел — текстовый индикатор только на узких экранах */}
          {activeItem ? (
            <div className="ml-1 min-w-0 truncate text-sm font-semibold text-foreground sm:ml-2 min-[1440px]:hidden">
              {activeItem.label}
            </div>
          ) : null}
        </div>

        {/* Горизонтальная навигация — только на широком экране (>= 1366px) */}
        <nav className="hidden min-w-0 flex-1 items-center justify-center gap-1 min-[1440px]:flex">
          {PRIMARY_NAV.map((item) => {
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
              {MORE_NAV.map((item) => {
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
          <div className="hidden text-right md:block">
            <div className="text-sm font-medium leading-tight text-foreground">Менеджер логистики</div>
            <div className="text-xs text-muted-foreground">Радиус Трек</div>
          </div>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-foreground text-sm font-semibold text-background">
            МЛ
          </div>
        </div>
      </div>
    </header>
  );
}
