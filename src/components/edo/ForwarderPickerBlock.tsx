// Поиск и выбор экспедитора из справочника диспетчера для ЭПД-сценария.
// Возвращает выбранного экспедитора + режим участия. Snapshot ГосЛог
// сохраняется на сервере при сохранении сценария.
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { apiGetAuth } from "@/lib/api-client";
import {
  EPD_POSSESSION_LABEL, type ForwarderPossessionMode, type EpdScenarioType,
} from "@/lib/edo/scenarios";
import type {
  ForwarderPublicRow, ForwarderPublicCard,
} from "@/lib/edo/forwarder-snapshot";
import { isGoslogConfirmed } from "@/lib/edo/forwarder-snapshot";

const GOSLOG_LABEL: Record<string, string> = {
  unknown: "ГосЛог: не проверен",
  needs_check: "ГосЛог: проверить",
  pending_application: "ГосЛог: ожидает",
  included: "ГосЛог ✓",
  not_found: "ГосЛог: не найден",
  rejected: "ГосЛог: отказ",
  error: "ГосЛог: ошибка",
  manually_verified: "ГосЛог: ручная проверка",
  expired_or_risk: "ГосЛог: просрочен/риск",
};

interface Props {
  scenarioType: EpdScenarioType;
  value: string | null;
  possessionMode: ForwarderPossessionMode | null;
  onChange: (forwarderId: string | null, name: string | null) => void;
  onPossessionChange: (mode: ForwarderPossessionMode) => void;
}

