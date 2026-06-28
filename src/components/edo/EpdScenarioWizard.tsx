// Мастер ЭПД — компактный мульти-шаг для выбора сценария, участников,
// валидации и создания заготовок документов. Встраивается в карточку ЭДО.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { apiGetAuth, apiPost, apiPatch } from "@/lib/api-client";
import { toast } from "sonner";
import {
  EPD_SCENARIO_CATALOG, EPD_SCENARIO_OPTIONS, getScenarioDef,
  EPD_DOCUMENT_LABEL, EPD_POSSESSION_LABEL,
  EPD_TITLE_SIGNER_LABEL, EPD_READINESS_STATUS_LABEL,
  type EpdScenarioType, type ForwarderPossessionMode,
  type EpdReadinessStatus,
} from "@/lib/edo/scenarios";
import { ForwarderPickerBlock } from "@/components/edo/ForwarderPickerBlock";

interface ScenarioRow {
  id: string;
  scenario_type: EpdScenarioType;
  forwarder_id: string | null;
  forwarder_possession_mode: ForwarderPossessionMode | null;
  required_documents: string[];
  participants_json: Record<string, unknown>;
  readiness_status: EpdReadinessStatus;
  validation_errors: string[];
  validation_warnings: string[];
  is_training: boolean;
}

interface Props {
  /** carrier_ext_id берётся на сервере из RPC. Передаём связку с документом/рейсом. */
  documentId?: string | null;
  tripId?: string | null;
  initialScenarioId?: string | null;
  /** Когда сценарий валиден — родитель может разрешить кнопки Saby. */
  onScenarioReady?: (id: string) => void;
}

