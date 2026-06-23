import { createFileRoute, Link } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, Truck, Users, FileSignature, Link2, ClipboardList } from "lucide-react";

// Минимальный кабинет экспедитора. Расширяется по мере подключения
// сценариев (заявки, договоры, ЭТрН, подписи). AI-диспетчер сюда не
// переносится, dispatcher-контур не меняется.

export const Route = createFileRoute("/forwarder")({
  head: () => ({ meta: [{ title: "Кабинет экспедитора — Радиус Трек" }] }),
  component: ForwarderPage,
});

const BLOCKS: Array<{ icon: typeof FileText; title: string; desc: string; href?: string }> = [
  { icon: ClipboardList, title: "Заявки", desc: "Входящие заявки от заказчиков и привлечённые перевозчики." },
  { icon: Truck, title: "Перевозчики", desc: "Сеть привлечённых перевозчиков и их транспорт." },
  { icon: FileText, title: "Документы", desc: "Договоры, заявки, акты, УПД, ЭТрН.",
    href: "/carrier/edo" },
  { icon: FileSignature, title: "ЭТрН и подписи", desc: "Статусы подписания и роли участников." },
  { icon: Users, title: "Грузоотправители / получатели", desc: "Справочник контрагентов ЭДО.",
    href: "/carrier/edo/counterparties" },
  { icon: Link2, title: "Ссылки участникам", desc: "Готовые ссылки для отправителя, водителя, получателя." },
];

function ForwarderPage() {
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto w-full max-w-[1200px] px-3 py-6 sm:px-4 lg:px-6 space-y-5">
        <div>
          <h1 className="text-2xl font-bold">Кабинет экспедитора</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Работа с заказчиком, привлечёнными перевозчиками, водителями,
            грузоотправителями и грузополучателями. Договоры, заявки, ЭТрН и подписи —
            в одном окне.
          </p>
          <div className="mt-2">
            <Badge variant="outline">Этап подготовки · mock / api_ready</Badge>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {BLOCKS.map(b => {
            const Icon = b.icon;
            const inner = (
              <Card className="h-full transition hover:bg-muted/40">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    {b.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">{b.desc}</CardContent>
              </Card>
            );
            return b.href
              ? <Link key={b.title} to={b.href}>{inner}</Link>
              : <div key={b.title}>{inner}</div>;
          })}
        </div>
      </main>
    </div>
  );
}
