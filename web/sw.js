/* 딜 데스크 서비스워커
 * - 캐시는 하지 않는다: 늘 서버에 바뀌었는지 묻고(no-cache), 데이터는 어차피 온라인 저장소.
 * - 앱 알림(Web Push): 받으면 띄우고, 누르면 그 딜 업무 대화를 연다. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(req.mode === 'navigate' ? fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }) : fetch(req, { cache: 'no-cache' }));
});

self.addEventListener('push', (e) => {
  let n = {};
  try { n = e.data ? e.data.json() : {}; } catch (x) { n = { title: '딜 데스크', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(n.title || '딜 데스크', {
    body: n.body || '', tag: n.tag || undefined, renotify: !!n.tag,
    icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: { url: n.url || './' },
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of list) { if (c.url.startsWith(self.registration.scope)) { await c.focus(); if ('navigate' in c) return c.navigate(url); return; } }
    return self.clients.openWindow(url);
  })());
});
