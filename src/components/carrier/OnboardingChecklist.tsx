import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, Circle, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { apiGetAuth } from "@/lib/api-client";

export type OnboardingStatus = {
  ok: boolean;
  linked: boolean;
  canAppearOnMap: boolean;
  carrierComplete?: boolean;
  commissionAgreed?: boolean;
  requisitesComplete?: boolean;
  documentsComplete?: boolean;
  hasDriver?: boolean;
  driverComplete?: boolean;
  driverDocumentsComplete?: boolean;
  hasVehicle?: boolean;
  vehicleComplete?: boolean;
  vehicleDocumentsComplete?: boolean;
  hasVehicleDriverBinding?: boolean;
  hasLocation?: boolean;
  missing?: string[];
  nextStep?: string;
};

const ITEMS: Array<{ key: keyof OnboardingStatus; label: string }> = [
  { key: "carrierComplete", label: "Данные компании" },
  { key: "commissionAgreed", label: "Согласие на комиссию" },
  { key: "requisitesComplete", label: "Реквизиты и налоговый режим" },
  { key: "documentsComplete", label: "Документы перевозчика" },
  { key: "hasDriver", label: "Добавлен водитель" },
  { key: "driverComplete", label: "Данные водителя" },
  { key: "driverDocumentsComplete", label: "Документы водителя" },
  { key: "hasVehicle", label: "Добавлен транспорт" },
  { key: "vehicleComplete", label: "Данные транспорта" },
  { key: "vehicleDocumentsComplete", label: "Документы транспорта" },
  { key: "hasVehicleDriverBinding", label: "Водитель закреплён за машиной" },
  { key: "hasLocation", label: "Указано местоположение" },
];

export function useOnboardingStatus() {
  return useQuery({
    queryKey: ["carrier", "onboarding-status"],
    queryFn: () =>
      apiGetAuth<OnboardingStatus>("/api/carrier/onboarding-status", 10000),
    staleTime: 30_000,
    retry: false,
  });
}

export function OnboardingChecklist() {
  const { data } = useOnboardingStatus();
  if (!data || !data.linked) return null;
  if (data.canAppearOnMap) {
    return (
      <Card className="border-emerald-300 bg-emerald-50">
        <CardContent className="flex items-center gap-3 py-4 text-sm">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          <div className="flex-1">
            <div className="font-medium text-emerald-900">
              Настройка завершена
            </div>
            <div className="text-emerald-800/80">
              Ваша машина участвует в подборе грузов диспетчера.
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const done = ITEMS.filter((i) => data[i.key] === true).length;
  const pct = Math.round((done / ITEMS.length) * 100);

  return (
    <Card className="border-amber-300 bg-amber-50/60">
      <CardContent className="space-y-3 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-base font-semibold text-amber-900">
              Завершите настройку, чтобы получать предложения рейсов
            </div>
            <div className="text-xs text-amber-800/80">
              Машина появится на карте AI-диспетчера после заполнения минимума.
            </div>
          </div>
          <Button asChild size="sm">
            <Link to="/carrier/onboarding">
              Продолжить настройку <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </div>
        <Progress value={pct} className="h-2" />
        <ul className="grid gap-1.5 text-sm sm:grid-cols-2">
          {ITEMS.map((it) => {
            const ok = data[it.key] === true;
            return (
              <li
                key={String(it.key)}
                className="flex items-center gap-2 text-foreground/90"
              >
                {ok ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                ) : (
                  <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <span className={ok ? "line-through opacity-70" : ""}>
                  {it.label}
                </span>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
