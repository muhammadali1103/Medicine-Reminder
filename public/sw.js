// Service Worker for MedTracker Push Notifications

const CACHE_NAME = "medtracker-v3";
const OLD_CACHES = ["medtracker-v1", "medtracker-v2"];

// Store for scheduled notifications
const scheduledNotifications = new Map();

// Install event - skip waiting to activate immediately
self.addEventListener("install", (event) => {
  console.log("[SW] Installing service worker...");
  self.skipWaiting();
});

// Activate event - clear old caches and take control
self.addEventListener("activate", (event) => {
  console.log("[SW] Activating service worker...");
  event.waitUntil(
    Promise.all([
      // Clear old caches
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((cacheName) => OLD_CACHES.includes(cacheName) || cacheName.startsWith("workbox-"))
            .map((cacheName) => {
              console.log("[SW] Deleting old cache:", cacheName);
              return caches.delete(cacheName);
            })
        );
      }),
      // Take control of all clients immediately
      clients.claim(),
    ])
  );
});

// Handle push notifications from server
self.addEventListener("push", (event) => {
  console.log("[SW] Push notification received");
  
  let data = {
    title: "Medication Reminder",
    body: "Time to take your medication!",
    icon: "/pwa-192x192.png",
    badge: "/pwa-192x192.png",
    tag: "medication-reminder",
  };

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || "/pwa-192x192.png",
    badge: data.badge || "/pwa-192x192.png",
    tag: data.tag || "medication-reminder",
    requireInteraction: true,
    vibrate: [200, 100, 200],
    data: data,
    actions: [
      { action: "take", title: "Take Now" },
      { action: "snooze5", title: "5 min" },
      { action: "snooze10", title: "10 min" },
      { action: "snooze15", title: "15 min" },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Handle notification clicks
self.addEventListener("notificationclick", (event) => {
  console.log("[SW] Notification clicked:", event.action);
  event.notification.close();

  const notificationData = event.notification.data || {};
  const medicationId = notificationData.medicationId;
  const medicationName = notificationData.medicationName || notificationData.body || "your medication";

  if (event.action === "take") {
    // Open the app to log the dose
    event.waitUntil(
      clients.matchAll({ type: "window" }).then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes("/") && "focus" in client) {
            client.postMessage({
              type: "DOSE_TAKEN",
              medicationId: medicationId,
            });
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow("/?action=take&medId=" + (medicationId || ""));
        }
      })
    );
  } else if (event.action === "snooze5" || event.action === "snooze10" || event.action === "snooze15") {
    // Get snooze duration from action
    const snoozeMinutes = parseInt(event.action.replace("snooze", ""), 10);
    const snoozeMs = snoozeMinutes * 60 * 1000;
    
    console.log(`[SW] Snoozing notification for ${snoozeMinutes} minutes`);
    
    // Schedule snooze notification
    const snoozeId = `snooze-${medicationId || Date.now()}-${Date.now()}`;
    
    const timeoutId = setTimeout(() => {
      self.registration.showNotification("Medication Reminder (Snoozed)", {
        body: `Reminder: ${medicationName}`,
        icon: "/pwa-192x192.png",
        badge: "/pwa-192x192.png",
        tag: snoozeId,
        requireInteraction: true,
        vibrate: [200, 100, 200, 100, 200],
        data: {
          medicationId: medicationId,
          medicationName: medicationName,
          isSnooze: true,
        },
        actions: [
          { action: "take", title: "Take Now" },
          { action: "snooze5", title: "5 min" },
          { action: "snooze10", title: "10 min" },
          { action: "snooze15", title: "15 min" },
        ],
      });
      scheduledNotifications.delete(snoozeId);
    }, snoozeMs);
    
    scheduledNotifications.set(snoozeId, timeoutId);
    
    // Notify any open clients about the snooze
    event.waitUntil(
      clients.matchAll({ type: "window" }).then((clientList) => {
        clientList.forEach((client) => {
          client.postMessage({
            type: "NOTIFICATION_SNOOZED",
            medicationId: medicationId,
            snoozedUntil: new Date(Date.now() + snoozeMs).toISOString(),
            snoozeMinutes: snoozeMinutes,
          });
        });
      })
    );
  } else {
    // Default click - open the app
    event.waitUntil(
      clients.matchAll({ type: "window" }).then((clientList) => {
        for (const client of clientList) {
          if ("focus" in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow("/");
        }
      })
    );
  }
});

// Handle scheduled notifications (using periodic sync if available)
self.addEventListener("periodicsync", (event) => {
  if (event.tag === "medication-check") {
    event.waitUntil(checkMedicationReminders());
  }
});

async function checkMedicationReminders() {
  console.log("[SW] Checking for medication reminders...");
}

// Message handler for scheduling notifications from the main app
self.addEventListener("message", (event) => {
  console.log("[SW] Message received:", event.data);
  
  if (event.data.type === "SCHEDULE_NOTIFICATION") {
    const { title, body, scheduledTime, medicationId, medicationName, tag } = event.data;
    const delay = new Date(scheduledTime).getTime() - Date.now();
    
    if (delay > 0) {
      const notificationTag = tag || `med-${medicationId}-${scheduledTime}`;
      
      // Cancel existing notification with same tag
      if (scheduledNotifications.has(notificationTag)) {
        clearTimeout(scheduledNotifications.get(notificationTag));
      }
      
      const timeoutId = setTimeout(() => {
        self.registration.showNotification(title || "Medication Reminder", {
          body: body || "Time to take your medication!",
          icon: "/pwa-192x192.png",
          badge: "/pwa-192x192.png",
          tag: notificationTag,
          requireInteraction: true,
          vibrate: [200, 100, 200],
          data: { 
            medicationId,
            medicationName: medicationName || body,
          },
          actions: [
            { action: "take", title: "Take Now" },
            { action: "snooze5", title: "5 min" },
            { action: "snooze10", title: "10 min" },
            { action: "snooze15", title: "15 min" },
          ],
        });
        
        // Notify clients to play voice reminder
        clients.matchAll({ type: "window" }).then((clientList) => {
          clientList.forEach((client) => {
            client.postMessage({
              type: "PLAY_VOICE_REMINDER",
              medicationId,
              medicationName: medicationName || body,
            });
          });
        });
        
        scheduledNotifications.delete(notificationTag);
      }, delay);
      
      scheduledNotifications.set(notificationTag, timeoutId);
      
      event.source?.postMessage({
        type: "NOTIFICATION_SCHEDULED",
        scheduledTime,
        medicationId,
        tag: notificationTag,
      });
    }
  }
  
  if (event.data.type === "SHOW_NOTIFICATION") {
    const { title, body, tag, medicationId, medicationName } = event.data;
    self.registration.showNotification(title || "Medication Reminder", {
      body: body || "Time to take your medication!",
      icon: "/pwa-192x192.png",
      badge: "/pwa-192x192.png",
      tag: tag || "medication-reminder",
      requireInteraction: true,
      vibrate: [200, 100, 200],
      data: { 
        medicationId,
        medicationName: medicationName || body,
      },
      actions: [
        { action: "take", title: "Take Now" },
        { action: "snooze5", title: "5 min" },
        { action: "snooze10", title: "10 min" },
        { action: "snooze15", title: "15 min" },
      ],
    });
  }
  
  if (event.data.type === "CANCEL_NOTIFICATION") {
    const { tag } = event.data;
    if (scheduledNotifications.has(tag)) {
      clearTimeout(scheduledNotifications.get(tag));
      scheduledNotifications.delete(tag);
      event.source?.postMessage({
        type: "NOTIFICATION_CANCELLED",
        tag,
      });
    }
  }
  
  if (event.data.type === "SNOOZE_REMINDER") {
    const { medicationId, medicationName, snoozeMinutes } = event.data;
    const snoozeMs = (snoozeMinutes || 10) * 60 * 1000;
    const snoozeId = `snooze-${medicationId}-${Date.now()}`;
    
    const timeoutId = setTimeout(() => {
      self.registration.showNotification("Medication Reminder (Snoozed)", {
        body: `Reminder: ${medicationName || "Time to take your medication"}`,
        icon: "/pwa-192x192.png",
        badge: "/pwa-192x192.png",
        tag: snoozeId,
        requireInteraction: true,
        vibrate: [200, 100, 200, 100, 200],
        data: {
          medicationId: medicationId,
          medicationName: medicationName,
          isSnooze: true,
        },
        actions: [
          { action: "take", title: "Take Now" },
          { action: "snooze5", title: "5 min" },
          { action: "snooze10", title: "10 min" },
          { action: "snooze15", title: "15 min" },
        ],
      });
      scheduledNotifications.delete(snoozeId);
    }, snoozeMs);
    
    scheduledNotifications.set(snoozeId, timeoutId);
    
    event.source?.postMessage({
      type: "SNOOZE_SCHEDULED",
      medicationId,
      snoozedUntil: new Date(Date.now() + snoozeMs).toISOString(),
      snoozeMinutes,
    });
  }
});