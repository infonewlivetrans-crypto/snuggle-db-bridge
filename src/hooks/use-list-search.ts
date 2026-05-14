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
): { page: number; pageSize: PageSize; q: string } {
  const rawSize = Number(search.pageSize);
  const pageSize = (PAGE_SIZE_OPTIONS as readonly number[]).includes(rawSize)
    ? (rawSize as PageSize)
    : (defaults.pageSize ?? 25);
  const page = Math.max(1, Math.floor(Number(search.page) || 1));
  const q = typeof search.q === "string" ? search.q : "";
  return { page, pageSize, q };
}

/** Хук: читает page/pageSize/q из URL и обновляет их без потери остальных параметров. */
export function useListSearch() {
  const raw = useSearch({ strict: false }) as Record<string, unknown>;
  const navigate = useNavigate();
  const { page, pageSize, q } = parseListSearch(raw);

  const update = (
    patch: Partial<{ page: number; pageSize: PageSize; q: string }>,
  ) => {
    navigate({
      to: ".",
      search: (prev: Record<string, unknown>) => ({ ...prev, ...patch }),
      replace: true,
    } as never);
  };

  return {
    page,
    pageSize,
    q,
    setPage: (p: number) => update({ page: Math.max(1, p) }),
    setPageSize: (size: PageSize) => update({ pageSize: size, page: 1 }),
    setQuery: (next: string) => update({ q: next, page: 1 }),
  };
}
