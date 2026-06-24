// Блок готовности перевозчика к ЭПД.
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { apiGetAuth, apiPatch } from "@/lib/api-client";
import { toast } from "sonner";
import {
  CARRIER_EPD_READINESS_LABEL, type CarrierEpdReadinessStatus,
} from "@/lib/edo/scenarios";
import { EDO_PROVIDER_OPTIONS } from "@/lib/edo/constants";

interface Row {
  edo_operator: string | null;
  has_1c: boolean;
  has_1c_edo: boolean;
  has_1c_epd: boolean;
  onec_epd_tariff: string | null;
  edo_participant_id: string | null;
  has_director_kep: boolean;
  has_mchd: boolean;
  responsible_person: string | null;
  driver_has_smartphone: boolean;
  driver_qr_ready: boolean;
  readiness_status: CarrierEpdReadinessStatus;
  notes: string | null;
}

export function CarrierEpdReadinessBlock() {
  const [r, setR] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiGetAuth<{ row: Row | null }>("/api/carrier/edo/readiness")
      .then(d => setR(d.row ?? {
        edo_operator: null, has_1c: false, has_1c_edo: false, has_1c_epd: false,
        onec_epd_tariff: null, edo_participant_id: null,
        has_director_kep: false, has_mchd: false, responsible_person: null,
        driver_has_smartphone: false, driver_qr_ready: false,
        readiness_status: "not_ready", notes: null,
      }))
      .catch(() => { /* noop */ });
  }, []);

  if (!r) return null;

  async function save() {
    setBusy(true);
    try {
      const upd = await apiPatch<{ row: Row }>("/api/carrier/edo/readiness", r);
      setR(upd.row);
      toast.success("Готовность к ЭПД сохранена");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally { setBusy(false); }
  }

  const set = <K extends keyof Row>(k: K, v: Row[K]) => setR({ ...r, [k]: v });

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base">Готовность к ЭПД</CardTitle>
          <Badge variant={r.readiness_status === "ready" ? "default" : "outline"}>
            {CARRIER_EPD_READINESS_LABEL[r.readiness_status]}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2.5 text-sm">
        <div>
          <Label>Оператор ЭДО/ЭПД</Label>
          <select
            className="w-full h-9 rounded-md border bg-background px-2"
            value={r.edo_operator ?? ""}
            onChange={e => set("edo_operator", e.target.value || null)}
          >
            <option value="">— не выбран —</option>
            {EDO_PROVIDER_OPTIONS.filter(o => o.value !== "internal_mock").map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex items-center gap-2"><Checkbox checked={r.has_1c} onCheckedChange={v => set("has_1c", Boolean(v))} />Есть 1С</label>
          <label className="flex items-center gap-2"><Checkbox checked={r.has_1c_edo} onCheckedChange={v => set("has_1c_edo", Boolean(v))} />1С-ЭДО</label>
          <label className="flex items-center gap-2"><Checkbox checked={r.has_1c_epd} onCheckedChange={v => set("has_1c_epd", Boolean(v))} />1С-ЭПД</label>
          <label className="flex items-center gap-2"><Checkbox checked={r.has_director_kep} onCheckedChange={v => set("has_director_kep", Boolean(v))} />КЭП руководителя</label>
          <label className="flex items-center gap-2"><Checkbox checked={r.has_mchd} onCheckedChange={v => set("has_mchd", Boolean(v))} />МЧД на сотрудника</label>
          <label className="flex items-center gap-2"><Checkbox checked={r.driver_has_smartphone} onCheckedChange={v => set("driver_has_smartphone", Boolean(v))} />Смартфон водителя</label>
          <label className="flex items-center gap-2"><Checkbox checked={r.driver_qr_ready} onCheckedChange={v => set("driver_qr_ready", Boolean(v))} />Водитель готов к QR</label>
        </div>
        <div>
          <Label>ID участника ЭДО</Label>
          <Input value={r.edo_participant_id ?? ""} onChange={e => set("edo_participant_id", e.target.value || null)} />
        </div>
        <div>
          <Label>Тариф 1С-ЭПД</Label>
          <Input value={r.onec_epd_tariff ?? ""} onChange={e => set("onec_epd_tariff", e.target.value || null)} />
        </div>
        <div>
          <Label>Ответственный</Label>
          <Input value={r.responsible_person ?? ""} onChange={e => set("responsible_person", e.target.value || null)} />
        </div>
        <div>
          <Label>Комментарий</Label>
          <Input value={r.notes ?? ""} onChange={e => set("notes", e.target.value || null)} />
        </div>
        <Button size="sm" onClick={save} disabled={busy}>Сохранить</Button>
        <p className="text-xs text-muted-foreground">
          Для работы с ЭПД нужен оператор ИС ЭПД/ЭДО, КЭП/МЧД и рабочий процесс.
          1С-ЭДО/1С-ЭПД — один из вариантов автоматизации, если компания работает через 1С.
        </p>
      </CardContent>
    </Card>
  );
}
