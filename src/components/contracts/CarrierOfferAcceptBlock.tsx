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
  CARRIER_OFFER_TITLE,
  CARRIER_OFFER_VERSION,
  CARRIER_OFFER_DEFAULT_RATE,
  acceptanceText,
  formatPercent,
} from "@/lib/contracts/carrier-offer";

interface Props {
  commissionRate?: number | null;
  accepted: boolean;
  acceptedByName: string;
  onAcceptedChange: (v: boolean) => void;
  onAcceptedByNameChange: (v: string) => void;
}

/**
 * Универсальный блок акцепта договора-оферты для перевозчика.
 * Используется в /dispatcher/join, /dispatcher/register/$token и /carrier/activate/$token.
 */
export function CarrierOfferAcceptBlock({
  commissionRate,
  accepted,
  acceptedByName,
  onAcceptedChange,
  onAcceptedByNameChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const rate = commissionRate == null ? CARRIER_OFFER_DEFAULT_RATE : commissionRate;
  const pct = formatPercent(rate);

  return (
    <section className="rounded-md border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="font-semibold">{CARRIER_OFFER_TITLE}</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button type="button" variant="outline" size="sm">
              <FileText className="h-4 w-4 mr-2" />
              Открыть полный текст
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>
                {CARRIER_OFFER_TITLE} <span className="text-xs text-muted-foreground ml-2">ред. {CARRIER_OFFER_VERSION}</span>
              </DialogTitle>
            <DialogDescription>
              Прочитайте условия договора-оферты и подтвердите согласие на оказание услуг диспетчера.
            </DialogDescription>
            </DialogHeader>
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed overflow-y-auto pr-2">
              {CARRIER_OFFER_FULL_TEXT}
            </pre>
          </DialogContent>
        </Dialog>
      </div>

      <p className="text-xs text-muted-foreground">
        Редакция {CARRIER_OFFER_VERSION}. Комиссия по вашей карточке: <b>{pct}%</b>, минимум 500 ₽.
      </p>

      <label className="flex items-start gap-2 text-sm cursor-pointer">
        <Checkbox
          checked={accepted}
          onCheckedChange={(v) => onAcceptedChange(Boolean(v))}
          className="mt-0.5"
        />
        <span>{acceptanceText(rate)}</span>
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
