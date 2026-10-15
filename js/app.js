/* BeeMath — สถานะผู้เรียน หน้าจอหลัก และการโต้ตอบ (ธีมรวงผึ้ง)
   หน้าจอเสริม (เริ่มต้น สตรีค ร้านค้า ศูนย์ฝึกฝน เกม เรื่องเล่า ความสำเร็จ) อยู่ใน js/extras.js */

const KEY = 'beemath-v1';
const MAX_HEARTS = 5;
const HEART_MS = 30 * 60 * 1000; // ได้หัวใจคืน 1 ดวงทุก 30 นาที
const MAX_SHIELDS = 2;
const BOOST_MS = 15 * 60 * 1000;
// สีพื้นในกรอบอวตารหกเหลี่ยม
const AVATAR_COLORS = ['#FFF0C2', '#DDF3D3', '#E3EDFF', '#FFE3D1', '#F1E6FF', '#FFE5E5', '#D6F2EC', '#EFE4C8'];
// เป้าหมายรายวัน: [XP, ชื่อ, เวลาโดยประมาณ]
const GOALS = [[10, 'สบาย ๆ', 'ราว 5 นาที'], [20, 'ปกติ', 'ราว 10 นาที'], [30, 'จริงจัง', 'ราว 15 นาที'], [50, 'สุดยอด', 'ราว 20 นาที']];
// ก้าวสำคัญของสตรีค: วัน → น้ำหวานที่ได้
const MILESTONES = { 7: 20, 30: 50, 100: 100, 365: 365 };
// น้ำหวานที่ได้เมื่อจบแต่ละแบบ
const NECTAR = { lesson: 5, test: 20, practice: 3, legend: 20, jump: 10, perfect: 5, quest: 10 };

// ---------- dates ----------
const pad = (n) => String(n).padStart(2, '0');
const dkey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => dkey(new Date());
const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return dkey(d); };
const weekKey = () => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return dkey(d); };
const monthKey = () => today().slice(0, 7);
const dayNum = (k) => { const [y, m, d] = k.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 864e5); };
const keyOfDay = (n) => { const d = new Date(n * 864e5); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
const thaiDate = (k) => new Date(k + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (n) => n.toLocaleString('en-US');

// ---------- state ----------
function defaultState() {
  return {
    name: 'ผู้เรียน', avatar: AVATAR_COLORS[0], xp: 0, joined: today(), onboarded: false,
    goal: 20, remind: { on: false, time: '19:00' }, remindedDay: null,
    week: { key: weekKey(), xp: 0 }, league: { tier: 0 }, leagueResult: null, leagueSeen: {},
    hearts: MAX_HEARTS, heartsTs: Date.now(),
    streak: 0, lastDay: null, days: {}, shields: 0, streakLost: null,
    nectar: 100, boostUntil: 0, outfit: null, owned: {},
    done: {}, legend: {}, stories: {}, chests: {}, fqClaimed: {},
    stats: { lessons: 0, solved: 0, bar: 0, perfect: 0, tests: 0, correct: 0, answered: 0, timedBest: 0 },
    records: { bestStreak: 0, bestDayXP: 0, bestCombo: 0 },
    today: { day: today(), xp: 0 },
    skills: {}, mistakes: [],
    quests: { day: today(), p: {}, claimed: {} },
    month: { key: monthKey(), points: 0 }, monthBadges: {},
    badges: {},
    settings: { sound: true, volume: 0.7, reduceMotion: false, textSize: 'm', adaptive: true },
  };
}
function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw) {
      const d = defaultState();
      const s = { ...d, ...raw };
      for (const k of ['stats', 'records', 'remind', 'league', 'today', 'month', 'settings', 'leagueSeen', 'fqClaimed']) s[k] = { ...d[k], ...raw[k] };
      if (!AVATAR_COLORS.includes(s.avatar)) s.avatar = AVATAR_COLORS[0]; // ข้อมูลเก่าเก็บอวตารเป็นอีโมจิ
      if (!raw.joined) s.joined = null; // ไม่รู้วันเริ่มเรียนจริงของข้อมูลเก่า
      if (raw.onboarded === undefined) s.onboarded = true; // ผู้เล่นเดิมไม่ต้องผ่านหน้าเริ่มต้น
      if (!raw.days) { s.days = {}; if (raw.lastDay) s.days[raw.lastDay] = 'learn'; }
      if (!raw.records) s.records.bestStreak = s.streak;
      return s;
    }
  } catch (e) { /* ไม่มีที่เก็บข้อมูล — เริ่มใหม่ */ }
  return defaultState();
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ }
  if (typeof cloudQueue === 'function') cloudQueue(); // ล็อกอินอยู่ → ส่งขึ้นคลาวด์ (js/cloud.js)
}

let S = load();
const UI = { view: 'learn', back: 'learn', sheet: null, L: null, cards: null, result: null, toast: null };

// อัปเดตสิ่งที่ขึ้นกับเวลา: หัวใจ ภารกิจ ลีก เดือน สตรีค
function tick() {
  const now = Date.now();
  if (S.hearts < MAX_HEARTS) {
    const gain = Math.floor((now - S.heartsTs) / HEART_MS);
    if (gain > 0) { S.hearts = Math.min(MAX_HEARTS, S.hearts + gain); S.heartsTs += gain * HEART_MS; }
  }
  if (S.hearts >= MAX_HEARTS) S.heartsTs = now;
  if (S.quests.day !== today()) S.quests = { day: today(), p: {}, claimed: {} };
  if (S.today.day !== today()) S.today = { day: today(), xp: 0 };
  if (S.month.key !== monthKey()) S.month = { key: monthKey(), points: 0 };
  if (S.week.key !== weekKey()) { if (!realLeague()) settleLeague(); S.week = { key: weekKey(), xp: 0 }; }
  checkStreak();
}

// ขาดเรียน: ใช้โล่สตรีคแทนวันที่พลาด ถ้าโล่ไม่พอสตรีคจะขาด (ซ่อมได้ภายใน 48 ชม.)
function checkStreak() {
  if (S.streakLost && dayNum(today()) - dayNum(S.streakLost.day) >= 2) S.streakLost = null;
  if (!S.streak || !S.lastDay || S.lastDay === today() || S.lastDay === yesterday()) return;
  const from = dayNum(S.lastDay) + 1, to = dayNum(yesterday());
  const missed = to - from + 1;
  if (missed <= S.shields) {
    S.shields -= missed;
    for (let n = from; n <= to; n++) S.days[keyOfDay(n)] = 'shield';
    S.lastDay = yesterday();
  } else {
    S.streakLost = { streak: S.streak, day: today() };
    S.streak = 0;
  }
  save();
}

// เรียนจบอย่างน้อย 1 อย่างวันนี้ → นับสตรีค และให้รางวัลก้าวสำคัญ
function learnToday() {
  if (S.lastDay === today()) return null;
  S.streak = S.lastDay === yesterday() ? S.streak + 1 : 1;
  S.lastDay = today();
  S.days[today()] = 'learn';
  S.records.bestStreak = Math.max(S.records.bestStreak, S.streak);
  const reward = MILESTONES[S.streak];
  if (reward) { S.nectar += reward; if (S.streak >= 30) S.owned.flower = true; }
  return { milestone: reward ? { days: S.streak, nectar: reward } : null };
}

const usesHearts = (kind) => kind === 'lesson' || kind === 'test';
const twoStrikes = (kind) => kind === 'legend' || kind === 'jump'; // ผิดได้ไม่เกิน 2 ข้อ ไม่ใช้หัวใจ
function loseHeart() {
  if (S.hearts >= MAX_HEARTS) S.heartsTs = Date.now();
  S.hearts = Math.max(0, S.hearts - 1);
}
function quest(id, n = 1) { S.quests.p[id] = (S.quests.p[id] || 0) + n; }
const boostLeft = () => Math.max(0, S.boostUntil - Date.now());
// คืนค่า XP ที่ได้จริง (คูณ 2 ถ้าใช้ XP สองเท่าอยู่)
function addXP(n) {
  if (boostLeft() > 0) n *= 2;
  S.xp += n; S.week.xp += n; S.today.xp += n;
  S.records.bestDayXP = Math.max(S.records.bestDayXP, S.today.xp);
  quest('xp', n);
  return n;
}

// ---------- ปรับความยากอัตโนมัติ ----------
// แต่ละทักษะ (ตัวสร้างโจทย์) มีระดับ 0 ง่าย · 1 ปกติ · 2 ท้าทาย (เริ่มที่ปกติ)
// ถูกติดกัน 4 ข้อ → ขึ้น 1 ระดับ · ผิดติดกัน 2 ข้อ → ลง 1 ระดับ · ระดับมีผลกับขนาดตัวเลขในโจทย์ (RV ใน js/data.js)
const LEVEL_UP_AFTER = 4, LEVEL_DOWN_AFTER = 2;
const skillLevel = (gen) => (S.settings.adaptive === false ? 1 : S.skills[gen]?.lvl ?? 1);
// สร้างโจทย์จริงของช่องที่ i ตอนจะแสดง (ความยากจึงปรับตามคำตอบระหว่างบทเรียนได้)
function materialize(L, i) {
  const slot = L.queue[i];
  if (!slot || slot.type) return;
  const lvl = L.kind === 'placement' ? 1 : skillLevel(slot.gen);
  LEVEL = lvl;
  try { L.queue[i] = { ...G[slot.gen](), uid: slot.uid, gen: slot.gen, pu: slot.pu, lvl }; } finally { LEVEL = 1; }
}

// บันทึกผลรายตัวสร้างโจทย์ ใช้คำนวณความแข็งแรงของทักษะ คลังข้อที่ผิด และระดับความยาก
// คืนค่า +1 / -1 เมื่อระดับความยากเปลี่ยน
function trackSkill(gen, ok) {
  if (!gen) return 0;
  const sk = S.skills[gen] || (S.skills[gen] = { r: [], last: 0 });
  sk.r.push(ok ? 1 : 0);
  if (sk.r.length > 10) sk.r.shift();
  sk.last = Date.now();
  let change = 0;
  if (S.settings.adaptive !== false && UI.L?.kind !== 'placement') {
    sk.lvl = sk.lvl ?? 1;
    if (ok) {
      sk.up = (sk.up || 0) + 1; sk.dn = 0;
      if (sk.up >= LEVEL_UP_AFTER && sk.lvl < 2) { sk.lvl++; sk.up = 0; change = 1; }
    } else {
      sk.dn = (sk.dn || 0) + 1; sk.up = 0;
      if (sk.dn >= LEVEL_DOWN_AFTER && sk.lvl > 0) { sk.lvl--; sk.dn = 0; change = -1; }
    }
  }
  if (!ok) { S.mistakes.push({ gen, ts: Date.now() }); if (S.mistakes.length > 60) S.mistakes.shift(); }
  else if (UI.L?.meta.review) S.mistakes = S.mistakes.filter((m) => m.gen !== gen); // ทบทวนถูกแล้ว เอาออกจากคลัง
  return change;
}

function levelInfo(xp) {
  let lvl = 1, need = 100;
  while (xp >= need) { xp -= need; lvl++; need += 50; }
  return { lvl, cur: xp, need };
}
const isUnlocked = (i) => i === 0 || !!S.done[NODES[i - 1].id];
const currentIndex = () => { const i = NODES.findIndex((n) => !S.done[n.id]); return i < 0 ? NODES.length : i; };
const unitReached = (ui) => NODES.some((n, i) => n.ui === ui && isUnlocked(i));
const unitDone = (ui) => NODES.filter((n) => n.ui === ui).every((n) => S.done[n.id]);
const unitVars = (u) => `--c:${u.color};--cd:${u.dark};--ci:${u.ink}`;
const tint = (o) => `--h:${o.color};color:${o.ink}`;

function checkBadges() {
  const fresh = [];
  for (const b of BADGES) if (!S.badges[b.id] && b.test(S)) { S.badges[b.id] = today(); fresh.push(b); }
  return fresh;
}
const badgeHex = (b, got, cls = 'badge-hex') => hex(got ? icon(b.icon, 26) : icon('lock', 22), cls, got ? tint(b) : '');

