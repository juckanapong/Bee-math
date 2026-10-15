/* BeeMath — Service Worker: ทำให้ติดตั้งเป็นแอปและเปิดได้แม้ไม่มีอินเทอร์เน็ต
   กลยุทธ์ stale-while-revalidate: เปิดจากแคชทันที แล้วโหลดเวอร์ชันใหม่เก็บไว้ใช้ครั้งถัดไป
   เปลี่ยน VERSION เมื่อเพิ่ม/ลบไฟล์ใน APP_FILES เพื่อล้างแคชเก่า */
const VERSION = 'beemath-v5';
const APP_FILES = [
  './', './index.html', './manifest.webmanifest', './css/style.css',
  './js/icons.js', './js/data.js', './js/sounds.js', './js/app.js', './js/extras.js', './js/config.js', './js/cloud.js', './js/friends.js', './js/classroom.js', './js/main.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png', './icons/icon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(APP_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // ข้ามโดเมน: แคชเฉพาะฟอนต์และไลบรารี Supabase (ห้ามแคชการเรียก API ของ Supabase)
  const isAsset = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net'].includes(url.hostname);
  if (url.origin !== self.location.origin && !isAsset) return;
  e.respondWith(caches.open(VERSION).then(async (cache) => {
    const cached = await cache.match(req, { ignoreSearch: url.origin === self.location.origin });
    const fresh = fetch(req).then((res) => {
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
