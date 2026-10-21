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
  league: null, leagueAt: 0, leagueError: null, // ลีกจริง (ระยะ 2b)
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
  if (/provider is not enabled|unsupported provider/i.test(m)) return 'ยังเข้าสู่ระบบด้วย Google ไม่ได้ (ผู้ดูแลต้องเปิด Google ใน Supabase › Authentication › Providers)';
  if (/anonymous sign-ins are disabled/i.test(m)) return 'ยังเข้าห้องเรียนแบบไม่ใช้อีเมลไม่ได้ (ผู้ดูแลต้องเปิด Anonymous sign-ins ใน Supabase)';
  if (/not class owner/i.test(m)) return 'คุณไม่ใช่ครูของห้องนี้';
  if (/anonymous users cannot create/i.test(m)) return 'บัญชีห้องเรียนแบบไม่ใช้อีเมลสร้างห้องไม่ได้ ใช้บัญชีอีเมลแทน';
  if (/feedback limit/i.test(m)) return 'วันนี้ส่งครบ 10 ข้อความแล้ว พรุ่งนี้ส่งใหม่ได้นะ';
  if (/class limit|assignment limit/i.test(m)) return 'ถึงจำนวนสูงสุดแล้ว';
  if (/could not find the function|function .* does not exist/i.test(m)) return 'ระบบนี้ยังไม่พร้อมใช้งาน (ผู้ดูแลต้องรันไฟล์ SQL ใน Supabase ให้ครบ)';
  return 'เกิดข้อผิดพลาด: ' + m;
}

