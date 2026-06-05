import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

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
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto w-full max-w-[1400px] px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h1 className="text-2xl font-bold">{title}</h1>
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
    </div>
  );
}