function showToast(msg) {
  UI.toast = msg;
  render();
  clearTimeout(showToast.t);
  showToast.t = setTimeout(() => { UI.toast = null; document.querySelector('.toast')?.remove(); }, 2200);
}

// ---------- mascot ----------
let beeId = 0;
const BEE_EYES = {
  open: (dy) => `<g class="eyes"><ellipse cx="48" cy="64" rx="7" ry="8" fill="#fff" stroke="#2A1F14" stroke-width="2.5"/><circle cx="49.5" cy="${65.5 + dy}" r="3.6" fill="#2A1F14"/><circle cx="51" cy="${63.5 + dy}" r="1.2" fill="#fff"/>
    <ellipse cx="72" cy="64" rx="7" ry="8" fill="#fff" stroke="#2A1F14" stroke-width="2.5"/><circle cx="73.5" cy="${65.5 + dy}" r="3.6" fill="#2A1F14"/><circle cx="75" cy="${63.5 + dy}" r="1.2" fill="#fff"/></g>`,
  closed: '<path d="M41 63 Q48 56 55 63M65 63 Q72 56 79 63" stroke="#2A1F14" stroke-width="3.5" fill="none" stroke-linecap="round"/>',
};
const BEE_MOUTH = {
  happy: '<path d="M52 77 Q60 85 68 77" stroke="#2A1F14" stroke-width="3.5" fill="none" stroke-linecap="round"/>',
  sad: '<path d="M52 82 Q60 76 68 82" stroke="#2A1F14" stroke-width="3.5" fill="none" stroke-linecap="round"/>',
  wow: '<ellipse cx="60" cy="80" rx="4.5" ry="5.5" fill="#2A1F14"/>',
  cheer: '<path d="M49 72 Q60 88 71 72 Z" fill="#2A1F14"/><path d="M54 80 Q60 84 66 80" stroke="#FF8FA3" stroke-width="3" fill="none" stroke-linecap="round"/>',
};
// ชุดแต่งน้องผึ้งจากร้านค้า
const BEE_OUTFITS = {
  cap: '<path d="M28 36 L60 22 L92 36 L60 50 Z" fill="#2A1F14"/><path d="M44 43 v9 q16 8 32 0 v-9" fill="#2A1F14"/><path d="M88 38 v14" stroke="#FFC21A" stroke-width="3" stroke-linecap="round"/><circle cx="88" cy="54" r="3.5" fill="#FFC21A"/>',
  bow: '<path d="M70 40 L82 47 L70 54 Z M94 40 L82 47 L94 54 Z" fill="#F0484E" stroke="#2A1F14" stroke-width="2.5" stroke-linejoin="round"/><circle cx="82" cy="47" r="4" fill="#F0484E" stroke="#2A1F14" stroke-width="2.5"/>',
  flower: '<g stroke="#2A1F14" stroke-width="2"><circle cx="84" cy="36" r="6" fill="#FF8FA3"/><circle cx="94" cy="42" r="6" fill="#FF8FA3"/><circle cx="90" cy="53" r="6" fill="#FF8FA3"/><circle cx="78" cy="53" r="6" fill="#FF8FA3"/><circle cx="74" cy="42" r="6" fill="#FF8FA3"/><circle cx="84" cy="45" r="5" fill="#FFC21A"/></g>',
};
// mood: happy (ยิ้ม) · sad (เสียใจ) · wow (ตื่นเต้น) · cheer (ดีใจชูมือ)
function bee(size = 80, mood = 'happy') {
  const id = 'bb' + beeId++;
  const cheer = mood === 'cheer';
  const wa = cheer ? 45 : 30, wx = cheer ? 36 : 40, wy = cheer ? 30 : 32;
  return `<svg class="bee ${mood}" width="${size}" height="${size}" viewBox="0 0 120 120" aria-hidden="true">
    <defs><clipPath id="${id}"><ellipse cx="60" cy="74" rx="36" ry="32"/></clipPath></defs>
    <g class="wings">
      <ellipse cx="${wx}" cy="${wy}" rx="15" ry="22" transform="rotate(-${wa} ${wx} ${wy})" fill="#DDF1FF" stroke="#2A1F14" stroke-width="3.5"/>
      <ellipse cx="${120 - wx}" cy="${wy}" rx="15" ry="22" transform="rotate(${wa} ${120 - wx} ${wy})" fill="#DDF1FF" stroke="#2A1F14" stroke-width="3.5"/>
    </g>
    <path d="M50 46 Q44 30 36 24" stroke="#2A1F14" stroke-width="3.5" fill="none" stroke-linecap="round"/><circle cx="36" cy="24" r="5" fill="#2A1F14"/>
    <path d="M70 46 Q76 30 84 24" stroke="#2A1F14" stroke-width="3.5" fill="none" stroke-linecap="round"/><circle cx="84" cy="24" r="5" fill="#2A1F14"/>
    ${cheer ? '<g class="arms"><path class="arm-l" d="M26 70 Q12 58 14 44" stroke="#2A1F14" stroke-width="5" fill="none" stroke-linecap="round"/><path class="arm-r" d="M94 70 Q108 58 106 44" stroke="#2A1F14" stroke-width="5" fill="none" stroke-linecap="round"/></g>' : ''}
    <ellipse cx="60" cy="74" rx="36" ry="32" fill="#FFC21A"/>
    <g clip-path="url(#${id})" fill="#2A1F14"><rect x="20" y="88" width="80" height="8"/><rect x="20" y="101" width="80" height="8"/></g>
    <ellipse cx="60" cy="74" rx="36" ry="32" fill="none" stroke="#2A1F14" stroke-width="3.5"/>
    ${cheer ? BEE_EYES.closed : BEE_EYES.open(mood === 'sad' ? 1 : 0)}
    <ellipse cx="38" cy="75" rx="5" ry="3.5" fill="#FF8FA3" opacity=".75"/><ellipse cx="82" cy="75" rx="5" ry="3.5" fill="#FF8FA3" opacity=".75"/>
    ${BEE_MOUTH[mood] || BEE_MOUTH.happy}
    ${BEE_OUTFITS[S.outfit] || ''}
  </svg>`;
}
const BRAND_BEE = `<svg width="30" height="30" viewBox="0 0 120 120" aria-hidden="true"><ellipse cx="42" cy="34" rx="16" ry="22" transform="rotate(-30 42 34)" fill="#DDF1FF" stroke="#2A1F14" stroke-width="6"/><ellipse cx="78" cy="34" rx="16" ry="22" transform="rotate(30 78 34)" fill="#DDF1FF" stroke="#2A1F14" stroke-width="6"/><ellipse cx="60" cy="72" rx="36" ry="32" fill="#FFC21A" stroke="#2A1F14" stroke-width="6"/><circle cx="48" cy="66" r="5" fill="#2A1F14"/><circle cx="72" cy="66" r="5" fill="#2A1F14"/><path d="M50 82 Q60 90 70 82" stroke="#2A1F14" stroke-width="5" fill="none" stroke-linecap="round"/></svg>`;
const PRAISE = ['เยี่ยมมาก!', 'ถูกต้อง!', 'เก่งสุด ๆ!', 'ยอดเยี่ยม!', 'สุดยอดเลย!'];
const COMFORT = ['เกือบแล้ว!', 'ไม่เป็นไรนะ ลองดูวิธีคิดนี้', 'ผิดได้ เรียนรู้ได้'];

// ---------- shell ----------
const chipsHTML = () => `<div class="chips">
    <button class="chip streak ${S.lastDay === today() ? 'on' : ''} ${UI.bump?.streak ? 'bump' : ''}" data-act="go" data-v="streak" aria-label="สตรีค ${S.streak} วัน">${icon('flame', 18)}${S.streak}</button>
    <button class="chip nectar ${UI.bump?.nectar ? 'bump' : ''}" data-act="go" data-v="shop" aria-label="น้ำหวาน ${S.nectar}">${icon('drop', 18)}${num(S.nectar)}</button>
    <button class="chip hearts ${UI.bump?.hearts ? 'bump' : ''}" data-act="go" data-v="shop" aria-label="หัวใจ ${S.hearts} ดวง">${icon('heart', 18)}${S.hearts}</button>
  </div>`;
function topBar() {
  return `<header class="topbar"><div class="brand">${BRAND_BEE}<span>Bee<em>Math</em></span></div>${chipsHTML()}</header>`;
}
const TABS = [
  ['learn', 'home', 'เรียนรู้'], ['practice', 'dumbbell', 'ฝึกฝน'], ['board', 'trophy', 'อันดับ'], ['quests', 'target', 'ภารกิจ'], ['profile', 'user', 'โปรไฟล์'],
];
function bottomNav() {
  const dot = QUESTS.some((q) => (S.quests.p[q.id] || 0) >= q.goal && !S.quests.claimed[q.id]);
  return `<nav class="tabs" aria-label="เมนูหลัก">${TABS.map(([v, i, t]) =>
    `<button class="tab ${UI.view === v ? 'active' : ''}" data-act="tab" data-v="${v}" ${UI.view === v ? 'aria-current="page"' : ''}>${icon(i)}${t}${(v === 'quests' && dot) || (v === 'profile' && friendDot()) ? '<i class="dot" aria-label="มีเรื่องรอดู"></i>' : ''}</button>`).join('')}</nav>`;
}
// เมนูด้านข้าง (แท็บเล็ต: แถบไอคอน · คอม: เมนูเต็ม) — มือถือใช้เมนูด้านล่างแทน
const SIDE = [['learn', 'home', 'เรียนรู้', 'tab'], ['practice', 'dumbbell', 'ฝึกฝน', 'tab'], ['board', 'trophy', 'อันดับ', 'tab'],
  ['quests', 'target', 'ภารกิจ', 'tab'], ['friends', 'users', 'เพื่อน', 'go'], ['classes', 'cap', 'ห้องเรียน', 'go'], ['shop', 'shop', 'ร้านค้า', 'go'], ['profile', 'user', 'โปรไฟล์', 'tab']];
