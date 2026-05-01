import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { AppHeader } from "@/components/AppHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listAuditFn } from "@/lib/server-functions/audit.functions";
import { APP_ROLES, ROLE_LABELS, type AppRole } from "@/lib/auth/roles";
import { DataTablePagination } from "@/components/DataTablePagination";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { parseListSearch, useListSearch } from "@/hooks/use-list-search";
import { Search } from "lucide-react";

export const Route = createFileRoute("/audit-log")({
  validateSearch: (s: Record<string, unknown>) => parseListSearch(s, { pageSize: 50 }),
  head: () => ({ meta: [{ title: "Журнал действий — Радиус Трек" }] }),
  component: AuditLogPage,
});

const SECTIONS = ["auth", "orders", "routes", "warehouse", "supply", "import", "users"] as const;
const ACTIONS = ["login", "logout", "create", "update", "delete", "status_change", "role_change"] as const;

const ANY = "__any__";

function AuditLogPage() {
  const { page, pageSize, q, setPage, setPageSize, setQuery } = useListSearch();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [role, setRole] = useState<string>(ANY);
  const [section, setSection] = useState<string>(ANY);
  const [action, setAction] = useState<string>(ANY);

  // Локальное состояние строки поиска для мгновенного отклика, debounce → URL
  const [searchInput, setSearchInput] = useState(q);
  const debouncedSearch = useDebouncedValue(searchInput, 300);
  useEffect(() => {
    if (debouncedSearch !== q) setQuery(debouncedSearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const filters = useMemo(
    () => ({
      from: from ? new Date(from).toISOString() : null,
      to: to ? new Date(to).toISOString() : null,
      role: role === ANY ? null : role,
      section: section === ANY ? null : section,
      action: action === ANY ? null : action,
      search: q || null,
      page,
      pageSize,
    }),
    [from, to, role, section, action, q, page, pageSize],
  );

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["audit-log", filters],
    queryFn: () => listAuditFn({ data: filters }),
    placeholderData: keepPreviousData,
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Журнал действий
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Все действия пользователей в системе. Доступно администратору и руководителю.
          </p>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-6">
          <div className="space-y-1.5">
            <Label className="text-xs">С даты</Label>
            <Input type="datetime-local" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">По дату</Label>
            <Input type="datetime-local" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Поиск</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="ФИО, объект, действие"
                className="pl-8"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Роль</Label>
            <Select value={role} onValueChange={(v) => { setRole(v); setPage(1); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Все</SelectItem>
                {APP_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>{ROLE_LABELS[r as AppRole]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Раздел</Label>
            <Select value={section} onValueChange={(v) => { setSection(v); setPage(1); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Все</SelectItem>
                {SECTIONS.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Действие</Label>
            <Select value={action} onValueChange={(v) => { setAction(v); setPage(1); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Все</SelectItem>
                {ACTIONS.map((a) => (
                  <SelectItem key={a} value={a}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2 lg:col-span-6 flex justify-end">
            <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? "Обновление…" : "Обновить"}
            </Button>
          </div>
        </div>

        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {(error as Error).message}
          </div>
        ) : null}

        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/50 hover:bg-secondary/50">
                  <TableHead className="whitespace-nowrap">Дата и время</TableHead>
                  <TableHead>Пользователь</TableHead>
                  <TableHead>Роль</TableHead>
                  <TableHead>Раздел</TableHead>
                  <TableHead>Действие</TableHead>
                  <TableHead>Объект</TableHead>
                  <TableHead>Старое</TableHead>
                  <TableHead>Новое</TableHead>
                  <TableHead>IP / устройство</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={9} className="py-12 text-center text-muted-foreground">Данные загружаются…</TableCell></TableRow>
                ) : rows.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="py-12 text-center text-muted-foreground">Записей нет</TableCell></TableRow>
                ) : (
                  rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap text-xs">
                        {new Date(r.created_at).toLocaleString("ru-RU")}
                      </TableCell>
                      <TableCell className="text-sm">{r.user_name ?? r.user_id ?? "—"}</TableCell>
                      <TableCell className="text-sm">
                        {r.user_role ? ROLE_LABELS[r.user_role as AppRole] ?? r.user_role : "—"}
                      </TableCell>
                      <TableCell className="text-sm">{r.section ?? "—"}</TableCell>
                      <TableCell className="text-sm">{r.action}</TableCell>
                      <TableCell className="text-sm">
                        {r.object_label ? (
                          <span>
                            <span className="font-medium">{r.object_label}</span>
                            {r.object_type ? <span className="text-muted-foreground"> ({r.object_type})</span> : null}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">{r.object_type ?? "—"}</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate text-xs text-muted-foreground" title={r.old_value ? JSON.stringify(r.old_value) : ""}>
                        {r.old_value ? JSON.stringify(r.old_value) : "—"}
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate text-xs text-muted-foreground" title={r.new_value ? JSON.stringify(r.new_value) : ""}>
                        {r.new_value ? JSON.stringify(r.new_value) : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <div>{r.ip_address ?? "—"}</div>
                        {r.user_agent ? <div className="max-w-[180px] truncate" title={r.user_agent}>{r.user_agent}</div> : null}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <DataTablePagination
            page={page}
            pageSize={pageSize}
            total={total}
            isLoading={isFetching}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </div>
      </main>
    </div>
  );
}
