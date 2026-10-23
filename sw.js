/* BeeMath — Service Worker: ทำให้ติดตั้งเป็นแอปและเปิดได้แม้ไม่มีอินเทอร์เน็ต
   กลยุทธ์ stale-while-revalidate: เปิดจากแคชทันที แล้วโหลดเวอร์ชันใหม่เก็บไว้ใช้ครั้งถัดไป
   เปลี่ยน VERSION เมื่อเพิ่ม/ลบไฟล์ใน APP_FILES เพื่อล้างแคชเก่า */
const VERSION = 'beemath-v34'; // ให้ตรงกับ APP_VERSION ใน js/ops.js
const APP_FILES = [
  './', './index.html', './privacy.html', './manifest.webmanifest', './css/style.css',
  './js/ops.js', './js/icons.js', './js/data.js', './js/sounds.js', './js/app.js', './js/extras.js', './js/askbee.js', './js/config.js', './js/cloud.js', './js/friends.js', './js/classroom.js', './js/feedback.js', './js/main.js', './js/fx3d.js', './audio/click.mp3',
  './fonts/digits-500.woff2', './fonts/digits-600.woff2', './fonts/digits-700.woff2', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png', './icons/icon.svg',
];

self.addEventListener('install', (e) => {
  // cache: 'reload' = ข้ามแคช HTTP ของเบราว์เซอร์ (GitHub Pages ตั้งไว้ 10 นาที) ไม่งั้นเวอร์ชันใหม่อาจเก็บไฟล์เก่าไว้
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(APP_FILES.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // ไฟล์เสียง: ให้เบราว์เซอร์โหลดเอง (Safari ขอเป็นช่วงด้วย Range ซึ่งแคชของ service worker ตอบไม่ได้)
  if (req.headers.has('range') || /\.m4a$/.test(new URL(req.url).pathname)) return;
  const url = new URL(req.url);
  // ข้ามโดเมน: แคชเฉพาะฟอนต์และไลบรารี Supabase (ห้ามแคชการเรียก API ของ Supabase)
  const isAsset = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net'].includes(url.hostname);
  if (url.origin !== self.location.origin && !isAsset) return;
  e.respondWith(caches.open(VERSION).then(async (cache) => {
    const cached = await cache.match(req, { ignoreSearch: url.origin === self.location.origin });
    // ไฟล์ของแอปเอง: ถามเซิร์ฟเวอร์ทุกครั้ง (no-cache = ตรวจ ETag ได้ 304 ถ้าไม่เปลี่ยน) ไม่ใช้สำเนาเก่าในแคช HTTP
    const fresh = fetch(req, url.origin === self.location.origin ? { cache: 'no-cache' } : undefined).then((res) => {
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
      return res;
    }).catch(() => null);
    if (cached) { e.waitUntil(fresh); return cached; }
    const res = await fresh;
    if (res) return res;
    // ออฟไลน์และไม่มีในแคช: หน้าเว็บให้ใช้ index.html แทน
    if (req.mode === 'navigate') return cache.match('./index.html');
    return new Response('', { status: 504, statusText: 'offline' });
  }));
});

// แจ้งเตือน Push จาก Edge Function push-send (เตือนให้มาเรียน) · แตะแล้วเปิดแอป (หรือสลับไปหน้าต่างที่เปิดอยู่)
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { /* ข้อความไม่ใช่ JSON */ }
  e.waitUntil(self.registration.showNotification(d.title || 'BeeMath', {
    body: d.body || 'มาฝึกแก้สมการกับน้องผึ้งกันเถอะ', icon: './icons/icon-192.png', badge: './icons/icon-192.png',
    tag: 'beemath-remind', data: { url: d.url || './' },
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
    const w = wins.find((c) => c.url.startsWith(self.registration.scope));
    return w ? w.focus() : self.clients.openWindow(e.notification.data?.url || './');
  }));
});