function sideNav() {
  const dot = QUESTS.some((q) => (S.quests.p[q.id] || 0) >= q.goal && !S.quests.claimed[q.id]);
  return `<nav class="sidenav" aria-label="เมนูหลัก">
    <div class="side-brand">${BRAND_BEE}<span>Bee<em>Math</em></span></div>
    ${SIDE.map(([v, i, t, act]) => `<button class="side-item ${UI.view === v ? 'active' : ''}" data-act="${act}" data-v="${v}" ${UI.view === v ? 'aria-current="page"' : ''}>
      ${icon(i, 26)}<span>${t}</span>${(v === 'quests' && dot) || (v === 'friends' && friendDot()) ? '<i class="dot" aria-label="มีเรื่องรอดู"></i>' : ''}</button>`).join('')}
    <button class="side-item side-bottom ${UI.view === 'settings' ? 'active' : ''}" data-act="go" data-v="settings" ${UI.view === 'settings' ? 'aria-current="page"' : ''}>${icon('gear', 26)}<span>ตั้งค่า</span></button>
  </nav>`;
}
// แผงสรุปด้านขวา (เฉพาะจอคอม)
function rightRail() {
  const rows = leagueRows(), me = rows.find((r) => r.me), t = TIERS[S.league.tier], z = leagueZones(rows.length);
  const top = S.league.tier === TIERS.length - 1;
  const need = me.rank > z.up && !top ? rows[z.up - 1].xp - me.xp + 1 : me.xp === 0 && !top ? 1 : 0;
  const goal = S.goal, x = S.today.xp, boost = boostLeft();
  const mp = Math.min(MONTH_GOAL, S.month.points);
  return `<aside class="rail" aria-label="สรุปวันนี้">
    ${chipsHTML()}
    <section class="rail-card">
      <div class="rail-head"><h2>ลีก${t.name}</h2><button class="linkbtn" data-act="tab" data-v="board">ดูลีก</button></div>
      <div class="rail-row">${hex(icon(t.icon, 22), 'ico', tint(t))}
        <span class="setting-main"><b>อันดับที่ ${me.rank} · ${me.xp} XP</b><small>${top ? 'ลีกสูงสุดแล้ว' : need ? `อีก ${need} XP จะเข้าเขตเลื่อนลีก` : 'อยู่ในเขตเลื่อนลีก!'} · เหลือ ${weekLeft()}</small></span></div>
    </section>
    <section class="rail-card">
      <div class="goal-row"><span>${x >= goal ? 'ถึงเป้าหมายวันนี้แล้ว!' : 'เป้าหมายวันนี้'}</span><span>${Math.min(x, goal)} / ${goal} XP</span></div>
      <div class="meter"><div style="width:${Math.min(100, (x / goal) * 100)}%"></div></div>
      ${boost ? `<span class="boost-note">${icon('bolt', 14)} XP ×2 เหลือ ${Math.ceil(boost / 60000)} นาที</span>` : ''}
    </section>
    <section class="rail-card">
      <div class="rail-head"><h2>ภารกิจประจำวัน</h2><button class="linkbtn" data-act="tab" data-v="quests">ดูทั้งหมด</button></div>
      ${QUESTS.map((q) => { const v = Math.min(q.goal, S.quests.p[q.id] || 0);
        return `<div class="rail-row">${hex(icon(q.icon, 18), 'ico small', tint(q))}<span class="setting-main"><b>${q.title}</b>
          <span class="meter labeled" style="--m:${q.color}"><span class="fill" style="width:${(v / q.goal) * 100}%"></span><span>${S.quests.claimed[q.id] ? 'รับแล้ว' : `${v} / ${q.goal}`}</span></span></span></div>`; }).join('')}
    </section>
    <button class="month-card" data-act="go" data-v="achievements">
      ${hex(icon('sun', 20), 'ico', S.monthBadges[S.month.key] ? '--h:#FFC21A;color:#2A1F14' : '--h:#4A3D2E;color:#FFD84D')}
      <span class="q-main"><b>เหรียญประจำเดือน</b><span class="meter labeled"><span class="fill" style="width:${(mp / MONTH_GOAL) * 100}%"></span><span>${mp} / ${MONTH_GOAL}</span></span></span>
    </button>
  </aside>`;
}
// โครงหน้า: เมนูข้าง + คอลัมน์กลาง + แผงขวา (CSS ซ่อน/แสดงตามความกว้างจอ)
// opts.top = แสดงแถบบน · opts.sub = { title, extra } สำหรับหน้าจอย่อยที่มีปุ่มย้อนกลับ
const friendDot = () => typeof friendsAlert === 'function' && friendsAlert() > 0;
// opts.wide = หน้ากว้าง (แดชบอร์ดครู) ไม่มีแผงขวา
function shell(body, opts = {}) {
  const { top = true, sub = null, wide = false } = opts;
  return `<div class="layout${wide ? ' wide' : ''}">${sideNav()}
    <div class="main-col">${sub ? subHead(sub.title, sub.extra) : top ? topBar() : ''}<main class="page${sub ? ' sub' : ''}${wide ? ' wide' : ''}">${body}</main></div>
    ${wide ? '' : rightRail()}</div>${sub ? '' : bottomNav()}${sheetHTML()}`;
}
// หัวหน้าจอย่อยที่มีปุ่มย้อนกลับ
const subHead = (title, extra = '') => `<header class="subhead"><button class="x" data-act="back" aria-label="ย้อนกลับ">${icon('back', 22)}</button><h1>${title}</h1>${extra}</header>`;

// ---------- learn (path) ----------
const OFFSETS = [0, 52, 78, 52, 0, -52, -78, -52];

// ข้อความให้กำลังใจจากน้องผึ้งข้างด่านปัจจุบัน
function nudge(i) {
  if (i === 0) return 'สวัสดี!<br>มาเริ่มเรียนกันเลย';
  if (NODES[i].kind === 'test') return 'ด่านทดสอบมาแล้ว<br>สู้ ๆ นะ!';
  const left = NODES.slice(i).findIndex((m) => m.kind === 'test');
  return left === 1 ? 'อีกบทเดียว<br>ก็ถึงด่านทดสอบแล้ว!' : `อีก ${left} บท<br>ก็ถึงด่านทดสอบ`;
}

function viewLearn() {
  const cur = currentIndex();
  const goal = S.goal, todayXP = S.today.xp;
  const boost = boostLeft();
  let html = `<section class="goal card" aria-label="เป้าหมายวันนี้">
    <span class="goal-ic">${icon(todayXP >= goal ? 'check' : 'target')}</span>
    <div class="goal-main">
      <div class="goal-row"><span>${todayXP >= goal ? 'ถึงเป้าหมายวันนี้แล้ว!' : 'เป้าหมายวันนี้'}</span><span>${Math.min(todayXP, goal)} / ${goal} XP</span></div>
      <div class="meter"><div style="width:${Math.min(100, (todayXP / goal) * 100)}%"></div></div>
      ${boost ? `<span class="boost-note">${icon('bolt', 14)} XP ×2 เหลือ ${Math.ceil(boost / 60000)} นาที</span>` : ''}
    </div>
  </section>`;
  if (S.streakLost) {
    html += `<button class="banner warn" data-act="go" data-v="streak">${icon('flame', 22)}<span>สตรีค ${S.streakLost.streak} วันขาดแล้ว แตะเพื่อซ่อมภายใน 48 ชม.</span>${icon('chevron', 20)}</button>`;
  }
  if (typeof assignmentBanner === 'function') html += assignmentBanner(); // งานจากครู (js/classroom.js)
  let k = 0;
  UNITS.forEach((u, ui) => {
    const items = NODES.map((n, i) => ({ n, i })).filter(({ n }) => n.ui === ui);
    const legend = !!S.legend[u.id];
    if (isUnlocked(items[0].i)) {
      const done = items.filter(({ n }) => S.done[n.id]).length;
      const curItem = items.find(({ i }) => i === cur);
      const label = legend ? 'ระดับตำนาน' : done === items.length ? 'ผ่านครบแล้ว'
        : curItem?.n.kind === 'test' ? 'ด่านทดสอบ'
        : curItem ? `บทเรียน ${u.lessons.findIndex((l) => l.id === curItem.n.id) + 1} จาก ${u.lessons.length}` : '';
      const guide = curItem?.n.kind === 'lesson' ? curItem.i : items[0].i;
      html += `<section class="unit-head" style="${unitVars(u)}" aria-label="บทที่ ${ui + 1}">
        <div><small>บทที่ ${ui + 1}${label ? ' · ' + label : ''}</small><h2>${u.title}</h2><p>${u.desc}</p></div>
        <button class="guide" data-act="cards" data-i="${guide}" aria-label="ดูเนื้อหาบทเรียน">${icon('book', 22)}</button>
      </section>`;
    } else {
      html += `<div class="unit-divider"><span>บทที่ ${ui + 1} · ${u.title}</span></div>
        <button class="jump-btn" data-act="jump-sheet" data-u="${ui}">${icon('mountain', 16)} ทดสอบข้ามมาบทนี้</button>`;
    }
    html += '<div class="path">';
    items.forEach(({ n, i }) => {
      const dx = OFFSETS[k++ % OFFSETS.length];
      const done = !!S.done[n.id], open = isUnlocked(i), isCur = i === cur;
      const state = (done ? (legend ? 'done legend' : 'done') : isCur ? 'current' : open ? 'open' : 'locked')
        + (n.id === UI.justDone ? ' just-done' : '') + (isCur && UI.justDone ? ' just-open' : '');
      const ic = n.kind === 'test' ? icon('trophy', 30) : done ? icon(legend ? 'crown' : 'check', 30) : open ? icon('star', 34) : icon('lock', 26);
      const label = (n.kind === 'test' ? 'ด่านทดสอบ: ' + u.title : n.title) + (done ? ' ผ่านแล้ว' : isCur ? ' ด่านปัจจุบัน' : open ? '' : ' ล็อกอยู่');
      html += `<div class="node-row k-${n.kind}${isCur ? ' is-cur' : ''}" style="--dx:${dx}px">
        ${isCur ? '<span class="halo hex"></span><div class="start-tip">เริ่มเลย!</div>' : ''}
        <button class="node ${state}" data-act="node" data-i="${i}" aria-label="${esc(label)}"><span class="hex face">${ic}</span></button>
        ${isCur ? `<div class="path-bee" style="--side:${dx >= 0 ? -1 : 1}"><p class="say">${nudge(i)}</p>${bee(96)}</div>` : ''}
      </div>`;
      // หีบสมบัติหลังบทเรียนที่ 2 ของแต่ละบท
      if (n.kind === 'lesson' && n.id === u.lessons[1]?.id) html += chestRow(u, OFFSETS[k++ % OFFSETS.length]);
      // ด่านทบทวนบท หลังผ่านด่านทดสอบแล้ว
      if (n.kind === 'test' && done) html += reviewRow(ui, OFFSETS[k++ % OFFSETS.length]);
    });
    html += '</div>';
  });
  if (cur >= NODES.length) html += `<div class="all-done">${bee(110, 'cheer')}<h3>เรียนครบทุกบทแล้ว!</h3><p>ลองท้าทาย “ระดับตำนาน” ในศูนย์ฝึกฝนดูสิ</p></div>`;
  return shell(html);
}

// หีบสมบัติ: เปิดได้เมื่อผ่านบทเรียนก่อนหน้า ได้น้ำหวานแบบสุ่ม
const CHEST_SVG = (open) => `<svg width="64" height="58" viewBox="0 0 64 58" aria-hidden="true">
  ${open ? '<path d="M8 22 L14 6 H50 L56 22 Z" fill="#C85A00" stroke="#2A1F14" stroke-width="3" stroke-linejoin="round"/><circle cx="32" cy="24" r="10" fill="#FFF0C2"/>'
    : '<path d="M8 24 Q8 8 32 8 Q56 8 56 24 Z" fill="#E09A00" stroke="#2A1F14" stroke-width="3" stroke-linejoin="round"/>'}
  <rect x="8" y="24" width="48" height="28" rx="4" fill="#FFC21A" stroke="#2A1F14" stroke-width="3"/>
  <path d="M8 34 H56" stroke="#2A1F14" stroke-width="3"/>
  ${open ? '' : '<rect x="27" y="28" width="10" height="12" rx="2" fill="#2A1F14"/><circle cx="32" cy="33" r="2" fill="#FFC21A"/>'}
</svg>`;
function chestRow(u, dx) {
  const id = u.id + '-chest', opened = !!S.chests[id], ready = !!S.done[u.lessons[1].id];
  const label = opened ? 'หีบสมบัติ เปิดแล้ว' : ready ? 'หีบสมบัติ แตะเพื่อเปิด' : 'หีบสมบัติ ผ่านบทเรียนก่อนหน้าเพื่อปลดล็อก';
  return `<div class="node-row k-chest" style="--dx:${dx}px">
    <button class="chest ${opened ? 'opened' : ready ? 'ready' : 'locked'}" data-act="chest" data-id="${id}" aria-label="${label}" ${ready && !opened ? '' : 'disabled'}>${CHEST_SVG(opened)}</button></div>`;
}
// ด่านทบทวนบท: ขึ้นจุดแจ้งเตือนเมื่อมีทักษะในบทที่อ่อนลง (ความแข็งแรง ≤ 2)
const unitWeak = (ui) => NODES.filter((n) => n.ui === ui && n.kind === 'lesson').filter((n) => (lessonStrength(n)?.level ?? 4) <= 2);
function reviewRow(ui, dx) {
  const weak = unitWeak(ui).length;
  return `<div class="node-row k-review" style="--dx:${dx}px">
    <button class="node review" data-act="unit-review" data-u="${ui}" aria-label="ทบทวนบทที่ ${ui + 1}${weak ? ' มีทักษะที่ควรทบทวน' : ''}"><span class="hex face">${icon('dumbbell', 28)}</span></button>
    ${weak ? '<span class="review-dot" aria-hidden="true">!</span>' : ''}
    <span class="review-label">${weak ? 'ควรทบทวน' : 'ทบทวนบท'}</span></div>`;
}

