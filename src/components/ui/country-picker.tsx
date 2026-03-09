import { useState, useRef, useEffect } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronDown, Search, Check } from "lucide-react";
import { COUNTRIES, findCountryByName } from "@/utils/geolocation";
import { cn } from "@/lib/utils";

interface CountryPickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export default function CountryPicker({ value, onChange, placeholder = "Select country", className }: CountryPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const selectedCountry = value ? findCountryByName(value) : undefined;

  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 100);
  }, [open]);

  const filtered = search
    ? COUNTRIES.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.code.toLowerCase().includes(search.toLowerCase())
      )
    : COUNTRIES;

  const handleSelect = (name: string) => {
    onChange(name);
    setOpen(false);
    setSearch("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between font-normal h-10",
            !value && "text-muted-foreground",
            className
          )}
        >
          <span className="flex items-center gap-2 truncate">
            {selectedCountry && <span className="text-base leading-none">{selectedCountry.flag}</span>}
            <span className="truncate">{value || placeholder}</span>
          </span>
          <ChevronDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-0 z-[60]" align="start">
        <div className="p-2 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search country..."
              className="pl-8 h-8 text-sm"
            />
          </div>
        </div>
        <ScrollArea className="h-[220px]">
          <div className="py-1">
            {filtered.map((country) => (
              <button
                key={country.code}
                type="button"
                onClick={() => handleSelect(country.name)}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted/60 transition-colors text-left",
                  value === country.name && "bg-primary/5 text-primary"
                )}
              >
                <span className="text-base leading-none">{country.flag}</span>
                <span className="flex-1 truncate">{country.name}</span>
                {value === country.name && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="text-center py-4 text-sm text-muted-foreground">No country found</p>
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
