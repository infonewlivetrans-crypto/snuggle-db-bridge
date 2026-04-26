import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db } from "@/lib/db";
import {
  CARRIER_TYPE_LABELS,
  CARRIER_TYPE_ORDER,
  type Carrier,
  type CarrierType,
} from "@/lib/carriers";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  carrier?: Carrier | null;
}

export function CarrierFormDialog({ open, onOpenChange, carrier }: Props) {
  const qc = useQueryClient();
  const isEdit = !!carrier;
  const [carrierType, setCarrierType] = useState<CarrierType>(carrier?.carrier_type ?? "ip");
  const [companyName, setCompanyName] = useState(carrier?.company_name ?? "");
  const [inn, setInn] = useState(carrier?.inn ?? "");
  const [ogrn, setOgrn] = useState(carrier?.ogrn ?? "");
  const [phone, setPhone] = useState(carrier?.phone ?? "");
  const [email, setEmail] = useState(carrier?.email ?? "");
  const [city, setCity] = useState(carrier?.city ?? "");
  const [contactPerson, setContactPerson] = useState(carrier?.contact_person ?? "");
  const [bankName, setBankName] = useState(carrier?.bank_name ?? "");
  const [bankAccount, setBankAccount] = useState(carrier?.bank_account ?? "");
  const [bankBik, setBankBik] = useState(carrier?.bank_bik ?? "");
  const [bankCorr, setBankCorr] = useState(carrier?.bank_corr_account ?? "");

  const mutation = useMutation({
    mutationFn: async () => {
      if (!companyName.trim()) throw new Error("Укажите название / ФИО");
      const payload = {
        carrier_type: carrierType,
        company_name: companyName.trim(),
        inn: inn.trim() || null,
        ogrn: ogrn.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        city: city.trim() || null,
        contact_person: contactPerson.trim() || null,
        bank_name: bankName.trim() || null,
        bank_account: bankAccount.trim() || null,
        bank_bik: bankBik.trim() || null,
        bank_corr_account: bankCorr.trim() || null,
      };
      if (isEdit && carrier) {
        const { error } = await db.from("carriers").update(payload).eq("id", carrier.id);
        if (error) throw error;
      } else {
        const { error } = await db.from("carriers").insert({ ...payload, verification_status: "new" });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["carriers"] });
      qc.invalidateQueries({ queryKey: ["carrier", carrier?.id] });
      toast.success(isEdit ? "Перевозчик обновлён" : "Перевозчик создан");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Редактирование перевозчика" : "Новый перевозчик"}</DialogTitle>
          <DialogDescription>
            Заполните карточку перевозчика — после сохранения статус «Новый», передайте на проверку
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>Тип *</Label>
              <Select value={carrierType} onValueChange={(v) => setCarrierType(v as CarrierType)}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CARRIER_TYPE_ORDER.map((t) => (
                    <SelectItem key={t} value={t}>
                      {CARRIER_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Название / ФИО *</Label>
              <Input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder={carrierType === "ooo" ? "ООО «Радиус»" : "Иванов И. И."}
                className="mt-1.5"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>ИНН</Label>
              <Input value={inn} onChange={(e) => setInn(e.target.value)} className="mt-1.5 font-mono" />
            </div>
            <div>
              <Label>{carrierType === "ooo" ? "ОГРН" : "ОГРНИП"}</Label>
              <Input value={ogrn} onChange={(e) => setOgrn(e.target.value)} className="mt-1.5 font-mono" />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>Телефон</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1.5" />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1.5" />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>Город</Label>
              <Input value={city} onChange={(e) => setCity(e.target.value)} className="mt-1.5" />
            </div>
            <div>
              <Label>Контактное лицо</Label>
              <Input value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} className="mt-1.5" />
            </div>
          </div>

          <div>
            <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Банковские реквизиты
            </div>
            <div className="space-y-3 rounded-lg border border-border p-3">
              <div>
                <Label>Банк</Label>
                <Input value={bankName} onChange={(e) => setBankName(e.target.value)} className="mt-1.5" />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label>Расчётный счёт</Label>
                  <Input value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} className="mt-1.5 font-mono" />
                </div>
                <div>
                  <Label>БИК</Label>
                  <Input value={bankBik} onChange={(e) => setBankBik(e.target.value)} className="mt-1.5 font-mono" />
                </div>
              </div>
              <div>
                <Label>Корр. счёт</Label>
                <Input value={bankCorr} onChange={(e) => setBankCorr(e.target.value)} className="mt-1.5 font-mono" />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
              {mutation.isPending ? "Сохранение…" : isEdit ? "Сохранить" : "Создать"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Re-export Textarea for forms that need it elsewhere
export { Textarea };
