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
import { Switch } from "@/components/ui/switch";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiPost, apiPatch, fetchListViaApi } from "@/lib/api-client";
import { PhotoUpload } from "@/components/PhotoUpload";
import type { Carrier, Driver } from "@/lib/carriers";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driver?: Driver | null;
  defaultCarrierId?: string;
}

export function DriverFormDialog({ open, onOpenChange, driver, defaultCarrierId }: Props) {
  const qc = useQueryClient();
  const isEdit = !!driver;

  const [carrierId, setCarrierId] = useState<string>(driver?.carrier_id ?? defaultCarrierId ?? "");
  const [fullName, setFullName] = useState(driver?.full_name ?? "");
  const [phone, setPhone] = useState(driver?.phone ?? "");
  const [passportSeries, setPassportSeries] = useState(driver?.passport_series ?? "");
  const [passportNumber, setPassportNumber] = useState(driver?.passport_number ?? "");
  const [passportIssuedBy, setPassportIssuedBy] = useState(driver?.passport_issued_by ?? "");
  const [passportIssuedDate, setPassportIssuedDate] = useState(driver?.passport_issued_date ?? "");
  const [licenseNumber, setLicenseNumber] = useState(driver?.license_number ?? "");
  const [licenseIssuedDate, setLicenseIssuedDate] = useState(driver?.license_issued_date ?? "");
  const [licenseExpiresDate, setLicenseExpiresDate] = useState(driver?.license_expires_date ?? "");
  const [licenseCategories, setLicenseCategories] = useState(driver?.license_categories ?? "");
  const [photoUrl, setPhotoUrl] = useState<string | null>(driver?.photo_url ?? null);
  const [isActive, setIsActive] = useState(driver?.is_active ?? true);
  const [comment, setComment] = useState(driver?.comment ?? "");

  const { data: carriers } = useQuery({
    queryKey: ["carriers", "select"],
    enabled: open,
    queryFn: async (): Promise<Carrier[]> => {
      const { rows } = await fetchListViaApi<Carrier>("/api/carriers", { limit: 100 });
      return rows;
    },
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!carrierId) throw new Error("Выберите перевозчика");
      if (!fullName.trim()) throw new Error("Укажите ФИО");
      const payload = {
        carrier_id: carrierId,
        full_name: fullName.trim(),
        phone: phone.trim() || null,
        passport_series: passportSeries.trim() || null,
        passport_number: passportNumber.trim() || null,
        passport_issued_by: passportIssuedBy.trim() || null,
        passport_issued_date: passportIssuedDate || null,
        license_number: licenseNumber.trim() || null,
        license_issued_date: licenseIssuedDate || null,
        license_expires_date: licenseExpiresDate || null,
        license_categories: licenseCategories.trim() || null,
        photo_url: photoUrl,
        is_active: isActive,
        comment: comment.trim() || null,
      };
      if (isEdit && driver) {
        await apiPatch(`/api/drivers/${driver.id}`, payload);
      } else {
        await apiPost(`/api/drivers`, payload);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["drivers"] });
      qc.invalidateQueries({ queryKey: ["carrier", carrierId] });
      toast.success(isEdit ? "Водитель обновлён" : "Водитель добавлен");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Редактирование водителя" : "Новый водитель"}</DialogTitle>
          <DialogDescription>Карточка водителя и привязка к перевозчику</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Перевозчик *</Label>
              <Select value={carrierId} onValueChange={setCarrierId}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Выберите перевозчика" />
                </SelectTrigger>
                <SelectContent>
                  {(carriers ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.company_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label>ФИО *</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} className="mt-1.5" />
            </div>
            <div>
              <Label>Телефон</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1.5" />
            </div>
            <div className="flex items-end justify-between gap-3 rounded-lg border border-border bg-secondary/40 p-3">
              <Label htmlFor="active" className="text-sm font-medium">
                Активен
              </Label>
              <Switch id="active" checked={isActive} onCheckedChange={setIsActive} />
            </div>
          </div>

          <div className="rounded-lg border border-border p-3">
            <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Паспортные данные
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label>Серия</Label>
                <Input value={passportSeries} onChange={(e) => setPassportSeries(e.target.value)} className="mt-1.5 font-mono" />
              </div>
              <div>
                <Label>Номер</Label>
                <Input value={passportNumber} onChange={(e) => setPassportNumber(e.target.value)} className="mt-1.5 font-mono" />
              </div>
              <div className="sm:col-span-2">
                <Label>Кем выдан</Label>
                <Input value={passportIssuedBy} onChange={(e) => setPassportIssuedBy(e.target.value)} className="mt-1.5" />
              </div>
              <div>
                <Label>Дата выдачи</Label>
                <Input type="date" value={passportIssuedDate ?? ""} onChange={(e) => setPassportIssuedDate(e.target.value)} className="mt-1.5" />
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border p-3">
            <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Водительское удостоверение
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label>Номер</Label>
                <Input value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} className="mt-1.5 font-mono" />
              </div>
              <div>
                <Label>Категории</Label>
                <Input value={licenseCategories} onChange={(e) => setLicenseCategories(e.target.value)} placeholder="B, C, CE" className="mt-1.5" />
              </div>
              <div>
                <Label>Дата выдачи</Label>
                <Input type="date" value={licenseIssuedDate ?? ""} onChange={(e) => setLicenseIssuedDate(e.target.value)} className="mt-1.5" />
              </div>
              <div>
                <Label>Действует до</Label>
                <Input type="date" value={licenseExpiresDate ?? ""} onChange={(e) => setLicenseExpiresDate(e.target.value)} className="mt-1.5" />
              </div>
            </div>
          </div>

          <PhotoUpload label="Фото водителя" value={photoUrl} onChange={setPhotoUrl} prefix="drivers" />

          <div>
            <Label>Комментарий</Label>
            <Textarea value={comment} onChange={(e) => setComment(e.target.value)} className="mt-1.5" rows={2} />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
              {mutation.isPending ? "Сохранение…" : isEdit ? "Сохранить" : "Добавить"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
