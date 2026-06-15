import { AppHeader } from "@/components/AppHeader";
import { DispatcherShell } from "@/components/dispatcher/DispatcherShell";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useLocation } from "@tanstack/react-router";

interface Props {
  title: string;
  onCreate?: () => void;
  createLabel?: string;
  toolbar?: React.ReactNode;
  children: React.ReactNode;
}

export function EntityTableLayout({
  title,
  onCreate,
  createLabel = "Добавить",
  toolbar,
  children,
}: Props) {
  const pathname = useLocation({ select: (l) => l.pathname });
  const isDispatcher = pathname.startsWith("/dispatcher");

  const content = (
    <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {onCreate && (
          <Button onClick={onCreate} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            {createLabel}
          </Button>
        )}
      </div>
      {toolbar && <div className="mb-4 flex flex-wrap gap-2">{toolbar}</div>}
      {children}
    </main>
  );

  if (isDispatcher) {
    return <DispatcherShell>{content}</DispatcherShell>;
  }
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      {content}
    </div>
  );
}
