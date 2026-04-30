import { useNavigate, useSearch } from "@tanstack/react-router";
import type { PageSize } from "@/components/DataTablePagination";
import { PAGE_SIZE_OPTIONS } from "@/components/DataTablePagination";

export type ListSearch = {
  page?: number;
  pageSize?: PageSize;
  q?: string;
};

/** Валидатор для validateSearch роутов со списками. */
export function parseListSearch(
  search: Record<string, unknown>,
  defaults: { pageSize?: PageSize } = {},
): Required<Pick<ListSearch, "page" | "pageSize">> & { q: string } {
  const rawSize = Number(search.pageSize);
  const pageSize = (PAGE_SIZE_OPTIONS as readonly number[]).includes(rawSize)
    ? (rawSize as PageSize)
    : (defaults.pageSize ?? 25);
  const page = Math.max(1, Math.floor(Number(search.page) || 1));
  const q = typeof search.q === "string" ? search.q : "";
  return { page, pageSize, q };
}

/** Хук, возвращающий текущее состояние и сеттеры, синхронизированные с URL. */
export function useListSearch<TFrom extends string>(routePath: TFrom) {
  const search = useSearch({ from: routePath }) as Required<
    Pick<ListSearch, "page" | "pageSize">
  > & { q: string };
  const navigate = useNavigate();

  const update = (
    patch: Partial<{ page: number; pageSize: PageSize; q: string }>,
  ) => {
    navigate({
      to: routePath,
      search: (prev: Record<string, unknown>) => ({ ...prev, ...patch }),
      replace: true,
    });
  };

  return {
    page: search.page,
    pageSize: search.pageSize,
    q: search.q,
    setPage: (p: number) => update({ page: Math.max(1, p) }),
    setPageSize: (size: PageSize) => update({ pageSize: size, page: 1 }),
    setQuery: (q: string) => update({ q, page: 1 }),
  };
}
