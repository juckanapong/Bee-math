/* BeeMath — ระบบหลังบ้าน (ระยะ 7) · โหลดเป็นไฟล์แรก
   - ค่าตั้งจากเซิร์ฟเวอร์ (ตาราง app_config ใน supabase/ops.sql): feature flags · สวิตช์ฉุกเฉิน · ประกาศ
     จำไว้ในเครื่อง จึงมีผลทันทีที่เปิดแอป (แม้ยังโหลดค่าใหม่ไม่เสร็จหรือออฟไลน์)
   - รายงาน error ของ JavaScript ไปที่ report_error (ไม่ส่งตัวตนหรือข้อมูลการเรียน) */

const APP_VERSION = 'v33'; // ให้ตรงกับ VERSION ใน sw.js (ใช้บอกว่า error มาจากแอปรุ่นไหน)

// ---------- ค่าตั้งจากเซิร์ฟเวอร์ ----------
const REMOTE_KEY = 'beemath-remote';
const REMOTE_DEFAULT = { flags: { push: true, feed: true, reactions: true }, kill: { offline: false, message: '' }, notice: { text: '', until: null } };
const remoteMerge = (v) => ({
  flags: { ...REMOTE_DEFAULT.flags, ...(v?.flags || {}) },
  kill: { ...REMOTE_DEFAULT.kill, ...(v?.kill || {}) },
  notice: { ...REMOTE_DEFAULT.notice, ...(v?.notice || {}) },
});
const Remote = (() => { try { return remoteMerge(JSON.parse(localStorage.getItem(REMOTE_KEY))); } catch (e) { return remoteMerge(null); } })();
// ฟีเจอร์เปิดอยู่ไหม (ไม่รู้จัก = เปิด)
const flag = (name) => Remote.flags[name] !== false;
// สวิตช์ฉุกเฉิน: หยุดเรียกเซิร์ฟเวอร์ทั้งหมด (ยกเว้นการอ่านค่าตั้งนี้เอง)
const cloudPaused = () => !!Remote.kill.offline;
// ใช้แทน navigator.onLine ทุกที่ที่จะเรียกเซิร์ฟเวอร์
const netOK = () => navigator.onLine && !cloudPaused();
// ประกาศที่ยังแสดงอยู่
const noticeText = () => (Remote.notice.text && (!Remote.notice.until || Date.now() < Date.parse(Remote.notice.until)) ? Remote.notice.text : '');

async function remoteLoad() {
  if (typeof Cloud === 'undefined' || !Cloud.client || !navigator.onLine) return;
  const { data, error } = await Cloud.client.from('app_config').select('key, value');
  if (error || !Array.isArray(data)) return; // ยังไม่ได้รัน ops.sql หรือเชื่อมต่อไม่ได้ → ใช้ค่าเดิม
  const wasPaused = cloudPaused();
  const v = Object.fromEntries(data.map((r) => [r.key, r.value]));
  Object.assign(Remote, remoteMerge(v));
  try { localStorage.setItem(REMOTE_KEY, JSON.stringify(Remote)); } catch (e) { /* ignore */ }
  // ปิดสวิตช์ฉุกเฉินแล้ว: ซิงก์ของที่ค้างไว้
  if (wasPaused && !cloudPaused() && Cloud.user && typeof cloudPull === 'function') { cloudPull(); outboxFlush(); }
  if (typeof render === 'function' && !['lesson', 'timed', 'story'].includes(UI.view)) render();
}
setInterval(remoteLoad, 10 * 60 * 1000);

// ---------- รายงาน error ----------
const Errs = { sent: 0, seen: new Set(), queue: [] };
// ลายเซ็นสั้น ๆ (FNV-1a) ใช้รวม error ชนิดเดียวกัน
function errSig(s) { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
// ชื่อเบราว์เซอร์และระบบแบบย่อ (ไม่ส่ง user agent เต็ม)
function browserTag() {
  const u = navigator.userAgent;
  const b = (u.match(/(Edg|OPR|SamsungBrowser|Firefox|CriOS|FxiOS|Chrome|Version)\/(\d+)/) || [])[0]?.replace('Version', 'Safari') || 'อื่น ๆ';
  const os = /Android/.test(u) ? 'Android' : /iPhone|iPad|iPod/.test(u) ? 'iOS' : /Mac OS X/.test(u) ? 'macOS' : /Windows/.test(u) ? 'Windows' : /CrOS/.test(u) ? 'ChromeOS' : /Linux/.test(u) ? 'Linux' : '';
  return `${b} ${os}`.trim();
}
// ตัดที่อยู่เว็บออกจาก stack ให้เหลือแค่ไฟล์:บรรทัด
const shortStack = (s) => String(s || '').split(location.origin).join('').slice(0, 2000);
function reportError(message, source, stack) {
  message = String(message || '').slice(0, 500);
  if (!message || Errs.sent >= 5) return; // ไม่เกิน 5 รายการต่อการเปิดแอป 1 ครั้ง
  const sig = errSig(message + '|' + (source || ''));
  if (Errs.seen.has(sig)) return;
  Errs.seen.add(sig); Errs.sent++;
  Errs.queue.push({
    p_sig: sig, p_message: message, p_source: (source || '').split(location.origin).join(''), p_stack: shortStack(stack),
    p_version: APP_VERSION, p_view: (typeof UI !== 'undefined' && UI.view) || 'start', p_browser: browserTag(),
  });
  errFlush();
}
// ส่ง error ที่ค้าง (เรียกอีกครั้งเมื่อระบบ Supabase พร้อม)
function errFlush() {
  if (typeof Cloud === 'undefined' || !Cloud.client || !netOK()) return;
  for (const e of Errs.queue.splice(0)) Cloud.client.rpc('report_error', e).then(() => {}, () => {});
}
// เฉพาะ error จากไฟล์ของแอปเอง (ข้ามส่วนขยายเบราว์เซอร์และสคริปต์โดเมนอื่น)
window.addEventListener('error', (e) => {
  if (!e.filename || !e.filename.startsWith(location.origin)) return;
  reportError(e.message, `${e.filename}:${e.lineno}:${e.colno}`, e.error?.stack);
});
window.addEventListener('unhandledrejection', (e) => {
  const r = e.reason, msg = String(r?.message || r || '');
  if (/Failed to fetch|NetworkError|Load failed|network|aborted|AbortError/i.test(msg)) return; // เน็ตหลุด ไม่ใช่บั๊ก
  reportError(msg, '', r?.stack);
});