// ---------- sheets ----------
const switchHTML = (id, on, label) => `<button class="switch ${on ? 'on' : ''}" role="switch" aria-checked="${on}" aria-label="${label}" data-act="toggle-${id}"><span></span></button>`;
const SHEETS = {
  node(s) {
    const n = NODES[s.i], open = isUnlocked(s.i), done = !!S.done[n.id];
    const idx = n.kind === 'lesson' ? n.unit.lessons.findIndex((l) => l.id === n.id) + 1 : null;
    return `<div class="sheet-card" style="${unitVars(n.unit)}">
      <span class="sheet-tag">บทที่ ${n.ui + 1} · ${n.kind === 'test' ? 'ด่านทดสอบท้ายบท' : `บทเรียน ${idx}/${n.unit.lessons.length}`}</span>
      <h3>${n.kind === 'test' ? 'ด่านทดสอบ: ' + n.unit.title : n.title}</h3>
      ${!open ? '<p>ทำบทเรียนก่อนหน้าให้ผ่านก่อน จึงจะปลดล็อกด่านนี้</p>'
        : n.kind === 'test' ? '<p>ตอบถูก 70% ขึ้นไปเพื่อผ่านด่าน และปลดล็อกบทถัดไป</p>'
        : `<p>${done ? 'ผ่านแล้ว ทบทวนอีกครั้งเพื่อรับ XP เพิ่ม' : 'เรียนเนื้อหาสั้น ๆ แล้วทำแบบฝึกหัด 6 ข้อ'}</p>`}
      ${open ? `<button class="btn primary" data-act="start" data-i="${s.i}">${done ? 'ทบทวน' : 'เริ่ม'} +${n.kind === 'test' ? 20 : 10} XP</button>`
        : `<button class="btn" disabled>${icon('lock', 20)} ยังล็อกอยู่</button>`}
      ${open && n.kind === 'lesson' ? `<button class="btn ghost" data-act="cards" data-i="${s.i}">${icon('book', 20)} ดูเนื้อหาบทเรียน</button>` : ''}
    </div>`;
  },
  nohearts() {
    const mins = Math.ceil((HEART_MS - (Date.now() - S.heartsTs)) / 60000);
    return `<div class="sheet-card center">${bee(80, 'sad')}<h3>หัวใจหมดแล้ว</h3>
      <p>รอ ${mins} นาทีเพื่อรับหัวใจคืน 1 ดวง ไปฝึกฝน (ไม่เสียหัวใจ) หรือใช้น้ำหวานเติมหัวใจในร้านค้า</p>
      <button class="btn primary" data-act="tab" data-v="practice">ไปฝึกฝน</button>
      <button class="btn ghost" data-act="go" data-v="shop">${icon('drop', 18)} ไปร้านค้า</button></div>`;
  },
  quit() {
    return `<div class="sheet-card center">${bee(80, 'sad')}<h3>จะออกจริงเหรอ?</h3>
      <p>ความคืบหน้าในรอบนี้จะหายไปนะ</p>
      <button class="btn primary" data-act="close">ทำต่อ</button>
      <button class="btn danger-text" data-act="quit-yes">ออก</button></div>`;
  },
  reset() {
    return `<div class="sheet-card center"><h3>รีเซ็ตความคืบหน้าทั้งหมด?</h3><p>XP บทเรียน น้ำหวาน ตราสัญลักษณ์ และสตรีคจะถูกลบ</p>
      <button class="btn danger" data-act="reset-yes">ลบทั้งหมด</button><button class="btn ghost" data-act="close">ยกเลิก</button></div>`;
  },
  avatar() {
    return `<div class="sheet-card center"><h3>เลือกสีกรอบอวตาร</h3><div class="swatches">${AVATAR_COLORS
      .map((c, i) => `<button class="swatch ${S.avatar === c ? 'sel' : ''}" data-act="avatar" data-a="${c}" aria-label="สีที่ ${i + 1}" ${S.avatar === c ? 'aria-pressed="true"' : ''}>
        ${hex(hex(S.avatar === c ? icon('check', 22) : '', 'sw-in', `background:${c}`), 'sw-out')}</button>`).join('')}</div></div>`;
  },
  badge(s) {
    const b = BADGES.find((x) => x.id === s.id), got = S.badges[b.id];
    return `<div class="sheet-card center">${badgeHex(b, got, 'badge-hex big')}<h3>${b.name}</h3><p>${b.desc}</p>
      <p class="small">${got ? 'ได้รับเมื่อ ' + thaiDate(got) : 'ยังไม่ได้รับ'}</p>
      <button class="btn primary" data-act="close">ตกลง</button></div>`;
  },
  chest(s) {
    return `<div class="sheet-card center"><div class="chest-big">${CHEST_SVG(true)}</div><h3>เปิดหีบแล้ว!</h3>
      <p>ได้รับ <b>${s.nectar} น้ำหวาน</b>${s.boost ? ' และ <b>XP สองเท่า 15 นาที</b>' : ''}</p>
      <button class="btn primary" data-act="close">เยี่ยมเลย</button></div>`;
  },
  jump(s) {
    const first = Math.min(s.u - 1, UNITS.findIndex((u, ui) => !unitDone(ui)));
    return `<div class="sheet-card" style="${unitVars(UNITS[s.u])}"><span class="sheet-tag">ทดสอบข้ามบท</span>
      <h3>ข้ามไปเรียนบทที่ ${s.u + 1}: ${UNITS[s.u].title}</h3>
      <p>ตอบ 10 ข้อจากบทที่ ${first + 1}${s.u - 1 > first ? `–${s.u}` : ''} ผิดได้ไม่เกิน 2 ข้อ ไม่ใช้หัวใจ ผ่านแล้วบทก่อนหน้าจะนับว่าผ่านทั้งหมด</p>
      <button class="btn primary" data-act="jump-start" data-u="${s.u}">เริ่มทดสอบ +20 XP</button>
      <button class="btn ghost" data-act="close">ไว้ก่อน</button></div>`;
  },
  league() {
    const r = S.leagueResult, t = TIERS[r.to];
    const msg = r.to > r.from ? `เลื่อนขึ้นสู่ลีก${t.name}!` : r.to < r.from ? `ตกไปอยู่ลีก${t.name}` : `อยู่ลีก${t.name}ต่อ`;
    return `<div class="sheet-card center">${hex(icon(t.icon, 40), 'tier-hex big', tint(t))}<h3>${msg}</h3>
      <p>สัปดาห์ที่แล้วคุณได้อันดับที่ ${r.rank} จาก ${r.n || 20} คน</p>
      <button class="btn primary" data-act="league-ok">ตกลง</button></div>`;
  },
};
function sheetHTML() {
  const s = UI.sheet;
  if (!s || !SHEETS[s.type]) return '';
  if (s.type === 'league' && !S.leagueResult) { UI.sheet = null; return ''; } // ข้อมูลถูกแทนที่ระหว่างซิงก์/เปลี่ยนบัญชี
  return `<div class="overlay" data-act="close-bg"><div class="sheet" role="dialog" aria-modal="true">${SHEETS[s.type](s)}</div></div>`;
}

// ---------- learn cards ----------
function viewCards() {
  const { i, k } = UI.cards;
  const n = NODES[i], card = n.cards[k], last = k === n.cards.length - 1;
  return `<div class="cards-view" style="${unitVars(n.unit)}">
    <header class="lesson-top"><button class="x" data-act="tab" data-v="learn" aria-label="ปิด">${icon('x', 22)}</button>
      <div class="dots">${n.cards.map((_, j) => `<i class="${j <= k ? 'on' : ''}"></i>`).join('')}</div>
      <button class="skip" data-act="cards-go">ข้าม</button></header>
    <main class="cards-body">
      <span class="pill">${icon('book', 16)} เรียนรู้ · ${esc(n.title)}</span>
      <h2>${card.title}</h2>
      <div class="talk">${bee(64)}<div class="bubble">${card.body}</div></div>
      ${card.visual ? `<div class="visual">${card.visual}</div>` : ''}
      ${card.demo ? `<div class="demo">${card.demo.map(([e, note], j) =>
        `<div class="demo-row" style="animation-delay:${0.35 + j * 0.7}s">${M(e)}${note ? `<small>${note}</small>` : ''}</div>`).join('')}</div>` : ''}
    </main>
    <footer class="lesson-foot"><button class="btn primary wide" data-act="${last ? 'cards-go' : 'cards-next'}">${last ? 'เริ่มทำแบบฝึกหัด' : 'ถัดไป'}</button></footer>
  </div>`;
}

// ---------- session (lesson / test / practice / legend / placement) ----------
// gens: ตัวสร้างโจทย์ · n: จำนวนข้อ · ordered: ไม่สลับลำดับ (ใช้กับทดสอบวัดระดับ)
function startSession(kind, gens, meta = {}, n = kind === 'lesson' ? 6 : kind === 'legend' || kind === 'placement' ? 10 : 8, ordered = false) {
  const base = [];
  for (let i = 0; i < n; i++) base.push(gens[i % gens.length]);
  const queue = (ordered ? base : shuffle(base)).map((g, uid) => ({ uid, gen: g, pu: meta.units?.[uid] })); // สร้างโจทย์จริงทีละข้อด้วย materialize()
  UI.L = { uid: Date.now(), kind, meta, queue, idx: 0, total: n, firstTry: 0, mistakes: 0, run: 0, hard: 0, sel: null, input: '', built: [], checked: false, ok: false, msg: '', note: '', wrong: [], unitOk: {}, ...freshMatch() };
  materialize(UI.L, 0);
  UI.view = 'lesson'; UI.sheet = null;
  render();
  window.scrollTo(0, 0);
}

