self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : { title: 'StudyLog', body: '새로운 알림이 있습니다.' };
  
  const options = {
    body: data.body,
    icon: '/icon.png',
    badge: '/icon.png',
    data: {
      url: data.url || '/'
    }
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url)
  );
});
