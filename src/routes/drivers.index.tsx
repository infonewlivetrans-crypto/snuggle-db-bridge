import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { db } from "@/lib/db";
import { AppHeader } from "@/components/AppHeader";
import { DriverFormDialog } from "@/components/DriverFormDialog";
import { ExportReportButton } from "@/components/ExportReportButton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { Carrier, Driver } from "@/lib/carriers";
import { Plus, Search, User } from "lucide-react";

export const Route = createFileRoute("/drivers/")({
  head: () => ({ meta: [{ title: "Водители — Радиус Трек" }] }),
  component: DriversPage,
});

function DriversPage() {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const { data: drivers, isLoading } = useQuery({
    queryKey: ["drivers"],
    queryFn: async (): Promise<Driver[]> => {
      const { data, error } = await db.from("drivers").select("*").order("full_name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: carriers } = useQuery({
    queryKey: ["carriers", "map"],
    queryFn: async (): Promise<Carrier[]> => {
      const { data, error } = await db.from("carriers").select("id, company_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const carrierMap = useMemo(() => {
    const m = new Map<string, string>();
    (carriers ?? []).forEach((c) => m.set(c.id, c.company_name));
    return m;
  }, [carriers]);

  const filtered = useMemo(() => {
    if (!drivers) return [];
    const q = search.toLowerCase();
    if (!q) return drivers;
    return drivers.filter(
      (d) =>
        d.full_name.toLowerCase().includes(q) ||
        (d.phone?.toLowerCase().includes(q) ?? false) ||
        (d.license_number?.toLowerCase().includes(q) ?? false),
    );
  }, [drivers, search]);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Водители</h1>
            <p className="mt-1 text-sm text-muted-foreground">Все водители перевозчиков</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ExportReportButton kind="drivers" label="Отчёт по водителям" />
            <Button onClick={() => setOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Добавить водителя
            </Button>
          </div>
        </div>

        <div className="mb-4 relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="ФИО, телефон, номер ВУ..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/50 hover:bg-secondary/50">
                <TableHead className="font-semibold">Водитель</TableHead>
                <TableHead className="font-semibold">Перевозчик</TableHead>
                <TableHead className="font-semibold">Телефон</TableHead>
                <TableHead className="font-semibold">ВУ</TableHead>
                <TableHead className="font-semibold">Статус</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">Загрузка...</TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center">
                    <User className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                    <div className="text-sm text-muted-foreground">Водителей нет</div>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {d.photo_url ? (
                          <img src={d.photo_url} alt={d.full_name} className="h-9 w-9 rounded-full object-cover" />
                        ) : (
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary">
                            <User className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                        <span className="font-medium text-foreground">{d.full_name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      <Link
                        to="/carriers/$carrierId"
                        params={{ carrierId: d.carrier_id }}
                        className="hover:text-primary"
                      >
                        {carrierMap.get(d.carrier_id) ?? "—"}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">{d.phone ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {d.license_number ?? "—"}
                      {d.license_categories && (
                        <span className="ml-1 text-foreground">· {d.license_categories}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {d.is_active ? (
                        <Badge variant="outline" className="border-green-200 bg-green-100 text-green-900">
                          Активен
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-border bg-secondary text-muted-foreground">
                          Неактивен
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </main>

      <DriverFormDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}
