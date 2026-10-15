/* BeeMath — บัญชีผู้ใช้และซิงก์ความคืบหน้ากับ Supabase (ระยะ 2a)
   - ไม่ตั้งค่า js/config.js หรือไม่ล็อกอิน = เล่นแบบเก็บในเครื่องเหมือนเดิม
   - ล็อกอินแล้ว: ทุกครั้งที่บันทึกจะส่งขึ้นคลาวด์ (หน่วงเวลาเล็กน้อย) และดึงลงเมื่อเปิดแอป
   - ซิงก์แบบ "เครื่องเป็นหลัก": ถ้าทั้งเครื่องและคลาวด์มีความคืบหน้าคนละชุด จะรวมกันโดยไม่ทิ้งด่านที่เคยผ่าน */

const SUPABASE_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js';
const SYNC_KEY = 'beemath-sync'; // { userId, lastSync, dirty }

const Cloud = {
  client: null, user: null,
  status: 'off', // off · loading · ready · syncing · synced · offline · error
  lastSync: null, error: null, applying: false, timer: null,
  enabled: () => !!(window.BEEMATH_CONFIG?.supabaseUrl && window.BEEMATH_CONFIG?.supabaseAnonKey),
};
const syncMeta = () => { try { return JSON.parse(localStorage.getItem(SYNC_KEY)) || {}; } catch (e) { return {}; } };
const setSyncMeta = (m) => { try { localStorage.setItem(SYNC_KEY, JSON.stringify(m)); } catch (e) { /* ignore */ } };
const loadScript = (src) => new Promise((ok, fail) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = fail; document.head.appendChild(s); });
// วาดหน้าใหม่เฉพาะเมื่อไม่ได้อยู่ระหว่างทำโจทย์ (ไม่ขัดจังหวะผู้เรียน)
const cloudRender = () => { if (!['lesson', 'timed', 'story'].includes(UI.view)) render(); };

// แปลงข้อความผิดพลาดของ Supabase เป็นภาษาไทย
function cloudError(err) {
  const m = String(err?.message || err || '');
  if (/invalid login credentials/i.test(m)) return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
  if (/already registered|already been registered/i.test(m)) return 'อีเมลนี้มีบัญชีอยู่แล้ว ลองเข้าสู่ระบบแทน';
  if (/email not confirmed/i.test(m)) return 'ยังไม่ได้ยืนยันอีเมล กรุณาเปิดลิงก์ในอีเมลที่เราส่งไปก่อน';
  if (/password.*(at least|characters)/i.test(m)) return 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร';
  if (/invalid.*email|email.*invalid/i.test(m)) return 'รูปแบบอีเมลไม่ถูกต้อง';
  if (/rate limit|too many/i.test(m)) return 'ลองบ่อยเกินไป รอสักครู่แล้วลองใหม่';
  if (/fetch|network|failed to load/i.test(m)) return 'เชื่อมต่อไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่';
  return 'เกิดข้อผิดพลาด: ' + m;
}

// ---------- เริ่มต้น ----------
async function cloudInit() {
  if (!Cloud.enabled()) return;
  Cloud.status = 'loading';
  try {
    if (!window.supabase) await loadScript(SUPABASE_CDN);
    const cfg = window.BEEMATH_CONFIG;
    Cloud.client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    const { data } = await Cloud.client.auth.getSession();
    Cloud.user = data.session?.user || null;
    Cloud.status = 'ready';
    Cloud.client.auth.onAuthStateChange((event, session) => {
      const prev = Cloud.user?.id;
      Cloud.user = session?.user || null;
      if (event === 'PASSWORD_RECOVERY') { UI.view = 'account'; UI.sheet = { type: 'new-password' }; render(); return; }
      if (Cloud.user && Cloud.user.id !== prev) setTimeout(() => cloudPull(), 0); // ล็อกอินจากแท็บอื่น/ลิงก์ยืนยันอีเมล
    });
    if (Cloud.user) await cloudPull();
  } catch (e) {
    Cloud.status = 'error';
    Cloud.error = 'โหลดระบบบัญชีไม่สำเร็จ (ยังเล่นแบบไม่มีบัญชีได้ตามปกติ)';
  }
  cloudRender();
}

