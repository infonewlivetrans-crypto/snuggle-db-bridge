import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { AppHeader } from "@/components/AppHeader";
import { CarrierFormDialog } from "@/components/CarrierFormDialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { importCarriersFn } from "@/lib/server-functions/managers.functions";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CARRIER_TYPE_LABELS,
  VERIFICATION_LABELS,
  VERIFICATION_ORDER,
  VERIFICATION_STYLES,
  type Carrier,
  type CarrierVerificationStatus,
} from "@/lib/carriers";
import { Search, Plus, Building2, ShieldCheck, Upload } from "lucide-react";

type ParsedCarrierRow = { fullName: string };

async function parseCarriersExcel(file: File): Promise<ParsedCarrierRow[]> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]!];
  if (!ws) return [];
  const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
  const rows: ParsedCarrierRow[] = [];
  for (const r of grid) {
    if (!Array.isArray(r)) continue;
    const fullName = String(r[0] ?? "").trim();
    if (!fullName) continue;
    if (/^(фио|перевозчик|водитель|name|full[_ ]?name|компания|организация)$/i.test(fullName)) continue;
    rows.push({ fullName });
  }
  return rows;
}

export const Route = createFileRoute("/carriers/")({
  head: () => ({
    meta: [{ title: "Перевозчики — Радиус Трек" }],
  }),
  component: CarriersPage,
});

function CarriersPage() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<CarrierVerificationStatus | "all">("all");
  const [createOpen, setCreateOpen] = useState(false);

  const { data: carriers, isLoading } = useQuery({
    queryKey: ["carriers"],
    queryFn: async (): Promise<Carrier[]> => {
      const { data, error } = await db
        .from("carriers")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    if (!carriers) return [];
    return carriers.filter((c) => {
      const q = search.toLowerCase();
      const matchSearch =
        !q ||
        c.company_name.toLowerCase().includes(q) ||
        (c.inn?.toLowerCase().includes(q) ?? false) ||
        (c.city?.toLowerCase().includes(q) ?? false);
      const matchStatus = filter === "all" || c.verification_status === filter;
      return matchSearch && matchStatus;
    });
  }, [carriers, search, filter]);

  const stats = useMemo(() => {
    const list = carriers ?? [];
    return {
      total: list.length,
      new: list.filter((c) => c.verification_status === "new").length,
      review: list.filter((c) => c.verification_status === "in_review").length,
      approved: list.filter((c) => c.verification_status === "approved").length,
    };
  }, [carriers]);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Перевозчики</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Реестр перевозчиков и статус их проверки
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" className="gap-2">
              <Link to="/carriers/verification">
                <ShieldCheck className="h-4 w-4" />
                Проверка
              </Link>
            </Button>
            <Button onClick={() => setCreateOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Добавить перевозчика
            </Button>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Всего" value={stats.total} accent />
          <Stat label="Новые" value={stats.new} />
          <Stat label="На проверке" value={stats.review} />
          <Stat label="Подтверждены" value={stats.approved} />
        </div>

        <div className="mb-4 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Название, ИНН, город..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={filter} onValueChange={(v) => setFilter(v as CarrierVerificationStatus | "all")}>
            <SelectTrigger className="sm:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все статусы</SelectItem>
              {VERIFICATION_ORDER.map((s) => (
                <SelectItem key={s} value={s}>
                  {VERIFICATION_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/50 hover:bg-secondary/50">
                <TableHead className="font-semibold text-foreground">Название / ФИО</TableHead>
                <TableHead className="font-semibold text-foreground">Тип</TableHead>
                <TableHead className="font-semibold text-foreground">ИНН</TableHead>
                <TableHead className="font-semibold text-foreground">Город</TableHead>
                <TableHead className="font-semibold text-foreground">Телефон</TableHead>
                <TableHead className="font-semibold text-foreground">Статус</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                    Загрузка...
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center">
                    <Building2 className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                    <div className="text-sm text-muted-foreground">Перевозчиков нет</div>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((c) => (
                  <TableRow key={c.id} className="cursor-pointer">
                    <TableCell>
                      <Link
                        to="/carriers/$carrierId"
                        params={{ carrierId: c.id }}
                        className="font-semibold text-foreground hover:text-primary"
                      >
                        {c.company_name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">{CARRIER_TYPE_LABELS[c.carrier_type]}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{c.inn ?? "—"}</TableCell>
                    <TableCell className="text-sm">{c.city ?? "—"}</TableCell>
                    <TableCell className="text-sm">{c.phone ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={VERIFICATION_STYLES[c.verification_status]}>
                        {VERIFICATION_LABELS[c.verification_status]}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </main>

      <CarrierFormDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        accent ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"
      }`}
    >
      <div
        className={`text-xs font-medium uppercase tracking-wider ${
          accent ? "text-primary-foreground/80" : "text-muted-foreground"
        }`}
      >
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}
