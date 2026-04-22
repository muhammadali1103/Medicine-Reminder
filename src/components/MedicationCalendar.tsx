import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Icons } from "@/components/icons";
import { cn } from "@/lib/utils";
import { MedicationData } from "@/hooks/useMedications";
import { format, startOfWeek, addDays, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday, isBefore, isAfter, parseISO } from "date-fns";

interface MedicationCalendarProps {
  medications: MedicationData[];
  onDaySelect?: (date: Date, doses: ScheduledDose[]) => void;
  className?: string;
}

export interface ScheduledDose {
  medicationId: string;
  medicationName: string;
  time: string;
  dosage: string;
  date: Date;
  status: "scheduled" | "completed" | "missed" | "upcoming";
}

type ViewMode = "week" | "month";

export function MedicationCalendar({ medications, onDaySelect, className }: MedicationCalendarProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());

  const activeMedications = useMemo(() => 
    medications.filter(m => m.is_active), 
    [medications]
  );

  // Generate scheduled doses for a date range
  const getScheduledDoses = useMemo(() => {
    const doses: ScheduledDose[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    activeMedications.forEach(med => {
      const schedule = med.schedule as { times?: string[]; type?: string } | null;
      const times = schedule?.times || ["08:00"];
      const startDate = med.start_date ? parseISO(med.start_date) : new Date();
      const endDate = med.end_date ? parseISO(med.end_date) : addDays(new Date(), 365);

      // Generate doses for the visible date range
      const rangeStart = viewMode === "week" 
        ? startOfWeek(currentDate, { weekStartsOn: 1 })
        : startOfMonth(currentDate);
      const rangeEnd = viewMode === "week"
        ? addDays(rangeStart, 6)
        : endOfMonth(currentDate);

      const daysInRange = eachDayOfInterval({ start: rangeStart, end: rangeEnd });

      daysInRange.forEach(day => {
        // Check if medication is active on this day
        if (isBefore(day, startDate) || isAfter(day, endDate)) return;

        times.forEach(time => {
          const [hours, minutes] = time.split(":").map(Number);
          const doseDateTime = new Date(day);
          doseDateTime.setHours(hours, minutes, 0, 0);

          let status: ScheduledDose["status"] = "scheduled";
          const now = new Date();

          if (isBefore(day, today)) {
            status = "completed"; // Assume past doses are completed (in real app, check dose_logs)
          } else if (isSameDay(day, today)) {
            if (doseDateTime < now) {
              status = "missed"; // Past time today, might be missed
            } else {
              status = "upcoming";
            }
          }

          doses.push({
            medicationId: med.id,
            medicationName: med.name,
            time,
            dosage: med.dosage || "1 dose",
            date: day,
            status,
          });
        });
      });
    });

    return doses;
  }, [activeMedications, currentDate, viewMode]);

  const getDosesForDay = (date: Date) => {
    return getScheduledDoses.filter(dose => isSameDay(dose.date, date));
  };

  const weekDays = useMemo(() => {
    const start = startOfWeek(currentDate, { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [currentDate]);

  const monthDays = useMemo(() => {
    const start = startOfMonth(currentDate);
    const end = endOfMonth(currentDate);
    const days = eachDayOfInterval({ start, end });
    
    // Pad start to begin on Monday
    const startDay = start.getDay();
    const paddingStart = startDay === 0 ? 6 : startDay - 1;
    const paddedDays: (Date | null)[] = Array(paddingStart).fill(null);
    
    return [...paddedDays, ...days];
  }, [currentDate]);

  const handlePrevious = () => {
    setCurrentDate(prev => 
      viewMode === "week" ? addDays(prev, -7) : addDays(startOfMonth(prev), -1)
    );
  };

  const handleNext = () => {
    setCurrentDate(prev => 
      viewMode === "week" ? addDays(prev, 7) : addDays(endOfMonth(prev), 1)
    );
  };

  const handleDayClick = (date: Date) => {
    setSelectedDate(date);
    const doses = getDosesForDay(date);
    onDaySelect?.(date, doses);
  };

  const renderDayCell = (date: Date | null, isWeekView: boolean) => {
    if (!date) {
      return <div className={cn("aspect-square", isWeekView ? "min-h-[80px]" : "")} />;
    }

    const doses = getDosesForDay(date);
    const isSelected = selectedDate && isSameDay(date, selectedDate);
    const isCurrentDay = isToday(date);
    const hasDoses = doses.length > 0;
    const completedDoses = doses.filter(d => d.status === "completed").length;
    const missedDoses = doses.filter(d => d.status === "missed").length;

    return (
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => handleDayClick(date)}
        className={cn(
          "relative flex flex-col items-center justify-start p-2 rounded-xl transition-all",
          isWeekView ? "min-h-[80px] flex-1" : "aspect-square",
          isSelected && "ring-2 ring-primary bg-primary/10",
          isCurrentDay && !isSelected && "bg-accent border-2 border-primary",
          !isSelected && !isCurrentDay && "hover:bg-accent/50"
        )}
      >
        <span className={cn(
          "text-sm font-semibold",
          isCurrentDay && "text-primary",
          isSelected && "text-primary"
        )}>
          {format(date, "d")}
        </span>
        
        {isWeekView && (
          <span className="text-[10px] text-muted-foreground mb-1">
            {format(date, "EEE")}
          </span>
        )}

        {hasDoses && (
          <div className="flex flex-wrap justify-center gap-0.5 mt-1">
            {doses.slice(0, isWeekView ? 4 : 3).map((dose, i) => (
              <div
                key={i}
                className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  dose.status === "completed" && "bg-success",
                  dose.status === "missed" && "bg-destructive",
                  dose.status === "upcoming" && "bg-warning",
                  dose.status === "scheduled" && "bg-muted-foreground"
                )}
              />
            ))}
            {doses.length > (isWeekView ? 4 : 3) && (
              <span className="text-[8px] text-muted-foreground">+{doses.length - (isWeekView ? 4 : 3)}</span>
            )}
          </div>
        )}

        {isWeekView && hasDoses && (
          <div className="mt-auto text-[10px] text-muted-foreground">
            {completedDoses > 0 && <span className="text-success">{completedDoses}✓</span>}
            {missedDoses > 0 && <span className="text-destructive ml-1">{missedDoses}✗</span>}
          </div>
        )}
      </motion.button>
    );
  };

  const selectedDayDoses = selectedDate ? getDosesForDay(selectedDate) : [];

  return (
    <div className={cn("space-y-4", className)}>
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Icons.calendar className="w-5 h-5 text-primary" />
              Medication Calendar
            </CardTitle>
            <div className="flex gap-1">
              <Button
                variant={viewMode === "week" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("week")}
              >
                Week
              </Button>
              <Button
                variant={viewMode === "month" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("month")}
              >
                Month
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Navigation */}
          <div className="flex items-center justify-between mb-4">
            <Button variant="ghost" size="icon-sm" onClick={handlePrevious}>
              <Icons.chevronRight className="w-4 h-4 rotate-180" />
            </Button>
            <h3 className="font-semibold text-foreground">
              {viewMode === "week" 
                ? `${format(weekDays[0], "MMM d")} - ${format(weekDays[6], "MMM d, yyyy")}`
                : format(currentDate, "MMMM yyyy")
              }
            </h3>
            <Button variant="ghost" size="icon-sm" onClick={handleNext}>
              <Icons.chevronRight className="w-4 h-4" />
            </Button>
          </div>

          {/* Calendar Grid */}
          {viewMode === "week" ? (
            <div className="grid grid-cols-7 gap-1">
              {weekDays.map((day, index) => (
                <div key={index}>
                  {renderDayCell(day, true)}
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-7 gap-1 mb-1">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(day => (
                  <div key={day} className="text-center text-xs font-medium text-muted-foreground py-1">
                    {day}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {monthDays.map((day, index) => (
                  <div key={index}>
                    {renderDayCell(day, false)}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Legend */}
          <div className="flex items-center justify-center gap-4 mt-4 pt-4 border-t">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-success" />
              <span className="text-xs text-muted-foreground">Completed</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-warning" />
              <span className="text-xs text-muted-foreground">Upcoming</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-destructive" />
              <span className="text-xs text-muted-foreground">Missed</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Selected Day Details */}
      {selectedDate && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center justify-between">
              <span>{format(selectedDate, "EEEE, MMMM d")}</span>
              <Badge variant="pill">{selectedDayDoses.length} doses</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selectedDayDoses.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">
                No medications scheduled for this day
              </p>
            ) : (
              <div className="space-y-2">
                {selectedDayDoses.map((dose, index) => (
                  <motion.div
                    key={`${dose.medicationId}-${dose.time}-${index}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-xl",
                      dose.status === "completed" && "bg-success/10",
                      dose.status === "missed" && "bg-destructive/10",
                      dose.status === "upcoming" && "bg-warning/10",
                      dose.status === "scheduled" && "bg-muted/50"
                    )}
                  >
                    <div className="w-12 text-center">
                      <span className="text-sm font-bold text-foreground">{dose.time}</span>
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-foreground">{dose.medicationName}</p>
                      <p className="text-sm text-muted-foreground">{dose.dosage}</p>
                    </div>
                    <Badge 
                      variant={
                        dose.status === "completed" ? "success" :
                        dose.status === "missed" ? "destructive" :
                        dose.status === "upcoming" ? "warning" :
                        "secondary"
                      }
                    >
                      {dose.status === "completed" && <Icons.checkCircle className="w-3 h-3 mr-1" />}
                      {dose.status.charAt(0).toUpperCase() + dose.status.slice(1)}
                    </Badge>
                  </motion.div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
