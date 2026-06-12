import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  searchPlaces,
  isKnownPlace,
  PLACE_KIND_LABEL,
  type RussianPlace,
} from "@/lib/cities/russian-places";

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Высота триггера (по умолчанию обычная). */
  size?: "sm" | "md";
  /** Доп. подсказка под полем. */
  helper?: string;
  /** Скрыть бейдж "не найден в справочнике". */
  hideUnknownBadge?: boolean;
}

/**
 * Единый компонент выбора населённого пункта.
 *
 * - Поиск по локальному справочнику (городов, ПГТ, посёлков, станиц, сёл,
 *   хуторов России).
 * - Разрешает ручной ввод, если в справочнике пусто.
 * - Старые значения из БД, которых нет в справочнике, отображаются как есть,
 *   но помечаются "не найден в справочнике".
 */
export function CityCombobox({
  value,
  onChange,
  placeholder = "Город, станица, село…",
  disabled,
  className,
  size = "md",
  helper,
  hideUnknownBadge,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const results = useMemo<RussianPlace[]>(() => searchPlaces(query, 40), [query]);

  const trimmed = query.trim();
  const showCustom =
    trimmed.length > 0 &&
    !results.some((r) => r.name.toLowerCase() === trimmed.toLowerCase());

  const isUnknown = !!value && !isKnownPlace(value);

  return (
    <div className={cn("space-y-1", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              "w-full justify-between font-normal",
              size === "sm" && "h-8 text-sm",
            )}
          >
            <span className={cn("truncate text-left", !value && "text-muted-foreground")}>
              {value || placeholder}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[--radix-popover-trigger-width] p-0"
          align="start"
        >
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Начните вводить название…"
              value={query}
              onValueChange={setQuery}
            />
            <CommandList>
              <CommandEmpty>Ничего не найдено</CommandEmpty>
              <CommandGroup>
                {value && (
                  <CommandItem
                    value="__clear__"
                    onSelect={() => {
                      onChange("");
                      setOpen(false);
                      setQuery("");
                    }}
                  >
                    <Check className="mr-2 h-4 w-4 opacity-0" />
                    <span className="text-muted-foreground">Очистить</span>
                  </CommandItem>
                )}
                {showCustom && (
                  <CommandItem
                    value={`__custom__${trimmed}`}
                    onSelect={() => {
                      onChange(trimmed);
                      setOpen(false);
                      setQuery("");
                    }}
                  >
                    <Check className="mr-2 h-4 w-4 opacity-0" />
                    <span>
                      Использовать <b>«{trimmed}»</b>{" "}
                      <span className="text-xs text-muted-foreground">
                        — нет в справочнике
                      </span>
                    </span>
                  </CommandItem>
                )}
                {results.map((p) => (
                  <CommandItem
                    key={`${p.name}|${p.region}|${p.kind}`}
                    value={`${p.name} ${p.region}`}
                    onSelect={() => {
                      onChange(p.name);
                      setOpen(false);
                      setQuery("");
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === p.name ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="flex-1 truncate">
                      <span className="text-xs text-muted-foreground mr-1">
                        {PLACE_KIND_LABEL[p.kind]}
                      </span>
                      {p.name}
                    </span>
                    <span className="ml-2 text-xs text-muted-foreground truncate">
                      {p.region}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {isUnknown && !hideUnknownBadge && (
        <p className="text-xs text-amber-600 flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          Не найден в справочнике — будет сохранён как есть
        </p>
      )}
      {helper && <p className="text-xs text-muted-foreground">{helper}</p>}
    </div>
  );
}

interface MultiProps {
  /** Список выбранных названий. */
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Множественный выбор населённых пунктов с поиском.
 * Используется, например, для "Куда готов ехать".
 */
export function CityMultiCombobox({
  value,
  onChange,
  placeholder = "Добавить город…",
  disabled,
  className,
}: MultiProps) {
  const add = (name: string) => {
    const n = name.trim();
    if (!n) return;
    if (value.some((v) => v.toLowerCase() === n.toLowerCase())) return;
    onChange([...value, n]);
  };
  const remove = (name: string) =>
    onChange(value.filter((v) => v !== name));

  return (
    <div className={cn("space-y-2", className)}>
      <CityCombobox
        value=""
        onChange={(v) => add(v)}
        placeholder={placeholder}
        disabled={disabled}
        hideUnknownBadge
      />
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((name) => {
            const unknown = !isKnownPlace(name);
            return (
              <button
                key={name}
                type="button"
                onClick={() => remove(name)}
                className={cn(
                  "px-2 py-0.5 rounded-md border text-xs hover:bg-accent",
                  unknown
                    ? "border-amber-400 text-amber-700"
                    : "border-border text-foreground",
                )}
                title={
                  unknown
                    ? "Не найден в справочнике — будет сохранён как есть. Нажмите, чтобы удалить."
                    : "Нажмите, чтобы удалить"
                }
              >
                {name} ×
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
