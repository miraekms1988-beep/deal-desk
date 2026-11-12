/* 딜 데스크 서비스워커 - 범위는 /deal-desk/ 만.
 * 같은 주소(miraekms1988-beep.github.io)의 PF 레이더 서비스워커는 범위가 '/' 라
 * 이게 없으면 /deal-desk/ 도 PF 레이더 앱으로 잡힌다(앱 설치 → PF 레이더). 더 좁은 범위가 이긴다.
 * 캐시는 하지 않는다: 늘 서버에 바뀌었는지 묻고(no-cache), 안 되면 그냥 실패 - 데이터는 어차피 온라인 저장소. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(req.mode === 'navigate' ? fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }) : fetch(req, { cache: 'no-cache' }));
});
