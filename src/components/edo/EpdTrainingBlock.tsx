// Тренажёр ЭПД. Учебные сессии, явная пометка «Учебный режим».
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiPost } from "@/lib/api-client";
import { toast } from "sonner";
import {
  EPD_SCENARIO_OPTIONS, type EpdScenarioType, getScenarioDef,
  EPD_DOCUMENT_LABEL, EPD_TITLE_SIGNER_LABEL,
} from "@/lib/edo/scenarios";

interface Props { role?: "carrier" | "forwarder" | "driver" | "dispatcher" }

export function EpdTrainingBlock({ role = "carrier" }: Props) {
  const [type, setType] = useState<EpdScenarioType>("regular_transport");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [step, setStep] = useState(1);
  const def = getScenarioDef(type);

  async function start() {
    try {
      const r = await apiPost<{ id: string }>("/api/carrier/edo/training/start", { role, scenario_type: type });
      setSessionId(r.id);
      setStep(1);
      toast.success("Учебная сессия начата");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    }
  }
  async function next() {
    if (!sessionId) return;
    const s = step + 1;
    setStep(s);
    await apiPost(`/api/carrier/edo/training/${sessionId}/step`, { step: s, progress: Math.min(100, s * 20) });
  }
  async function complete() {
    if (!sessionId) return;
    await apiPost(`/api/carrier/edo/training/${sessionId}/complete`, {});
    toast.success("Сессия завершена");
    setSessionId(null);
    setStep(1);
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base">Тренажёр ЭПД</CardTitle>
          <Badge variant="outline">Учебный режим — не отправляется оператору</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2.5 text-sm">
        <div>
          <label className="text-xs text-muted-foreground">Сценарий</label>
          <select className="w-full h-9 rounded-md border bg-background px-2"
            value={type} onChange={e => setType(e.target.value as EpdScenarioType)}
            disabled={!!sessionId}>
            {EPD_SCENARIO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        {def && (
          <div className="rounded-md border p-2 bg-muted/40 text-xs space-y-1">
            <div className="font-medium">Что нужно по сценарию</div>
            <div>Документы: {def.required_documents.map(d => EPD_DOCUMENT_LABEL[d]).join(", ")}</div>
            <div>Т1: {EPD_TITLE_SIGNER_LABEL[def.signing_plan.etrn_t1]}, Т2: {EPD_TITLE_SIGNER_LABEL[def.signing_plan.etrn_t2]}, Т3: {EPD_TITLE_SIGNER_LABEL[def.signing_plan.etrn_t3]}, Т4: {EPD_TITLE_SIGNER_LABEL[def.signing_plan.etrn_t4]}</div>
          </div>
        )}
        {!sessionId
          ? <Button size="sm" onClick={start}>Начать тренировку</Button>
          : <>
              <div className="text-xs text-muted-foreground">Шаг {step}</div>
              <div className="flex gap-2">
                <Button size="sm" onClick={next}>Дальше</Button>
                <Button size="sm" variant="outline" onClick={complete}>Завершить</Button>
              </div>
            </>
        }
        <p className="text-xs text-muted-foreground">
          Учебные документы не отправляются оператору и не имеют юридической силы.
        </p>
      </CardContent>
    </Card>
  );
}
