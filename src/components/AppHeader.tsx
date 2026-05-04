// Шапка приложения «Радиус Трек».
//
// Структура:
// - Слева: логотип
// - Центр: 6 основных разделов (Рабочий стол, Логистика, Склад, Заказы,
//   Финансы, Отчёты). На средних экранах часть уезжает в «Ещё».
//   Администрирование доступно из меню пользователя и из «Ещё».
// - Справа: уведомления, бейдж «Демо-режим», блок пользователя.
//
// Маршруты НЕ меняются.
import { Link, useLocation } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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
  FileText,
  PlayCircle,
  ArrowLeftRight,
  FileSpreadsheet,
  Users as UsersIcon,
  LogOut,
  History,
  Database,
  AlertTriangle,
  MessageSquare,
  Activity,
  Sun,
  Upload,
  LayoutDashboard,
  Wallet,
  ShieldCheck,
  ChevronDown,
  Bell,
  UserCog,
  Link2,
} from "lucide-react";
import { BrandMark } from "@/components/BrandLogo";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { NotificationsBell } from "@/components/NotificationsBell";
import { DemoModeBadge } from "@/components/DemoModeBadge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useAuth } from "@/lib/auth/auth-context";
import { canAccess, ROLE_LABELS } from "@/lib/auth/roles";
import {
  useEnabledModules,
  isPathEnabled,
  useLaunchMode,
  isPathVisibleInLaunchMode,
} from "@/lib/modules";
import { cn } from "@/lib/utils";

type Icon = React.ComponentType<{ className?: string }>;

type NavItem = {
  to: string;
  label: string;
  icon: Icon;
};

type NavGroup = {
  id: string;
  label: string;
  icon: Icon;
  match: (p: string) => boolean;
  items: readonly NavItem[];
};

