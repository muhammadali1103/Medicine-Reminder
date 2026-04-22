import { apiClient } from "@/lib/apiClient";

const QUEUE_KEY = "smrai.offline.syncQueue";

export type SyncActionType = "LOG_DOSE" | "ADD_MEDICATION" | "UPDATE_MEDICATION";

export interface SyncQueueItem {
  id: string;
  type: SyncActionType;
  payload: any;
  createdAt: string;
}

type QueueListener = (state: { syncing: boolean; pending: number }) => void;

const listeners = new Set<QueueListener>();
let syncing = false;

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function notify() {
  const pending = getSyncQueue().length;
  listeners.forEach((listener) => listener({ syncing, pending }));
}

export function subscribeSyncQueue(listener: QueueListener) {
  listeners.add(listener);
  listener({ syncing, pending: getSyncQueue().length });

  return () => {
    listeners.delete(listener);
  };
}

export function getSyncQueue(): SyncQueueItem[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as SyncQueueItem[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: SyncQueueItem[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  notify();
}

export function enqueueSyncAction(type: SyncActionType, payload: any) {
  const item: SyncQueueItem = {
    id: makeId(),
    type,
    payload,
    createdAt: new Date().toISOString(),
  };

  writeQueue([...getSyncQueue(), item]);
  return item;
}

async function processItem(item: SyncQueueItem) {
  if (item.type === "LOG_DOSE") {
    return apiClient.from("dose_logs").insert(item.payload).select().single();
  }

  if (item.type === "ADD_MEDICATION") {
    return apiClient.from("medications").insert(item.payload).select().single();
  }

  if (item.type === "UPDATE_MEDICATION") {
    return apiClient.from("medications").update(item.payload.updates).eq("id", item.payload.id);
  }

  return { error: { message: "Unknown sync action" } };
}

export async function processSyncQueue() {
  if (syncing || typeof navigator !== "undefined" && !navigator.onLine) {
    return { synced: 0, failed: 0 };
  }

  syncing = true;
  notify();

  let synced = 0;
  let failed = 0;
  const queue = getSyncQueue();

  while (queue.length > 0) {
    const item = queue[0];
    const result = await processItem(item);

    if (result?.error) {
      failed += 1;
      break;
    }

    queue.shift();
    synced += 1;
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    notify();
  }

  syncing = false;
  notify();
  return { synced, failed };
}