function viewLesson() {
  const L = UI.L, q = L.queue[L.idx];
  const pct = Math.round(((L.idx + (L.checked ? 1 : 0)) / L.queue.length) * 100);
  const fromPct = L.shownPct ?? pct;
  L.shownPct = pct;
  let area = '';
  if (q.type === 'choice') {
    area = `<div class="opts">${q.choices.map((c, k) => {
      let cls = L.sel === k ? 'sel' : '';
      if (L.checked && k === q.answer) cls = 'right';
      else if (L.checked && L.sel === k) cls = 'wrong';
      return `<button class="opt ${cls}" data-act="opt" data-k="${k}" ${L.checked ? 'disabled' : ''}><span class="kbd">${k + 1}</span>${c}</button>`;
    }).join('')}</div>`;
  } else if (q.type === 'input') {
    area = answerPad(L.input, L.checked, L.ok, 'key');
  } else if (q.type === 'match') {
    const item = (side, id) => {
      const p = q.pairs[id], done = L.mDone.includes(id);
      const sel = (side === 'l' ? L.mL : L.mR) === id;
      const flash = L.mFlash && L.mFlash[side] === id;
      return `<button class="m-item ${done ? 'matched' : sel ? 'sel' : flash ? 'wrong' : ''}" data-act="m-pick" data-side="${side}" data-id="${id}" ${done || L.checked ? 'disabled' : ''}>${side === 'l' ? p.a : p.b}</button>`;
    };
    area = `<div class="match">
      <div class="match-col">${q.left.map((id) => item('l', id)).join('')}</div>
      <div class="match-col">${q.right.map((id) => item('r', id)).join('')}</div>
    </div>`;
  } else if (q.type === 'order') {
    const placed = L.built.map((k, i) => `<button class="step-tile placed" data-act="o-remove" data-k="${i}" ${L.checked ? 'disabled' : ''}><span class="step-no">${i + 1}</span>${M(q.palette[k])}</button>`).join('');
    area = `<div class="order">
      <div class="order-start">${M(q.start)}</div>
      <div class="order-slots ${L.checked ? (L.ok ? 'right' : 'wrong') : ''}">${placed || '<span class="slot wide">แตะขั้นตอนด้านล่างเพื่อเรียงต่อจากสมการ</span>'}</div>
      <div class="palette-label">ขั้นตอน</div>
      <div class="order-palette">${q.palette.map((st, k) => `<button class="step-tile" data-act="o-add" data-k="${k}" ${L.checked || L.built.includes(k) ? 'disabled' : ''}>${M(st)}</button>`).join('')}</div>
    </div>`;
  } else if (q.type === 'barbuild') {
    const used = (v) => L.built.filter((t) => t === String(v)).length;
    const tiles = L.built.map((t, i) =>
      `<button class="tile ${t === 'x' ? 'tx' : 'tn'}" data-act="unbuild" data-k="${i}" aria-label="เอาออก" ${L.checked ? 'disabled' : ''}>${t === 'x' ? M('x') : t}</button>`).join('');
    area = `<div class="builder">
      <div class="build-bar ${L.checked ? (L.ok ? 'right' : 'wrong') : ''}">
        ${tiles ? `<div class="built">${tiles}</div>` : ''}
        ${L.checked ? '' : L.built.length ? '<span class="slot">?</span>' : '<span class="slot wide">แตะชิ้นส่วนด้านล่างเพื่อวางลงในบาร์</span>'}
      </div>
      <div class="brace-row" aria-label="รวมทั้งหมด ${q.c}"><i></i><span>${q.c}</span><i></i></div>
      <div class="palette-label">ชิ้นส่วน</div>
      <div class="palette">
        <button class="tile tx" data-act="build" data-t="x" ${L.checked ? 'disabled' : ''}>${M('x')}</button>
        ${q.palette.map((v) => `<button class="tile tn" data-act="build" data-t="${v}" ${L.checked || used(v) ? 'disabled' : ''}>${v}</button>`).join('')}
      </div></div>`;
  }
  const ready = q.type === 'choice' ? L.sel !== null : q.type === 'input' ? L.input !== '' && L.input !== '−' : q.type === 'match' ? false : L.built.length > 0;
  const answerHTML = q.type === 'choice' ? q.choices[q.answer] : q.type === 'input' ? M('x = ' + q.answer) : '';
  const foot = L.checked
    ? feedbackFoot(L.ok, L.msg, answerHTML, q.explain, 'next', L.kind === 'placement', L.note)
    : q.type === 'match'
      ? `<footer class="lesson-foot match-foot"><span>แตะ 1 ช่องในแต่ละฝั่งเพื่อจับคู่ · จับคู่แล้ว <b>${L.mDone.length} / ${q.pairs.length}</b>${L.mMiss ? ` · ผิด ${L.mMiss} ครั้ง` : ''}</span></footer>`
      : `<footer class="lesson-foot">${kbdHint(q.type)}<button class="btn primary wide" data-act="check" ${ready ? '' : 'disabled'}>ตรวจคำตอบ</button></footer>`;
  const pills = [
    L.kind === 'test' ? `<span class="pill">${icon('trophy', 16)} ด่านทดสอบ</span>` : '',
    L.kind === 'practice' ? `<span class="pill green">${icon('dumbbell', 16)} ${L.meta.review ? 'ทบทวนข้อที่ผิด' : L.meta.weak ? 'ฝึกจุดอ่อน' : 'ฝึกฝน'}</span>` : '',
    L.kind === 'legend' ? `<span class="pill dark">${icon('crown', 16)} ระดับตำนาน</span>` : '',
    L.kind === 'jump' ? `<span class="pill blue">${icon('mountain', 16)} ทดสอบข้ามบท</span>` : '',
    L.kind === 'placement' ? `<span class="pill blue">${icon('mountain', 16)} ทดสอบวัดระดับ ข้อ ${L.idx + 1}/10</span>` : '',
    q.tags.includes('bar') ? `<span class="pill blue">${icon('bar', 16)} บาร์โมเดล</span>` : '',
    q.retry ? `<span class="pill red">${icon('refresh', 16)} ทวนข้อที่ผิด</span>` : '',
    q.lvl === 2 && !q.retry && L.kind !== 'placement' ? `<span class="pill hard">${icon('mountain', 16)} โจทย์ท้าทาย +1 XP</span>` : '',
  ].join('');
  const status = usesHearts(L.kind) ? `<span class="hearts-top">${icon('heart', 22)}${S.hearts}</span>`
    : twoStrikes(L.kind) ? `<span class="hearts-top legend" aria-label="ผิดได้อีก ${Math.max(0, 2 - L.mistakes)} ข้อ">${icon('shield', 20)}${Math.max(0, 2 - L.mistakes)}</span>`
    : `<span class="hearts-top">${icon('heart', 22)}∞</span>`;
  return `<div class="lesson ${L.kind}">
    <header class="lesson-top"><button class="x" data-act="quit" aria-label="ออก">${icon('x', 22)}</button>
      <div class="progress ${L.run >= 3 ? 'hot' : ''}" role="progressbar" aria-label="ความคืบหน้า" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><div style="width:${pct}%;--from:${fromPct}%"></div></div>
      ${status}</header>
    <main class="lesson-body">
      ${pills ? `<div class="pills">${pills}</div>` : ''}
      ${L.run >= 3 && !L.checked ? `<div class="combo">${icon('flame', 18)} ถูกติดกัน ${L.run} ข้อ!</div>` : ''}
      <div class="talk">${bee(64, L.checked && L.kind !== 'placement' ? (L.ok ? 'wow' : 'sad') : 'happy')}<div class="bubble">${q.prompt}</div></div>
      ${q.visual ? `<div class="visual">${q.visual}</div>` : ''}
      ${area}
    </main>
    ${foot}
    ${sheetHTML()}
  </div>`;
}

// สถานะของโจทย์จับคู่ (ล้างใหม่ทุกข้อ)
const freshMatch = () => ({ mL: null, mR: null, mDone: [], mMiss: 0, mFlash: null });

// ช่องคำตอบตัวเลข + แป้นกด (act = ชื่อ action ของปุ่ม)
function answerPad(input, checked, ok, act, label = 'x =') {
  const lab = label.replace(/^([a-z])(?= )/, '<i class="v">$1</i>');
  return `<div class="answer-row"><span class="math">${lab}</span><div class="answer-box ${checked ? (ok ? 'right' : 'wrong') : ''}">${input ? esc(input) : '<span class="ph">?</span>'}</div></div>
    <div class="keypad">${['1', '2', '3', '4', '5', '6', '7', '8', '9', '−', '0', '⌫']
      .map((k) => `<button class="key" data-act="${act}" data-k="${k}" ${k === '⌫' ? 'aria-label="ลบ"' : k === '−' ? 'aria-label="สลับเครื่องหมายลบ"' : ''} ${checked ? 'disabled' : ''}>${k === '⌫' ? icon('backspace', 26) : k}</button>`).join('')}</div>`;
}
// คำใบ้ปุ่มลัดคีย์บอร์ด (แสดงเฉพาะจอใหญ่ที่ใช้เมาส์)
const kbdHint = (type) => `<span class="kbd-hint">${type === 'choice' ? 'กด <kbd>1</kbd>–<kbd>4</kbd> เลือกคำตอบ · ' : type === 'input' ? 'พิมพ์ตัวเลขจากคีย์บอร์ด · ' : ''}<kbd>Enter</kbd> ${type === 'line' ? 'ไปต่อ' : 'ตรวจคำตอบ'}</span>`;
// แผ่นผลตรวจคำตอบ (quiet = ไม่บอกถูกผิด ใช้กับทดสอบวัดระดับ)
function feedbackFoot(ok, msg, answerHTML, explain, act, quiet = false, note = '') {
  if (quiet) {
    return `<footer class="lesson-foot fb neutral" aria-live="polite"><div class="fb-head"><span class="fb-ic">${icon('check', 22)}</span><div><h3>บันทึกคำตอบแล้ว</h3><p>ทำข้อต่อไปได้เลย</p></div></div>
      <button class="btn primary wide" data-act="${act}">ทำต่อ</button></footer>`;
  }
  // บนจอใหญ่ แถบนี้จัดเป็นแถวเดียว: ผลตรวจ | เฉลย | ปุ่ม
  return `<footer class="lesson-foot fb ${ok ? 'ok' : 'bad'}" aria-live="polite">
    <div class="fb-head"><span class="fb-ic">${icon(ok ? 'check' : 'x', 22)}</span>
      <div><h3>${msg}</h3>${!ok && answerHTML ? `<p>คำตอบที่ถูกคือ ${answerHTML}</p>` : ''}${note ? `<p class="lvl-note">${icon(ok ? 'up' : 'down', 14)} ${note}</p>` : ''}</div>
      ${act === 'next' && typeof openFeedback === 'function' ? `<button class="fb-flag" data-act="report-q" aria-label="รายงานโจทย์ข้อนี้" title="รายงานโจทย์ข้อนี้">${icon('flag', 20)}</button>` : ''}</div>
    ${ok ? '' : `<div class="explain">${explain}</div>`}
    <div class="fb-act"><button class="btn ${ok ? 'go' : 'danger'} wide" data-act="${act}">${ok ? 'ทำต่อ' : 'เข้าใจแล้ว ไปต่อ'}</button><span class="kbd-hint">หรือกด <kbd>Enter</kbd></span>
      ${act === 'next' && typeof askChips === 'function' ? `<button class="ask-btn" data-act="ask-open">${icon('chat', 18)} ถามน้องผึ้ง</button>` : ''}</div></footer>`;
}
// แก้ข้อความในช่องตัวเลข
function editInput(cur, k) {
  if (k === '⌫') return cur.slice(0, -1);
  if (k === '−') return cur.startsWith('−') ? cur.slice(1) : '−' + cur;
  return cur.replace('−', '').length < 4 ? cur + k : cur;
}

function check() {
  const L = UI.L, q = L.queue[L.idx];
  let ok = false;
  if (q.type === 'choice') ok = L.sel === q.answer;
  else if (q.type === 'input') ok = Number(L.input.replace('−', '-')) === q.answer;
  else if (q.type === 'barbuild') {
    const xs = L.built.filter((t) => t === 'x').length;
    const nums = L.built.filter((t) => t !== 'x');
    ok = xs === q.a && nums.length === 1 && Number(nums[0]) === q.b;
  }
  else if (q.type === 'match') ok = L.mMiss < 2; // จับคู่ผิดได้ 1 ครั้ง
  else if (q.type === 'order') ok = L.built.length === q.steps.length && L.built.every((k, i) => q.palette[k] === q.steps[i]);
  L.checked = true; L.ok = ok;
  SFX.play(ok ? 'correct' : 'wrong');
  S.stats.answered++;
  const lvlChange = trackSkill(q.gen, ok);
  L.note = lvlChange > 0 ? 'เก่งมาก! โจทย์แบบนี้ข้อต่อไปจะท้าทายขึ้น' : lvlChange < 0 ? 'ข้อต่อไปจะง่ายลงหน่อย ค่อย ๆ ไปนะ' : '';
  if (ok && q.lvl === 2 && !q.retry) L.hard++;
  if (q.tags.includes('bar')) { S.stats.bar++; quest('bar'); }
  if (ok) {
    S.stats.correct++;
    if (q.tags.includes('solve')) { S.stats.solved++; quest('solve'); }
    if (!q.retry) L.firstTry++;
    if (q.pu !== undefined) L.unitOk[q.pu] = (L.unitOk[q.pu] || 0) + 1;
    L.run++;
    S.records.bestCombo = Math.max(S.records.bestCombo, L.run);
    L.msg = L.run >= 3 ? `ถูกติดกัน ${L.run} ข้อ!` : pick(PRAISE);
    // ตอบถูกติดกันทุก 5 ข้อ ได้หัวใจคืน 1 ดวง
    if (usesHearts(L.kind) && L.run % 5 === 0 && S.hearts < MAX_HEARTS) { S.hearts++; L.msg = `ถูกติดกัน ${L.run} ข้อ ได้หัวใจคืน 1 ดวง!`; }
  } else {
    L.run = 0; L.mistakes++;
    L.msg = twoStrikes(L.kind) && L.mistakes > 2 ? 'ผิดเกิน 2 ข้อแล้ว' : pick(COMFORT);
    L.wrong.push(q.gen);
    if (usesHearts(L.kind)) loseHeart();
    if ((L.kind === 'lesson' || L.kind === 'practice') && !q.retry) L.queue.push({ ...q, retry: true }); // ทวนข้อที่ผิดอีกครั้งท้ายบท
  }
  save(); render();
  // เลื่อนลงให้เห็นคำตอบของผู้เรียนเหนือแผ่นเฉลย
  if (!ok && L.kind !== 'placement') requestAnimationFrame(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));
}

