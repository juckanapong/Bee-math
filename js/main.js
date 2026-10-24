/* BeeMath — ตัวรับเหตุการณ์และเริ่มต้นแอป (โหลดเป็นไฟล์สุดท้าย) */

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  ACT[el.dataset.act]?.(el.dataset, el, e);
});
// แตะพื้นหลังเพื่อปิดหน้าต่าง: กดลงและยกขึ้นบนพื้นหลังเดียวกัน (Safari ไม่ส่ง click ให้ div ธรรมดา จึงไม่พึ่ง click)
let downOnOverlay = false;
document.addEventListener('pointerdown', (e) => { downOnOverlay = e.target.classList?.contains('overlay'); });
document.addEventListener('pointerup', (e) => {
  if (downOnOverlay && e.target.classList?.contains('overlay')) ACT['close-sheet']();
  downOnOverlay = false;
});
document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.id === 'name') S.name = t.value.trim() || 'ผู้เรียน';
  else if (t.id === 'goal-select') S.goal = +t.value;
  else if (t.id === 'remind-time') { S.remind.time = t.value; S.remindedDay = null; if (typeof pushSync === 'function') pushSync(); }
  else if (t.id === 'volume') { S.settings.volume = +t.value / 100; SFX.play('tap'); Music.apply(); }
  else if (t.id === 'import-file') { if (t.files[0]) readImport(t.files[0]); t.value = ''; return; }
  else return;
  save();
});
// ปรับระดับเสียงแบบทันทีระหว่างลากแถบ
document.addEventListener('input', (e) => {
  if (e.target.matches?.('input, textarea, select')) e.target.dataset.dirty = '1'; // ให้ render() เก็บค่าที่พิมพ์ไว้
  // เริ่มแก้ช่องแล้ว: ซ่อน error เก่าของฟอร์มนั้น (ไม่วาดหน้าใหม่ระหว่างพิมพ์)
  const form = e.target.closest?.('.acct-card, .sheet-card') || e.target.closest?.('form');
  if (form?.querySelector('.acct-msg.err')) {
    form.querySelectorAll('.acct-msg.err').forEach((el) => el.remove());
    if (UI.acct) UI.acct.err = null;
    UI.formErr = null;
  }
  if (e.target.id === 'volume') { S.settings.volume = +e.target.value / 100; Music.apply(); }
  else if (e.target.id === 'nl-range') nlInput(+e.target.value); // เส้นจำนวนในบทเรียน
});
document.addEventListener('keydown', (e) => {
  // หน้าต่างป๊อปอัป: Esc ปิด (ยกเว้นหน้าที่ต้องตอบก่อน) · Tab วนอยู่ในหน้าต่าง
  if (UI.sheet) {
    if (e.key === 'Escape' && !SHEET_LOCKED.includes(UI.sheet.type)) { e.preventDefault(); ACT['close-sheet'](); }
    else if (e.key === 'Tab') trapTab(e);
    return;
  }
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  // Enter/Space บนปุ่มที่โฟกัสอยู่ = กดปุ่มนั้น (ไม่ใช่คีย์ลัด "ตรวจคำตอบ" ของบทเรียน)
  if ((e.key === 'Enter' || e.key === ' ') && e.target.tagName === 'BUTTON' && !e.target.matches('[data-act="check"], [data-act="next"], [data-act="s-check"], [data-act="s-next"]')) return;
  const clickFirst = (sel) => document.querySelector(sel)?.click();
  if (UI.view === 'timed') {
    if (/^[1-4]$/.test(e.key)) ACT['timed-ans']({ k: +e.key - 1 });
    return;
  }
  if (UI.view === 'story' && UI.st) {
    const cur = STORIES.find((x) => x.id === UI.st.id).steps[UI.st.step];
    if (e.key === 'Enter') return clickFirst('[data-act="s-check"]:not([disabled]), [data-act="s-next"]');
    if (UI.st.checked || !cur.q) return;
    if (cur.q === 'choice' && /^[1-4]$/.test(e.key) && +e.key <= cur.choices.length) ACT['s-opt']({ k: +e.key - 1 });
    if (cur.q === 'input') {
      if (/^[0-9]$/.test(e.key)) ACT['s-key']({ k: e.key });
      else if (e.key === '-') ACT['s-key']({ k: '−' });
      else if (e.key === 'Backspace') ACT['s-key']({ k: '⌫' });
    }
    return;
  }
  if (UI.view !== 'lesson') return;
  const L = UI.L, q = L.queue[L.idx];
  if (e.key === 'Enter') return clickFirst('[data-act="check"]:not([disabled]), [data-act="next"]');
  if (L.checked) return;
  if (q.type === 'choice' && /^[1-4]$/.test(e.key) && +e.key <= q.choices.length) ACT.opt({ k: +e.key - 1 });
  if (q.type === 'multi' && /^[1-9]$/.test(e.key) && +e.key <= q.choices.length) ACT['m-toggle']({ k: +e.key - 1 });
  if (q.type === 'numline' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
    if (q.est) { const r = document.getElementById('nl-range'); r?.focus(); return; } // แบบประมาณ: ให้แถบเลื่อนรับปุ่มลูกศรเอง
    e.preventDefault(); ACT['nl-step']({ d: e.key === 'ArrowLeft' ? -1 : 1 });
  }
  if (q.type === 'input') {
    if (/^[0-9]$/.test(e.key)) ACT.key({ k: e.key });
    else if (e.key === '-') ACT.key({ k: '−' });
    else if (e.key === 'Backspace') ACT.key({ k: '⌫' });
  }
});

