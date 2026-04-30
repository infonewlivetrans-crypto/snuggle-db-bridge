import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

type Props = {
  page: number;
  pageSize: PageSize;
  total: number;
  /** Показывать ли индикатор загрузки рядом с навигацией */
  isLoading?: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: PageSize) => void;
  /** Если true — total неизвестен (например, использован range без count) */
  unknownTotal?: boolean;
};

export function DataTablePagination({
  page,
  pageSize,
  total,
  isLoading,
  onPageChange,
  onPageSizeChange,
  unknownTotal,
}: Props) {
  const totalPages = unknownTotal ? page + 1 : Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, total);

  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-border bg-card/50 px-3 py-2 text-sm sm:flex-row">
      <div className="flex items-center gap-2 text-muted-foreground">
        {isLoading ? (
          <span className="inline-flex items-center gap-2">
            <span className="h-3 w-3 animate-pulse rounded-full bg-primary" />
            Данные загружаются…
          </span>
        ) : unknownTotal ? (
          <span>Страница {safePage}</span>
        ) : (
          <span>
            {total === 0 ? "Нет данных" : <>Показаны {from}–{to} из {total}</>}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className="hidden text-xs text-muted-foreground sm:inline">Строк на странице</span>
        <Select
          value={String(pageSize)}
          onValueChange={(v) => onPageSizeChange(Number(v) as PageSize)}
        >
          <SelectTrigger className="h-8 w-[80px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map((s) => (
              <SelectItem key={s} value={String(s)}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={safePage <= 1}
            onClick={() => onPageChange(1)}
            aria-label="Первая страница"
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={safePage <= 1}
            onClick={() => onPageChange(safePage - 1)}
            aria-label="Предыдущая страница"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="px-2 text-xs tabular-nums text-foreground">
            {safePage} / {unknownTotal ? "…" : totalPages}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={!unknownTotal && safePage >= totalPages}
            onClick={() => onPageChange(safePage + 1)}
            aria-label="Следующая страница"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          {!unknownTotal && (
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={safePage >= totalPages}
              onClick={() => onPageChange(totalPages)}
              aria-label="Последняя страница"
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
