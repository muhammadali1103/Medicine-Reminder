import { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MedicationAvatar } from "@/components/PillIcon";
import { Icons } from "@/components/icons";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface Medication {
  id: string;
  name: string;
  genericName?: string;
  strength?: string;
  dosage: string;
  frequency: string;
  nextDose?: string;
  shape: "round" | "oval" | "capsule" | "tablet";
  color1: string;
  color2?: string;
  refillDate?: string;
  interactions?: number;
  status: "active" | "paused" | "completed";
}

interface MedicationCardProps {
  medication: Medication;
  onTaken?: () => void;
  onSkip?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onToggleStatus?: () => void;
  onInteractionClick?: () => void;
  variant?: "compact" | "full";
  className?: string;
}

export function MedicationCard({
  medication,
  onTaken,
  onSkip,
  onEdit,
  onDelete,
  onToggleStatus,
  onInteractionClick,
  variant = "compact",
  className,
}: MedicationCardProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const hasInteractions = medication.interactions && medication.interactions > 0;

  const handleDelete = () => {
    setShowDeleteDialog(false);
    onDelete?.();
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Card
          variant={hasInteractions ? "warning" : "interactive"}
          className={cn("overflow-hidden", className)}
        >
          <CardContent className="p-4">
            <div className="flex items-start gap-4">
              <MedicationAvatar
                shape={medication.shape}
                color1={medication.color1}
                color2={medication.color2}
                size="md"
              />

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground truncate">
                      {medication.name}
                    </h3>
                    {medication.genericName && (
                      <p className="text-xs text-muted-foreground truncate">
                        {medication.genericName}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={medication.status === "active" ? "status" : "secondary"}>
                      {medication.status}
                    </Badge>
                    {(onEdit || onDelete || onToggleStatus) && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" className="h-8 w-8">
                            <Icons.moreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {onEdit && (
                            <DropdownMenuItem onClick={onEdit}>
                              <Icons.edit className="w-4 h-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                          )}
                          {onToggleStatus && (
                            <DropdownMenuItem onClick={onToggleStatus}>
                              {medication.status === "active" ? (
                                <>
                                  <Icons.pause className="w-4 h-4 mr-2" />
                                  Pause
                                </>
                              ) : (
                                <>
                                  <Icons.play className="w-4 h-4 mr-2" />
                                  Resume
                                </>
                              )}
                            </DropdownMenuItem>
                          )}
                          {onDelete && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => setShowDeleteDialog(true)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Icons.trash className="w-4 h-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
                  {medication.strength && (
                    <span className="flex items-center gap-1">
                      <Icons.pill className="w-3.5 h-3.5" />
                      {medication.strength}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Icons.clock className="w-3.5 h-3.5" />
                    {medication.frequency}
                  </span>
                </div>

                {hasInteractions && (
                  <button 
                    onClick={onInteractionClick}
                    className="flex items-center gap-1.5 mt-2 text-warning text-sm font-medium hover:underline cursor-pointer"
                  >
                    <Icons.alertTriangle className="w-4 h-4" />
                    <span>{medication.interactions} interaction{medication.interactions > 1 ? "s" : ""} found - View details</span>
                  </button>
                )}

                {medication.nextDose && variant === "full" && (
                  <div className="mt-3 p-2.5 bg-accent/50 rounded-xl">
                    <p className="text-xs text-muted-foreground mb-1">Next dose</p>
                    <p className="font-semibold text-foreground">{medication.nextDose}</p>
                  </div>
                )}

                {(onTaken || onSkip) && variant === "full" && (
                  <div className="flex gap-2 mt-3">
                    {onTaken && (
                      <Button
                        size="sm"
                        variant="success"
                        className="flex-1"
                        onClick={onTaken}
                      >
                        <Icons.check className="w-4 h-4" />
                        Taken
                      </Button>
                    )}
                    {onSkip && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="flex-1"
                        onClick={onSkip}
                      >
                        Skip
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {medication.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this medication and all its dose history. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
