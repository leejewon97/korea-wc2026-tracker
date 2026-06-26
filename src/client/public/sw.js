self.addEventListener('push', (event) => {
  let data = { title: '한국 32강 트래커', url: '/go' };
  try {
    if (event.data) {
      data = { ...data, ...event.data.json() };
    }
  } catch {
    // use defaults
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: '탭하여 카카오톡·웹에서 확인하세요.',
      icon: 'https://t1.kakaocdn.net/kakaocorp/corp_thumbnail/Kakao.png',
      data: { url: data.url || '/go' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/go';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes(url) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    }),
  );
});
