import { createFileRoute } from "@tanstack/react-router";
import { ClipboardList } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/carrier/trips")({
  head: () => ({ meta: [{ title: "Задания и рейсы — кабинет перевозчика" }] }),
  component: CarrierTripsPage,
});

function CarrierTripsPage() {
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-medium">Задания и рейсы</h2>
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-2 py-10 text-center text-sm text-muted-foreground">
          <ClipboardList className="h-8 w-8" />
          <div>Пока нет назначенных рейсов.</div>
          <div>
            Когда диспетчер подберёт груз под ваш транспорт, задание появится здесь.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
