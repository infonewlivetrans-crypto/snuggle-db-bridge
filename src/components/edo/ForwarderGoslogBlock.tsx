// Блок «ГосЛог и готовность экспедитора». Ручная фиксация по официальному источнику.
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiGetAuth, apiPatch } from "@/lib/api-client";
import { toast } from "sonner";
import { GOSLOG_STATUS_LABEL, type GoslogStatus } from "@/lib/edo/scenarios";

interface Row {
  id?: string;
  forwarder_id: string | null;
  inn: string | null;
  ogrn: string | null;
  company_name: string | null;
  has_okved_5229: boolean;
  goslog_status: GoslogStatus;
  registry_number: string | null;
  application_number: string | null;
  source_url: string | null;
  verification_comment: string | null;
}

const EMPTY: Row = {
  forwarder_id: null, inn: null, ogrn: null, company_name: null,
  has_okved_5229: false, goslog_status: "unknown",
  registry_number: null, application_number: null, source_url: null,
  verification_comment: null,
};

export function ForwarderGoslogBlock() {
  const [rows, setRows] = useState<Row[]>([]);
  const [draft, setDraft] = useState<Row>({ ...EMPTY });
  const [busy, setBusy] = useState(false);

  async function reload() {
    try {
      const d = await apiGetAuth<{ rows: Row[] }>("/api/forwarder/goslog-status");
      setRows(d.rows ?? []);
    } catch { /* noop */ }
  }
  useEffect(() => { reload(); }, []);

  async function save() {
    setBusy(true);
    try {
      await apiPatch("/api/forwarder/goslog-status", draft);
      setDraft({ ...EMPTY });
      await reload();
      toast.success("Статус ГосЛог сохранён");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally { setBusy(false); }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">ГосЛог и готовность экспедитора</CardTitle>
        <p className="text-xs text-muted-foreground">
          Ручная фиксация по официальному источнику. Live-проверка пока не подключена.
        </p>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="grid gap-2 sm:grid-cols-2">
          <div><Label>Название</Label><Input value={draft.company_name ?? ""} onChange={e => setDraft({ ...draft, company_name: e.target.value || null })} /></div>
          <div><Label>ИНН</Label><Input value={draft.inn ?? ""} onChange={e => setDraft({ ...draft, inn: e.target.value || null })} /></div>
          <div><Label>ОГРН</Label><Input value={draft.ogrn ?? ""} onChange={e => setDraft({ ...draft, ogrn: e.target.value || null })} /></div>
          <div>
            <Label>Статус ГосЛог</Label>
            <select className="w-full h-9 rounded-md border bg-background px-2"
              value={draft.goslog_status}
              onChange={e => setDraft({ ...draft, goslog_status: e.target.value as GoslogStatus })}>
              {(Object.keys(GOSLOG_STATUS_LABEL) as GoslogStatus[]).map(s => (
                <option key={s} value={s}>{GOSLOG_STATUS_LABEL[s]}</option>
              ))}
            </select>
          </div>
          <div><Label>№ в реестре</Label><Input value={draft.registry_number ?? ""} onChange={e => setDraft({ ...draft, registry_number: e.target.value || null })} /></div>
          <div><Label>№ заявления</Label><Input value={draft.application_number ?? ""} onChange={e => setDraft({ ...draft, application_number: e.target.value || null })} /></div>
          <div className="sm:col-span-2"><Label>Источник (URL официального реестра)</Label><Input value={draft.source_url ?? ""} onChange={e => setDraft({ ...draft, source_url: e.target.value || null })} /></div>
          <div className="sm:col-span-2"><Label>Комментарий</Label><Input value={draft.verification_comment ?? ""} onChange={e => setDraft({ ...draft, verification_comment: e.target.value || null })} /></div>
        </div>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={draft.has_okved_5229} onChange={e => setDraft({ ...draft, has_okved_5229: e.target.checked })} />
          Есть ОКВЭД 52.29
        </label>
        <Button size="sm" onClick={save} disabled={busy}>Сохранить запись</Button>

        <div className="pt-2 border-t">
          <div className="text-xs font-medium mb-1">Последние записи</div>
          {rows.length === 0
            ? <div className="text-xs text-muted-foreground">Записей пока нет.</div>
            : <div className="space-y-1.5">{rows.slice(0, 10).map(r => (
                <div key={r.id} className="text-xs flex items-center justify-between gap-2 border-b border-border/40 pb-1.5 last:border-0">
                  <div>{r.company_name ?? "—"} {r.inn ? `· ИНН ${r.inn}` : ""}</div>
                  <Badge variant={r.goslog_status === "included" || r.goslog_status === "manually_verified" ? "default" : "outline"}>
                    {GOSLOG_STATUS_LABEL[r.goslog_status]}
                  </Badge>
                </div>
              ))}</div>
          }
        </div>
      </CardContent>
    </Card>
  );
}
