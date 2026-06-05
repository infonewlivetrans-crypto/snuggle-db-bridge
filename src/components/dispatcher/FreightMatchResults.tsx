import { useState } from "react";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { dealsApi } from "@/lib/dispatcher/api";
import type { MatchResult } from "@/lib/dispatcher/types";

interface Props {
  rows: MatchResult[];
  loading?: boolean;
  freightId?: string | null;
}

const VERDICT_LABEL: Record<MatchResult["verdict"], string> = {
  fit: "Подходит",
  partial: "Частично",
  no_fit: "Не подходит",
};
const VERDICT_CLASS: Record<MatchResult["verdict"], string> = {
  fit: "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-200",
  partial: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-200",
  no_fit: "bg-red-100 text-red-900 border-red-300 dark:bg-red-950 dark:text-red-200",
};

const fmtMoney = (n: number | null) => (n == null ? "—" : `${n.toLocaleString("ru-RU")} ₽`);

export function FreightMatchResults({ rows, loading, freightId }: Props) {
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [createdMap, setCreatedMap] = useState<Record<string, string>>({});

  const handleCreateDeal = async (vehicleId: string) => {
    if (!freightId) return;
    if (creatingId) return;
    if (createdMap[vehicleId]) return;
    setCreatingId(vehicleId);
    try {
      const res = await dealsApi.fromMatch({ freight_id: freightId, vehicle_id: vehicleId });
      setCreatedMap((m) => ({ ...m, [vehicleId]: res.row.id }));
      if (res.already_exists) {
        toast.info("Сделка уже существует", {
          action: { label: "Открыть сделки", onClick: () => { window.location.href = "/dispatcher/deals"; } },
        });
      } else {
        toast.success("Сделка создана", {
          action: { label: "Открыть сделки", onClick: () => { window.location.href = "/dispatcher/deals"; } },
        });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка создания сделки");
    } finally {
      setCreatingId(null);
    }
  };

  if (loading) return <div className="text-sm text-muted-foreground py-4">Подбор машин...</div>;
  if (!rows.length) return <div className="text-sm text-muted-foreground py-4">Подходящих машин не найдено.</div>;

  return (
    <div className="rounded-md border bg-card overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Оценка</TableHead>
            <TableHead>ТС / кузов</TableHead>
            <TableHead>Г/п, объём</TableHead>
            <TableHead>Город / готов</TableHead>
            <TableHead>Водитель / перевозчик</TableHead>
            <TableHead>Ставки</TableHead>
            <TableHead>Причины</TableHead>
            <TableHead className="text-right">Действия</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.vehicle_id}>
              <TableCell>
                <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${VERDICT_CLASS[r.verdict]}`}>
                  {VERDICT_LABEL[r.verdict]}
                </span>
              </TableCell>
              <TableCell>
                <div className="font-medium">{r.vehicle_kind ?? "—"}</div>
                <div className="text-xs text-muted-foreground">{r.body_type ?? ""}</div>
              </TableCell>
              <TableCell className="text-xs">
                <div>{r.payload_kg != null ? `${r.payload_kg} кг` : "—"}</div>
                <div className="text-muted-foreground">{r.volume_m3 != null ? `${r.volume_m3} м³` : ""}</div>
              </TableCell>
              <TableCell className="text-xs">
                <div>{r.home_city ?? "—"}</div>
                <div className="text-muted-foreground">{r.ready_date ?? ""}</div>
              </TableCell>
              <TableCell className="text-xs">
                <div>{r.driver_name ?? "—"}</div>
                <div className="text-muted-foreground">{r.carrier_name ?? ""}</div>
              </TableCell>
              <TableCell className="text-xs whitespace-nowrap">
                <div>мин/рейс: {fmtMoney(r.minimum_trip_rate)}</div>
                <div>мин/км: {fmtMoney(r.minimum_km_rate)}</div>
                <div className="mt-1 border-t pt-1">груз: {fmtMoney(r.freight_rate)}</div>
                <div className="text-muted-foreground">комиссия 5%: {fmtMoney(r.commission)}</div>
              </TableCell>
              <TableCell className="text-xs">
                <ul className="list-disc pl-4 space-y-0.5">
                  {r.reasons.map((rs, i) => <li key={i}>{rs}</li>)}
                </ul>
              </TableCell>
              <TableCell className="text-right whitespace-nowrap">
                {freightId && r.verdict !== "no_fit" && (
                  <Button
                    size="sm"
                    variant={createdId ? "outline" : "default"}
                    disabled={creatingId === r.vehicle_id}
                    onClick={() => handleCreateDeal(r.vehicle_id)}
                  >
                    {creatingId === r.vehicle_id ? "Создание…" : "Создать сделку"}
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