export function ForwarderPickerBlock({
  scenarioType, value, possessionMode, onChange, onPossessionChange,
}: Props) {
  const [q, setQ] = useState("");

  const search = useQuery({
    queryKey: ["carrier", "edo", "forwarders", "search", q],
    queryFn: () =>
      apiGetAuth<{ rows: ForwarderPublicRow[] }>(
        `/api/carrier/edo/forwarders?q=${encodeURIComponent(q)}`,
      ),
    enabled: !value,
  });

  const card = useQuery({
    queryKey: ["carrier", "edo", "forwarders", "card", value],
    queryFn: () =>
      apiGetAuth<ForwarderPublicCard>(
        `/api/carrier/edo/forwarders/${value}`,
      ),
    enabled: !!value,
  });

  // Подсказка про несоответствие сценария и режима.
  let possessionWarning: string | null = null;
  if (value) {
    if (scenarioType === "forwarder_with_possession" &&
        possessionMode && possessionMode !== "accepting_cargo_possession") {
      possessionWarning = "Выбран сценарий с экспедитором во владении, но режим участия другой.";
    } else if (scenarioType === "forwarder_warehouse_storage" &&
        possessionMode && possessionMode !== "warehouse_storage") {
      possessionWarning = "Сценарий предполагает хранение груза у экспедитора, но режим другой.";
    } else if (scenarioType === "forwarder_no_possession" &&
        possessionMode && possessionMode === "accepting_cargo_possession") {
      possessionWarning = "Сценарий без владения, но указан режим с владением грузом.";
    }
  }

  useEffect(() => {
    // если экспедитор выбран и режим неизвестен — авто-выставляем по сценарию.
    if (!value || possessionMode) return;
    if (scenarioType === "forwarder_no_possession") onPossessionChange("not_accepting_cargo");
    else if (scenarioType === "forwarder_with_possession") onPossessionChange("accepting_cargo_possession");
    else if (scenarioType === "forwarder_warehouse_storage") onPossessionChange("warehouse_storage");
  }, [value, possessionMode, scenarioType, onPossessionChange]);

  const empty = !search.isLoading && (search.data?.rows.length ?? 0) === 0 && !value;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Экспедитор</CardTitle>
        <p className="text-xs text-muted-foreground">
          Выберите экспедитора, который участвует в сценарии ЭПД. От его роли зависит
          комплект документов и кто подписывает титулы.
        </p>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!value && (
          <>
            <div>
              <Label className="text-xs">Поиск (ИНН, название, контактное лицо)</Label>
              <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Например: 7707083893" />
            </div>
            <div className="space-y-1">
              {search.isLoading && <div className="text-xs text-muted-foreground">Загрузка…</div>}
              {empty && (
                <div className="rounded-md border p-3 text-xs space-y-1 bg-muted/30">
                  <div>В справочнике диспетчера пока нет экспедиторов под этот запрос.</div>
                  <a className="underline text-primary" href="/dispatcher/forwarders" target="_blank" rel="noreferrer">
                    Открыть раздел экспедиторов
                  </a>
                </div>
              )}
              {(search.data?.rows ?? []).map(row => (
                <div key={row.id} className="flex items-center justify-between gap-2 rounded-md border p-2">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{row.company_name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {row.inn ? `ИНН ${row.inn}` : "ИНН не указан"}
                      {row.contact_person ? ` · ${row.contact_person}` : ""}
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => onChange(row.id, row.company_name)}>
                    Выбрать
                  </Button>
                </div>
              ))}
            </div>
          </>
        )}

        {value && (
          <>
            {card.isLoading && <div className="text-xs text-muted-foreground">Загрузка карточки…</div>}
            {card.data && (
              <div className="rounded-md border p-2 space-y-2">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="min-w-0">
                    <div className="font-medium">{card.data.forwarder.company_name}</div>
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      {card.data.forwarder.inn && <div>ИНН: {card.data.forwarder.inn}</div>}
                      {card.data.forwarder.ogrn && <div>ОГРН: {card.data.forwarder.ogrn}</div>}
                      {card.data.forwarder.phone && <div>{card.data.forwarder.phone}</div>}
                      {card.data.forwarder.email && <div>{card.data.forwarder.email}</div>}
                      {(card.data.forwarder.okved_codes ?? []).length > 0 && (
                        <div>ОКВЭД: {card.data.forwarder.okved_codes.join(", ")}</div>
                      )}
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => onChange(null, null)}>Сменить</Button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant={isGoslogConfirmed(card.data.goslog?.goslog_status) ? "default" : "outline"}>
                    {GOSLOG_LABEL[card.data.goslog?.goslog_status ?? "unknown"]
                      ?? `ГосЛог: ${card.data.goslog?.goslog_status ?? "не проверен"}`}
                  </Badge>
                  <Badge variant={card.data.forwarder.has_okved_5229 ? "default" : "outline"}>
                    {card.data.forwarder.has_okved_5229 ? "ОКВЭД 52.29 ✓" : "ОКВЭД 52.29 не указан"}
                  </Badge>
                  {card.data.goslog?.registry_number && (
                    <Badge variant="outline">Реестр: {card.data.goslog.registry_number}</Badge>
                  )}
                </div>
                {!isGoslogConfirmed(card.data.goslog?.goslog_status) && (
                  <div className="text-xs text-amber-700">
                    Экспедитор не подтверждён в ГосЛог. Перед использованием в рабочем
                    ЭПД-сценарии проверьте статус по официальному источнику.
                  </div>
                )}
                {!card.data.forwarder.has_okved_5229 && (
                  <div className="text-xs text-amber-700">
                    У экспедитора не указан ОКВЭД 52.29. Проверьте вид деятельности
                    перед работой по экспедиторскому сценарию.
                  </div>
                )}
              </div>
            )}

            <div>
              <Label className="text-xs">Режим участия экспедитора</Label>
              <Select value={possessionMode ?? "unknown"}
                onValueChange={v => onPossessionChange(v as ForwarderPossessionMode)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["not_accepting_cargo", "accepting_cargo_possession", "warehouse_storage", "agent_only", "unknown"] as ForwarderPossessionMode[]).map(v => (
                    <SelectItem key={v} value={v}>{EPD_POSSESSION_LABEL[v]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {possessionWarning && (
                <div className="text-xs text-amber-700 pt-1">{possessionWarning}</div>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              Экспедитор выбран из справочника диспетчера. Его статус ГосЛог и реквизиты
              будут зафиксированы в snapshot документа — даже если позже статус изменится,
              в документе останется история.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
