import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiPost, fetchListViaApi } from "@/lib/api-client";
import { AppHeader } from "@/components/AppHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Settings as SettingsIcon, Search, Save } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/supply/settings")({
  head: () => ({
    meta: [
      { title: "Настройки снабжения" },
      { name: "description", content: "Минимальный остаток, страховой запас, критичность" },
    ],
  }),
  component: SupplySettingsPage,
});

type Setting = {
  id?: string;
  product_id: string;
  warehouse_id: string | null;
  min_stock: number;
  safety_stock: number;
  is_critical: boolean;
  on_demand_only: boolean;
  priority: number;
};

const PRIORITY_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: "1 — Высокий" },
  { value: 2, label: "2 — Средний" },
  { value: 3, label: "3 — Обычный" },
  { value: 4, label: "4 — Низкий" },
];

function SupplySettingsPage() {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [warehouseId, setWarehouseId] = useState<string>("all");
  const [draft, setDraft] = useState<Record<string, Partial<Setting>>>({});

  const { data: products } = useQuery({
    queryKey: ["products-all"],
    queryFn: async () => {
      const r = await fetchListViaApi<{ id: string; name: string; sku: string | null; unit: string | null }>(
        "/api/products",
        { limit: 1000 },
      );
      return r.rows;
    },
  });

  const { data: warehouses } = useQuery({
    queryKey: ["warehouses-all-set"],
    queryFn: async () => {
      const r = await fetchListViaApi<{ id: string; name: string }>(
        "/api/warehouses",
        { limit: 1000 },
      );
      return r.rows;
    },
  });

  const { data: settings, isLoading } = useQuery({
    queryKey: ["product-stock-settings"],
    queryFn: async (): Promise<Setting[]> => {
      const r = await fetchListViaApi<Setting>("/api/product-stock-settings", { limit: 1000 });
      return r.rows;
    },
  });

  const settingMap = useMemo(() => {
    const m = new Map<string, Setting>();
    (settings ?? []).forEach((s) => {
      m.set(`${s.product_id}::${s.warehouse_id ?? ""}`, s);
    });
    return m;
  }, [settings]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (products ?? []).filter((p) => {
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.sku ?? "").toLowerCase().includes(q)
      );
    });
    if (warehouseId === "all") return list.map((p) => ({ p, wId: null as string | null }));
    return list.map((p) => ({ p, wId: warehouseId }));
  }, [products, query, warehouseId]);

  const saveMutation = useMutation({
    mutationFn: async (payload: Setting) => {
      await apiPost("/api/product-stock-settings", payload);
    },
    onSuccess: () => {
      toast.success("Сохранено");
      qc.invalidateQueries({ queryKey: ["product-stock-settings"] });
      qc.invalidateQueries({ queryKey: ["stock-balances"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const getValue = (key: string, field: keyof Setting, fallback: number | boolean): number | boolean => {
    const d = draft[key]?.[field];
    if (d !== undefined) return d as number | boolean;
    const s = settingMap.get(key);
    if (s && s[field] !== undefined && s[field] !== null) return s[field] as number | boolean;
    return fallback;
  };

  const setDraftField = (key: string, field: keyof Setting, value: number | boolean) => {
    setDraft((prev) => ({ ...prev, [key]: { ...(prev[key] ?? {}), [field]: value } }));
  };

  const handleSave = (productId: string, wId: string | null) => {
    const key = `${productId}::${wId ?? ""}`;
    const cur = settingMap.get(key);
    const payload: Setting = {
      ...(cur ?? { product_id: productId, warehouse_id: wId, min_stock: 0, safety_stock: 0, is_critical: false, on_demand_only: false, priority: 3 }),
      ...(draft[key] ?? {}),
      product_id: productId,
      warehouse_id: wId,
    };
    saveMutation.mutate(payload);
    setDraft((prev) => {
      const { [key]: _, ...rest } = prev;
      return rest;
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
            <SettingsIcon className="h-6 w-6 text-primary" />
            Настройки снабжения
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Минимальный остаток, страховой запас, критичность и режим «по запросу»
          </p>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Поиск по товару или артикулу"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={warehouseId} onValueChange={setWarehouseId}>
            <SelectTrigger className="w-[240px]">
              <SelectValue placeholder="Склад" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Глобально (все склады)</SelectItem>
              {(warehouses ?? []).map((w) => (
                <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Товар</TableHead>
                <TableHead className="w-[140px]">Мин. остаток</TableHead>
                <TableHead className="w-[140px]">Страховой</TableHead>
                <TableHead className="w-[160px]">Приоритет</TableHead>
                <TableHead className="w-[120px]">Критичный</TableHead>
                <TableHead className="w-[150px]">Только под заказ</TableHead>
                <TableHead className="w-[120px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">Загрузка…</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">Товаров нет</TableCell></TableRow>
              ) : (
                rows.map(({ p, wId }) => {
                  const key = `${p.id}::${wId ?? ""}`;
                  const dirty = !!draft[key];
                  return (
                    <TableRow key={key}>
                      <TableCell>
                        <div className="font-medium">{p.name}</div>
                        {p.sku && <div className="font-mono text-xs text-muted-foreground">{p.sku}</div>}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          value={String(getValue(key, "min_stock", 0))}
                          onChange={(e) => setDraftField(key, "min_stock", Number(e.target.value) || 0)}
                          className="h-9"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          value={String(getValue(key, "safety_stock", 0))}
                          onChange={(e) => setDraftField(key, "safety_stock", Number(e.target.value) || 0)}
                          className="h-9"
                        />
                      </TableCell>
                      <TableCell>
                        <Select
                          value={String(getValue(key, "priority", 3))}
                          onValueChange={(v) => setDraftField(key, "priority", Number(v) || 3)}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PRIORITY_OPTIONS.map((o) => (
                              <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={Boolean(getValue(key, "is_critical", false))}
                          onCheckedChange={(v) => setDraftField(key, "is_critical", v)}
                        />
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={Boolean(getValue(key, "on_demand_only", false))}
                          onCheckedChange={(v) => setDraftField(key, "on_demand_only", v)}
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant={dirty ? "default" : "outline"}
                          disabled={!dirty || saveMutation.isPending}
                          onClick={() => handleSave(p.id, wId)}
                        >
                          <Save className="mr-1 h-3 w-3" />
                          Сохранить
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          Приоритет: 1 — высокий, 4 — низкий. Используется для сортировки заявок на пополнение.
        </p>
      </main>
    </div>
  );
}
