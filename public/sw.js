// Mara service worker - handles daily check-in notifications

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(clients.claim());
});

// Listen for scheduled notification messages
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SCHEDULE_NOTIFICATION') {
    const { time, title, body } = e.data;
    scheduleDaily(time, title, body);
  }
});

// Store scheduled time
let scheduledTime = null;
let scheduledTitle = 'Mara';
let scheduledBody = 'How are you doing today?';

function scheduleDaily(time, title, body) {
  scheduledTime = time;
  scheduledTitle = title || 'Mara';
  scheduledBody = body || 'How are you doing today?';
  
  // Clear existing alarm
  if (self._alarmInterval) clearInterval(self._alarmInterval);
  
  // Check every minute if it's time
  self._alarmInterval = setInterval(() => {
    checkAndNotify();
  }, 60000);
  
  // Check immediately
  checkAndNotify();
}

function checkAndNotify() {
  if (!scheduledTime) return;
  
  const now = new Date();
  const [hours, minutes] = scheduledTime.split(':').map(Number);
  const nowHours = now.getHours();
  const nowMinutes = now.getMinutes();
  
  if (nowHours === hours && nowMinutes === minutes) {
    const lastNotif = self._lastNotifDate;
    const today = now.toDateString();
    
    if (lastNotif !== today) {
      self._lastNotifDate = today;
      self.registration.showNotification(scheduledTitle, {
        body: scheduledBody,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: 'mara-daily',
        renotify: false,
        requireInteraction: false,
        data: { url: '/' }
      });
    }
  }
}

// Handle notification click
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === '/' && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});