// ---------- ซิงก์ ----------
const isFresh = (st) => !st || ((st.xp || 0) === 0 && !Object.keys(st.done || {}).length);
// รวมความคืบหน้าสองชุด: ใช้ชุดที่ XP มากกว่าเป็นหลัก แล้วรวมด่าน/ตรา/หีบ/เรื่องเล่าที่เคยได้จากอีกชุดด้วย
function mergeStates(a, b) {
  const [base, other] = (a.xp || 0) >= (b.xp || 0) ? [a, b] : [b, a];
  const out = JSON.parse(JSON.stringify(base));
  for (const k of ['done', 'badges', 'chests', 'legend', 'stories', 'monthBadges', 'owned']) out[k] = { ...(other[k] || {}), ...(base[k] || {}) };
  out.records = { ...(other.records || {}), ...(base.records || {}) };
  for (const k of Object.keys(other.records || {})) out.records[k] = Math.max(other.records[k] || 0, base.records?.[k] || 0);
  out.onboarded = !!(base.onboarded || other.onboarded);
  return out;
}
// แทนที่ความคืบหน้าในเครื่องด้วยชุดใหม่ (ผ่าน load() เพื่อเติมค่าที่ขาดและแปลงข้อมูลรุ่นเก่า)
function applyState(st) {
  Cloud.applying = true;
  try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* ignore */ }
  S = load();
  save();
  Cloud.applying = false;
}

async function cloudPull() {
  if (!Cloud.client || !Cloud.user) return;
  if (!navigator.onLine) { Cloud.status = 'offline'; return; }
  Cloud.status = 'syncing'; cloudRender();
  const uid = Cloud.user.id;
  const { data, error } = await Cloud.client.from('progress').select('state, updated_at').eq('user_id', uid).maybeSingle();
  if (error) { Cloud.status = 'error'; Cloud.error = cloudError(error); return cloudRender(); }
  const meta = syncMeta();
  let merged = false;
  if (!data) {
    // บัญชีใหม่: อัปโหลดความคืบหน้าในเครื่องขึ้นไป (ยกเว้นเป็นของบัญชีอื่น)
    if (meta.userId && meta.userId !== uid) applyState(defaultState());
  } else if (meta.userId === uid && !meta.dirty) {
    applyState(data.state); // มีแต่คลาวด์ที่เปลี่ยน
  } else if ((meta.userId && meta.userId !== uid) || isFresh(S)) {
    applyState(data.state); // ข้อมูลในเครื่องเป็นของบัญชีอื่น หรือยังไม่มีความคืบหน้า
  } else {
    applyState(mergeStates(S, data.state)); // ทั้งสองฝั่งมีความคืบหน้า → รวมกัน
    merged = true;
  }
  setSyncMeta({ userId: uid, lastSync: Date.now(), dirty: !data || merged });
  if (!data || merged) await cloudPush();
  else { Cloud.status = 'synced'; Cloud.lastSync = Date.now(); }
  if (merged) showToast('รวมความคืบหน้าในเครื่องนี้เข้ากับบัญชีแล้ว');
  cloudRender();
}

async function cloudPush() {
  clearTimeout(Cloud.timer);
  if (!Cloud.client || !Cloud.user) return;
  if (!navigator.onLine) { Cloud.status = 'offline'; return; }
  Cloud.status = 'syncing';
  const uid = Cloud.user.id;
  const { error } = await Cloud.client.from('progress').upsert({
    user_id: uid, state: S, xp: S.xp, week_key: S.week.key, week_xp: S.week.xp,
    streak: S.streak, league_tier: S.league.tier, updated_at: new Date().toISOString(),
  });
  if (error) { Cloud.status = 'error'; Cloud.error = cloudError(error); return; }
  await Cloud.client.from('profiles').update({ display_name: S.name.slice(0, 20) || 'ผู้เรียน', avatar: S.avatar }).eq('id', uid);
  setSyncMeta({ userId: uid, lastSync: Date.now(), dirty: false });
  Cloud.status = 'synced'; Cloud.lastSync = Date.now(); Cloud.error = null;
  if (['account', 'settings'].includes(UI.view)) cloudRender();
}

