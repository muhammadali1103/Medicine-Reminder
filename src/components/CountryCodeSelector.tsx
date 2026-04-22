import { useState, useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { countries, Country } from "@/data/countries";
import { Icons } from "@/components/icons";

interface CountryCodeSelectorProps {
  value: string;
  onChange: (dialCode: string) => void;
}

export function CountryCodeSelector({ value, onChange }: CountryCodeSelectorProps) {
  const [search, setSearch] = useState("");

  const filteredCountries = useMemo(() => {
    if (!search) return countries;
    const lower = search.toLowerCase();
    return countries.filter(
      (c) =>
        c.name.toLowerCase().includes(lower) ||
        c.dialCode.includes(search) ||
        c.code.toLowerCase().includes(lower)
    );
  }, [search]);

  const selectedCountry = countries.find((c) => c.dialCode === value);

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-[140px]">
        <SelectValue>
          {selectedCountry ? (
            <span className="flex items-center gap-2">
              <span>{selectedCountry.flag}</span>
              <span>{selectedCountry.dialCode}</span>
            </span>
          ) : (
            "Select"
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="z-[100] max-h-[300px] bg-popover border border-border shadow-lg">
        <div className="sticky top-0 z-10 p-2 bg-popover border-b border-border">
          <div className="relative">
            <Icons.search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search country..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
        </div>
        {filteredCountries.map((country) => (
          <SelectItem key={country.code} value={country.dialCode}>
            <span className="flex items-center gap-2">
              <span>{country.flag}</span>
              <span className="truncate max-w-[120px]">{country.name}</span>
              <span className="text-muted-foreground ml-auto">{country.dialCode}</span>
            </span>
          </SelectItem>
        ))}
        {filteredCountries.length === 0 && (
          <div className="py-4 text-center text-sm text-muted-foreground">
            No countries found
          </div>
        )}
      </SelectContent>
    </Select>
  );
}
