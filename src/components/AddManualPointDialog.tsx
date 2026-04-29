import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { PAYMENT_LABELS, type PaymentType } from "@/lib/orders";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** id исходной заявки на транспорт (delivery_routes.source_request_id) */
  sourceRequestId: string;
  /** id доставочного маршрута для инвалидации запросов */
  deliveryRouteId: string;
  /** текущее количество точек (нужно для point_number) */
  currentPointsCount: number;
};

const PAYMENT_TYPES: PaymentType[] = ["cash", "card", "online", "qr"];

export function AddManualPointDialog({
  open,
  onOpenChange,
  sourceRequestId,
  deliveryRouteId,
  currentPointsCount,
}: Props) {
  const qc = useQueryClient();

  const [orderNumber, setOrderNumber] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [address, setAddress] = useState("");
  const [mapLink, setMapLink] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [amountDue, setAmountDue] = useState("");
  const [paymentType, setPaymentType] = useState<PaymentType>("cash");
  const [prepaid, setPrepaid] = useState(false);
  const [requiresQr, setRequiresQr] = useState(false);
  const [comment, setComment] = useState("");

  const reset = () => {
    setOrderNumber("");
    setContactName("");
    setContactPhone("");
    setAddress("");
    setMapLink("");
    setLatitude("");
    setLongitude("");
    setAmountDue("");
    setPaymentType("cash");
    setPrepaid(false);
    setRequiresQr(false);
    setComment("");
  };

  const add = useMutation({
    mutationFn: async () => {
      if (!orderNumber.trim()) throw new Error("Укажите номер заказа");
      if (!address.trim()) throw new Error("Укажите адрес");

      // 1) Создаём заказ
      const lat = latitude.trim() ? Number(latitude) : null;
      const lng = longitude.trim() ? Number(longitude) : null;
      if (lat != null && Number.isNaN(lat)) throw new Error("Некорректная широта");
      if (lng != null && Number.isNaN(lng)) throw new Error("Некорректная долгота");
      const amt = amountDue.trim() ? Number(amountDue) : null;
      if (amt != null && Number.isNaN(amt)) throw new Error("Некорректная сумма");

      const { data: order, error: orderErr } = await supabase
        .from("orders")
        .insert({
          order_number: orderNumber.trim(),
          contact_name: contactName.trim() || null,
          contact_phone: contactPhone.trim() || null,
          delivery_address: address.trim(),
          map_link: mapLink.trim() || null,
          latitude: lat,
          longitude: lng,
          amount_due: amt,
          payment_type: paymentType,
          payment_status: prepaid ? "paid" : "not_paid",
          requires_qr: requiresQr,
          comment: comment.trim() || null,
          status: "in_progress",
          source: "manual",
        })
        .select("id")
        .single();
      if (orderErr) throw orderErr;

      // 2) Создаём точку маршрута
      const { error: pErr } = await supabase.from("route_points").insert({
        route_id: sourceRequestId,
        order_id: order.id,
        point_number: currentPointsCount + 1,
        status: "pending",
      });
      if (pErr) throw pErr;
    },
    onSuccess: () => {
      toast.success("Точка добавлена");
      qc.invalidateQueries({ queryKey: ["delivery-route-points", sourceRequestId] });
      qc.invalidateQueries({ queryKey: ["delivery-route", deliveryRouteId] });
      reset();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Добавить точку маршрута</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="on">Номер заказа *</Label>
            <Input
              id="on"
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cn">Клиент</Label>
            <Input
              id="cn"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cp">Телефон</Label>
            <Input
              id="cp"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              placeholder="+7..."
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ad">Адрес *</Label>
            <Textarea
              id="ad"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              rows={2}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ml">Ссылка на карту</Label>
            <Input
              id="ml"
              value={mapLink}
              onChange={(e) => setMapLink(e.target.value)}
              placeholder="https://maps.google.com/..."
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="lat">Широта</Label>
              <Input
                id="lat"
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                placeholder="55.7558"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="lng">Долгота</Label>
              <Input
                id="lng"
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                placeholder="37.6173"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="am">Сумма к получению, ₽</Label>
              <Input
                id="am"
                inputMode="decimal"
                value={amountDue}
                onChange={(e) => setAmountDue(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Тип оплаты</Label>
              <Select value={paymentType} onValueChange={(v) => setPaymentType(v as PaymentType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {PAYMENT_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <Label htmlFor="prepaid" className="m-0">Оплачено заранее</Label>
            <Switch id="prepaid" checked={prepaid} onCheckedChange={setPrepaid} />
          </div>
          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <Label htmlFor="qr" className="m-0">Нужен QR-код</Label>
            <Switch id="qr" checked={requiresQr} onCheckedChange={setRequiresQr} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cm">Комментарий менеджера</Label>
            <Textarea
              id="cm"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={() => add.mutate()} disabled={add.isPending}>
            {add.isPending ? "Добавление…" : "Добавить точку"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
