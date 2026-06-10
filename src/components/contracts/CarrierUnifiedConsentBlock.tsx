import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FileText } from "lucide-react";
import {
  CARRIER_OFFER_FULL_TEXT,
  CARRIER_OFFER_VERSION,
  CARRIER_OFFER_MINIMUM_FEE,
} from "@/lib/contracts/carrier-offer";

interface Props {
  accepted: boolean;
  acceptedByName: string;
  onAcceptedChange: (v: boolean) => void;
  onAcceptedByNameChange: (v: string) => void;
}

/**
 * Единый блок согласия на договор-оферту и комиссию.
 * Используется в публичных формах регистрации перевозчика.
 * Не создаёт отдельной записи в БД — commission-поля заполняются через API.
 */
export function CarrierUnifiedConsentBlock({
  accepted,
  acceptedByName,
  onAcceptedChange,
  onAcceptedByNameChange,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <section className="rounded-md border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="font-semibold">Договор-оферта и комиссия</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button type="button" variant="outline" size="sm">
              <FileText className="h-4 w-4 mr-2" />
              Открыть полный текст договора
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>
                Договор-оферта и комиссия{" "}
                <span className="text-xs text-muted-foreground ml-2">
                  ред. {CARRIER_OFFER_VERSION}
                </span>
              </DialogTitle>
              <DialogDescription>
                Прочитайте условия договора-оферты и подтвердите согласие на
                оказание услуг диспетчера.
              </DialogDescription>
            </DialogHeader>
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed overflow-y-auto pr-2">
              {CARRIER_OFFER_FULL_TEXT}
            </pre>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-1 text-sm text-muted-foreground">
        <p>Комиссия сервиса: 5% от ставки рейса, но не менее {CARRIER_OFFER_MINIMUM_FEE} ₽.</p>
        <p>
          Комиссия оплачивается после получения оплаты за перевозку, если иное
          не согласовано сторонами.
        </p>
      </div>

      <label className="flex items-start gap-2 text-sm cursor-pointer">
        <Checkbox
          checked={accepted}
          onCheckedChange={(v) => onAcceptedChange(Boolean(v))}
          className="mt-0.5"
        />
        <span>
          Я принимаю условия договора-оферты и подтверждаю согласие на
          комиссию 5%
        </span>
      </label>

      <div>
        <Label className="text-sm">ФИО принимающего договор *</Label>
        <Input
          value={acceptedByName}
          onChange={(e) => onAcceptedByNameChange(e.target.value)}
          placeholder="Иванов Иван Иванович"
        />
      </div>
    </section>
  );
}
