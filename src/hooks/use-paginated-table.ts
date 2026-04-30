import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { PageSize } from "@/components/DataTablePagination";

export type Order = { column: string; ascending?: boolean };

type Options = {
  /** Имя таблицы или view */
  table: string;
  /** Колонки select() */
  select: string;
  /** Сортировки (применяются по порядку) */
  order: Order[];
  page: number;
  pageSize: PageSize;
  /** Поисковая строка пользователя (уже после debounce) */
  search?: string;
  /** Поля для ilike-поиска (объединяются через OR) */
  searchColumns?: string[];
  /** Доп. фильтры eq() */
  eqFilters?: Record<string, string | number | boolean | null | undefined>;
  /** Уникальный префикс ключа кэша */
  queryKey: readonly unknown[];
  /** Включить запрос */
  enabled?: boolean;
};

function escapeIlike(s: string) {
  return s.replace(/[%_\\,]/g, (m) => `\\${m}`);
}

export function usePaginatedTable<T = unknown>(opts: Options) {
  const {
    table,
    select,
    order,
    page,
    pageSize,
    search,
    searchColumns,
    eqFilters,
    queryKey,
    enabled,
  } = opts;

  const fromIdx = (page - 1) * pageSize;
  const toIdx = fromIdx + pageSize - 1;

  return useQuery({
    queryKey: [...queryKey, page, pageSize, search ?? "", eqFilters ?? {}],
    enabled,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<{ rows: T[]; total: number }> => {
      let q = supabase.from(table).select(select, { count: "exact" });
      for (const o of order) {
        q = q.order(o.column, { ascending: o.ascending ?? false });
      }
      if (eqFilters) {
        for (const [k, v] of Object.entries(eqFilters)) {
          if (v === undefined || v === null || v === "" || v === "all") continue;
          q = q.eq(k, v);
        }
      }
      if (search && search.trim() && searchColumns && searchColumns.length > 0) {
        const s = escapeIlike(search.trim());
        const orExpr = searchColumns.map((c) => `${c}.ilike.%${s}%`).join(",");
        q = q.or(orExpr);
      }
      q = q.range(fromIdx, toIdx);
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as T[], total: count ?? 0 };
    },
  });
}