export function EpdScenarioWizard({
  documentId, tripId, initialScenarioId, onScenarioReady,
}: Props) {
  const [scenarioId, setScenarioId] = useState<string | null>(initialScenarioId ?? null);
  const [row, setRow] = useState<ScenarioRow | null>(null);
  const [type, setType] = useState<EpdScenarioType>("regular_transport");
  const [poss, setPoss] = useState<ForwarderPossessionMode>("unknown");
  const [shipper, setShipper] = useState("");
  const [consignee, setConsignee] = useState("");
  const [carrier, setCarrier] = useState("");
  const [driver, setDriver] = useState("");
  const [forwarder, setForwarder] = useState<string>("");
  const [forwarderName, setForwarderName] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const def = getScenarioDef(type);

  async function load(id: string) {
    const r = await apiGetAuth<{ row: ScenarioRow }>(`/api/carrier/edo/scenarios/${id}`);
    setRow(r.row);
    setType(r.row.scenario_type);
    setPoss((r.row.forwarder_possession_mode ?? "unknown") as ForwarderPossessionMode);
    const p = r.row.participants_json as Record<string, unknown>;
    setShipper((p?.shipper as string) ?? "");
    setConsignee((p?.consignee as string) ?? "");
    setCarrier((p?.carrier as string) ?? "");
    setDriver((p?.driver as string) ?? "");
    setForwarder(r.row.forwarder_id ?? "");
    const snap = p?.forwarder_snapshot as { forwarder_name?: string } | undefined;
    setForwarderName(snap?.forwarder_name ?? "");
  }

  async function create() {
    setBusy(true);
    try {
      const r = await apiPost<{ id: string }>("/api/carrier/edo/scenarios", {
        scenario_type: type,
        document_id: documentId ?? null,
        trip_id: tripId ?? null,
        forwarder_possession_mode: poss,
        forwarder_id: forwarder || null,
        participants: { shipper, consignee, carrier, driver, forwarder },
      });
      setScenarioId(r.id);
      await load(r.id);
      toast.success("Сценарий создан");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось создать сценарий");
    } finally { setBusy(false); }
  }

  async function saveAndValidate() {
    if (!scenarioId) return;
    setBusy(true);
    try {
      await apiPatch(`/api/carrier/edo/scenarios/${scenarioId}`, {
        forwarder_possession_mode: poss,
        forwarder_id: forwarder || null,
        participants: { shipper, consignee, carrier, driver, forwarder },
      });
      const r = await apiPost<{ errors: string[]; warnings: string[]; readiness: EpdReadinessStatus }>(
        `/api/carrier/edo/scenarios/${scenarioId}/validate`, {},
      );
      await load(scenarioId);
      if (r.readiness !== "invalid" && onScenarioReady) onScenarioReady(scenarioId);
      toast.success(`Проверка: ${EPD_READINESS_STATUS_LABEL[r.readiness]}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка валидации");
    } finally { setBusy(false); }
  }

  async function createDocs() {
    if (!scenarioId) return;
    setBusy(true);
    try {
      const r = await apiPost<{ created: number }>(
        `/api/carrier/edo/scenarios/${scenarioId}/create-documents`, {},
      );
      toast.success(`Создано документов: ${r.created}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally { setBusy(false); }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base">Мастер ЭПД</CardTitle>
          {row && (
            <Badge variant={
              row.readiness_status === "valid" ? "default"
              : row.readiness_status === "invalid" ? "destructive" : "outline"
            }>
              {EPD_READINESS_STATUS_LABEL[row.readiness_status]}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Определите сценарий перевозки, участников, документы и подписи перед отправкой оператору.
        </p>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div>
          <Label>Сценарий перевозки</Label>
          <Select value={type} onValueChange={v => setType(v as EpdScenarioType)} disabled={!!scenarioId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {EPD_SCENARIO_OPTIONS.map(o => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {def && <p className="text-xs text-muted-foreground mt-1">{def.short}</p>}
        </div>

        {def?.requires_forwarder && (
          <ForwarderPickerBlock
            scenarioType={type}
            value={forwarder || null}
            possessionMode={poss}
            onChange={(id, name) => {
              setForwarder(id ?? "");
              setForwarderName(name ?? "");
            }}
            onPossessionChange={m => setPoss(m)}
          />
        )}

        <div className="grid gap-2 sm:grid-cols-2">
          <div><Label>Грузоотправитель</Label><Input value={shipper} onChange={e => setShipper(e.target.value)} /></div>
          <div><Label>Грузополучатель</Label><Input value={consignee} onChange={e => setConsignee(e.target.value)} /></div>
          {def?.participants.includes("carrier") && (
            <div><Label>Перевозчик</Label><Input value={carrier} onChange={e => setCarrier(e.target.value)} /></div>
          )}
          {def?.participants.includes("driver") && (
            <div><Label>Водитель</Label><Input value={driver} onChange={e => setDriver(e.target.value)} /></div>
          )}
        </div>

        {def && (
          <div className="rounded-md border p-2 bg-muted/40 space-y-1">
            <div className="text-xs font-medium">Необходимые документы</div>
            <ul className="text-xs list-disc pl-5">
              {def.required_documents.map(d => <li key={d}>{EPD_DOCUMENT_LABEL[d]}</li>)}
            </ul>
            <div className="text-xs font-medium pt-1">План подписания ЭТрН</div>
            <div className="text-xs text-muted-foreground">
              Т1: {EPD_TITLE_SIGNER_LABEL[def.signing_plan.etrn_t1]} ·
              Т2: {EPD_TITLE_SIGNER_LABEL[def.signing_plan.etrn_t2]} ·
              Т3: {EPD_TITLE_SIGNER_LABEL[def.signing_plan.etrn_t3]} ·
              Т4: {EPD_TITLE_SIGNER_LABEL[def.signing_plan.etrn_t4]}
            </div>
            {def.warnings.length > 0 && (
              <div className="text-xs text-amber-700">
                {def.warnings.map(w => <div key={w}>· {w}</div>)}
              </div>
            )}
          </div>
        )}

        {row && (row.validation_errors.length > 0 || row.validation_warnings.length > 0) && (
          <div className="rounded-md border p-2 text-xs space-y-1">
            {row.validation_errors.length > 0 && (
              <div className="text-destructive">
                <div className="font-medium">Критические ошибки:</div>
                {row.validation_errors.map(e => <div key={e}>· {e}</div>)}
              </div>
            )}
            {row.validation_warnings.length > 0 && (
              <div className="text-amber-700">
                <div className="font-medium">Предупреждения:</div>
                {row.validation_warnings.map(w => <div key={w}>· {w}</div>)}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {!scenarioId
            ? <Button size="sm" onClick={create} disabled={busy}>Создать сценарий</Button>
            : <>
                <Button size="sm" onClick={saveAndValidate} disabled={busy}>Сохранить и проверить</Button>
                <Button size="sm" variant="outline" onClick={createDocs} disabled={busy || !row || row.readiness_status === "invalid"}>
                  Создать заготовки документов
                </Button>
              </>
          }
        </div>

        {scenarioId && documentId && <PracticeSummary documentId={documentId} />}

        <p className="text-xs text-muted-foreground">
          ЭДО/ЭПД — это не просто подпись. Нужны оператор, КЭП/МЧД, участники, документы и понятный процесс.
          1С-ЭПД — один из вариантов, если компания работает через 1С.
        </p>

      </CardContent>
    </Card>
  );
}

export { EPD_SCENARIO_CATALOG };

// Сводка по практическим блокам после выбора сценария.
function PracticeSummary({ documentId }: { documentId: string }) {
  const remarks = useQuery({
    queryKey: ["edo", "remarks", documentId],
    queryFn: () =>
      apiGetAuth<{ rows: Array<{ severity: "info" | "warning" | "critical" }> }>(
        `/api/carrier/edo/documents/${documentId}/remarks`,
      ),
  });
  const changes = useQuery({
    queryKey: ["edo", "changes", documentId],
    queryFn: () =>
      apiGetAuth<{ rows: Array<{ id: string }> }>(
        `/api/carrier/edo/documents/${documentId}/changes`,
      ),
  });
  const qr = useQuery({
    queryKey: ["edo", "qr-carrier", documentId],
    queryFn: () =>
      apiGetAuth<{ row: { qr_status: string } | null }>(
        `/api/carrier/edo/documents/${documentId}/qr`,
      ),
  });
  const total = remarks.data?.rows.length ?? 0;
  const critical = (remarks.data?.rows ?? []).filter(r => r.severity === "critical").length;
  const changeCount = changes.data?.rows.length ?? 0;
  const qrStatus = qr.data?.row?.qr_status ?? null;
  return (
    <div className="rounded-md border p-2 text-xs space-y-1 bg-muted/30">
      <div className="font-medium">Практические блоки</div>
      <div className="flex flex-wrap gap-1.5">
        <Badge variant={critical > 0 ? "destructive" : "outline"}>
          Замечания: {total}{critical ? ` (крит. ${critical})` : ""}
        </Badge>
        <Badge variant="outline">Изменения по рейсу: {changeCount}</Badge>
        <Badge variant={qrStatus ? "default" : "outline"}>
          QR водителю: {qrStatus ?? "нет"}
        </Badge>
      </div>
      <p className="text-muted-foreground">
        Готовность перевозчика и ГосЛог экспедитора проверьте в соответствующих разделах.
      </p>
    </div>
  );
}
