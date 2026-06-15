import * as React from "react";
import { AlertTriangle } from "lucide-react";

/**
 * Изолирует падения карты (Leaflet/тайлы/маркеры/cluster) от остального
 * кабинета AI-диспетчера. При ошибке показывает безопасный fallback,
 * сайт и dashboard продолжают работать.
 */
interface State {
  hasError: boolean;
  message?: string;
}

export class MapErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { hasError: false };

  static getDerivedStateFromError(err: unknown): State {
    return {
      hasError: true,
      message: err instanceof Error ? err.message : "unknown error",
    };
  }

  componentDidCatch(error: unknown) {
    console.error("[MapErrorBoundary] map crashed:", error);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="flex h-[55vh] min-h-[320px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-card/50 p-4 text-center sm:h-[60vh]">
        <AlertTriangle className="h-8 w-8 text-muted-foreground" />
        <div className="text-sm font-medium">Карта временно недоступна</div>
        <div className="max-w-md text-xs text-muted-foreground">
          Не удалось отобразить карту, но остальной кабинет продолжает работать.
          Список машин доступен в соответствующем разделе.
        </div>
      </div>
    );
  }
}
