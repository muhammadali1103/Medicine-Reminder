const CACHE_PREFIX = "smrai.offline";

export interface CacheEnvelope<T> {
  data: T;
  savedAt: string;
}

export function cacheKey(userId: string, name: string) {
  return `${CACHE_PREFIX}.${userId}.${name}`;
}

export function readCachedData<T>(key: string): CacheEnvelope<T> | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as CacheEnvelope<T>) : null;
  } catch {
    return null;
  }
}

export function writeCachedData<T>(key: string, data: T) {
  localStorage.setItem(
    key,
    JSON.stringify({
      data,
      savedAt: new Date().toISOString(),
    } satisfies CacheEnvelope<T>)
  );
}

export function formatLastSynced(savedAt?: string | null) {
  if (!savedAt) {
    return "Not synced yet";
  }

  const diffMs = Date.now() - new Date(savedAt).getTime();
  const diffMinutes = Math.max(0, Math.round(diffMs / 60000));

  if (diffMinutes < 1) {
    return "Last updated just now";
  }

  if (diffMinutes < 60) {
    return `Last updated ${diffMinutes} min${diffMinutes === 1 ? "" : "s"} ago`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  return `Last updated ${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
}
