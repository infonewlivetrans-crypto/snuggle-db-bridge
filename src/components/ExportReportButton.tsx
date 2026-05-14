import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { exportReport, type ReportKind } from "@/lib/reports-export";
import { toast } from "sonner";

const LABELS: Record<ReportKind, string> = {
  delivery: "по доставке",
  payments: "по оплатам",
  drivers: "по водителям",
  transport: "по заявкам на транспорт",
};

export function ExportReportButton({
  kind,
  label,
  variant = "outline",
  size = "default",
}: {
  kind: ReportKind;
  label?: string;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm";
}) {
  const [busy, setBusy] = useState(false);

  const handle = async (format: "xlsx" | "docx") => {
    setBusy(true);
    try {
      await exportReport(kind, format);
      toast.success(`Отчёт ${LABELS[kind]} (${format.toUpperCase()}) сформирован`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка экспорта");
    } finally {
      setBusy(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={size} disabled={busy} className="gap-2">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {label ?? "Экспорт отчёта"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Отчёт {LABELS[kind]}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => handle("xlsx")} className="gap-2">
          <FileSpreadsheet className="h-4 w-4" /> Excel (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handle("docx")} className="gap-2">
          <FileText className="h-4 w-4" /> Word (.docx)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
