import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertTriangle, FileText } from "lucide-react";
import { apiGetAuth } from "@/lib/api-client";

interface Acceptance {
  id: string;
  contract_type: string;
  contract_version: string;
  contract_title: string | null;
  commission_rate: number | null;
  minimum_fee: number | null;
  accepted_by_name: string | null;
  accepted_by_phone: string | null;
  accepted_by_email: string | null;
  accepted_at: string;
  source: string;
}

interface Props {
  carrierId: string;
  currentCommissionRate: number;
}

export function CarrierContractAcceptanceBlock({ carrierId, currentCommissionRate }: Props) {
  const [rows, setRows] = useState<Acceptance[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiGetAuth<{ rows: Acceptance[] }>(
          `/api/dispatcher/carriers/${carrierId}/contract-acceptances`,
        );
        if (!cancelled) setRows(res.rows ?? []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Ошибка");
      }
    })();
    return () => { cancelled = true; };
  }, [carrierId]);

  const last = rows && rows.length > 0 ? rows[0] : null;
  const fmtPct = (r: number | null | undefined) => {
    if (r == null) return "—";
    const v = r > 1 ? r : r * 100;
    return Number.isInteger(v) ? `${v}%` : `${v.toFixed(1)}%`;
  };
  const currentPct = currentCommissionRate > 1
    ? currentCommissionRate
    : currentCommissionRate * 100;
  const acceptedPct = last?.commission_rate != null
    ? (last.commission_rate > 1 ? last.commission_rate : last.commission_rate * 100)
    : null;
  const commissionChanged =
    last && acceptedPct != null && Math.abs(acceptedPct - currentPct) > 0.0001;

  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-medium flex items-center gap-2">
          <FileText className="h-4 w-4" /> Договор и комиссия
        </span>
        {last ? (
          <Badge variant="default" className="gap-1">
            <CheckCircle2 className="h-3 w-3" /> Договор принят
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1 border-yellow-500 text-yellow-700">
            <AlertTriangle className="h-3 w-3" /> Договор-оферта не принят
          </Badge>
        )}
      </div>

      {error && <div className="text-xs text-destructive">{error}</div>}

      {last && (
        <div className="text-xs space-y-1">
          <Row label="Версия" value={last.contract_version} />
          <Row label="Дата" value={new Date(last.accepted_at).toLocaleString("ru-RU")} />
          <Row label="ФИО" value={last.accepted_by_name ?? "—"} />
          <Row label="Email" value={last.accepted_by_email ?? "—"} />
          <Row label="Телефон" value={last.accepted_by_phone ?? "—"} />
          <Row label="Комиссия на момент принятия" value={fmtPct(last.commission_rate)} />
          <Row label="Минимальное вознаграждение" value={`${last.minimum_fee ?? 500} ₽`} />
          <Row label="Источник" value={last.source} />
          <Row label="Текущая комиссия перевозчика" value={fmtPct(currentCommissionRate)} />
        </div>
      )}

      {commissionChanged && (
        <div className="rounded border border-yellow-500/50 bg-yellow-50 p-2 text-xs text-yellow-800">
          Комиссия изменена после принятия договора. При необходимости запросите
          повторное подтверждение условий.
        </div>
      )}

      {rows && rows.length > 1 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">
            История акцептов ({rows.length})
          </summary>
          <ul className="mt-1 space-y-1">
            {rows.map((r) => (
              <li key={r.id} className="border-t pt-1">
                {new Date(r.accepted_at).toLocaleString("ru-RU")} — {r.contract_version} — {r.accepted_by_name ?? "—"} — {fmtPct(r.commission_rate)} — {r.source}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="w-56 text-muted-foreground">{label}</div>
      <div className="flex-1 font-medium">{value}</div>
    </div>
  );
}
