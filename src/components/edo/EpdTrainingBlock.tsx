// Тренажёр ЭПД. Учебные сессии, явная пометка «Учебный режим».
// Расширенные шаги: замечания, фото, изменения, QR офлайн.
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { apiPost } from "@/lib/api-client";
import { toast } from "sonner";
import {
  EPD_SCENARIO_OPTIONS, type EpdScenarioType, getScenarioDef,
  EPD_DOCUMENT_LABEL, EPD_TITLE_SIGNER_LABEL,
} from "@/lib/edo/scenarios";

interface Props { role?: "carrier" | "forwarder" | "driver" | "dispatcher" }

interface TrainStep {
  id: string;
  title: string;
  hint: string;
  why: string;
}

const TRAIN_STEPS: TrainStep[] = [
  { id: "accept_clean", title: "Принять груз без замечаний",
    hint: "Проверьте количество и состояние груза. Подтвердите приёмку, не оставляя замечаний.",
    why: "Если замечаний нет — это фиксируется отдельно и закрывает спор о приёмке." },
  { id: "accept_remark", title: "Принять груз с замечанием",
    hint: "Зафиксируйте расхождение по количеству или повреждение. Выберите серьёзность.",
    why: "Замечание после подписания Т2 уже не получится добавить корректно." },
  { id: "add_photo", title: "Добавить фото повреждения",
    hint: "Прикрепите фото к замечанию. В учебном режиме фото остаётся локально (mock).",
    why: "Фото пригодится при споре с грузоотправителем или страховой." },
  { id: "change_driver", title: "Поменять водителя",
    hint: "Оформите изменение водителя — укажите ФИО, телефон и причину.",
    why: "Изменение водителя может требовать отдельного титула у оператора ЭПД." },
  { id: "change_vehicle", title: "Поменять транспортное средство",
    hint: "Оформите изменение ТС — укажите гос. номер.",
    why: "Без актуального ТС в ЭПД проверка ГИБДД покажет несоответствие." },
  { id: "change_drop", title: "Изменить точку выгрузки",
    hint: "Оформите изменение адреса/точки разгрузки.",
    why: "Грузополучатель должен быть актуальным, иначе титул Т3 не сойдётся." },
  { id: "show_qr", title: "Показать QR водителю",
    hint: "Откройте экран QR в кабинете водителя.",
    why: "QR — главное, что показывает водитель сотруднику ГИБДД при проверке." },
  { id: "qr_offline", title: "Проверить, что QR доступен офлайн",
    hint: "Откройте QR при наличии интернета — он сохранится локально.",
    why: "Связь в рейсе может пропасть, а QR должен оставаться доступным." },
];

export function EpdTrainingBlock({ role = "carrier" }: Props) {
  const [type, setType] = useState<EpdScenarioType>("regular_transport");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const def = getScenarioDef(type);
  const total = TRAIN_STEPS.length;
  const current = TRAIN_STEPS[stepIdx];
  const doneCount = Object.values(done).filter(Boolean).length;

  async function start() {
    try {
      const r = await apiPost<{ id: string }>("/api/carrier/edo/training/start",
        { role, scenario_type: type });
      setSessionId(r.id);
      setStepIdx(0);
      setDone({});
      toast.success("Учебная сессия начата");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    }
  }
  async function next() {
    if (!sessionId) return;
    const newIdx = Math.min(stepIdx + 1, total - 1);
    setStepIdx(newIdx);
    setDone(prev => ({ ...prev, [TRAIN_STEPS[stepIdx].id]: true }));
    await apiPost(`/api/carrier/edo/training/${sessionId}/step`, {
      step: newIdx + 1,
      progress: Math.min(100, Math.round(((newIdx + 1) / total) * 100)),
    });
  }
  async function toggleDone(id: string) {
    setDone(prev => ({ ...prev, [id]: !prev[id] }));
  }
  async function complete() {
    if (!sessionId) return;
    await apiPost(`/api/carrier/edo/training/${sessionId}/complete`, {});
    toast.success("Сессия завершена");
    setSessionId(null);
    setStepIdx(0);
  }

  const skipped = TRAIN_STEPS.filter(s => !done[s.id]).map(s => s.title);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base">Тренажёр ЭПД</CardTitle>
          <Badge variant="outline">Учебный режим — не отправляется оператору</Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Учебный режим. Документы и действия не имеют юридической силы и никуда не отправляются
          (ни в Saby, ни в 1С, ни в ГИС ЭПД).
        </p>
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
            <div>
              Т1: {EPD_TITLE_SIGNER_LABEL[def.signing_plan.etrn_t1]},{" "}
              Т2: {EPD_TITLE_SIGNER_LABEL[def.signing_plan.etrn_t2]},{" "}
              Т3: {EPD_TITLE_SIGNER_LABEL[def.signing_plan.etrn_t3]},{" "}
              Т4: {EPD_TITLE_SIGNER_LABEL[def.signing_plan.etrn_t4]}
            </div>
          </div>
        )}
        {!sessionId ? (
          <Button size="sm" onClick={start}>Начать тренировку</Button>
        ) : (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span>Шаг {stepIdx + 1} из {total}</span>
              <span className="text-muted-foreground">Выполнено: {doneCount}/{total}</span>
            </div>
            <div className="rounded-md border p-2 bg-background space-y-1">
              <div className="font-medium">{current.title}</div>
              <div className="text-xs text-muted-foreground">{current.hint}</div>
              <div className="text-xs text-emerald-700">Зачем: {current.why}</div>
            </div>
            <div className="space-y-1 max-h-44 overflow-auto rounded-md border p-2">
              {TRAIN_STEPS.map((s, i) => (
                <label key={s.id} className="flex items-center gap-2 text-xs">
                  <Checkbox checked={!!done[s.id]} onCheckedChange={() => toggleDone(s.id)} />
                  <span className={i === stepIdx ? "font-medium" : ""}>{i + 1}. {s.title}</span>
                </label>
              ))}
            </div>
            {stepIdx >= total - 1 && (
              <div className="rounded-md border p-2 text-xs bg-muted/40">
                <div className="font-medium">Итог тренировки</div>
                <div>Выполнено: {doneCount} из {total}.</div>
                {skipped.length > 0 ? (
                  <div className="text-amber-700">Пропущено: {skipped.join("; ")}.</div>
                ) : (
                  <div className="text-emerald-700">Все шаги пройдены — отличная работа.</div>
                )}
              </div>
            )}
            <div className="flex gap-2">
              <Button size="sm" onClick={next} disabled={stepIdx >= total - 1}>Дальше</Button>
              <Button size="sm" variant="outline" onClick={complete}>Завершить</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