// เรียกจาก save(): ทำเครื่องหมายว่ามีการเปลี่ยนแปลง แล้วส่งขึ้นคลาวด์หลังหยุดเปลี่ยน 2.5 วินาที
function cloudQueue() {
  if (!Cloud.user || Cloud.applying) return;
  setSyncMeta({ ...syncMeta(), userId: Cloud.user.id, dirty: true });
  clearTimeout(Cloud.timer);
  Cloud.timer = setTimeout(() => cloudPush(), 2500);
}
window.addEventListener('online', () => { if (Cloud.user && syncMeta().dirty) cloudPush(); });
// ปิดแท็บ/สลับแอป: พยายามส่งขึ้นทันที
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && Cloud.user && syncMeta().dirty) cloudPush(); });

// ---------- บัญชี ----------
const siteUrl = () => location.origin + location.pathname;
async function cloudSignUp(email, password, name) {
  const { data, error } = await Cloud.client.auth.signUp({ email, password, options: { data: { display_name: name }, emailRedirectTo: siteUrl() } });
  if (error) throw error;
  if (data.session) { Cloud.user = data.user; S.name = name || S.name; await cloudPull(); return { confirmed: true }; }
  return { confirmed: false };
}
async function cloudSignIn(email, password) {
  const { data, error } = await Cloud.client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  Cloud.user = data.user;
  await cloudPull();
}
// ออกจากระบบ: ส่งข้อมูลล่าสุดขึ้นก่อน แล้วล้างข้อมูลในเครื่อง (กันข้อมูลรั่วบนเครื่องที่ใช้ร่วมกัน)
async function cloudSignOut() {
  if (syncMeta().dirty) await cloudPush();
  await Cloud.client.auth.signOut();
  Cloud.user = null; Cloud.status = 'ready'; Cloud.lastSync = null;
  setSyncMeta({});
  const fresh = defaultState(); fresh.onboarded = true;
  applyState(fresh);
}
async function cloudDeleteAccount() {
  const { error } = await Cloud.client.rpc('delete_my_account');
  if (error) throw error;
  await Cloud.client.auth.signOut();
  Cloud.user = null; Cloud.status = 'ready';
  setSyncMeta({});
  applyState(defaultState());
}