function next() {
  const L = UI.L;
  if (usesHearts(L.kind) && S.hearts <= 0) return finish(false);
  if (twoStrikes(L.kind) && L.mistakes > 2) return finish(false);
  L.idx++; L.sel = null; L.input = ''; L.built = []; L.checked = false; L.note = '';
  Object.assign(L, freshMatch());
  if (L.idx >= L.queue.length) return finish(true);
  materialize(L, L.idx);
  render();
  window.scrollTo(0, 0);
}

function finish(completed) {
  const L = UI.L;
  const acc = Math.round((L.firstTry / L.total) * 100);
  const perfect = completed && L.mistakes === 0;
  const passed = completed && (L.kind !== 'test' || acc >= 70);
  let xp = 0, nectar = 0, streak = null, extra = {};
  if (L.kind === 'placement') {
    // ถูกอย่างน้อย 4 ใน 5 ข้อของบทใดถือว่าผ่านบทนั้น (ต้องผ่านบทก่อนหน้าด้วย)
    let reached = 0;
    for (let ui = 0; ui < 2 && (L.unitOk[ui] || 0) >= 4; ui++) {
      NODES.filter((n) => n.ui === ui).forEach((n) => { S.done[n.id] = true; });
      reached = ui + 1;
    }
    S.onboarded = true;
    xp = addXP(10);
    streak = learnToday();
    extra = { startUnit: reached };
  } else if (passed) {
    xp = { test: 20, lesson: 10, legend: 30, jump: 20 }[L.kind] ?? 5 + Math.floor(L.firstTry / 2);
    if (perfect && (L.kind === 'lesson' || L.kind === 'test')) xp += 5;
    extra.hardBonus = Math.min(5, L.hard); // โบนัสโจทย์ท้าทาย ข้อละ 1 XP (สูงสุด 5)
    xp = addXP(xp + extra.hardBonus);
    nectar = NECTAR[L.kind] + (perfect && L.kind !== 'practice' ? NECTAR.perfect : 0);
    S.nectar += nectar;
    if (L.kind === 'practice') S.hearts = Math.min(MAX_HEARTS, S.hearts + 1);
    else if (L.kind === 'legend') S.legend[L.meta.unit] = true;
    else if (L.kind === 'jump') NODES.filter((n) => n.ui < L.meta.unit).forEach((n) => { S.done[n.id] = true; });
    else {
      if (!S.done[NODES[L.meta.i].id]) UI.justDone = NODES[L.meta.i].id;
      S.done[NODES[L.meta.i].id] = true;
      S.stats.lessons++;
      if (L.kind === 'test') S.stats.tests++;
      if (perfect) { S.stats.perfect++; quest('perfect'); }
    }
    streak = learnToday();
  }
  const badges = checkBadges();
  save();
  SFX.play(L.kind === 'placement' || passed ? 'complete' : 'fail');
  const n = L.meta.i !== undefined ? NODES[L.meta.i] : null;
  const sub = n ? `${n.kind === 'test' ? 'ด่านทดสอบ' : n.title} · บทที่ ${n.ui + 1}`
    : L.kind === 'legend' ? 'ระดับตำนาน · ' + UNITS.find((u) => u.id === L.meta.unit).title
    : L.kind === 'jump' ? `ปลดล็อกบทที่ ${L.meta.unit + 1} · ${UNITS[L.meta.unit].title}`
    : L.meta.unitReview !== undefined ? `ทบทวนบทที่ ${L.meta.unitReview + 1}`
    : L.meta.review ? 'ทบทวนข้อที่ผิด' : L.meta.weak ? 'ฝึกจุดอ่อน' : PRACTICE.find((p) => p.id === L.meta.practice)?.title || 'ฝึกฝน';
  UI.result = { kind: L.kind, meta: L.meta, completed, passed, xp, nectar, acc, perfect, streakUp: !!streak, milestone: streak?.milestone, badges, sub, wrong: uniq(L.wrong), correct: L.firstTry, ...extra };
  UI.view = 'result'; UI.L = null;
  render();
  window.scrollTo(0, 0);
}

const HONEYCOMB = `<svg class="combs" viewBox="0 0 390 360" aria-hidden="true">
  <g fill="#FFEFC2"><polygon points="40,20 66,35 66,65 40,80 14,65 14,35"/><polygon points="350,60 376,75 376,105 350,120 324,105 324,75"/>
  <polygon points="310,0 336,15 336,45 310,60 284,45 284,15"/><polygon points="70,140 90,152 90,176 70,188 50,176 50,152"/>
  <polygon points="330,200 350,212 350,236 330,248 310,236 310,212"/></g></svg>`;

// ตัวเลขล้วน (หรือมี %) จะนับขึ้นจาก 0 ตอนเปิดหน้าผลลัพธ์
const countUp = (v) => { const m = String(v).match(/^(\+?)(\d+)(%?)$/); return m ? `${m[1]}<span class="count" data-to="${m[2]}">${m[2]}</span>${m[3]}` : v; };
const statTile = (cls, label, ic, value) => `<div class="tile-stat ${cls}"><small>${label}</small><b>${icon(ic, 20)}${countUp(value)}</b></div>`;
const sadScreen = (title, text, actions) => `<div class="result center-y">${bee(120, 'sad')}<h2>${title}</h2><p>${text}</p><div class="result-actions">${actions}</div></div>`;
// การ์ดรางวัลที่ใช้ร่วมกันในหน้าจบ: น้ำหวาน ก้าวสำคัญสตรีค ตราสัญลักษณ์ใหม่
function rewardsHTML(r) {
  let d = 0; // เลื่อนเวลาให้รางวัลโผล่ทีละชิ้น
  const delay = () => `style="--d:${0.7 + 0.25 * d++}s"`;
  return `${r.nectar ? `<span class="earn" ${delay()}>${icon('drop', 16)} +${r.nectar} น้ำหวาน</span>` : ''}
    ${r.hardBonus ? `<span class="earn hard" ${delay()}>${icon('mountain', 16)} รวมโบนัสโจทย์ท้าทาย +${r.hardBonus} XP</span>` : ''}
    ${r.milestone ? `<div class="new-badge" ${delay()}>${hex(icon('flame', 26), 'badge-hex', '--h:#FF7A1A;color:#2A1F14')}<div><small>ก้าวสำคัญ! สตรีค ${r.milestone.days} วัน</small><b>รับ ${r.milestone.nectar} น้ำหวาน${r.milestone.days === 30 ? ' + ดอกไม้ประดับ' : ''}</b></div></div>` : ''}
    ${(r.badges || []).map((b) => `<div class="new-badge" ${delay()}>${badgeHex(b, true)}<div><small>ได้ตราสัญลักษณ์ใหม่</small><b>${b.name}</b></div></div>`).join('')}`;
}
const RESULT_VIEWS = {};
function viewResult() {
  const r = UI.result;
  if (RESULT_VIEWS[r.kind]) return RESULT_VIEWS[r.kind](r);
  if (r.kind === 'placement') {
    const u = UNITS[r.startUnit];
    return `<div class="result win">${HONEYCOMB}<div class="hero hex">${bee(170, 'cheer')}</div>
      <h2>วัดระดับเสร็จแล้ว!</h2><p>เริ่มเรียนที่บทที่ ${r.startUnit + 1} · ${u.title}</p>
      <div class="tiles">${statTile('green', 'ตอบถูก', 'target', `${r.correct}/10`)}${statTile('gold', 'XP ที่ได้', 'bolt', r.xp)}</div>
      <div class="result-actions"><button class="btn primary wide" data-act="tab" data-v="learn">เริ่มเรียน</button></div></div>`;
  }
  if (!r.completed && r.kind === 'jump') {
    return sadScreen('ยังข้ามบทไม่ได้', 'ผิดเกิน 2 ข้อ ไม่เป็นไร! เรียนตามเส้นทางไปก่อน หรือลองทดสอบอีกครั้ง',
      `<button class="btn primary wide" data-act="jump-start" data-u="${r.meta.unit}">ลองอีกครั้ง</button><button class="btn link wide" data-act="tab" data-v="learn">กลับหน้าหลัก</button>`);
  }
  if (!r.completed && r.kind === 'legend') {
    return sadScreen('ยังไม่ถึงระดับตำนาน', 'ผิดเกิน 2 ข้อ ทบทวนอีกนิดแล้วลองใหม่ได้เสมอ',
      `<button class="btn primary wide" data-act="legend-start" data-u="${r.meta.unit}">ลองอีกครั้ง</button><button class="btn link wide" data-act="tab" data-v="practice">กลับศูนย์ฝึกฝน</button>`);
  }
  if (!r.completed) {
    return sadScreen('หัวใจหมดแล้ว', 'ไม่เป็นไร! ฝึกฝนเพิ่มอีกนิดแล้วกลับมาลองใหม่นะ',
      `<button class="btn primary wide" data-act="tab" data-v="practice">ไปฝึกฝน (รับหัวใจคืน)</button><button class="btn link wide" data-act="tab" data-v="learn">กลับหน้าหลัก</button>`);
  }
  if (!r.passed) {
    return sadScreen('ยังไม่ผ่านด่าน', `ความแม่นยำ ${r.acc}% ต้องได้ 70% ขึ้นไป ลองทบทวนบทเรียนแล้วสู้ใหม่!`,
      `<button class="btn primary wide" data-act="start" data-i="${r.meta.i}">ลองอีกครั้ง</button>
      ${r.wrong.length ? '<button class="btn ghost wide" data-act="review">ทบทวนข้อที่ผิด</button>' : ''}
      <button class="btn link wide" data-act="tab" data-v="learn">กลับหน้าหลัก</button>`);
  }
  const title = { test: 'ผ่านด่านทดสอบแล้ว!', practice: 'ฝึกฝนเสร็จแล้ว!', legend: 'ถึงระดับตำนานแล้ว!', jump: 'ข้ามบทสำเร็จ!' }[r.kind] || 'จบบทเรียนแล้ว!';
  const nextTab = (r.kind === 'practice' && r.meta.unitReview === undefined) || r.kind === 'legend' ? 'practice' : 'learn';
  return `<div class="result win">${HONEYCOMB}${confetti()}
    <div class="hero hex">${bee(170, 'cheer')}</div>
    <h2>${title}</h2><p>${esc(r.sub)}</p>
    <div class="tiles">
      ${statTile('gold', 'XP ที่ได้', 'bolt', r.xp)}
      ${statTile('green', r.perfect ? 'ไร้ที่ติ!' : 'แม่นยำ', 'target', r.acc + '%')}
      ${statTile('orange', 'สตรีค', 'flame', S.streak)}
      ${r.kind === 'practice' ? statTile('red', 'หัวใจ', 'heart', '+1') : ''}
    </div>
    ${rewardsHTML(r)}
    <div class="result-actions"><button class="btn primary wide" data-act="tab" data-v="${nextTab}">ไปต่อ</button>
      ${r.wrong.length ? '<button class="btn link wide" data-act="review">ทบทวนข้อที่ผิด</button>' : ''}</div>
  </div>`;
}
function confetti() {
  const colors = ['#FFC21A', '#58C23A', '#2F6FED', '#FF7A1A', '#F0484E'];
  return `<div class="confetti" aria-hidden="true">${Array.from({ length: 36 }, (_, i) =>
    `<i style="left:${Math.random() * 100}%;background:${colors[i % 5]};animation-delay:${Math.random() * 0.8}s;animation-duration:${2 + Math.random() * 1.5}s"></i>`).join('')}</div>`;
}

