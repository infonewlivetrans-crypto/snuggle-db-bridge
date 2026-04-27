import { Link, useLocation } from "@tanstack/react-router";
import { Package, BarChart3, Route as RouteIcon, Building2, User, Truck, Warehouse } from "lucide-react";

export function AppHeader() {
  const location = useLocation();
  const path = location.pathname;

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-8">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary">
              <Package className="h-5 w-5 text-primary-foreground" strokeWidth={2.5} />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-bold tracking-tight text-foreground">РАДИУС ТРЕК</span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Логистика
              </span>
            </div>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            <Link
              to="/"
              className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                path === "/"
                  ? "bg-foreground text-background"
                  : "text-foreground hover:bg-secondary"
              }`}
            >
              <span className="inline-flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Заказы
              </span>
            </Link>
            <Link
              to="/routes"
              className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                path.startsWith("/routes")
                  ? "bg-foreground text-background"
                  : "text-foreground hover:bg-secondary"
              }`}
            >
              <span className="inline-flex items-center gap-2">
                <RouteIcon className="h-4 w-4" />
                Маршруты
              </span>
            </Link>
            <Link
              to="/carriers"
              className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                path.startsWith("/carriers")
                  ? "bg-foreground text-background"
                  : "text-foreground hover:bg-secondary"
              }`}
            >
              <span className="inline-flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Перевозчики
              </span>
            </Link>
            <Link
              to="/drivers"
              className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                path.startsWith("/drivers")
                  ? "bg-foreground text-background"
                  : "text-foreground hover:bg-secondary"
              }`}
            >
              <span className="inline-flex items-center gap-2">
                <User className="h-4 w-4" />
                Водители
              </span>
            </Link>
            <Link
              to="/vehicles"
              className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                path.startsWith("/vehicles")
                  ? "bg-foreground text-background"
                  : "text-foreground hover:bg-secondary"
              }`}
            >
              <span className="inline-flex items-center gap-2">
                <Truck className="h-4 w-4" />
                Авто
              </span>
            </Link>
            <Link
              to="/warehouses"
              className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                path.startsWith("/warehouses")
                  ? "bg-foreground text-background"
                  : "text-foreground hover:bg-secondary"
              }`}
            >
              <span className="inline-flex items-center gap-2">
                <Warehouse className="h-4 w-4" />
                Склады
              </span>
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-3">
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
