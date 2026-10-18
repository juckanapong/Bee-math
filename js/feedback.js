/* BeeMath — แจ้งปัญหา / ข้อเสนอแนะ / รายงานโจทย์
   เข้าสู่ระบบแล้ว → ส่งเข้าตาราง feedback (supabase/feedback.sql) · ยังไม่เข้าสู่ระบบ → เปิดแอปอีเมลพร้อมข้อความที่กรอกไว้ */

const FEEDBACK_EMAIL = 'juckanapong@gmail.com';
const FB_KINDS = [['bug', 'แอปมีปัญหา'], ['question', 'โจทย์/เฉลยผิด'], ['idea', 'ข้อเสนอแนะ'], ['other', 'อื่น ๆ']];

const plain = (html) => { const d = document.createElement('div'); d.innerHTML = html || ''; return d.textContent.replace(/\s+/g, ' ').trim(); };

// โจทย์ที่กำลังทำอยู่ (สำหรับ "รายงานโจทย์นี้")
function questionContext() {
  const L = UI.L, q = L?.queue[L.idx];
  if (!q) return null;
  const choice = (k) => (q.choices && k !== null && k !== undefined ? plain(q.choices[k]) : '');
  return {
    gen: q.gen || '', type: q.type, lvl: q.lvl ?? null,
    prompt: plain(q.prompt).slice(0, 200), eq: q.eq || '',
    answer: q.type === 'choice' ? choice(q.answer) : String(q.answer ?? '').slice(0, 60),
    user: q.type === 'choice' ? choice(L.sel) : q.type === 'input' ? L.input : '',
    correct: !!L.ok,
  };
}
function feedbackContext(f) {
  const ctx = { view: f.from || UI.view, at: new Date().toISOString() };
  if (f.attach) ctx.device = `${innerWidth}×${innerHeight} · ${navigator.onLine ? 'online' : 'offline'} · ${navigator.userAgent}`.slice(0, 300);
  if (f.q) ctx.question = f.q;
  return ctx;
}

function openFeedback(kind = 'bug', q = null) {
  UI.fb = { kind, text: '', attach: true, q, from: UI.view, busy: false, err: null };
  UI.sheet = { type: 'feedback' };
  render();
  setTimeout(() => document.getElementById('fb-text')?.focus(), 50);
}

SHEETS.feedback = () => {
  const f = UI.fb, online = typeof Cloud !== 'undefined' && Cloud.user;
  return `<div class="sheet-card fb-sheet"><h3>${f.q ? 'รายงานโจทย์ข้อนี้' : 'แจ้งปัญหา / ข้อเสนอแนะ'}</h3>
    <form class="acct-form" data-form="feedback">
      <div class="fb-kinds" role="radiogroup" aria-label="เรื่องที่จะแจ้ง">${FB_KINDS.map(([k, t]) =>
        `<button type="button" role="radio" aria-checked="${f.kind === k}" class="fb-kind ${f.kind === k ? 'on' : ''}" data-act="fb-kind" data-k="${k}">${t}</button>`).join('')}</div>
      ${f.q ? `<div class="fb-q"><b>${esc(f.q.prompt || 'โจทย์')}</b>${f.q.eq ? `<span>${M(f.q.eq)}</span>` : ''}<small>เฉลยในแอป: ${esc(f.q.answer)}${f.q.user ? ` · คำตอบของคุณ: ${esc(f.q.user)}` : ''}</small></div>` : ''}
      <label class="fld">เล่าให้ฟังหน่อย${f.q ? ' (เช่น เฉลยผิดตรงไหน)' : ''}
        <textarea id="fb-text" maxlength="1000" rows="4" required placeholder="${f.q ? 'เช่น คิดว่าคำตอบควรเป็น 5 เพราะ…' : 'เกิดอะไรขึ้น ทำอะไรอยู่ตอนนั้น หรืออยากให้มีอะไรเพิ่ม'}">${esc(f.text)}</textarea></label>
      <label class="consent fb-attach"><input type="checkbox" id="fb-attach" ${f.attach ? 'checked' : ''}><span>แนบข้อมูลอุปกรณ์ (ขนาดจอ เบราว์เซอร์) ช่วยให้แก้ปัญหาได้เร็วขึ้น</span></label>
      <p class="muted small">อย่าใส่ข้อมูลส่วนตัว เช่น เบอร์โทร ที่อยู่ หรือรหัสผ่าน · ${online ? `ส่งในนามบัญชี "${esc(S.name)}"` : `ยังไม่ได้เข้าสู่ระบบ จะเปิดแอปอีเมลเพื่อส่งถึง ${FEEDBACK_EMAIL}`}</p>
      ${f.err ? `<p class="acct-msg err" role="alert">${esc(f.err)}</p>` : ''}
      <button class="btn primary" type="submit" ${f.busy ? 'disabled' : ''}>${f.busy ? 'กำลังส่ง…' : online ? 'ส่ง' : 'เปิดแอปอีเมล'}</button>
      <button class="btn ghost" type="button" data-act="close">ยกเลิก</button>
    </form></div>`;
};

FORM_HANDLERS.feedback = async () => {
  const f = UI.fb;
  f.text = document.getElementById('fb-text')?.value.trim() || '';
  f.attach = !!document.getElementById('fb-attach')?.checked;
  if (!f.text) return;
  const ctx = feedbackContext(f);
  if (!(typeof Cloud !== 'undefined' && Cloud.user)) {
    const kind = FB_KINDS.find(([k]) => k === f.kind)[1];
    const body = `${f.text}\n\n---\n${JSON.stringify(ctx, null, 1)}`;
    location.href = `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(`BeeMath: ${kind}`)}&body=${encodeURIComponent(body.slice(0, 1800))}`;
    UI.sheet = null; render();
    return;
  }
  if (!netOK()) { f.err = cloudPaused() ? 'ระบบออนไลน์ปิดชั่วคราว ลองส่งใหม่ภายหลัง (ข้อความยังอยู่)' : 'ออฟไลน์อยู่ ต่ออินเทอร์เน็ตแล้วกดส่งอีกครั้ง (ข้อความยังอยู่)'; return render(); }
  f.busy = true; f.err = null; render();
  const { error } = await Cloud.client.rpc('feedback_send', { p_kind: f.kind, p_message: f.text, p_context: ctx });
  f.busy = false;
  if (error) { f.err = cloudError(error); return render(); }
  UI.sheet = null; UI.fb = null; render();
  showToast('ขอบคุณ! ส่งถึงผู้พัฒนาแล้ว');
};

Object.assign(ACT, {
  'fb-open': () => openFeedback('bug'),
  'report-q': () => openFeedback('question', questionContext()),
  'fb-kind': (d) => { UI.fb.text = document.getElementById('fb-text')?.value || UI.fb.text; UI.fb.kind = d.k; render(); },
});
// เก็บข้อความที่พิมพ์ไว้ ไม่ให้หายตอนหน้าต่างวาดใหม่
document.addEventListener('input', (e) => { if (e.target.id === 'fb-text' && UI.fb) UI.fb.text = e.target.value; });
document.addEventListener('change', (e) => { if (e.target.id === 'fb-attach' && UI.fb) UI.fb.attach = e.target.checked; });