// ---------- หน้าบัญชี ----------
function timeAgo(ts) {
  const s = Math.round((Date.now() - ts) / 1000);
  return s < 60 ? 'เมื่อสักครู่' : s < 3600 ? `${Math.floor(s / 60)} นาทีที่แล้ว` : `${Math.floor(s / 3600)} ชั่วโมงที่แล้ว`;
}
function syncLabel() {
  if (!Cloud.enabled()) return 'ยังไม่ได้เปิดระบบบัญชี';
  if (!Cloud.user) return Cloud.status === 'error' ? Cloud.error : 'ยังไม่ได้เข้าสู่ระบบ ความคืบหน้าเก็บในเครื่องนี้เท่านั้น';
  return { syncing: 'กำลังซิงก์…', offline: 'ออฟไลน์ จะซิงก์เมื่อกลับมาออนไลน์', error: Cloud.error || 'ซิงก์ไม่สำเร็จ', loading: 'กำลังเชื่อมต่อ…' }[Cloud.status]
    || (Cloud.lastSync ? `ซิงก์แล้ว ${timeAgo(Cloud.lastSync)}` : 'เชื่อมต่อแล้ว');
}
function viewAccount() {
  const a = UI.acct || (UI.acct = { tab: 'signin' });
  let body;
  if (!Cloud.enabled()) {
    body = `<div class="card acct-card"><b>ยังไม่ได้เปิดระบบบัญชี</b>
      <p class="muted">ผู้ดูแลต้องสร้างโปรเจกต์ Supabase แล้วใส่ค่าใน <code>js/config.js</code> (ดูขั้นตอนใน README) ระหว่างนี้ใช้ "สำรองความคืบหน้า" ในหน้าตั้งค่าเพื่อย้ายเครื่องได้</p></div>`;
  } else if (Cloud.user) {
    body = `<div class="card acct-card">
      <div class="acct-who">${hex(bee(56), 'acct-av', `background:${S.avatar}`)}<span class="setting-main"><b>${esc(S.name)}</b><small>${esc(Cloud.user.email || '')}</small></span></div>
      <p class="sync-line ${Cloud.status}">${icon(Cloud.status === 'error' ? 'x' : Cloud.status === 'offline' ? 'clock' : 'check', 16)} ${esc(syncLabel())}</p>
      <button class="btn primary" data-act="cloud-sync" ${Cloud.status === 'syncing' ? 'disabled' : ''}>${icon('refresh', 18)} ซิงก์ตอนนี้</button>
      <button class="btn" data-act="cloud-signout">ออกจากระบบ</button>
    </div>
    <p class="muted small">ออกจากระบบแล้วความคืบหน้าในเครื่องนี้จะถูกล้าง (เก็บไว้ในบัญชีแล้ว) เพื่อให้คนอื่นใช้เครื่องนี้ต่อได้อย่างปลอดภัย</p>
    <button class="btn danger-text" data-act="cloud-delete-ask">ลบบัญชีและข้อมูลทั้งหมด</button>`;
  } else {
    const tabs = [['signin', 'เข้าสู่ระบบ'], ['signup', 'สมัครบัญชี']];
    const form = a.tab === 'forgot'
      ? `<form class="acct-form" data-form="forgot">
          <p class="muted">กรอกอีเมลที่ใช้สมัคร เราจะส่งลิงก์ตั้งรหัสผ่านใหม่ไปให้</p>
          <label class="fld">อีเมล<input type="email" id="acct-email" autocomplete="email" required></label>
          <button class="btn primary" type="submit" ${a.busy ? 'disabled' : ''}>ส่งลิงก์ตั้งรหัสผ่านใหม่</button>
          <button class="btn link" type="button" data-act="acct-tab" data-t="signin">กลับไปเข้าสู่ระบบ</button></form>`
      : `<form class="acct-form" data-form="${a.tab}">
          ${a.tab === 'signup' ? `<label class="fld">ชื่อที่แสดง<input id="acct-name" maxlength="20" value="${esc(S.name)}" autocomplete="nickname" required></label>` : ''}
          <label class="fld">อีเมล<input type="email" id="acct-email" autocomplete="email" required></label>
          <label class="fld">รหัสผ่าน<input type="password" id="acct-pw" minlength="6" autocomplete="${a.tab === 'signup' ? 'new-password' : 'current-password'}" required></label>
          <button class="btn primary" type="submit" ${a.busy ? 'disabled' : ''}>${a.busy ? 'กำลังดำเนินการ…' : a.tab === 'signup' ? 'สมัครบัญชี' : 'เข้าสู่ระบบ'}</button>
          ${a.tab === 'signin' ? '<button class="btn link" type="button" data-act="acct-tab" data-t="forgot">ลืมรหัสผ่าน?</button>' : '<p class="muted small">ความคืบหน้าที่ทำไว้ในเครื่องนี้จะถูกย้ายเข้าบัญชีใหม่</p>'}
        </form>`;
    body = `<div class="card acct-card">
      <div class="acct-intro">${bee(64, 'happy')}<p>เก็บความคืบหน้าไว้บนคลาวด์ เรียนต่อได้ทุกเครื่อง ไม่หายแม้ล้างเบราว์เซอร์</p></div>
      ${a.tab === 'forgot' ? '' : `<div class="seg wide" role="tablist">${tabs.map(([t, l]) => `<button role="tab" aria-selected="${a.tab === t}" class="${a.tab === t ? 'on' : ''}" data-act="acct-tab" data-t="${t}">${l}</button>`).join('')}</div>`}
      ${a.err ? `<p class="acct-msg err" role="alert">${esc(a.err)}</p>` : ''}${a.msg ? `<p class="acct-msg ok" role="status">${esc(a.msg)}</p>` : ''}
      ${form}
    </div>`;
  }
  return shell(`<div class="sub-body">${body}</div>`, { sub: { title: 'บัญชี' } });
}
Object.assign(SHEETS, {
  'cloud-delete'() {
    return `<div class="sheet-card center"><h3>ลบบัญชีถาวร?</h3>
      <p>ความคืบหน้าทั้งหมดบนคลาวด์และในเครื่องนี้จะถูกลบ และกู้คืนไม่ได้</p>
      <button class="btn danger" data-act="cloud-delete">ลบบัญชี</button><button class="btn ghost" data-act="close">ยกเลิก</button></div>`;
  },
  'new-password'() {
    return `<div class="sheet-card"><h3>ตั้งรหัสผ่านใหม่</h3>
      <form class="acct-form" data-form="new-password">
        <label class="fld">รหัสผ่านใหม่<input type="password" id="acct-pw" minlength="6" autocomplete="new-password" required></label>
        <button class="btn primary" type="submit">บันทึกรหัสผ่าน</button></form></div>`;
  },
});
VIEWS.account = viewAccount;
SUBPAGES.push('account');

