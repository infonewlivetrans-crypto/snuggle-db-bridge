import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Download,
  FileSpreadsheet,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Info,
} from "lucide-react";
import {
  downloadRouteTemplate,
  importRouteFromFile,
  type RouteImportResult,
} from "@/lib/route-excel-import";
import { toast } from "sonner";

export const Route = createFileRoute("/route-import-template")({
  head: () => ({
    meta: [
      { title: "Шаблон импорта маршрута — Радиус Трек" },
      {
        name: "description",
        content: "Скачайте шаблон Excel и загрузите маршрут с точками доставки",
      },
    ],
  }),
  component: RouteImportTemplatePage,
});

const COLUMNS: Array<{ key: string; label: string; required?: boolean }> = [
  { key: "route_number", label: "Номер маршрута", required: true },
  { key: "driver_name", label: "ФИО водителя", required: true },
  { key: "vehicle_number", label: "Госномер машины" },
  { key: "order_number", label: "Номер заказа", required: true },
  { key: "customer_name", label: "Клиент / получатель", required: true },
  { key: "customer_phone", label: "Телефон клиента" },
  { key: "delivery_address", label: "Адрес доставки", required: true },
  { key: "map_link", label: "Ссылка на карту (Яндекс/Google)" },
  { key: "coordinates", label: "Координаты, например 55.7558, 37.6173" },
  { key: "amount_to_collect", label: "Сумма к получению, ₽" },
  { key: "payment_type", label: "Тип оплаты: наличные / карта / онлайн / qr" },
  { key: "prepaid", label: "Оплачено заранее: да / нет" },
  { key: "requires_qr", label: "Нужен QR-код: да / нет" },
  { key: "marketplace", label: "Маркетплейс (Ozon, WB и т. п.)" },
  { key: "manager_comment", label: "Комментарий менеджера" },
];

function RouteImportTemplatePage() {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RouteImportResult | null>(null);

  const handleImport = async () => {
    if (!file) return;
    setBusy(true);
    setResult(null);
    try {
      const r = await importRouteFromFile(file);
      setResult(r);
      qc.invalidateQueries({ queryKey: ["delivery-routes"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      if (r.routesCreated > 0 && r.errors.length === 0) {
        toast.success(
          `Импорт завершён: маршрутов ${r.routesCreated}, точек ${r.pointsCreated}`,
        );
      } else if (r.routesCreated > 0) {
        toast.warning(
          `Маршрутов: ${r.routesCreated}, точек: ${r.pointsCreated}, ошибок: ${r.errors.length}`,
        );
      } else {
        toast.error("Не заполнены обязательные данные");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка импорта");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="mb-6">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <FileSpreadsheet className="h-6 w-6 text-muted-foreground" />
            Шаблон импорта маршрута
          </h1>
          <p className="text-sm text-muted-foreground">
            Скачайте шаблон, заполните и загрузите файл — система создаст маршрут и точки.
          </p>
        </div>

        <Alert className="mb-6">
          <Info className="h-4 w-4" />
          <AlertDescription>
            Заполните шаблон и загрузите файл. По одному маршруту может быть несколько строк
            — одна строка = одна точка доставки.
          </AlertDescription>
        </Alert>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">1. Скачать шаблон</CardTitle>
              <CardDescription>
                Excel-файл с заголовками и двумя строками-примерами.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={downloadRouteTemplate} className="gap-2">
                <Download className="h-4 w-4" />
                Скачать шаблон Excel
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">2. Загрузить заполненный файл</CardTitle>
              <CardDescription>
                Поддерживаются .xlsx и .xls.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="route-template-file">Файл Excel</Label>
                <Input
                  id="route-template-file"
                  type="file"
                  accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={(e) => {
                    setFile(e.target.files?.[0] ?? null);
                    setResult(null);
                  }}
                />
              </div>
              <Button onClick={handleImport} disabled={!file || busy} className="gap-2">
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileSpreadsheet className="h-4 w-4" />
                )}
                Импортировать
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-lg">Колонки шаблона</CardTitle>
            <CardDescription>
              Обязательные поля помечены значком. Адрес можно заменить координатами или
              ссылкой на карту.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Колонка</TableHead>
                  <TableHead>Описание</TableHead>
                  <TableHead className="w-32">Обязательно</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {COLUMNS.map((c) => (
                  <TableRow key={c.key}>
                    <TableCell className="font-mono text-xs">{c.key}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {c.label}
                    </TableCell>
                    <TableCell>
                      {c.required ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
                          <AlertTriangle className="h-3 w-3" />
                          Да
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {result && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                {result.errors.length === 0 ? (
                  <CheckCircle2 className="h-5 w-5 text-status-success" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                )}
                Результат импорта
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="rounded-md border border-border p-3">
                  <div className="text-xs text-muted-foreground">Маршрутов создано</div>
                  <div className="text-xl font-semibold">{result.routesCreated}</div>
                </div>
                <div className="rounded-md border border-border p-3">
                  <div className="text-xs text-muted-foreground">Точек загружено</div>
                  <div className="text-xl font-semibold">{result.pointsCreated}</div>
                </div>
                <div className="rounded-md border border-border p-3">
                  <div className="text-xs text-muted-foreground">Ошибок</div>
                  <div className="text-xl font-semibold">{result.errors.length}</div>
                </div>
              </div>

              {result.errors.length > 0 && (
                <div className="rounded-md border border-border">
                  <div className="border-b border-border bg-muted/40 px-3 py-2 text-sm font-medium">
                    Не загружены строки
                  </div>
                  <ul className="max-h-64 space-y-1 overflow-auto p-3 text-sm">
                    {result.errors.map((e, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="font-mono text-xs text-muted-foreground">
                          стр. {e.row}
                        </span>
                        <span>{e.message}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {result.deliveryRouteIds.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {result.deliveryRouteIds.map((id) => (
                    <Button key={id} asChild size="sm" variant="outline">
                      <Link
                        to="/driver/$deliveryRouteId"
                        params={{ deliveryRouteId: id }}
                      >
                        Открыть в интерфейсе водителя
                      </Link>
                    </Button>
                  ))}
                  <Button asChild size="sm" variant="ghost">
                    <Link to="/delivery-routes">К списку маршрутов</Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
