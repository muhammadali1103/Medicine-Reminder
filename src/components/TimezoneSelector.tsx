import { useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { timezones } from "@/data/countries";

interface TimezoneSelectorProps {
  value: string;
  onChange: (timezone: string) => void;
}

const timezoneLabels: Record<string, string> = {
  "Pacific/Midway": "(UTC-11:00) Midway Island",
  "Pacific/Honolulu": "(UTC-10:00) Hawaii",
  "America/Anchorage": "(UTC-09:00) Alaska",
  "America/Los_Angeles": "(UTC-08:00) Pacific Time (US & Canada)",
  "America/Denver": "(UTC-07:00) Mountain Time (US & Canada)",
  "America/Chicago": "(UTC-06:00) Central Time (US & Canada)",
  "America/New_York": "(UTC-05:00) Eastern Time (US & Canada)",
  "America/Caracas": "(UTC-04:00) Caracas",
  "America/Halifax": "(UTC-04:00) Atlantic Time (Canada)",
  "America/St_Johns": "(UTC-03:30) Newfoundland",
  "America/Sao_Paulo": "(UTC-03:00) Brasilia",
  "Atlantic/Azores": "(UTC-01:00) Azores",
  "Europe/London": "(UTC+00:00) London, Dublin",
  "Europe/Paris": "(UTC+01:00) Paris, Amsterdam",
  "Europe/Berlin": "(UTC+01:00) Berlin, Rome",
  "Europe/Athens": "(UTC+02:00) Athens, Cairo",
  "Europe/Moscow": "(UTC+03:00) Moscow",
  "Asia/Dubai": "(UTC+04:00) Dubai, Abu Dhabi",
  "Asia/Karachi": "(UTC+05:00) Karachi, Islamabad",
  "Asia/Kolkata": "(UTC+05:30) Mumbai, New Delhi",
  "Asia/Dhaka": "(UTC+06:00) Dhaka",
  "Asia/Bangkok": "(UTC+07:00) Bangkok, Jakarta",
  "Asia/Hong_Kong": "(UTC+08:00) Hong Kong",
  "Asia/Shanghai": "(UTC+08:00) Beijing, Shanghai",
  "Asia/Tokyo": "(UTC+09:00) Tokyo, Seoul",
  "Asia/Seoul": "(UTC+09:00) Seoul",
  "Australia/Sydney": "(UTC+10:00) Sydney, Melbourne",
  "Pacific/Auckland": "(UTC+12:00) Auckland",
  "Pacific/Fiji": "(UTC+12:00) Fiji",
};

export function TimezoneSelector({ value, onChange }: TimezoneSelectorProps) {
  const sortedTimezones = useMemo(() => {
    return [...timezones].sort((a, b) => {
      const labelA = timezoneLabels[a] || a;
      const labelB = timezoneLabels[b] || b;
      return labelA.localeCompare(labelB);
    });
  }, []);

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Select timezone">
          {timezoneLabels[value] || value}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-[300px]">
        {sortedTimezones.map((tz) => (
          <SelectItem key={tz} value={tz}>
            {timezoneLabels[tz] || tz}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