// ---------- leaderboard (ลีก 5 ระดับ ผู้เล่นอื่นเป็นผู้เล่นจำลอง) ----------
const BOTS = ['ฟ้าใส', 'ภูผา', 'มะปราง', 'ต้นกล้า', 'ใบเตย', 'ข้าวหอม', 'ก้อนเมฆ', 'น้ำตาล', 'พายุ', 'ขนุน', 'ปลายฟ้า', 'ดาวเหนือ', 'น้ำฝน', 'ภูมิ', 'แพรวา', 'กันต์', 'ปุยฝ้าย', 'ตะวัน', 'มิว'];
const BOT_COLORS = [['#DDF1FF', '#1E4FB8'], ['#FFE3D1', '#A24400'], ['#E8F8E0', '#2B7A1A'], ['#F1E6FF', '#5B2EA6'], ['#FFF0C2', '#7A4E00'], ['#FFE5E5', '#A3262B']];
const initial = (name) => [...name].find((ch) => !'เแโใไ'.includes(ch)) || name[0];
function hash(s) { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
// XP ของผู้เล่นจำลองเพิ่มตามเวลาในสัปดาห์ และเก่งขึ้นในลีกที่สูงขึ้น
function botXP(name, wk = S.week.key, elapsed = null) {
  if (elapsed === null) { const now = new Date(); elapsed = (((now.getDay() + 6) % 7) + now.getHours() / 24) / 7; }
  return Math.round((30 + (hash(wk + name) % 420)) * (1 + 0.3 * S.league.tier) * Math.min(1, 0.08 + elapsed));
}
// ลีกจริง (ล็อกอินและซิงก์แล้ว) — ดู league_sync ใน supabase/league.sql และ leagueSync() ใน js/cloud.js
const realLeague = () => (typeof Cloud !== 'undefined' && Cloud.user && Cloud.league) || null;
// เขตเลื่อน/ตกลีก: ลีกจริงคิดตามขนาดกลุ่ม (25% แรกเลื่อน · 3 อันดับท้ายตกเมื่อกลุ่ม ≥ 10 คน) ลีกจำลองใช้ค่าคงที่
const leagueZones = (n) => realLeague() ? { up: Math.max(1, Math.round(n * 0.25)), down: n >= 10 ? n - 2 : Infinity } : { up: PROMOTE_TOP, down: DEMOTE_FROM };
function leagueRows(wk = S.week.key, elapsed = null) {
  const real = realLeague();
  if (real && arguments.length === 0) {
    const members = real.members.some((m) => m.me) ? real.members : [...real.members, { name: S.name, avatar: S.avatar, xp: 0, me: true }];
    return members.map((m) => ({ n: m.me ? S.name : m.name, c: [m.avatar, '#2A1F14'], xp: m.me ? Math.max(m.xp, S.week.xp) : m.xp, me: m.me, real: true }))
      .sort((p, q) => q.xp - p.xp || (q.me ? 1 : -1))
      .map((r, i) => ({ ...r, rank: i + 1 }));
  }
  return [...BOTS.map((n, i) => ({ n, c: BOT_COLORS[i % BOT_COLORS.length], xp: botXP(n, wk, elapsed) })), { n: S.name, xp: S.week.xp, me: true }]
    .sort((p, q) => q.xp - p.xp || (q.me ? 1 : -1))
    .map((r, i) => ({ ...r, rank: i + 1 }));
}
// จบสัปดาห์: เลื่อนขึ้น/ตกลีกตามอันดับ
function settleLeague() {
  if (!S.week.xp && !S.lastDay) return; // ยังไม่เคยเรียน ไม่ต้องคิดอันดับ
  const rank = leagueRows(S.week.key, 1).find((r) => r.me).rank;
  const from = S.league.tier;
  let to = from;
  if (rank <= PROMOTE_TOP && from < TIERS.length - 1) to++;
  else if (rank >= DEMOTE_FROM && from > 0) to--;
  S.league.tier = to;
  S.leagueResult = { from, to, rank };
}
const rowHTML = (r, z = leagueZones(20)) => `<li class="${r.me ? 'me' : ''} ${r.rank <= z.up && r.xp > 0 ? 'promo' : r.rank >= z.down ? 'demo' : ''}">
  <span class="rank r${r.rank}">${r.rank}</span>
  <span class="av" style="${r.me ? 'background:#FFC21A' : `background:${r.c[0]};color:${r.c[1]}`}">${r.me ? 'คุณ' : initial(r.n)}</span>
  <span class="nm">${esc(r.n)}${r.me ? ' (คุณ)' : ''}</span><span class="pts">${r.xp} XP</span></li>`;
function tierRow() {
  return `<div class="tiers" role="list" aria-label="ระดับลีก">${TIERS.map((t, i) => {
    const st = i === S.league.tier ? 'cur' : i < S.league.tier ? 'past' : 'next';
    return `<div class="tier ${st}" role="listitem">${hex(icon(st === 'next' ? 'lock' : t.icon, 22), 'tier-hex', st === 'next' ? '' : tint(t))}<span>${t.name}</span></div>`;
  }).join('')}</div>`;
}
function weekLeft() {
  const end = new Date(); end.setHours(0, 0, 0, 0); end.setDate(end.getDate() + (7 - ((end.getDay() + 6) % 7)));
  const h = Math.ceil((end - new Date()) / 3600000);
  return h >= 24 ? `${Math.floor(h / 24)} วัน ${h % 24} ชม.` : `${h} ชม.`;
}
function viewBoard() {
  if (typeof leagueRefresh === 'function') leagueRefresh(); // ดึงอันดับล่าสุดของเพื่อนในกลุ่ม
  const rows = leagueRows(), n = rows.length, z = leagueZones(n), real = realLeague();
  const t = S.league.tier, top = t === TIERS.length - 1;
  let list = '';
  rows.forEach((r) => {
    list += rowHTML(r, z);
    if (r.rank === z.up && !top && n > z.up) list += `<li class="zone up">${icon('up', 14)} เขตเลื่อนลีก</li>`;
    if (r.rank === z.down - 1 && t > 0) list += `<li class="zone down">${icon('down', 14)} เขตตกลีก</li>`;
  });
  const rules = `${top ? 'ลีกสูงสุดแล้ว' : `${z.up} อันดับแรกเลื่อนขึ้น`}${t > 0 && z.down <= n ? ` · อันดับ ${z.down}–${n} ตกลีก` : ''}`;
  return shell(`${tierRow()}
    <h1 class="page-title center">ลีก${TIERS[t].name}</h1>
    <p class="muted center">${icon('clock', 15)} เหลือ ${weekLeft()} · ${real ? `${n} คนในกลุ่มนี้` : 'กลุ่มละ 20 คน'} · ${rules}</p>
    <ol class="board">${list}</ol>
    ${real
      ? `<p class="muted small center">ผู้เล่นจริงในลีกเดียวกัน · อัปเดตทุกครั้งที่ซิงก์${n < 5 ? ' · ชวนเพื่อนมาสมัครเพื่อแข่งกันสนุกขึ้น!' : ''}</p>`
      : `<p class="muted small center">ผู้เล่นอื่นเป็นผู้เล่นจำลอง${typeof Cloud !== 'undefined' && Cloud.enabled() ? ' · <button class="linkbtn" data-act="go" data-v="account">เข้าสู่ระบบเพื่อแข่งกับผู้เล่นจริง</button>' : ''}</p>`}`);
}

// ---------- quests ----------
function viewQuests() {
  const end = new Date(); end.setHours(24, 0, 0, 0);
  const hrs = Math.ceil((end - new Date()) / 3600000);
  const rows = leagueRows();
  const me = rows.find((r) => r.me);
  const preview = me.rank <= 4 ? rows.slice(0, 4) : [...rows.slice(0, 3), me];
  const mp = Math.min(MONTH_GOAL, S.month.points);
  return shell(`<h1 class="page-title">ภารกิจประจำวัน</h1>
    <p class="muted">${icon('clock', 15)} รีเซ็ตในอีก ${hrs} ชั่วโมง · รับรางวัลแต่ละข้อได้ ${NECTAR.quest} น้ำหวาน และ 1 แต้มประจำเดือน</p>
    <div class="quest-card">${QUESTS.map((q) => {
      const v = Math.min(q.goal, S.quests.p[q.id] || 0), done = v >= q.goal, claimed = S.quests.claimed[q.id];
      return `<div class="quest ${done ? 'done' : ''}">${hex(icon(q.icon, 22), 'ico', tint(q))}
        <div class="q-main"><b>${q.title}</b>
          <div class="meter labeled" style="--m:${q.color}"><div style="width:${(v / q.goal) * 100}%"></div><span>${v} / ${q.goal}</span></div></div>
        ${claimed ? `<span class="claimed">${icon('check', 16)} รับแล้ว</span>`
          : done ? `<button class="btn small primary" data-act="claim" data-id="${q.id}">รับ +${q.reward}</button>`
          : `<span class="reward">+${q.reward} XP</span>`}
      </div>`;
    }).join('')}</div>
    <button class="month-card" data-act="go" data-v="achievements">
      ${hex(icon('sun', 22), 'ico', S.monthBadges[S.month.key] ? '--h:#FFC21A;color:#2A1F14' : '--h:#4A3D2E;color:#FFD84D')}
      <span class="q-main"><b>ภารกิจประจำเดือน: สะสม ${MONTH_GOAL} แต้ม</b>
        <span class="meter labeled"><span class="fill" style="width:${(mp / MONTH_GOAL) * 100}%"></span><span>${mp} / ${MONTH_GOAL}</span></span></span>
      ${icon('chevron', 20)}
    </button>
    <div class="league-head"><h2>ลีก${TIERS[S.league.tier].name}</h2><button class="linkbtn" data-act="tab" data-v="board">ดูทั้งหมด</button></div>
    <ol class="board">${preview.map((r) => rowHTML(r, leagueZones(rows.length))).join('')}</ol>`);
}

// ---------- profile ----------
const PROFILE_PATTERN = `<svg class="pattern" viewBox="0 0 390 150" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><g fill="none" stroke="#F0AE00" stroke-width="3">
  <polygon points="30,10 56,25 56,55 30,70 4,55 4,25"/><polygon points="82,40 108,55 108,85 82,100 56,85 56,55"/>
  <polygon points="300,20 326,35 326,65 300,80 274,65 274,35"/><polygon points="352,50 378,65 378,95 352,110 326,95 326,65"/>
  <polygon points="352,-10 378,5 378,35 352,50 326,35 326,5"/></g></svg>`;
function viewProfile() {
  const lv = levelInfo(S.xp);
  const got = BADGES.filter((b) => S.badges[b.id]).length;
  const unitProg = UNITS.map((u, ui) => {
    const ns = NODES.filter((n) => n.ui === ui), d = ns.filter((n) => S.done[n.id]).length;
    return `<div class="uprog"><div class="uprog-row"><span>${u.title}${S.legend[u.id] ? ' · ระดับตำนาน' : ''}</span><span>${d}/${ns.length}</span></div>
      <div class="meter" style="--m:${u.color}"><div style="width:${(d / ns.length) * 100}%"></div></div></div>`;
  }).join('');
  return shell(`<div class="profile-hero">${PROFILE_PATTERN}
      <button class="gear" data-act="settings" aria-label="ตั้งค่า">${icon('gear', 22)}</button>
      <button class="avatar-hex hex" data-act="pick-avatar" aria-label="เปลี่ยนสีกรอบอวตาร">${hex(bee(84), 'inner', `background:${S.avatar}`)}</button>
    </div>
    <div class="profile-id">
      <input class="name-input" id="name" value="${esc(S.name)}" maxlength="20" aria-label="ชื่อ">
      ${S.joined ? `<span class="joined">เริ่มเรียนเมื่อ ${thaiDate(S.joined)}</span>` : ''}
    </div>
    <div class="quick-links">
      <button data-act="go" data-v="streak">${icon('flame', 22)}สตรีค</button>
      <button data-act="go" data-v="achievements">${icon('medal', 22)}ความสำเร็จ</button>
      <button data-act="go" data-v="friends" class="ql-friends">${icon('users', 22)}เพื่อน${friendDot() ? '<i class="dot" aria-label="มีเรื่องรอดู"></i>' : ''}</button>
      <button data-act="go" data-v="shop">${icon('shop', 22)}ร้านค้า</button>
    </div>
    <div class="level-card card">${hex(lv.lvl, 'lv')}
      <div class="lv-main"><div class="lv-row"><span>เลเวล ${lv.lvl}</span><span>${lv.cur} / ${lv.need} XP</span></div>
        <div class="meter"><div style="width:${(lv.cur / lv.need) * 100}%"></div></div></div></div>
    <div class="stats">
      <div class="stat">${icon('flame', 26)}<div><b>${S.streak}</b><small>วันต่อเนื่อง</small></div></div>
      <div class="stat">${icon('bolt', 26)}<div><b>${num(S.xp)}</b><small>XP ทั้งหมด</small></div></div>
      <div class="stat">${icon('check', 26)}<div><b>${Object.keys(S.done).length} / ${NODES.length}</b><small>ด่านที่ผ่าน</small></div></div>
      <div class="stat">${icon('drop', 26)}<div><b>${num(S.nectar)}</b><small>น้ำหวาน</small></div></div>
    </div>
    <div class="sec-row"><h3>ความก้าวหน้า</h3></div>${unitProg}
    <div class="sec-row"><h3>ตราสัญลักษณ์</h3><span>${got} / ${BADGES.length}</span></div>
    <div class="badges">${BADGES.map((b) => `<button class="badge ${S.badges[b.id] ? 'got' : ''}" data-act="badge" data-id="${b.id}">${badgeHex(b, S.badges[b.id])}<span>${b.name}</span></button>`).join('')}</div>`, { top: false });
}

// ---------- render & actions ----------
const VIEWS = { learn: viewLearn, board: viewBoard, quests: viewQuests, profile: viewProfile, lesson: viewLesson, cards: viewCards, result: viewResult };
const SUBPAGES = ['streak', 'shop', 'achievements', 'settings'];
// ชื่อ "ฉาก" ปัจจุบัน: เปลี่ยนเมื่อไปหน้าใหม่หรือข้อใหม่ ใช้ตัดสินว่าจะเล่นแอนิเมชันตอนเข้าหรือไม่
function sceneKey() {
  if (UI.view === 'lesson' && UI.L) return 'lesson:' + UI.L.uid + ':' + UI.L.idx;
  if (UI.view === 'story' && UI.st) return 'story:' + UI.st.id + ':' + UI.st.step;
  if (UI.view === 'timed' && UI.T) return 'timed:' + UI.T.n;
  if (UI.view === 'cards' && UI.cards) return 'cards:' + UI.cards.i + ':' + UI.cards.k;
  if (UI.view === 'onboarding') return 'ob:' + UI.ob?.step;
  return UI.view;
}
const reduceMotion = () => S.settings.reduceMotion || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
// นับตัวเลขขึ้นจาก 0 (ใช้ในหน้าผลลัพธ์)
function runCounters() {
  const els = [...document.querySelectorAll('.count[data-to]')];
  if (!els.length || reduceMotion()) return;
  const t0 = performance.now(), dur = 900;
  const step = (t) => {
    const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
    els.forEach((el) => { el.textContent = Math.round(+el.dataset.to * e); });
    if (p < 1) requestAnimationFrame(step);
  };
  els.forEach((el) => { el.textContent = '0'; });
  requestAnimationFrame(step);
}
function render() {
  // อัปเดตเวอร์ชันที่รอไว้ (js/main.js): โหลดใหม่เมื่อออกจากบทเรียน/เกมแล้ว
  if (UI.updateReady && !['lesson', 'timed', 'story', 'cards'].includes(UI.view) && !UI.sheet) return location.reload();
  tick();
  beeId = 0;
  if (!S.onboarded && !['onboarding', 'lesson', 'result', 'account'].includes(UI.view)) UI.view = 'onboarding';
  if (S.leagueResult && UI.view === 'learn' && !UI.sheet) {
    UI.sheet = { type: 'league' };
    SFX.play(S.leagueResult.to > S.leagueResult.from ? 'levelup' : 'tap');
  }
  // การตั้งค่าการแสดงผล: ลดการเคลื่อนไหว และขนาดตัวอักษร
  const root = document.documentElement;
  root.classList.toggle('reduce-motion', !!S.settings.reduceMotion);
  root.classList.toggle('text-l', S.settings.textSize === 'l');
  root.classList.toggle('text-xl', S.settings.textSize === 'xl');
  const chips = { streak: S.streak, nectar: S.nectar, hearts: S.hearts };
  UI.bump = UI.lastChips ? Object.fromEntries(Object.keys(chips).map((k) => [k, chips[k] > UI.lastChips[k]])) : {};
  const key = sceneKey(), enter = key !== UI.lastScene;
  UI.lastScene = key;
  const app = document.getElementById('app');
  app.innerHTML = VIEWS[UI.view]() + (UI.toast ? `<div class="toast" role="status">${UI.toast}</div>` : '');
  app.className = 'view-' + UI.view;
  app.toggleAttribute('data-enter', enter);
  if (app.querySelector('.chip')) UI.lastChips = chips; // จำค่าเฉพาะตอนที่ชิปแสดงอยู่ เพื่อให้เด้งเมื่อกลับมาหน้าหลัก
  if (UI.view === 'learn') UI.justDone = null;
  if (enter && UI.view === 'result') runCounters();
}

function openNode(i) {
  const n = NODES[i];
  if (!isUnlocked(i)) return;
  if (S.hearts <= 0) { UI.sheet = { type: 'nohearts' }; return render(); }
  if (n.kind === 'lesson' && !S.done[n.id]) { UI.cards = { i, k: 0 }; UI.view = 'cards'; UI.sheet = null; return render(); }
  startSession(n.kind, n.gens, { i });
}

const ACT = {
  tab: (d) => { UI.view = d.v; UI.sheet = null; render(); if (d.v === 'learn') scrollToCurrent(); else window.scrollTo(0, 0); },
  // เปิดหน้าจอย่อย และจำหน้าที่มาไว้สำหรับปุ่มย้อนกลับ
  go: (d) => { if (!SUBPAGES.includes(UI.view)) UI.back = UI.view; UI.view = d.v; UI.sheet = null; render(); window.scrollTo(0, 0); },
  back: () => { UI.view = UI.back || 'learn'; render(); window.scrollTo(0, 0); },
  node: (d) => { UI.sheet = { type: 'node', i: +d.i }; render(); },
  close: () => { UI.sheet = null; render(); },
  'close-bg': (d, el, e) => { if (e.target === el && UI.sheet?.type !== 'consent') (UI.sheet?.type === 'league' ? ACT['league-ok'] : ACT.close)(); },
  start: (d) => openNode(+d.i),
  cards: (d) => { UI.cards = { i: +d.i, k: 0 }; UI.view = 'cards'; UI.sheet = null; render(); },
  'cards-next': () => { UI.cards.k++; render(); },
  'cards-go': () => { const i = UI.cards.i; if (S.hearts <= 0) { UI.view = 'learn'; UI.sheet = { type: 'nohearts' }; return render(); } startSession(NODES[i].kind, NODES[i].gens, { i }); },
  review: () => startSession('practice', UI.result.wrong, { review: true }),
  opt: (d) => { SFX.play('tap'); UI.L.sel = +d.k; render(); },
  key: (d) => { SFX.play('tap'); UI.L.input = editInput(UI.L.input, d.k); render(); },
  build: (d) => { SFX.play('tap'); UI.L.built.push(d.t); render(); },
  unbuild: (d) => { SFX.play('tap'); UI.L.built.splice(+d.k, 1); render(); },
  // จับคู่: เลือกฝั่งละ 1 ช่อง ถ้าตรงกันจะล็อกเป็นสีเขียว ครบทุกคู่แล้วตรวจอัตโนมัติ
  'm-pick': (d) => {
    const L = UI.L, q = L.queue[L.idx], id = +d.id;
    L.mFlash = null;
    if (d.side === 'l') L.mL = L.mL === id ? null : id; else L.mR = L.mR === id ? null : id;
    if (L.mL !== null && L.mR !== null) {
      if (L.mL === L.mR) { L.mDone.push(L.mL); SFX.play('reward'); }
      else { L.mMiss++; L.mFlash = { l: L.mL, r: L.mR }; SFX.play('wrong'); }
      L.mL = L.mR = null;
    } else SFX.play('tap');
    if (L.mDone.length === q.pairs.length) return check();
    render();
  },
  'o-add': (d) => { SFX.play('tap'); UI.L.built.push(+d.k); render(); },
  'o-remove': (d) => { SFX.play('tap'); UI.L.built.splice(+d.k, 1); render(); },
  chest: (d) => {
    if (S.chests[d.id]) return;
    S.chests[d.id] = true;
    const nectar = R(15, 30), boost = Math.random() < 0.25 && !boostLeft();
    S.nectar += nectar;
    if (boost) S.boostUntil = Date.now() + BOOST_MS;
    save();
    SFX.play('levelup');
    UI.sheet = { type: 'chest', nectar, boost };
    render();
  },
  'unit-review': (d) => {
    const ui = +d.u, weak = unitWeak(ui);
    const gens = uniq((weak.length ? weak : NODES.filter((n) => n.ui === ui && n.kind === 'lesson')).flatMap((n) => n.gens));
    startSession('practice', gens, { unitReview: ui });
  },
  'jump-sheet': (d) => { UI.sheet = { type: 'jump', u: +d.u }; render(); },
  'jump-start': (d) => {
    const target = +d.u, first = UNITS.findIndex((u, ui) => !unitDone(ui));
    const gens = uniq(UNITS.slice(first, target).flatMap((u) => u.lessons.flatMap((l) => l.gens)));
    startSession('jump', gens, { unit: target }, 10);
  },
  check: () => check(),
  next: () => next(),
  quit: () => { UI.sheet = { type: 'quit' }; render(); },
  'quit-yes': () => {
    const k = UI.L?.kind, fromPath = UI.L?.meta.unitReview !== undefined;
    UI.L = null; UI.sheet = null;
    UI.view = k === 'placement' ? 'onboarding' : (k === 'practice' && !fromPath) || k === 'legend' ? 'practice' : 'learn';
    render(); scrollToCurrent();
  },
  claim: (d) => {
    const q = QUESTS.find((x) => x.id === d.id);
    S.quests.claimed[q.id] = true; S.xp += q.reward; S.week.xp += q.reward; S.nectar += NECTAR.quest;
    S.month.points++;
    const monthDone = S.month.points >= MONTH_GOAL && !S.monthBadges[S.month.key];
    if (monthDone) S.monthBadges[S.month.key] = true;
    checkBadges(); save();
    SFX.play(monthDone ? 'levelup' : 'reward');
    showToast(monthDone ? 'ได้เหรียญประจำเดือนแล้ว!' : `+${q.reward} XP · +${NECTAR.quest} น้ำหวาน`);
  },
  settings: () => ACT.go({ v: 'settings' }),
  badge: (d) => { UI.sheet = { type: 'badge', id: d.id }; render(); },
  'league-ok': () => { if (S.leagueResult?.week) S.leagueSeen[S.leagueResult.week] = true; S.leagueResult = null; UI.sheet = null; save(); render(); },
  'pick-avatar': () => { UI.sheet = { type: 'avatar' }; render(); },
  avatar: (d) => { S.avatar = d.a; UI.sheet = null; save(); render(); },
  reset: () => { UI.sheet = { type: 'reset' }; render(); },
  'reset-yes': () => { S = defaultState(); save(); UI.sheet = null; UI.ob = null; UI.view = 'onboarding'; render(); },
};

function scrollToCurrent() {
  requestAnimationFrame(() => {
    const el = document.querySelector('.node.current');
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
}
