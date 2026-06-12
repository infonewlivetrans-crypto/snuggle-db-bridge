import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
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
  VEHICLE_BODY_TYPES,
  getVehicleBodyTypeLabel,
} from "@/lib/dispatcher/vehicle-options";

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
  disabled?: boolean;
  className?: string;
}

/** Единый выпадающий список типов кузова с поиском. */
export function VehicleBodyTypeSelect({
  value,
  onChange,
  placeholder = "Выберите тип кузова",
  allowEmpty = true,
  emptyLabel = "—",
  disabled,
  className,
}: Props) {
  const [open, setOpen] = useState(false);

  const isKnown = useMemo(
    () => VEHICLE_BODY_TYPES.some((o) => o.value === value),
    [value],
  );

  const currentLabel = !value
    ? ""
    : isKnown
      ? getVehicleBodyTypeLabel(value)
      : `Текущее: ${getVehicleBodyTypeLabel(value)}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full justify-between font-normal", className)}
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {currentLabel || placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Поиск..." />
          <CommandList>
            <CommandEmpty>Ничего не найдено</CommandEmpty>
            <CommandGroup>
              {allowEmpty && (
                <CommandItem
                  value="__empty__"
                  onSelect={() => {
                    onChange("");
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === "" ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {emptyLabel}
                </CommandItem>
              )}
              {VEHICLE_BODY_TYPES.map((o) => (
                <CommandItem
                  key={o.value}
                  value={`${o.label} ${o.value}`}
                  onSelect={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === o.value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {o.label}
                </CommandItem>
              ))}
              {value && !isKnown && (
                <CommandItem
                  value={`current-${value}`}
                  onSelect={() => setOpen(false)}
                >
                  <Check className="mr-2 h-4 w-4 opacity-100" />
                  Текущее: {value}
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