// ทุกนาที: หัวใจคืน · เตือนให้มาเรียน (ไม่วาดใหม่ระหว่างทำโจทย์)
setInterval(() => {
  remindCheck();
  if (['lesson', 'timed', 'story'].includes(UI.view)) return;
  const h = S.hearts;
  tick();
  if (h !== S.hearts) render();
}, 60000);

// ---------- PWA: ติดตั้งเป็นแอป + ใช้ออฟไลน์ (ทำงานเมื่อเปิดผ่าน http/https เท่านั้น ไม่ใช่ file://) ----------
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  // มีเวอร์ชันใหม่ (service worker ตัวใหม่เข้ามาคุมหน้า): โหลดหน้าใหม่ทันที หรือรอจนจบบทเรียน/เกม
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || UI.updateReady) return;
    UI.updateReady = true;
    if (!['lesson', 'timed', 'story', 'cards'].includes(UI.view) && !UI.sheet) location.reload();
  });
}
// เก็บคำขอติดตั้งไว้ แล้วแสดงปุ่ม "ติดตั้งแอป" ในหน้าตั้งค่า (Chrome/Edge/Android)
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); UI.installPrompt = e; if (UI.view === 'settings') render(); });
window.addEventListener('appinstalled', () => { UI.installPrompt = null; showToast('ติดตั้ง BeeMath แล้ว!'); });
window.addEventListener('online', () => { if (UI.view !== 'lesson') render(); });
window.addEventListener('offline', () => showToast('ไม่มีอินเทอร์เน็ต ยังเรียนต่อได้ตามปกติ'));

const oauthBack = oauthResume(); // เพิ่งกลับจากหน้า Google → กลับหน้าเดิม + แสดงหน้ารอ (js/cloud.js)
// ปุ่มย้อนกลับของมือถือ/เบราว์เซอร์: ใช้ทำงานในแอป ไม่หลุดออกจากแอป (เดิมกดแล้วออกทันที แม้อยู่กลางบทเรียน)
// เก็บรายการประวัติไว้ 2 ชั้น: กดย้อนกลับ → ทำ appBack() แล้วเติมชั้นบนกลับ · หน้าแรกสุดแล้วจึงย้อนออกจริง
history.replaceState({ bm: 0 }, '');
history.pushState({ bm: 1 }, '');
addEventListener('popstate', () => {
  if (appBack()) history.pushState({ bm: 1 }, '');
  else history.back();
});
render();
Music.autoplay(); // เพลงประกอบ: ลองเล่นเองทันที (ถ้าเบราว์เซอร์ไม่ยอม จะเริ่มที่การแตะครั้งแรก)
scrollToCurrent();
remindCheck();
// ระบบบัญชี (ทำงานเมื่อตั้งค่า js/config.js แล้วเท่านั้น)
// เคยเข้าสู่ระบบ หรือเพิ่งกลับจากหน้า Google/ลิงก์ในอีเมล → โหลดทันที · ผู้เล่นที่ไม่มีบัญชี → รอให้เครื่องว่างก่อน หน้าแรกจะได้เร็วขึ้น
const hadSession = (() => { try { return Object.keys(localStorage).some((k) => /^sb-.*-auth-token$/.test(k)); } catch (e) { return true; } })();
Cloud.expect = hadSession; // ใช้แสดง "กำลังเชื่อมต่อบัญชี…" ระหว่างโหลด (js/cloud.js acctPending)
if (hadSession || oauthBack || /[?#&](code|access_token|error)=/.test(location.href)) cloudInit();
else if ('requestIdleCallback' in window) requestIdleCallback(() => cloudInit(), { timeout: 3000 });
else setTimeout(cloudInit, 1500);
// เอฟเฟกต์ 3 มิติ: โหลดตอนเครื่องว่าง (หน้าแรกไม่ต้องรอ)
if ('requestIdleCallback' in window) requestIdleCallback(() => fx3dPreload(), { timeout: 6000 });
else setTimeout(fx3dPreload, 4000);
