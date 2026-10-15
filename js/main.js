/* BeeMath — ตัวรับเหตุการณ์และเริ่มต้นแอป (โหลดเป็นไฟล์สุดท้าย) */

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  ACT[el.dataset.act]?.(el.dataset, el, e);
});
document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.id === 'name') S.name = t.value.trim() || 'ผู้เรียน';
  else if (t.id === 'goal-select') S.goal = +t.value;
  else if (t.id === 'remind-time') { S.remind.time = t.value; S.remindedDay = null; }
  else if (t.id === 'volume') { S.settings.volume = +t.value / 100; SFX.play('tap'); }
  else if (t.id === 'import-file') { if (t.files[0]) readImport(t.files[0]); t.value = ''; return; }
  else return;
  save();
});
// ปรับระดับเสียงแบบทันทีระหว่างลากแถบ
document.addEventListener('input', (e) => { if (e.target.id === 'volume') S.settings.volume = +e.target.value / 100; });
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || UI.sheet) return;
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
}
// เก็บคำขอติดตั้งไว้ แล้วแสดงปุ่ม "ติดตั้งแอป" ในหน้าตั้งค่า (Chrome/Edge/Android)
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); UI.installPrompt = e; if (UI.view === 'settings') render(); });
window.addEventListener('appinstalled', () => { UI.installPrompt = null; showToast('ติดตั้ง BeeMath แล้ว!'); });
window.addEventListener('online', () => { if (UI.view !== 'lesson') render(); });
window.addEventListener('offline', () => showToast('ออฟไลน์อยู่ ยังเรียนต่อได้ตามปกติ'));

render();
scrollToCurrent();
remindCheck();
cloudInit(); // ระบบบัญชี (ทำงานเมื่อตั้งค่า js/config.js แล้วเท่านั้น)