// ---------- เริ่มต้น ----------
async function cloudInit() {
  if (!Cloud.enabled() || Cloud.status !== 'off') return; // เริ่มครั้งเดียว (อาจถูกเรียกก่อนเวลาเมื่อเปิดหน้าที่ต้องใช้บัญชี)
  Cloud.status = 'loading';
  try {
    if (!window.supabase) await loadScript(SUPABASE_CDN);
    const cfg = window.BEEMATH_CONFIG;
    const urlTok = oauthTokens(); // อ่านก่อนสร้าง client เพราะ supabase-js จะล้าง hash ทิ้งเมื่อสำเร็จ
    Cloud.client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    const init = await Cloud.client.auth.initialize();
    let { data } = await Cloud.client.auth.getSession();
    // supabase-js ทิ้ง session จาก URL เงียบ ๆ เมื่อตรวจกับเซิร์ฟเวอร์ไม่ผ่าน (เช่น เน็ตมือถือสะดุดตอนกลับจาก Google) → ลองอีกครั้งเอง
    if (!data.session && urlTok) {
      const r = await Cloud.client.auth.setSession(urlTok);
      if (r.data?.session) data = r.data;
      else Cloud.oauthErr = r.error?.message || init.error?.message || 'no session';
    }
    Cloud.user = data.session?.user || null;
    Cloud.status = 'ready';
    remoteLoad(); errFlush(); // ค่าตั้งจากเซิร์ฟเวอร์ · error ที่เกิดก่อนระบบพร้อม (js/ops.js)
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
  oauthReturn(); // ทำเสมอ ไม่งั้นหน้า "กำลังเข้าสู่ระบบ…" จะค้างเมื่อโหลดไม่สำเร็จ
  cloudRender();
}

// ---------- ซิงก์ ----------
const isFresh = (st) => !st || ((st.xp || 0) === 0 && !Object.keys(st.done || {}).length);
// รวมความคืบหน้าสองชุด: ใช้ชุดที่ XP มากกว่าเป็นหลัก แล้วรวมด่าน/ตรา/หีบ/เรื่องเล่าที่เคยได้จากอีกชุดด้วย
function mergeStates(a, b) {
  const [base, other] = (a.xp || 0) >= (b.xp || 0) ? [a, b] : [b, a];
  const out = JSON.parse(JSON.stringify(base));
  for (const k of ['done', 'badges', 'chests', 'legend', 'stories', 'monthBadges', 'owned', 'fqClaimed', 'leagueSeen']) out[k] = { ...(other[k] || {}), ...(base[k] || {}) };
  out.records = { ...(other.records || {}), ...(base.records || {}) };
  out.badgeLv = { ...(other.badgeLv || {}), ...(base.badgeLv || {}) };
  for (const k of Object.keys(other.badgeLv || {})) out.badgeLv[k] = Math.max(other.badgeLv[k] || 0, base.badgeLv?.[k] || 0);
  for (const k of Object.keys(other.records || {})) out.records[k] = Math.max(other.records[k] || 0, base.records?.[k] || 0);
  out.onboarded = !!(base.onboarded || other.onboarded);
  if ((other.consent?.at || 0) > (base.consent?.at || 0)) out.consent = other.consent;
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
  if (!netOK()) { Cloud.status = cloudPaused() ? 'paused' : 'offline'; return; }
  Cloud.status = 'syncing'; cloudRender();
  const uid = Cloud.user.id;
  const { data, error } = await Cloud.client.from('progress').select('state, updated_at').eq('user_id', uid).maybeSingle();
  if (error) { Cloud.status = 'error'; Cloud.error = cloudError(error); return cloudRender(); }
  const meta = syncMeta();
  let merged = false;
  Cloud.fresh = !data; // บัญชีใหม่ที่ยังไม่มีความคืบหน้าในคลาวด์ (ใช้เลือกข้อความต้อนรับหลังกลับจาก Google)
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
  else { Cloud.status = 'synced'; Cloud.lastSync = Date.now(); await leagueSync(true); }
  if (typeof friendsSync === 'function') friendsSync(true);
  if (typeof classroomSync === 'function') classroomSync(true);
  if (merged) showToast('รวมความคืบหน้าในเครื่องนี้เข้ากับบัญชีแล้ว');
  outboxFlush(); // ผลของรอบที่ค้างส่งจากครั้งก่อน
  pushSync(); // ผูกการแจ้งเตือนของเครื่องนี้กับบัญชี
  consentCheck();
  cloudRender();
}

async function cloudPush() {
  clearTimeout(Cloud.timer);
  if (!Cloud.client || !Cloud.user) return;
  if (!netOK()) { Cloud.status = cloudPaused() ? 'paused' : 'offline'; return; }
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
  leagueSync();
  if (typeof friendsSync === 'function') friendsSync(); // ข้อความ/คำขอจากเพื่อน (ทุก 60 วินาที)
  if (typeof classroomSync === 'function') classroomSync(); // งานจากครู
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

// ---------- ลีกจริง (ระยะ 2b) ----------
// ส่ง XP ของสัปดาห์ให้เซิร์ฟเวอร์ แล้วรับตารางอันดับของกลุ่ม ระดับลีก และผลของสัปดาห์ที่แล้ว
// ถ้ายังไม่ได้รัน supabase/league.sql ฟังก์ชันจะไม่มี → ใช้ลีกจำลองต่อไปตามเดิม
async function leagueSync(force = false) {
  if (!Cloud.client || !Cloud.user || !netOK()) return;
  if (!force && Date.now() - Cloud.leagueAt < 15000) return;
  Cloud.leagueAt = Date.now();
  const { data, error } = await Cloud.client.rpc('league_sync', { p_week: S.week.key, p_xp: S.week.xp });
  if (error || !data) { Cloud.leagueError = cloudError(error || 'ไม่ได้รับข้อมูลลีก'); if (UI.view === 'board') cloudRender(); return; }
  Cloud.league = data; Cloud.leagueError = null;
  let changed = false;
  if (S.league.tier !== data.tier) { S.league.tier = data.tier; changed = true; }
  const r = data.result;
  if (r && !S.leagueSeen[r.week] && !S.leagueResult) { S.leagueResult = { from: r.from, to: r.to, rank: r.rank, n: r.n, week: r.week, reward: r.reward || 0 }; changed = true; }
  if (changed) { Cloud.applying = true; save(); Cloud.applying = false; }
  if (['board', 'quests', 'learn', 'practice', 'profile'].includes(UI.view)) cloudRender();
}
// ---------- แจ้งเตือน Push (supabase/notify_feed.sql · supabase/functions/push-send) ----------
// เปิด "เตือนให้มาเรียน" + เข้าสู่ระบบ + อนุญาตแจ้งเตือน → สมัครรับ Push แล้วบันทึกเวลาเตือนไว้ที่เซิร์ฟเวอร์
// เซิร์ฟเวอร์ส่งเมื่อถึงเวลาและยังไม่ได้เรียนวันนี้ (ไม่เกินวันละครั้ง · เว้นช่วง 21:00–07:00)
const PUSH_FROM = '07:00', PUSH_UNTIL = '20:45';
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  && location.protocol === 'https:' && !!window.BEEMATH_CONFIG?.vapidPublicKey;
// iPhone/iPad: Push ใช้ได้เฉพาะแอปที่เพิ่มลงหน้าจอโฮมแล้ว
const iosNeedsInstall = () => /iPhone|iPad|iPod/.test(navigator.userAgent) && !navigator.standalone && !matchMedia('(display-mode: standalone)').matches;
const Push = { on: false, busy: false };
const b64url = (s) => { const b = atob((s + '='.repeat((4 - (s.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(b, (c) => c.charCodeAt(0)); };
// เวลาเตือนที่เซิร์ฟเวอร์ใช้ (อยู่ในช่วงที่ส่งได้เสมอ)
const pushTime = () => (S.remind.time < PUSH_FROM ? PUSH_FROM : S.remind.time > PUSH_UNTIL ? PUSH_UNTIL : S.remind.time);
async function pushSync() {
  if (!pushSupported() || !Cloud.client || Push.busy) return;
  Push.busy = true;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return;
    let sub = await reg.pushManager.getSubscription();
    const want = !!(Cloud.user && S.remind.on && Notification.permission === 'granted' && flag('push') && netOK());
    if (!want && sub && (!flag('push') || !netOK())) { Push.on = false; return; } // ปิดชั่วคราว: ไม่ยกเลิกการสมัครของเครื่อง
    if (want) {
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64url(window.BEEMATH_CONFIG.vapidPublicKey) });
      const k = sub.toJSON().keys;
      const { error } = await Cloud.client.rpc('push_save', { p_endpoint: sub.endpoint, p_p256dh: k.p256dh, p_auth: k.auth, p_time: pushTime(), p_on: true });
      Push.on = !error;
    } else if (sub) {
      if (Cloud.user) await Cloud.client.rpc('push_remove', { p_endpoint: sub.endpoint });
      await sub.unsubscribe();
      Push.on = false;
    } else Push.on = false;
  } catch (e) { Push.on = false; } finally { Push.busy = false; }
  if (UI.view === 'settings') cloudRender();
}

// ---------- ฟีดเพื่อน ----------
const Feed = { data: null, at: 0, gave: {} };
async function feedSync(force = false) {
  if (!Cloud.client || !Cloud.user || !netOK() || !flag('feed')) return;
  if (!force && Date.now() - Feed.at < 30000) return;
  Feed.at = Date.now();
  const { data, error } = await Cloud.client.rpc('friends_feed');
  if (!error && Array.isArray(data)) { Feed.data = data; if (UI.view === 'friends') cloudRender(); }
}
async function feedKudos(id) {
  const ev = Feed.data?.find((e) => e.id === id);
  if (!ev || ev.gave) return;
  ev.gave = true; ev.kudos++; render(); // แสดงผลทันที
  const { error } = await Cloud.client.rpc('feed_kudos_give', { p_event: id });
  if (error) { ev.gave = false; ev.kudos--; showToast(cloudError(error)); render(); }
}
// สตรีคถึงก้าวสำคัญ / ครบเป้าหมายสตรีค → แจ้งเพื่อนในฟีด (ไม่รอผล)
function cloudFeedStreak(kind, days) {
  if (Cloud.client && Cloud.user && netOK()) Cloud.client.rpc('feed_post_streak', { p_kind: kind, p_days: days }).then(() => {}, () => {});
}

// ตั้งไอคอนข้างชื่อในลีก (league_react ใน supabase/league_v3.sql) แล้วดึงตารางใหม่ · คืนค่า true เมื่อสำเร็จ
async function cloudReact(reaction) {
  if (!Cloud.client || !Cloud.user || !netOK()) return false;
  const { error } = await Cloud.client.rpc('league_react', { p_reaction: reaction });
  if (error) return false;
  await leagueSync(true);
  return true;
}
// เปิดหน้าอันดับ: ดึงข้อมูลใหม่ถ้าเก่ากว่า 30 วินาที
function leagueRefresh() {
  if (Cloud.user && Date.now() - Cloud.leagueAt > 30000) setTimeout(() => leagueSync(true), 0);
}

// ---------- XP ลีกที่เซิร์ฟเวอร์ตรวจ (supabase/sessions.sql · supabase/functions/session-submit) ----------
// เริ่มรอบ → แจ้งเซิร์ฟเวอร์ (ไม่รอผล) · จบรอบ → ใส่คิว outbox แล้วส่งคำตอบไปตรวจ เซิร์ฟเวอร์คิด XP แล้วบวกเข้าลีกเอง
// คิวเก็บใน localStorage แยกตามบัญชี ส่งตามลำดับ ส่งซ้ำได้เมื่อเน็ตหลุด (เซิร์ฟเวอร์ไม่นับซ้ำเพราะใช้ id ของรอบ)
const OUTBOX_KEY = (uid) => 'beemath-outbox:' + uid;
const Outbox = { busy: false, timer: null, wait: 0, began: {} };
const outboxLoad = (uid) => { try { return JSON.parse(localStorage.getItem(OUTBOX_KEY(uid))) || []; } catch (e) { return []; } };
const outboxSave = (uid, items) => { try { localStorage.setItem(OUTBOX_KEY(uid), JSON.stringify(items.slice(-200))); } catch (e) { /* ignore */ } };
const outboxCount = () => (Cloud.user ? outboxLoad(Cloud.user.id).length : 0);
function outboxAdd(item) {
  if (!Cloud.user) return;
  const uid = Cloud.user.id;
  outboxSave(uid, [...outboxLoad(uid), { ...item, at: Date.now() }]);
  outboxFlush();
}

// เริ่มรอบ: บันทึกเวลาเริ่มและ seed ไว้ที่เซิร์ฟเวอร์ ถ้าไม่สำเร็จ (ออฟไลน์/ยังไม่ล็อกอิน) รอบนี้ได้ XP เฉพาะในเครื่อง
function cloudSessionBegin(id, kind, seed) {
  if (!Cloud.client || !Cloud.user || !netOK()) { Outbox.began[id] = false; return; }
  Outbox.began[id] = null; // กำลังส่ง
  Cloud.client.rpc('session_begin', { p_id: id, p_kind: kind, p_seed: seed })
    .then(({ error }) => { Outbox.began[id] = !error; })
    .catch(() => { Outbox.began[id] = false; });
}
function cloudSessionSubmit(s) {
  if (Outbox.began[s.id] === false || Outbox.began[s.id] === undefined) return; // เซิร์ฟเวอร์ไม่รู้จักรอบนี้
  delete Outbox.began[s.id];
  outboxAdd({ t: 'session', ...s });
}
const cloudQuestClaim = (quest, day) => outboxAdd({ t: 'claim', quest, day });
const cloudBoost = (source) => outboxAdd({ t: 'boost', source });

// ส่งของในคิวทีละชิ้นตามลำดับ · ผิดพลาดชั่วคราว (เน็ต/เซิร์ฟเวอร์) → หยุดแล้วลองใหม่ภายหลัง · ถูกปฏิเสธถาวร → ทิ้งชิ้นนั้น
async function outboxFlush() {
  if (Outbox.busy || !Cloud.client || !Cloud.user || !netOK()) return;
  Outbox.busy = true; clearTimeout(Outbox.timer);
  const uid = Cloud.user.id;
  let sent = 0, retry = false;
  try {
    for (;;) {
      const [item] = outboxLoad(uid);
      if (!item || Cloud.user?.id !== uid) break;
      const res = await outboxSend(item);
      if (res === 'retry') { retry = true; break; }
      outboxSave(uid, outboxLoad(uid).slice(1));
      if (res === 'ok') sent++;
    }
  } finally { Outbox.busy = false; }
  if (retry) {
    Outbox.wait = Math.min(300000, Outbox.wait ? Outbox.wait * 2 : 5000);
    Outbox.timer = setTimeout(outboxFlush, Outbox.wait);
  } else Outbox.wait = 0;
  if (sent) leagueSync(true);
}
// คืนค่า 'ok' · 'drop' (ปฏิเสธถาวร) · 'retry'
async function outboxSend(item) {
  try {
    if (item.t === 'boost') {
      const { error } = await Cloud.client.rpc('boost_begin', { p_source: item.source });
      if (!error) return 'ok';
      return /boost limit|does not exist/i.test(error.message) ? 'drop' : 'retry';
    }
    const body = item.t === 'claim' ? { type: 'claim', quest: item.quest, day: item.day }
      : { type: 'session', id: item.id, kind: item.kind, meta: item.meta, completed: item.completed, answers: item.answers };
    const { error } = await Cloud.client.functions.invoke('session-submit', { body });
    if (!error) return 'ok';
    const status = error.context?.status;
    // 4xx ที่ไม่ใช่ปัญหาชั่วคราว = คำตอบไม่ผ่านการตรวจ/รอบหมดอายุ → ไม่ส่งซ้ำ · 404 = ยังไม่ได้ deploy ฟังก์ชัน → รอ
    if (status >= 400 && status < 500 && ![401, 404, 408, 429].includes(status)) return 'drop';
    return Date.now() - item.at > 3 * 864e5 ? 'drop' : 'retry';
  } catch (e) { return 'retry'; }
}
window.addEventListener('online', () => outboxFlush());

// โลโก้ Google แบบสี่สี (ตามแนวทางปุ่ม "Sign in with Google")
const GOOGLE_G = '<svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';

// ---------- นโยบายความเป็นส่วนตัว (privacy.html) ----------
// เปลี่ยน v เมื่อแก้นโยบาย → ผู้มีบัญชีจะถูกขอให้ยอมรับฉบับใหม่
const PRIVACY = { v: '2026-10-18', url: 'privacy.html' };
const privacyLink = (t = 'นโยบายความเป็นส่วนตัว') => `<a href="${PRIVACY.url}" target="_blank" rel="noopener">${t}</a>`;
const consentOk = () => S.consent?.v === PRIVACY.v;
function giveConsent(via) { S.consent = { v: PRIVACY.v, at: Date.now(), via }; save(); }
function consentBox(text) {
  return `<label class="consent"><input type="checkbox" id="acct-consent" required><span>${text}</span></label>`;
}
// ชื่อที่แสดงต้องตั้งเอง: ลีก เพื่อน และครูจะได้แยกออกว่าใครเป็นใคร
const DEFAULT_NAME = 'ผู้เรียน';
const isDefaultName = (n) => !n || !n.trim() || n.trim() === DEFAULT_NAME;
const nameError = (n) => isDefaultName(n) ? 'ตั้งชื่อที่แสดงก่อนนะ (ใช้ชื่อ "ผู้เรียน" ไม่ได้)' : n.trim().length < 2 ? 'ชื่อที่แสดงต้องมีอย่างน้อย 2 ตัวอักษร' : '';
// หลังซิงก์: บัญชีที่ยังไม่ยอมรับนโยบายฉบับปัจจุบัน หรือยังใช้ชื่อเริ่มต้น → ถาม (ไม่ขัดจังหวะระหว่างทำโจทย์)
function consentCheck() {
  if (!Cloud.user || UI.sheet || ['lesson', 'timed', 'story', 'onboarding'].includes(UI.view)) return;
  if (!consentOk()) { UI.sheet = { type: 'consent' }; render(); }
  else if (isDefaultName(S.name)) { UI.sheet = { type: 'set-name' }; render(); }
}

// ---------- บัญชี ----------
const siteUrl = () => location.origin + location.pathname;
async function cloudSignUp(email, password, name) {
  const { data, error } = await Cloud.client.auth.signUp({ email, password, options: { data: { display_name: name }, emailRedirectTo: siteUrl() } });
  if (error) throw error;
  if (data.session) { Cloud.user = data.user; S.name = name || S.name; await cloudPull(); return { confirmed: true }; }
  return { confirmed: false };
}
// เข้าสู่ระบบด้วย Google: พาไปหน้า Google แล้วกลับมาที่แอป (supabase-js อ่าน session จาก URL ให้เอง)
async function cloudGoogle() {
  const a = UI.acct || (UI.acct = { tab: 'signin' });
  if (a.tab === 'signup') {
    if (!document.getElementById('acct-consent')?.checked) { a.err = 'ติ๊กยอมรับนโยบายความเป็นส่วนตัวก่อนนะ'; return render(); }
    const name = document.getElementById('acct-name')?.value.trim();
    if (nameError(name)) { a.err = nameError(name); return render(); }
    S.name = name.slice(0, 20);
    giveConsent('google');
  }
  // จำหน้าที่จากมา (หน้าก่อนหน้าบัญชี) ไว้กลับไปหลังเข้าสู่ระบบ · sessionStorage อยู่รอดข้ามการไปหน้า Google ในแท็บเดียวกัน
  try { sessionStorage.setItem(OAUTH_KEY, JSON.stringify({ back: UI.back, ob: UI.view === 'account' && UI.back === 'onboarding' ? UI.ob : null, at: Date.now() })); } catch (e) { /* ignore */ }
  a.err = null; a.busy = true; render();
  const { error } = await Cloud.client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: siteUrl(), queryParams: { prompt: 'select_account' } } });
  if (error) { a.busy = false; a.err = cloudError(error); render(); }
}
// กลับจากหน้า Google: ตั๋วที่ cloudGoogle() เก็บไว้ (หมดอายุใน 15 นาที กันเปิดแท็บเดิมทีหลังแล้วเจอหน้ารอ)
const OAUTH_KEY = 'bm-oauth';
function oauthTicket() {
  try { const t = JSON.parse(sessionStorage.getItem(OAUTH_KEY)); return t && Date.now() - (t.at || 0) < 15 * 60000 ? t : null; } catch (e) { return null; }
}
// เปิดแอปครั้งแรกหลังกลับจาก Google (js/main.js เรียกก่อนวาดหน้าแรก): กลับไปหน้าเดิม แล้วแสดง "กำลังเข้าสู่ระบบ…" จนกว่าระบบบัญชีจะโหลดเสร็จ
function oauthResume() {
  const t = oauthTicket();
  if (!t || !Cloud.enabled()) return false;
  const back = ['learn', 'board', 'quests', 'profile', 'friends', 'classes', 'teacher', 'onboarding'].includes(t.back) ? t.back : 'learn';
  UI.back = back; UI.view = back;
  if (back === 'onboarding' && t.ob) UI.ob = t.ob;
  UI.sheet = { type: 'oauth-wait' };
  return true;
}
// token ที่ Supabase ส่งกลับมาใน URL หลังเลือกบัญชี Google (แบบ implicit: อยู่หลัง #)
function oauthTokens() {
  const p = new URLSearchParams(location.hash.slice(1));
  return p.get('access_token') && p.get('refresh_token') ? { access_token: p.get('access_token'), refresh_token: p.get('refresh_token') } : null;
}
// แจ้งผล (สำเร็จ / ยกเลิก / ผิดพลาด) แล้วล้างพารามิเตอร์ออกจาก URL
function oauthReturn() {
  const t = oauthTicket();
  try { sessionStorage.removeItem(OAUTH_KEY); } catch (e) { /* ignore */ }
  const p = new URLSearchParams(location.search + '&' + location.hash.slice(1));
  const code = p.get('error'), err = p.get('error_description') || code;
  if (err) {
    history.replaceState(null, '', siteUrl());
    UI.sheet = null;
    UI.view = 'account'; UI.acct = { tab: 'signin', err: code === 'access_denied' ? 'ยกเลิกการเข้าสู่ระบบด้วย Google แล้ว' : cloudError(err) };
  } else if (t && Cloud.user) {
    if (/access_token=/.test(location.hash)) history.replaceState(null, '', siteUrl()); // กรณีลองซ้ำเอง supabase-js ไม่ได้ล้างให้
    // บัญชีมีความคืบหน้าอยู่แล้ว = ผ่านหน้าเริ่มต้นไปแล้ว ไม่ต้องตอบคำถามเริ่มต้นซ้ำ
    if (S.onboarded && UI.view === 'onboarding') { UI.view = 'learn'; UI.ob = null; }
    UI.sheet = { type: 'oauth-ok' };
  } else if (t) {
    // กลับมาแล้วแต่ไม่มี session: บอกสาเหตุจริงที่รู้ และส่งรายงานให้ผู้ดูแล (ไม่ส่ง token)
    const gotTokens = /access_token=/.test(location.hash);
    if (gotTokens) history.replaceState(null, '', siteUrl()); // ไม่ทิ้ง token ค้างไว้ในแถบที่อยู่
    const nav = performance.getEntriesByType?.('navigation')[0]?.type || '?';
    const ref = (() => { try { return new URL(document.referrer).hostname; } catch (e) { return '-'; } })();
    reportError(`oauth: no session (tokens=${gotTokens}, nav=${nav}, ref=${ref}, inapp=${inAppBrowser() || '-'}): ${Cloud.oauthErr || Cloud.error || '-'}`, 'cloud.js oauthReturn');
    UI.sheet = null;
    UI.view = 'account';
    UI.acct = { tab: 'signin', err: Cloud.status === 'error' ? Cloud.error
      : inAppBrowser() ? 'เข้าสู่ระบบด้วย Google ไม่สำเร็จ เพราะเปิดอยู่ในแอป ' + inAppBrowser() + ' ลองเปิดหน้านี้ใน Safari หรือ Chrome แล้วเข้าสู่ระบบอีกครั้ง'
      : gotTokens ? 'เลือกบัญชี Google แล้ว แต่ยืนยันกับเซิร์ฟเวอร์ไม่สำเร็จ ' + (Cloud.oauthErr ? `(${cloudError(Cloud.oauthErr).replace(/^เกิดข้อผิดพลาด: /, '')}) ` : '') + 'ลองกดเข้าสู่ระบบด้วย Google อีกครั้ง'
      : 'ยังไม่ได้เข้าสู่ระบบ หน้า Google ไม่ได้ส่งบัญชีกลับมา ลองกดเข้าสู่ระบบด้วย Google อีกครั้ง' };
  }
}
// เบราว์เซอร์ที่ฝังอยู่ในแอปแชต/โซเชียล: Google มักบล็อกการเข้าสู่ระบบ (คืนชื่อแอป หรือ '' ถ้าไม่ใช่)
function inAppBrowser() {
  const ua = navigator.userAgent || '';
  return / Line\//i.test(ua) ? 'LINE' : /FBAN|FBAV|FB_IAB/.test(ua) ? 'Facebook' : /Instagram/.test(ua) ? 'Instagram' : /MicroMessenger/.test(ua) ? 'WeChat' : /musical_ly|TikTok/i.test(ua) ? 'TikTok' : '';
}
// ชื่อที่ใช้บอกว่าเข้าสู่ระบบเป็นใคร: ชื่อที่แสดงในแอป (ไม่ใช้ชื่อจริงจาก Google) หรืออีเมลถ้ายังไม่ได้ตั้งชื่อ
const acctLabel = () => isDefaultName(S.name) ? (Cloud.user?.email || 'บัญชีของคุณ') : S.name;
async function cloudSignIn(email, password) {
  const { data, error } = await Cloud.client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  Cloud.user = data.user;
  await cloudPull();
}
// ออกจากระบบ: ส่งข้อมูลล่าสุดขึ้นก่อน แล้วล้างข้อมูลในเครื่อง (กันข้อมูลรั่วบนเครื่องที่ใช้ร่วมกัน)
async function cloudSignOut() {
  if (syncMeta().dirty) await cloudPush();
  await outboxFlush(); // ส่งไม่หมดก็ไม่หาย: คิวผูกกับบัญชี ส่งต่อเมื่อเข้าสู่ระบบครั้งหน้า
  // เลิกส่งแจ้งเตือนมาที่เครื่องนี้ (เครื่องที่ใช้ร่วมกันในโรงเรียน)
  try { const sub = await (await navigator.serviceWorker?.getRegistration())?.pushManager.getSubscription(); if (sub) { await Cloud.client.rpc('push_remove', { p_endpoint: sub.endpoint }); await sub.unsubscribe(); } } catch (e) { /* ignore */ }
  Push.on = false; Feed.data = null;
  await Cloud.client.auth.signOut();
  Cloud.user = null; Cloud.status = 'ready'; Cloud.lastSync = null; Cloud.league = null;
  if (typeof Friends !== 'undefined') { Friends.data = null; Friends.at = 0; Friends.sent = {}; }
  if (typeof Classroom !== 'undefined') Object.assign(Classroom, { mine: null, at: 0, teach: null, dash: {}, sel: null, league: {}, leagueErr: null, teachTried: false });
  setSyncMeta({});
  const fresh = defaultState(); fresh.onboarded = true;
  applyState(fresh);
}
async function cloudDeleteAccount() {
  const { error } = await Cloud.client.rpc('delete_my_account');
  if (error) throw error;
  try { localStorage.removeItem(OUTBOX_KEY(Cloud.user.id)); } catch (e) { /* ignore */ }
  await Cloud.client.auth.signOut();
  Cloud.user = null; Cloud.status = 'ready'; Cloud.league = null;
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
  return { syncing: 'กำลังบันทึก…', offline: 'ไม่มีอินเทอร์เน็ต จะบันทึกลงบัญชีเมื่อต่อเน็ตได้', paused: 'บัญชีออนไลน์ปิดปรับปรุงชั่วคราว ความคืบหน้าเก็บไว้ในเครื่องก่อน', error: Cloud.error || 'บันทึกลงบัญชีไม่สำเร็จ', loading: 'กำลังเชื่อมต่อ…' }[Cloud.status]
    || (Cloud.lastSync ? `บันทึกลงบัญชีแล้ว ${timeAgo(Cloud.lastSync)}` : 'เชื่อมต่อแล้ว');
}
function viewAccount() {
  const a = UI.acct || (UI.acct = { tab: 'signin' });
  let body;
  if (!Cloud.enabled()) {
    body = `<div class="card acct-card"><b>ยังไม่ได้เปิดระบบบัญชี</b>
      <p class="muted">ผู้ดูแลต้องสร้างโปรเจกต์ Supabase แล้วใส่ค่าใน <code>js/config.js</code> (ดูขั้นตอนใน README) ระหว่างนี้ใช้ "สำรองความคืบหน้า" ในหน้าตั้งค่าเพื่อย้ายเครื่องได้</p></div>`;
  } else if (Cloud.user) {
    body = `<div class="card acct-card">
      <div class="acct-who">${hex(bee(56), 'acct-av', `background:${S.avatar}`)}<span class="setting-main"><b>${esc(S.name)}</b><small>${Cloud.user.is_anonymous ? 'บัญชีห้องเรียน ใช้ได้บนเครื่องนี้เครื่องเดียว' : esc(Cloud.user.email || '') + (Cloud.user.app_metadata?.provider === 'google' ? ' · บัญชี Google' : '')}</small></span></div>
      <p class="sync-line ${Cloud.status}">${icon(Cloud.status === 'error' ? 'x' : ['offline', 'paused'].includes(Cloud.status) ? 'clock' : 'check', 16)} ${esc(syncLabel())}</p>
      <button class="btn primary" data-act="cloud-sync" ${Cloud.status === 'syncing' ? 'disabled' : ''}>${icon('refresh', 18)} บันทึกตอนนี้</button>
      <button class="btn" data-act="${Cloud.user.is_anonymous ? 'cloud-signout-anon' : 'cloud-signout'}">ออกจากระบบ</button>
    </div>
    <p class="muted small">ออกจากระบบแล้วความคืบหน้าในเครื่องนี้จะถูกล้าง (เก็บไว้ในบัญชีแล้ว) เพื่อให้คนอื่นใช้เครื่องนี้ต่อได้อย่างปลอดภัย</p>
    <p class="muted small">${consentOk() ? `ยอมรับ${privacyLink()}แล้ว` : `ยังไม่ได้ยอมรับ${privacyLink()}ฉบับปัจจุบัน`}</p>
    <button class="btn danger-text" data-act="cloud-delete-ask">ลบบัญชีและข้อมูลทั้งหมด</button>`;
  } else {
    const tabs = [['signin', 'เข้าสู่ระบบ'], ['signup', 'สมัคร'], ['class', 'รหัสห้อง']];
    const form = a.tab === 'class'
      ? `<form class="acct-form" data-form="anon-join">
          <p class="muted">สำหรับนักเรียนที่ไม่มีอีเมล: กรอกชื่อและรหัสห้องจากครู แล้วครูจะเห็นความคืบหน้าของคุณ บัญชีนี้ใช้ได้บนเครื่องนี้เครื่องเดียว ถ้าจะย้ายเครื่องให้ใช้ไฟล์สำรองในหน้าตั้งค่า</p>
          <label class="fld">ชื่อที่แสดง<input id="acct-name" maxlength="20" minlength="2" value="${isDefaultName(S.name) ? '' : esc(S.name)}" placeholder="ชื่อที่ครูจะเห็น" required></label>
          <label class="fld">รหัสห้องเรียน<input id="class-code" placeholder="HIVE-XXXX" maxlength="9" autocapitalize="characters" autocomplete="off" required></label>
          ${consentBox(`ฉันอ่าน${privacyLink()}แล้ว และครูหรือผู้ปกครองแจ้งเรื่องการใช้ข้อมูลให้ทราบแล้ว`)}
          <button class="btn primary" type="submit" ${a.busy ? 'disabled' : ''}>${a.busy ? 'กำลังเข้าห้อง…' : 'เข้าห้องเรียน'}</button></form>`
      : a.tab === 'forgot'
      ? `<form class="acct-form" data-form="forgot">
          <p class="muted">กรอกอีเมลที่ใช้สมัคร เราจะส่งลิงก์ตั้งรหัสผ่านใหม่ไปให้</p>
          <label class="fld">อีเมล<input type="email" id="acct-email" autocomplete="email" required></label>
          <button class="btn primary" type="submit" ${a.busy ? 'disabled' : ''}>ส่งลิงก์ตั้งรหัสผ่านใหม่</button>
          <button class="btn link" type="button" data-act="acct-tab" data-t="signin">กลับไปเข้าสู่ระบบ</button></form>`
      : `<form class="acct-form" data-form="${a.tab}">
          ${a.tab === 'signup' ? `<label class="fld">ชื่อที่แสดง<input id="acct-name" maxlength="20" minlength="2" value="${isDefaultName(S.name) ? '' : esc(S.name)}" placeholder="ชื่อที่เพื่อนและครูจะเห็น" autocomplete="nickname" required></label>` : ''}
          <label class="fld">อีเมล<input type="email" id="acct-email" autocomplete="email" required></label>
          <label class="fld">รหัสผ่าน<input type="password" id="acct-pw" minlength="6" autocomplete="${a.tab === 'signup' ? 'new-password' : 'current-password'}" required></label>
          ${a.tab === 'signup' ? consentBox(`ฉันอ่าน${privacyLink()}แล้ว และถ้าอายุต่ำกว่า 20 ปี ผู้ปกครองรับทราบและยินยอมแล้ว`) : ''}
          <button class="btn primary" type="submit" ${a.busy ? 'disabled' : ''}>${a.busy ? 'กำลังดำเนินการ…' : a.tab === 'signup' ? 'สมัครบัญชี' : 'เข้าสู่ระบบ'}</button>
          ${a.tab === 'signin' ? '<button class="btn link" type="button" data-act="acct-tab" data-t="forgot">ลืมรหัสผ่าน?</button>' : '<p class="muted small">ความคืบหน้าที่ทำไว้ในเครื่องนี้จะถูกย้ายเข้าบัญชีใหม่</p>'}
        </form>
        <div class="or-line"><span>หรือ</span></div>
        <button class="btn google-btn" type="button" data-act="acct-google" ${a.busy ? 'disabled' : ''}>${GOOGLE_G}${a.tab === 'signup' ? 'สมัครด้วย Google' : 'เข้าสู่ระบบด้วย Google'}</button>
        ${inAppBrowser() ? `<p class="acct-msg warn">เปิดอยู่ในแอป ${inAppBrowser()} Google อาจไม่ยอมให้เข้าสู่ระบบในหน้านี้ ${inAppBrowser() === 'LINE' ? `<a href="${siteUrl()}?openExternalBrowser=1" target="_blank" rel="noopener">เปิดใน Safari/Chrome</a>` : 'กดเมนู ⋯ แล้วเลือกเปิดในเบราว์เซอร์'}</p>` : ''}
        ${a.tab === 'signup' ? '<p class="muted small">สมัครด้วย Google ก็ต้องติ๊กยอมรับนโยบายด้านบนก่อน แอปจะใช้ชื่อที่คุณตั้งเอง ไม่ดึงชื่อจริงหรือรูปจาก Google</p>' : ''}`;
    body = `<div class="card acct-card">
      <div class="acct-intro">${bee(64, 'happy')}<p>สมัครแล้วเรียนต่อได้ทุกเครื่อง ความคืบหน้าไม่หายแม้ล้างเบราว์เซอร์</p></div>
      <p class="muted small">ไม่สมัครก็เรียนได้ครบทุกบท ความคืบหน้าจะอยู่ในเครื่องนี้ ${privacyLink('อ่านว่าเราเก็บข้อมูลอะไรบ้าง')}</p>
      ${a.tab === 'forgot' ? '' : `<div class="seg wide" role="tablist">${tabs.map(([t, l]) => `<button role="tab" aria-selected="${a.tab === t}" class="${a.tab === t ? 'on' : ''}" data-act="acct-tab" data-t="${t}">${l}</button>`).join('')}</div>`}
      ${a.err ? `<p class="acct-msg err" role="alert">${esc(a.err)}</p>` : ''}${a.msg ? `<p class="acct-msg ok" role="status">${esc(a.msg)}</p>` : ''}
      ${form}
    </div>`;
  }
  return shell(`<div class="sub-body">${body}</div>`, { sub: { title: 'บัญชี' } });
}
Object.assign(SHEETS, {
  'oauth-wait'() {
    return `<div class="sheet-card center" aria-busy="true">${bee(72, 'happy')}<h2>กำลังเข้าสู่ระบบ…</h2><p>รอสักครู่ กำลังเชื่อมบัญชี Google</p></div>`;
  },
  'oauth-ok'() {
    const email = Cloud.user?.email || '', label = acctLabel();
    return `<div class="sheet-card center">${hex(bee(56, 'happy'), 'acct-av', `background:${S.avatar}`)}
      <h2>เข้าสู่ระบบแล้ว</h2>
      <p class="oauth-who"><b>${esc(label)}</b>${label !== email && email ? `<small>${esc(email)}</small>` : ''}</p>
      <p>${Cloud.fresh ? 'ความคืบหน้าจากนี้จะบันทึกลงบัญชีนี้ เรียนต่อได้ทุกเครื่อง' : 'โหลดความคืบหน้าจากบัญชีแล้ว เรียนต่อจากเดิมได้เลย'}</p>
      <button class="btn primary" data-act="oauth-ok">${UI.view === 'onboarding' ? 'ไปต่อ' : 'เรียนต่อ'}</button></div>`;
  },
  'set-name'() {
    return `<div class="sheet-card"><h2>ตั้งชื่อที่แสดง</h2>
      <p>ชื่อนี้จะแสดงในลีก รายชื่อเพื่อน และห้องเรียน เพื่อนและครูจะได้รู้ว่าเป็นคุณ</p>
      <form class="acct-form" data-form="set-name">
        <label class="fld">ชื่อที่แสดง<input id="set-name" maxlength="20" minlength="2" placeholder="เช่น ชื่อเล่นของคุณ" autocomplete="nickname" required></label>
        ${UI.nameErr ? `<p class="acct-msg err" role="alert">${esc(UI.nameErr)}</p>` : ''}
        <button class="btn primary" type="submit">บันทึกชื่อ</button></form></div>`;
  },
  consent() {
    return `<div class="sheet-card"><h2>นโยบายความเป็นส่วนตัว</h2>
      <p>บัญชีนี้เก็บชื่อที่แสดงและความคืบหน้าการเรียนไว้ เพื่อให้เรียนต่อได้ทุกเครื่อง และใช้ลีก เพื่อน กับห้องเรียนได้ ไม่มีโฆษณาและไม่ขายข้อมูล</p>
      <p>ถ้าอายุต่ำกว่า 20 ปี ชวนผู้ปกครองมา${privacyLink('อ่านนโยบายฉบับเต็ม')}ด้วยกันนะ</p>
      <button class="btn primary" data-act="consent-yes">ยอมรับและใช้บัญชีต่อ</button>
      <button class="btn ghost" data-act="consent-no">ไม่ยอมรับ (ออกจากระบบ)</button></div>`;
  },
  'cloud-signout-anon'() {
    return `<div class="sheet-card center"><h2>ออกจากบัญชีห้องเรียน?</h2>
      <p>บัญชีนี้ไม่มีอีเมลและรหัสผ่าน ถ้าออกจากระบบแล้วจะ<b>กลับเข้าบัญชีเดิมไม่ได้อีก</b> แนะนำให้ดาวน์โหลดไฟล์สำรองในหน้าตั้งค่าก่อน</p>
      <button class="btn danger" data-act="cloud-signout">ออกจากระบบ</button><button class="btn ghost" data-act="close">ยกเลิก</button></div>`;
  },
  'cloud-delete'() {
    return `<div class="sheet-card center"><h2>ลบบัญชีถาวร?</h2>
      <p>ความคืบหน้าทั้งหมดทั้งในบัญชีและในเครื่องนี้จะถูกลบ และกู้คืนไม่ได้</p>
      <button class="btn danger" data-act="cloud-delete">ลบบัญชี</button><button class="btn ghost" data-act="close">ยกเลิก</button></div>`;
  },
  'new-password'() {
    return `<div class="sheet-card"><h2>ตั้งรหัสผ่านใหม่</h2>
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
  a.err = null; a.msg = null;
  if (kind === 'signup' && nameError(name)) { a.err = nameError(name); return render(); }
  a.busy = true; render();
  try {
    if (kind === 'signin') { await cloudSignIn(email, pw); showToast('เข้าสู่ระบบแล้ว'); }
    else if (kind === 'signup') {
      S.name = name.slice(0, 20);
      giveConsent('signup');
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
  'acct-google': () => cloudGoogle(),
  'oauth-ok': () => { UI.sheet = null; render(); consentCheck(); },
  'consent-yes': () => { giveConsent('prompt'); UI.sheet = null; render(); showToast('ขอบคุณ! ยอมรับนโยบายแล้ว'); consentCheck(); },
  'consent-no': () => { UI.sheet = null; (Cloud.user?.is_anonymous ? ACT['cloud-signout-anon'] : ACT['cloud-signout'])(); },
  'acct-tab': (d) => { UI.acct = { tab: d.t }; render(); },
  'league-join': (d) => { UI.acct = { tab: d.t || 'signup' }; ACT.go({ v: 'account' }); },
  'league-retry': async () => { Cloud.leagueError = null; render(); await leagueSync(true); render(); },
  'cloud-sync': async () => { await cloudPull(); if (Cloud.status === 'synced') showToast('บันทึกแล้ว'); },
  'cloud-signout': async () => { UI.sheet = null; await cloudSignOut(); UI.acct = { tab: 'signin' }; showToast('ออกจากระบบแล้ว'); },
  'cloud-signout-anon': () => { UI.sheet = { type: 'cloud-signout-anon' }; render(); },
  'cloud-delete-ask': () => { UI.sheet = { type: 'cloud-delete' }; render(); },
  'cloud-delete': async () => {
    try { await cloudDeleteAccount(); UI.sheet = null; UI.ob = null; UI.view = 'onboarding'; showToast('ลบบัญชีแล้ว'); }
    catch (e) { UI.sheet = null; UI.acct = { tab: 'signin', err: cloudError(e) }; render(); }
  },
});
// ฟอร์มที่ไม่ใช่ของหน้าบัญชีลงทะเบียนตัวจัดการไว้ที่นี่ (เช่น เพิ่มเพื่อนใน js/friends.js)
const FORM_HANDLERS = {};
FORM_HANDLERS['set-name'] = async () => {
  const name = document.getElementById('set-name')?.value.trim() || '';
  UI.nameErr = nameError(name);
  if (UI.nameErr) return render();
  S.name = name.slice(0, 20); save();
  UI.sheet = null; UI.nameErr = null; render();
  showToast('บันทึกชื่อแล้ว');
  await cloudPush();
};
document.addEventListener('submit', (e) => {
  const kind = e.target.dataset?.form;
  if (!kind) return;
  e.preventDefault();
  (FORM_HANDLERS[kind] || submitAccount)(kind);
});