// ฟอร์มบัญชี (ส่งด้วยปุ่มหรือกด Enter)
async function submitAccount(kind) {
  const a = UI.acct || (UI.acct = { tab: 'signin' });
  const val = (id) => document.getElementById(id)?.value.trim() || '';
  const email = val('acct-email'), pw = document.getElementById('acct-pw')?.value || '', name = val('acct-name');
  a.err = null; a.msg = null; a.busy = true; render();
  try {
    if (kind === 'signin') { await cloudSignIn(email, pw); showToast('เข้าสู่ระบบแล้ว'); }
    else if (kind === 'signup') {
      if (name) S.name = name.slice(0, 20);
      const r = await cloudSignUp(email, pw, S.name);
      if (r.confirmed) showToast('สร้างบัญชีแล้ว!');
      else { a.tab = 'signin'; a.msg = `ส่งลิงก์ยืนยันไปที่ ${email} แล้ว เปิดลิงก์ในอีเมลแล้วกลับมาเข้าสู่ระบบ`; }
    } else if (kind === 'forgot') {
      const { error } = await Cloud.client.auth.resetPasswordForEmail(email, { redirectTo: siteUrl() });
      if (error) throw error;
      a.tab = 'signin'; a.msg = `ส่งลิงก์ตั้งรหัสผ่านใหม่ไปที่ ${email} แล้ว`;
    } else if (kind === 'new-password') {
      const { error } = await Cloud.client.auth.updateUser({ password: pw });
      if (error) throw error;
      UI.sheet = null; showToast('ตั้งรหัสผ่านใหม่แล้ว');
    }
  } catch (e) { a.err = cloudError(e); }
  a.busy = false;
  render();
}
Object.assign(ACT, {
  'acct-tab': (d) => { UI.acct = { tab: d.t }; render(); },
  'cloud-sync': async () => { await cloudPull(); if (Cloud.status === 'synced') showToast('ซิงก์แล้ว'); },
  'cloud-signout': async () => { await cloudSignOut(); UI.acct = { tab: 'signin' }; showToast('ออกจากระบบแล้ว'); },
  'cloud-delete-ask': () => { UI.sheet = { type: 'cloud-delete' }; render(); },
  'cloud-delete': async () => {
    try { await cloudDeleteAccount(); UI.sheet = null; UI.ob = null; UI.view = 'onboarding'; showToast('ลบบัญชีแล้ว'); }
    catch (e) { UI.sheet = null; UI.acct = { tab: 'signin', err: cloudError(e) }; render(); }
  },
});
document.addEventListener('submit', (e) => {
  const kind = e.target.dataset?.form;
  if (!kind) return;
  e.preventDefault();
  submitAccount(kind);
});
