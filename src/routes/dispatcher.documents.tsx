import { createFileRoute } from "@tanstack/react-router";
import { DispatcherShell } from "@/components/dispatcher/DispatcherShell";
import { FileText } from "lucide-react";

export const Route = createFileRoute("/dispatcher/documents")({
  component: DispatcherDocumentsPage,
});

function DispatcherDocumentsPage() {
  return (
    <DispatcherShell>
      <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Документы</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Документы по сделкам, договоры, заявки и оригиналы.
          </p>
        </div>
        <div className="grid place-items-center rounded-2xl border border-dashed border-border bg-card/40 p-12 text-center">
          <FileText className="h-10 w-10 text-muted-foreground" />
          <div className="mt-4 text-base font-semibold text-foreground">
            Раздел в разработке
          </div>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Здесь появится единый реестр документов по сделкам с автоматической
            генерацией договоров-заявок и контролем оригиналов.
          </p>
        </div>
      </div>
    </DispatcherShell>
  );
}