const GROUPS: readonly NavGroup[] = [
  {
    id: "workspace",
    label: "Рабочий стол",
    icon: LayoutDashboard,
    match: (p) =>
      p === "/" ||
      p.startsWith("/workspace") ||
      p.startsWith("/work-day") ||
      p.startsWith("/work-control") ||
      p.startsWith("/notifications"),
    items: [
      { to: "/", label: "Обзор", icon: LayoutDashboard },
      { to: "/workspace", label: "Рабочий стол", icon: LayoutDashboard },
      { to: "/work-day", label: "Рабочий день", icon: Sun },
      { to: "/work-control", label: "Контроль работы", icon: AlertTriangle },
      { to: "/notifications", label: "Уведомления", icon: Bell },
    ],
  },
  {
    id: "logistics",
    label: "Логистика",
    icon: RouteIcon,
    match: (p) =>
      p.startsWith("/transport-requests") ||
      p.startsWith("/delivery-routes") ||
      p.startsWith("/routes") ||
      p.startsWith("/logist") ||
      p.startsWith("/carriers") ||
      p.startsWith("/drivers") ||
      p.startsWith("/vehicles") ||
      p.startsWith("/carrier-offers") ||
      p.startsWith("/carrier-routes"),
    items: [
      { to: "/logist", label: "Кабинет логиста", icon: ClipboardList },
      { to: "/transport-requests", label: "Заявки на транспорт", icon: ClipboardList },
      { to: "/transport-requests/picker", label: "Подбор заказов", icon: ClipboardList },
      { to: "/delivery-routes", label: "Маршруты", icon: RouteIcon },
      { to: "/routes", label: "Рейсы (план)", icon: RouteIcon },
      { to: "/carrier-offers", label: "Предложения рейсов", icon: Truck },
      { to: "/carrier-routes", label: "Мои рейсы (перевозчик)", icon: RouteIcon },
      { to: "/carriers", label: "Перевозчики", icon: Building2 },
      { to: "/drivers", label: "Водители", icon: User },
      { to: "/vehicles", label: "Транспорт", icon: Truck },
    ],
  },
  {
    id: "warehouse",
    label: "Склад",
    icon: Warehouse,
    match: (p) =>
      p.startsWith("/warehouse") ||
      (p.startsWith("/warehouses") && !p.startsWith("/warehouse-")) ||
      p.startsWith("/supply"),
    items: [
      { to: "/warehouse-today", label: "Склад сегодня", icon: Warehouse },
      { to: "/warehouses", label: "Склады", icon: Warehouse },
      { to: "/warehouse-stock", label: "Остатки", icon: PackageSearch },
      { to: "/warehouse-inbound", label: "Приёмка", icon: PackageSearch },
      { to: "/warehouse-schedule", label: "Отгрузка (график)", icon: ClipboardList },
      { to: "/warehouse-returns", label: "Возвраты", icon: ClipboardList },
      { to: "/warehouse-movements", label: "Движение товара", icon: ClipboardList },
      { to: "/warehouse-transfers", label: "Перемещения между складами", icon: ArrowLeftRight },
      { to: "/warehouse-report", label: "Отчёт склада", icon: FileText },
      { to: "/warehouse-settings", label: "Настройки склада", icon: Settings },
      { to: "/supply", label: "Снабжение — обзор", icon: PackageSearch },
      { to: "/supply/requests", label: "Заявки на пополнение", icon: ClipboardList },
      { to: "/supply/cabinet", label: "Кабинет снабжения", icon: PackageSearch },
    ],
  },
  {
    id: "orders",
    label: "Заказы",
    icon: ClipboardList,
    match: (p) =>
      p.startsWith("/orders") ||
      p.startsWith("/data-import") ||
      p.startsWith("/upload"),
    items: [
      { to: "/orders", label: "Заказы и клиенты", icon: ClipboardList },
      { to: "/data-import", label: "Импорт заказов", icon: FileSpreadsheet },
      { to: "/data-import/history", label: "История импорта", icon: History },
      { to: "/upload", label: "Загрузка файлов", icon: Upload },
    ],
  },
  {
    id: "finance",
    label: "Финансы",
    icon: Wallet,
    match: (p) => p.startsWith("/carrier-payments") || p.startsWith("/admin/tariffs"),
    items: [
      { to: "/carrier-payments", label: "Оплаты перевозчикам", icon: Receipt },
      { to: "/admin/tariffs", label: "Тарифы", icon: Receipt },
    ],
  },
  {
    id: "reports",
    label: "Отчёты",
    icon: BarChart3,
    match: (p) => p.startsWith("/route-reports") || p.startsWith("/director"),
    items: [
      { to: "/route-reports", label: "Отчёты по рейсам", icon: FileText },
      { to: "/director", label: "Отчёт руководителя", icon: BarChart3 },
    ],
  },
  {
    id: "admin",
    label: "Администрирование",
    icon: ShieldCheck,
    match: (p) =>
      p.startsWith("/users") ||
      (p.startsWith("/admin") && !p.startsWith("/admin/tariffs")) ||
      p.startsWith("/audit-log") ||
      p.startsWith("/backups") ||
      p.startsWith("/system-errors") ||
      p.startsWith("/system-activity") ||
      p.startsWith("/system-issues") ||
      p.startsWith("/system-test") ||
      p.startsWith("/feedback") ||
      p.startsWith("/pilot-tasks") ||
      p.startsWith("/pilot") ||
      p.startsWith("/first-run"),
    items: [
      { to: "/users", label: "Пользователи и роли", icon: UsersIcon },
      { to: "/users/managers", label: "Менеджеры", icon: UserCog },
      { to: "/users/invites", label: "Инвайт-ссылки", icon: Link2 },
      { to: "/admin/settings", label: "Настройки модулей", icon: Settings },
      { to: "/audit-log", label: "Журнал действий", icon: History },
      { to: "/backups", label: "Резервные копии", icon: Database },
      { to: "/system-errors", label: "Ошибки системы", icon: AlertTriangle },
      { to: "/system-activity", label: "Активность системы", icon: Activity },
      { to: "/system-issues", label: "Ошибки и доработки", icon: ClipboardList },
      { to: "/system-test", label: "Тест системы", icon: ClipboardList },
      { to: "/feedback", label: "Обратная связь", icon: MessageSquare },
      { to: "/pilot-tasks", label: "Задачи пилота", icon: ClipboardList },
      { to: "/pilot", label: "Пилотный запуск", icon: PlayCircle },
      { to: "/first-run", label: "Первый запуск", icon: PlayCircle },
    ],
  },
];

// Главные пункты в центре. Админка уходит в «Ещё» / меню пользователя.
const PRIMARY_IDS = new Set([
  "workspace",
  "logistics",
  "warehouse",
  "orders",
  "finance",
  "reports",
]);

