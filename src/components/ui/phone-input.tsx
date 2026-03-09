import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ChevronDown, Search } from "lucide-react";
import { COUNTRIES, type CountryInfo } from "@/utils/geolocation";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  defaultCountryCode?: string;
  className?: string;
  placeholder?: string;
}

export default function PhoneInput({ value, onChange, defaultCountryCode = "BD", className, placeholder }: PhoneInputProps) {
  const [selectedCountry, setSelectedCountry] = useState<CountryInfo>(
    COUNTRIES.find(c => c.code === defaultCountryCode) || COUNTRIES.find(c => c.code === "BD")!
  );
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const match = COUNTRIES.find(c => c.code === defaultCountryCode);
    if (match) {
      setSelectedCountry(match);
      // If no value yet, pre-fill dial code
      if (!value) {
        onChange(match.dialCode + " ");
      }
    }
  }, [defaultCountryCode]);

  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 100);
  }, [open]);

  const handleCountrySelect = (country: CountryInfo) => {
    setSelectedCountry(country);
    // Replace the dial code portion
    const phoneWithoutCode = value.replace(/^\+\d+\s*/, "");
    onChange(country.dialCode + " " + phoneWithoutCode);
    setOpen(false);
    setSearch("");
  };

  const filteredCountries = search
    ? COUNTRIES.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.dialCode.includes(search) ||
        c.code.toLowerCase().includes(search.toLowerCase())
      )
    : COUNTRIES;

  return (
    <div className={cn("flex gap-0", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="rounded-r-none border-r-0 px-2.5 h-10 gap-1 min-w-[85px] shrink-0 focus:ring-0 focus:ring-offset-0"
          >
            <span className="text-base leading-none">{selectedCountry.flag}</span>
            <span className="text-xs text-muted-foreground">{selectedCountry.dialCode}</span>
            <ChevronDown className="w-3 h-3 text-muted-foreground ml-0.5" />
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
          <ScrollArea className="h-[240px]">
            <div className="py-1">
              {filteredCountries.map((country) => (
                <button
                  key={country.code}
                  type="button"
                  onClick={() => handleCountrySelect(country)}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted/60 transition-colors text-left",
                    selectedCountry.code === country.code && "bg-primary/5 text-primary"
                  )}
                >
                  <span className="text-base leading-none">{country.flag}</span>
                  <span className="flex-1 truncate">{country.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{country.dialCode}</span>
                </button>
              ))}
              {filteredCountries.length === 0 && (
                <p className="text-center py-4 text-sm text-muted-foreground">No country found</p>
              )}
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-l-none h-10"
        placeholder={placeholder || `${selectedCountry.dialCode} xxx xxx xxxx`}
      />
    </div>
  );
}
