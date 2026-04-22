import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { Icons } from "@/components/icons";
import { processSyncQueue, subscribeSyncQueue } from "@/services/syncQueue";
import { cn } from "@/lib/utils";

export function OfflineBanner() {
  const { isOnline, wasOffline } = useOnlineStatus();
  const [showRestored, setShowRestored] = useState(false);
  const [syncState, setSyncState] = useState({ syncing: false, pending: 0 });

  useEffect(() => subscribeSyncQueue(setSyncState), []);

  useEffect(() => {
    if (!isOnline || !wasOffline) {
      return;
    }

    setShowRestored(true);
    void processSyncQueue();

    const timeout = window.setTimeout(() => setShowRestored(false), 3500);
    return () => window.clearTimeout(timeout);
  }, [isOnline, wasOffline]);

  const visible = !isOnline || showRestored || syncState.syncing;
  const restored = isOnline && (showRestored || syncState.syncing);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          className={cn(
            "fixed left-0 right-0 top-0 z-[100] border-b px-4 py-2 text-sm shadow-sm",
            restored
              ? "border-success/30 bg-success/15 text-success"
              : "border-warning/30 bg-warning/15 text-warning-foreground"
          )}
        >
          <div className="mx-auto flex max-w-lg items-center justify-center gap-2 font-medium">
            {syncState.syncing ? (
              <Icons.refresh className="h-4 w-4 animate-spin" />
            ) : restored ? (
              <Icons.checkCircle className="h-4 w-4" />
            ) : (
              <Icons.alertTriangle className="h-4 w-4" />
            )}
            <span>
              {syncState.syncing
                ? `Syncing ${syncState.pending} queued action${syncState.pending === 1 ? "" : "s"}...`
                : restored
                  ? "Back online! Syncing..."
                  : "You're offline - showing cached data"}
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