function GroupButton({
  group,
  isActive,
  className = "",
}: {
  group: NavGroup;
  isActive: boolean;
  className?: string;
}) {
  const GIcon = group.icon;
  const baseCls = cn(
    "inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
    isActive
      ? "bg-primary text-primary-foreground"
      : "text-foreground/80 hover:bg-secondary hover:text-foreground",
    className,
  );

  if (group.items.length === 1) {
    return (
      <Link to={group.items[0].to} className={baseCls}>
        <GIcon className="h-4 w-4" />
        <span className="whitespace-nowrap">{group.label}</span>
      </Link>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={baseCls}>
          <GIcon className="h-4 w-4" />
          <span className="whitespace-nowrap">{group.label}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-70" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="flex items-center gap-2">
          <GIcon className="h-4 w-4" />
          {group.label}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {group.items.map((item) => {
          const Icon = item.icon;
          return (
            <DropdownMenuItem key={item.to} asChild>
              <Link
                to={item.to}
                className="flex w-full cursor-pointer items-center gap-2"
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppHeader() {
  const location = useLocation();
  const path = location.pathname;
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, profile, roles, signOut } = useAuth();

  const enabledModules = useEnabledModules();
  const launchMode = useLaunchMode();

  const isItemVisible = (to: string) =>
    canAccess(to, roles) &&
    isPathEnabled(to, enabledModules) &&
    isPathVisibleInLaunchMode(to, launchMode);

  const visibleGroups = useMemo(() => {
    return GROUPS.map((g) => ({
      ...g,
      items: g.items.filter((it) => isItemVisible(it.to)),
    })).filter((g) => g.items.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roles.join("|"), JSON.stringify(enabledModules), launchMode]);

  const activeGroup =
    visibleGroups.find((g) => g.match(path)) ?? null;

  const initials = (profile?.full_name ?? user?.email ?? "?")
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const roleLabel = roles.length > 0 ? ROLE_LABELS[roles[0]] : "Пользователь";

  const primaryGroups = visibleGroups.filter((g) => PRIMARY_IDS.has(g.id));
  const extraGroups = visibleGroups.filter((g) => !PRIMARY_IDS.has(g.id));

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center gap-3 px-3 sm:px-4 lg:px-6">
        {/* ===== ЛЕВО: бургер + логотип ===== */}
        <div className="flex shrink-0 items-center gap-2">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 lg:hidden"
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
              <div className="flex items-center gap-2 border-b border-border px-5 py-4">
                <BrandMark size={32} />
                <span className="text-sm font-extrabold tracking-tight">
                  Радиус&nbsp;Трек
                </span>
              </div>
              <nav className="flex max-h-[calc(100vh-72px)] flex-col gap-1 overflow-y-auto p-2">
                {visibleGroups.map((g) => {
                  const GIcon = g.icon;
                  const isActive = activeGroup?.id === g.id;
                  return (
                    <Collapsible key={g.id} defaultOpen={isActive}>
                      <CollapsibleTrigger
                        className={cn(
                          "flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-sm font-semibold transition-colors",
                          isActive
                            ? "bg-primary text-primary-foreground"
                            : "text-foreground hover:bg-secondary",
                        )}
                      >
                        <span className="inline-flex min-w-0 items-center gap-2">
                          <GIcon className="h-4 w-4 shrink-0" />
                          <span className="truncate">{g.label}</span>
                        </span>
                        <ChevronDown className="h-4 w-4 shrink-0 transition-transform data-[state=open]:rotate-180" />
                      </CollapsibleTrigger>
                      <CollapsibleContent className="ml-2 mt-1 flex flex-col gap-0.5 border-l border-border pl-2">
                        {g.items.map((item) => {
                          const Icon = item.icon;
                          const itemActive =
                            path === item.to ||
                            (item.to !== "/" && path.startsWith(item.to + "/"));
                          return (
                            <Link
                              key={item.to}
                              to={item.to}
                              onClick={() => setMobileOpen(false)}
                              className={cn(
                                "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                                itemActive
                                  ? "bg-secondary font-semibold text-foreground"
                                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                              )}
                            >
                              <Icon className="h-4 w-4 shrink-0" />
                              <span className="truncate">{item.label}</span>
                            </Link>
                          );
                        })}
                      </CollapsibleContent>
                    </Collapsible>
                  );
                })}
              </nav>
            </SheetContent>
          </Sheet>

          <Link
            to="/"
            search={{ orderId: undefined }}
            className="flex shrink-0 items-center gap-2.5"
            aria-label="На главную — Радиус Трек"
          >
            <BrandMark size={34} className="shrink-0" />
            <span className="hidden flex-col leading-tight sm:flex">
              <span className="whitespace-nowrap text-[15px] font-extrabold tracking-tight text-foreground">
                Радиус&nbsp;Трек
              </span>
              <span className="hidden whitespace-nowrap text-[10px] uppercase tracking-[0.14em] text-muted-foreground xl:inline">
                Логистика · Трекинг
              </span>
            </span>
          </Link>
        </div>

        {/* ===== ЦЕНТР: основное меню ===== */}
        <nav className="hidden min-w-0 flex-1 items-center justify-center gap-1 lg:flex">
          {primaryGroups.map((g) => (
            <GroupButton
              key={g.id}
              group={g}
              isActive={activeGroup?.id === g.id}
              className={
                // На lg показываем первые 4, остальные на xl
                ["finance", "reports"].includes(g.id)
                  ? "hidden xl:inline-flex"
                  : ""
              }
            />
          ))}

          {/* «Ещё» — на lg..xl-1 содержит финансы+отчёты+админку, на xl+ только админку */}
          {(extraGroups.length > 0 || primaryGroups.some((g) => ["finance", "reports"].includes(g.id))) ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="ml-1 inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-foreground/80 transition-colors hover:bg-secondary hover:text-foreground"
                >
                  Ещё
                  <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                {[
                  ...primaryGroups.filter((g) =>
                    ["finance", "reports"].includes(g.id),
                  ),
                  ...extraGroups,
                ].map((g, idx, arr) => {
                  const GIcon = g.icon;
                  return (
                    <div key={g.id}>
                      <DropdownMenuLabel className="flex items-center gap-2">
                        <GIcon className="h-4 w-4" />
                        {g.label}
                      </DropdownMenuLabel>
                      {g.items.map((item) => {
                        const Icon = item.icon;
                        return (
                          <DropdownMenuItem key={item.to} asChild>
                            <Link
                              to={item.to}
                              className="flex w-full cursor-pointer items-center gap-2"
                            >
                              <Icon className="h-4 w-4 shrink-0" />
                              <span className="truncate">{item.label}</span>
                            </Link>
                          </DropdownMenuItem>
                        );
                      })}
                      {idx < arr.length - 1 ? <DropdownMenuSeparator /> : null}
                    </div>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </nav>

        {/* Спейсер для мобильных */}
        <div className="flex-1 lg:hidden" />

        {/* ===== ПРАВО: уведомления + демо + пользователь ===== */}
        <div className="flex shrink-0 items-center gap-2">
          <NotificationsBell />
          <DemoModeBadge />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 rounded-full p-1 pr-2 transition-colors hover:bg-secondary">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-foreground text-sm font-semibold text-background">
                  {initials || "?"}
                </div>
                <div className="hidden text-left md:block">
                  <div className="max-w-[160px] truncate text-sm font-medium leading-tight text-foreground">
                    {profile?.full_name ?? user?.email ?? "Пользователь"}
                  </div>
                  <div className="text-xs leading-tight text-muted-foreground">
                    {roleLabel}
                  </div>
                </div>
                <ChevronDown className="hidden h-3.5 w-3.5 opacity-60 md:inline" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <div className="px-2 py-1.5">
                <div className="text-sm font-medium text-foreground">
                  {profile?.full_name ?? user?.email}
                </div>
                <div className="text-xs text-muted-foreground">{roleLabel}</div>
              </div>
              <DropdownMenuSeparator />
              {roles.includes("admin") ? (
                <>
                  <DropdownMenuItem asChild>
                    <Link to="/users" className="flex cursor-pointer items-center gap-2">
                      <UsersIcon className="h-4 w-4" />
                      Пользователи и роли
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/admin/settings" className="flex cursor-pointer items-center gap-2">
                      <Settings className="h-4 w-4" />
                      Настройки модулей
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              ) : null}
              <DropdownMenuItem
                onClick={() => signOut()}
                className="cursor-pointer text-destructive focus:text-destructive"
              >
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
