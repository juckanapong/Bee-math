/* BeeMath — หน้าจอเสริม: เริ่มต้นใช้งาน สตรีค ร้านค้า ศูนย์ฝึกฝน เกมผึ้งเร่งรีบ เรื่องเล่าโจทย์ ความสำเร็จ
   ใช้สถานะ S / UI และฟังก์ชันจาก js/app.js */

// ---------- เริ่มต้นใช้งาน (เป้าหมาย + วัดระดับ) ----------
function viewOnboarding() {
  const o = UI.ob || (UI.ob = { step: 'welcome', goal: S.goal, remind: S.remind.on, level: 'basic' });
  // หน้าต้อนรับ: คนที่เพิ่งเปิดลิงก์ครั้งแรกรู้ทันทีว่าเว็บนี้คืออะไร ช่วยใคร แล้วค่อยเลือกเป้าหมาย
  if (o.step === 'welcome') {
    const signIn = typeof Cloud !== 'undefined' && Cloud.enabled() && !Cloud.user;
    return `<div class="lesson onboarding welcome">
      <main class="lesson-body welcome-body">
        <div class="welcome-hero hex">${bee(150, 'cheer')}</div>
        <h1 class="welcome-title">Bee<em>Math</em></h1>
        <p class="welcome-lead">ฝึกแก้สมการตัวแปรเดียวด้วย<span class="nowrap">บาร์โมเดล</span> ทีละนิดทุกวันกับน้องผึ้ง</p>
        <ul class="welcome-points">
          <li>${hex(icon('clock', 20), 'ico small', '--h:var(--honey);color:var(--ink)')}<span>วันละ 5–10 นาที เล่นเป็นด่านเหมือนเกม</span></li>
          <li>${hex(icon('cap', 20), 'ico small', '--h:var(--green);color:var(--green-ink)')}<span>สำหรับนักเรียน ม.ต้น และทุกคนที่อยากเก่งสมการ</span></li>
          <li>${hex(icon('heart', 20), 'ico small', '--h:var(--blue);color:#fff')}<span>ฟรี ไม่ต้องสมัครก็เริ่มเรียนได้เลย</span></li>
        </ul>
      </main>
      <footer class="lesson-foot welcome-foot">
        <button class="btn primary wide" data-act="ob-start">เริ่มเลย</button>
        ${signIn ? '<button class="btn link wide" data-act="go" data-v="account">มีบัญชีอยู่แล้ว? เข้าสู่ระบบ</button>' : ''}
      </footer>
    </div>${sheetHTML()}`;
  }
  const isGoal = o.step === 'goal';
  const body = isGoal
    ? `<div class="talk">${bee(72)}<div class="bubble">อยากฝึกวันละเท่าไหร่ดี? เปลี่ยนทีหลังได้เสมอนะ</div></div>
      <div class="choice-list" role="radiogroup" aria-label="เป้าหมายรายวัน">${GOALS.map(([xp, name, time]) =>
        `<button class="pick ${o.goal === xp ? 'sel' : ''}" role="radio" aria-checked="${o.goal === xp}" data-act="ob-goal" data-g="${xp}">
          <b>${name}</b><span>${xp} XP · ${time}</span></button>`).join('')}</div>
      <div class="setting-row card">
        <span class="goal-ic">${icon('bell', 22)}</span>
        <span class="setting-main"><b>เตือนให้มาเรียน</b><small>ทุกวัน เวลา ${S.remind.time} น. (เปลี่ยนได้ในตั้งค่า)</small></span>
        ${switchHTML('ob-remind', o.remind, 'เปิดการเตือน')}
      </div>
      ${typeof Cloud !== 'undefined' && Cloud.user
        ? `<p class="acct-msg ok ob-signed">${icon('check', 16)} เข้าสู่ระบบเป็น <b>${esc(acctLabel())}</b> แล้ว ความคืบหน้าจะบันทึกลงบัญชีนี้</p>`
        : `${typeof Cloud !== 'undefined' && Cloud.enabled() ? '<button class="btn link" data-act="go" data-v="account">มีบัญชีอยู่แล้ว? เข้าสู่ระบบ</button>' : ''}
      <p class="muted small center">ไม่ต้องสมัครก็เรียนได้ ความคืบหน้าจะเก็บไว้ในเครื่องนี้ <a class="pp-link" href="privacy.html" target="_blank" rel="noopener">อ่านนโยบายความเป็นส่วนตัว</a></p>`}`
    : `<h1 class="ob-title">เคยเรียนสมการมาก่อนไหม?</h1>
      <p class="muted">เลือกจุดเริ่มต้นที่เหมาะกับตัวเอง</p>
      <button class="big-pick ${o.level === 'basic' ? 'sel' : ''}" data-act="ob-level" data-l="basic">
        ${hex(icon('flag', 26), 'ico big', '--h:var(--green);color:var(--green-ink)')}
        <span><b>เริ่มจากพื้นฐาน</b><small>เริ่มที่บทที่ 1 รู้จักสมการตัวแปรเดียว</small></span></button>
      <button class="big-pick ${o.level === 'test' ? 'sel' : ''}" data-act="ob-level" data-l="test">
        ${hex(icon('mountain', 26), 'ico big', '--h:var(--blue);color:var(--card)')}
        <span><b>ทดสอบวัดระดับ</b><small>ตอบ 10 ข้อ ราว 5 นาที ข้ามไปได้ถึงบทที่ 3</small></span></button>
      <div class="note">${icon('sun', 20)}<p>ทดสอบวัดระดับไม่ใช้หัวใจ ถ้าตอบผิดหลายข้อจะเริ่มที่บทที่ 1 ตามปกติ</p></div>`;
  const cta = isGoal ? 'ต่อไป' : o.level === 'test' ? 'เริ่มทดสอบวัดระดับ' : 'เริ่มบทที่ 1';
  return `<div class="lesson onboarding">
    <header class="lesson-top">
      ${isGoal ? '<span class="x"></span>' : `<button class="x" data-act="ob-back" aria-label="ย้อนกลับ">${icon('back', 22)}</button>`}
      <div class="progress" role="progressbar" aria-label="ขั้นตอนเริ่มต้น" aria-valuenow="${isGoal ? 50 : 100}" aria-valuemin="0" aria-valuemax="100"><div style="width:${isGoal ? 50 : 100}%"></div></div>
      <span class="step-label">${isGoal ? '1/2' : '2/2'}</span></header>
    <main class="lesson-body">${body}</main>
    <footer class="lesson-foot"><button class="btn primary wide" data-act="ob-next">${cta}</button></footer>
  </div>${sheetHTML()}`;
}
// ทดสอบวัดระดับ: 5 ข้อจากบทที่ 1 แล้ว 5 ข้อจากบทที่ 2 (ถูก 4/5 ถือว่าผ่านบทนั้น)
function startPlacement() {
  const gens = [], units = [];
  [0, 1].forEach((ui) => {
    const pool = shuffle(uniq(UNITS[ui].lessons.flatMap((l) => l.gens)));
    for (let i = 0; i < 5; i++) { gens.push(pool[i % pool.length]); units.push(ui); }
  });
  startSession('placement', gens, { units }, 10, true);
}
// ขอสิทธิ์แจ้งเตือน แล้วสมัครรับ Push จากเซิร์ฟเวอร์ (ถ้าเข้าสู่ระบบอยู่ · js/cloud.js)
async function requestNotify() {
  if (S.remind.on && 'Notification' in window && Notification.permission === 'default') await Notification.requestPermission();
  if (typeof pushSync === 'function') await pushSync(); // ปิดการเตือน = ยกเลิก Push ของเครื่องนี้ด้วย
  render();
}
// เตือนให้มาเรียนตอนเปิดแอปค้างไว้ · ถ้ารับ Push จากเซิร์ฟเวอร์อยู่แล้ว ใช้แค่ข้อความในแอป (ไม่ให้แจ้งเตือนซ้ำ)
function remindCheck() {
  if (!S.remind.on || S.lastDay === today() || S.remindedDay === today()) return;
  const now = new Date();
  if (`${pad(now.getHours())}:${pad(now.getMinutes())}` < S.remind.time) return;
  S.remindedDay = today(); save();
  const body = S.streak ? `เรียนวันนี้เพื่อรักษาสตรีค ${S.streak} วันไว้นะ!` : 'มาฝึกแก้สมการกับน้องผึ้งกันเถอะ!';
  if ('Notification' in window && Notification.permission === 'granted' && !(typeof Push !== 'undefined' && Push.on)) new Notification('BeeMath', { body });
  else showToast(body);
}

// คำอธิบายใต้ตั้งค่าการเตือน: บอกว่าจะได้แจ้งเตือนแบบไหน และต้องทำอะไรเพิ่ม
function remindNote() {
  if (!S.remind.on) return 'ปิดอยู่';
  const cloud = typeof Cloud !== 'undefined' && Cloud.enabled();
  if (!cloud || typeof pushSupported !== 'function' || !pushSupported() || !flag('push')) return 'ทำงานเมื่อเปิดแอปค้างไว้ในเบราว์เซอร์';
  if (iosNeedsInstall()) return 'บน iPhone/iPad ให้เพิ่มแอปลงหน้าจอโฮมก่อน จึงจะเตือนตอนปิดแอปได้';
  if (!Cloud.user) return 'เข้าสู่ระบบเพื่อรับแจ้งเตือนแม้ปิดแอป';
  if (Notification.permission === 'denied') return 'เบราว์เซอร์บล็อกการแจ้งเตือนไว้ เปิดได้ที่การตั้งค่าของเบราว์เซอร์';
  if (Push.on) return `น้องผึ้งจะเตือนวันละครั้งในวันที่ยังไม่ได้เรียน แม้ปิดแอปอยู่${pushTime() !== S.remind.time ? ` (จะเตือนเวลา ${pushTime()} น.)` : ''}`;
  return 'กำลังเปิดการแจ้งเตือน…';
}

// ---------- สตรีค ----------
// เป้าหมายสตรีค: เลือกจำนวนวันที่จะเรียนต่อเนื่องเพิ่ม · แสดงความคืบหน้า · สตรีคขาดก่อนครบ = เริ่มใหม่
function streakGoalHTML() {
  const g = S.streakGoal;
  const broken = g && !g.done && S.streak < g.start;
  if (!g || broken) {
    return `<section class="card sgoal">
      <div class="sgoal-head">${hex(icon('target', 22), 'ico', '--h:var(--orange);color:var(--ink)')}<span class="setting-main"><b>ตั้งเป้าหมายสตรีค</b>
        <small>${broken ? `สตรีคขาดก่อนครบเป้า ${g.n} วัน ลองตั้งใหม่อีกครั้งนะ` : 'เลือกว่าจะเรียนต่อเนื่องอีกกี่วัน ครบแล้วรับน้ำหวาน'}</small></span></div>
      <div class="sgoal-pick">${STREAK_GOALS.map((x) => `<button class="sgoal-opt" data-act="sgoal-set" data-n="${x.n}"><b>${x.n} วัน</b><small>${icon('drop', 13)} ${x.nectar}</small></button>`).join('')}</div>
    </section>`;
  }
  const def = STREAK_GOALS.find((x) => x.n === g.n), got = Math.min(g.n, Math.max(0, S.streak - g.start));
  return `<section class="card sgoal">
    <div class="sgoal-head">${hex(icon(g.done ? 'check' : 'target', 22), 'ico', '--h:var(--orange);color:var(--ink)')}<span class="setting-main">
      <b>${g.done ? `ครบเป้าหมาย ${g.n} วันแล้ว!` : `เป้าหมาย: เรียนต่อเนื่องอีก ${g.n} วัน`}</b>
      <small>${g.done ? `ได้รับ ${def.nectar} น้ำหวานแล้ว` : `${got} จาก ${g.n} วัน ครบแล้วได้ ${def.nectar} น้ำหวาน`}</small></span></div>
    <div class="meter" role="progressbar" aria-label="ความคืบหน้าเป้าหมายสตรีค" aria-valuenow="${got}" aria-valuemin="0" aria-valuemax="${g.n}"><div style="width:${(got / g.n) * 100}%"></div></div>
    <button class="btn ${g.done ? 'primary' : 'link'} small" data-act="sgoal-reset">${g.done ? 'ตั้งเป้าหมายใหม่' : 'เปลี่ยนเป้าหมาย'}</button>
  </section>`;
}
function viewStreak() {
  const now = new Date(), y = now.getFullYear(), m = now.getMonth();
  const offset = (new Date(y, m, 1).getDay() + 6) % 7, daysIn = new Date(y, m + 1, 0).getDate();
  const todayN = now.getDate();
  let cells = '<span class="cal-cell blank"></span>'.repeat(offset);
  let learned = 0, shielded = 0;
  for (let d = 1; d <= daysIn; d++) {
    const k = `${y}-${pad(m + 1)}-${pad(d)}`, st = S.days[k];
    if (st === 'learn') learned++; else if (st === 'shield') shielded++;
    const cls = [st || '', d === todayN ? 'today' : '', d > todayN ? 'future' : ''].join(' ');
    const label = `${d}${st === 'learn' ? ' เรียนแล้ว' : st === 'shield' ? ' ใช้โล่สตรีค' : ''}`;
    cells += `<span class="cal-cell ${cls}" style="--i:${d}" aria-label="${label}">${d}</span>`;
  }
  const marks = Object.keys(MILESTONES).map(Number);
  const nextM = marks.find((d) => d > S.streak);
  const prevM = [0, ...marks].filter((d) => d <= S.streak).pop();
  const ms = marks.map((d, i) => {
    const reached = S.streak >= d;
    const fill = reached ? 100 : d === nextM ? Math.round(((S.streak - prevM) / (d - prevM)) * 100) : 0;
    return `${i ? `<span class="ms-bar"><i style="width:${fill}%"></i></span>` : ''}<span class="ms ${reached ? 'on' : ''}" aria-label="${d} วัน${reached ? ' ผ่านแล้ว' : ''}">${d}</span>`;
  }).join('');
  const learnedToday = S.lastDay === today();
  return shell(`<div class="sub-body">
    <section class="streak-hero">
      <div><b>${S.streak}</b><span>วันติดต่อกัน</span><small>${learnedToday ? 'เรียนวันนี้แล้ว รักษาไว้พรุ่งนี้นะ!' : S.streak ? 'เรียนวันนี้เพื่อรักษาสตรีค' : 'จบ 1 บทเรียนเพื่อเริ่มสตรีค'}</small></div>
      <span class="flame-3d" ${fxAmb('flame', S.streak)}>${icon('flame', 84)}</span>
    </section>
    ${S.streakLost ? `<section class="banner warn col">
      <b>สตรีค ${S.streakLost.streak} วันเพิ่งขาด</b><span>ซ่อมได้ภายใน 48 ชม. ด้วยน้ำหวาน 400</span>
      <button class="btn small primary" data-act="buy" data-id="repair">${icon('wrench', 18)} ซ่อมสตรีค</button></section>` : ''}
    ${streakGoalHTML()}
    <section class="card cal-card" aria-label="ปฏิทินเดือนนี้">
      <div class="cal-head"><b>${now.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}</b><span>เรียน ${learned} วัน${shielded ? ` · ใช้โล่ ${shielded} ครั้ง` : ''}</span></div>
      <div class="cal">${['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'].map((d) => `<span class="cal-dow">${d}</span>`).join('')}${cells}</div>
      <div class="cal-legend"><span><i class="lg learn"></i>เรียนแล้ว</span><span><i class="lg shield"></i>ใช้โล่สตรีค</span><span><i class="lg today"></i>วันนี้</span></div>
    </section>
    <section>
      <div class="sec-row tight"><h2>ก้าวสำคัญ</h2><span>${nextM ? `อีก ${nextM - S.streak} วัน` : 'ครบทุกก้าวแล้ว!'}</span></div>
      <div class="milestones">${ms}</div>
      ${nextM ? `<p class="muted small">ครบ ${nextM} วัน รับ ${MILESTONES[nextM]} น้ำหวาน${nextM === 30 ? ' และดอกไม้ประดับให้น้องผึ้ง' : ''}</p>` : ''}
    </section>
    ${(() => {
      const best = (typeof Friends !== 'undefined' && Friends.data?.friends || []).filter((f) => f.pair_streak > 0).sort((a, b) => b.pair_streak - a.pair_streak)[0];
      return best ? `<button class="banner pair" data-act="go" data-v="friends">${icon('flame', 22)}<span>สตรีคคู่กับ${esc(best.name)} <b>${best.pair_streak} วัน</b>${best.today ? '' : ` — ${esc(best.name)}ยังไม่ได้เรียนวันนี้`}</span>${icon('chevron', 20)}</button>` : '';
    })()}
    <section class="card row-card">
      ${hex(icon('shield', 24), 'ico', '--h:var(--tile-n);color:var(--blue-dark)')}
      <span class="setting-main"><b>โล่สตรีค ${S.shields} / ${MAX_SHIELDS}</b><small>ใช้อัตโนมัติเมื่อพลาด 1 วัน สตรีคไม่หาย</small></span>
      ${S.shields < MAX_SHIELDS ? priceBtn('shield', 200) : '<span class="claimed">มีครบแล้ว</span>'}
    </section>
  </div>`, { sub: { title: 'สตรีค' } });
}

// ---------- ร้านค้า ----------
const SHOP = [
  { sec: 'หัวใจ', id: 'refill', name: 'เติมหัวใจเต็ม', icon: 'heart', color: '#FFE5E5', ink: '#A3262B', price: 350,
    desc: () => `ตอนนี้มี ${S.hearts} / ${MAX_HEARTS} ดวง`, blocked: () => S.hearts >= MAX_HEARTS && 'หัวใจเต็มแล้ว',
    buy: () => { S.hearts = MAX_HEARTS; return 'เติมหัวใจเต็มแล้ว!'; } },
  { sec: 'หัวใจ', id: 'free', name: 'ได้หัวใจคืนฟรี', icon: 'heart', color: '#FFE5E5', ink: '#A3262B',
    desc: () => 'ฝึกฝนจบ 1 รอบ หรือตอบถูกติดกัน 5 ข้อในบทเรียน', blocked: () => 'ฟรี' },
  { sec: 'สตรีค', id: 'shield', name: 'โล่สตรีค', icon: 'shield', color: '#A9DCFF', ink: '#1E4FB8', price: 200,
    desc: () => `ใช้แทนวันที่พลาดได้ 1 วัน <span class="nowrap">(มีอยู่ ${S.shields} จาก ${MAX_SHIELDS})</span>`, blocked: () => S.shields >= MAX_SHIELDS && 'มีครบแล้ว',
    buy: () => { S.shields++; return 'ได้โล่สตรีคแล้ว'; } },
  { sec: 'สตรีค', id: 'repair', name: 'ซ่อมสตรีค', icon: 'wrench', color: '#FFE3D1', ink: '#A24400', price: 400,
    desc: () => (S.streakLost ? `กู้สตรีค ${S.streakLost.streak} วันคืน` : 'ใช้ได้ภายใน 48 ชม. หลังสตรีคขาด'), blocked: () => !S.streakLost && 'ยังไม่ต้องใช้',
    buy: () => repairStreak() },
  { sec: 'เร่งความเร็ว', id: 'boost', name: 'XP สองเท่า 15 นาที', icon: 'bolt', color: '#FFC21A', ink: '#2A1F14', price: 100,
    desc: () => 'ทุกอย่างที่ทำในช่วงนี้ได้ XP ×2', blocked: () => boostLeft() > 0 && `เหลือ ${Math.ceil(boostLeft() / 60000)} นาที`,
    buy: () => { S.boostUntil = Date.now() + BOOST_MS; if (typeof cloudBoost === 'function') cloudBoost('shop'); return 'XP สองเท่าเริ่มแล้ว!'; } },
  { sec: 'แต่งตัวน้องผึ้ง', id: 'cap', outfit: true, name: 'หมวกบัณฑิต', icon: 'cap', color: '#2A1F14', ink: '#FFC21A', price: 500, desc: () => 'ใส่ให้น้องผึ้งทุกหน้าจอ' },
  { sec: 'แต่งตัวน้องผึ้ง', id: 'bow', outfit: true, name: 'โบว์สีแดง', icon: 'bow', color: '#FFE5E5', ink: '#A3262B', price: 300, desc: () => 'ใส่ให้น้องผึ้งทุกหน้าจอ' },
  { sec: 'แต่งตัวน้องผึ้ง', id: 'flower', outfit: true, name: 'ดอกไม้ประดับ', icon: 'flower', color: '#DDF3D3', ink: '#2B6A17', desc: () => 'ได้ฟรีเมื่อสตรีคครบ 30 วัน' },
];
function repairStreak() {
  const lost = S.streakLost;
  if (S.lastDay === today()) S.streak = lost.streak + S.streak;
  else { S.streak = lost.streak; S.lastDay = yesterday(); }
  S.streakLost = null;
  S.records.bestStreak = Math.max(S.records.bestStreak, S.streak);
  return `กู้สตรีคคืนแล้ว ${S.streak} วัน!`;
}
const priceBtn = (id, price) => `<button class="price-btn" data-act="buy" data-id="${id}" aria-label="ซื้อ ราคา ${price} น้ำหวาน" ${S.nectar < price ? 'aria-disabled="true"' : ''}>${icon('drop', 15)}${price}</button>`;
function shopAction(it) {
  if (it.outfit) {
    if (S.owned[it.id]) return `<button class="price-btn ${S.outfit === it.id ? 'ghost' : ''}" data-act="wear" data-id="${it.id}">${S.outfit === it.id ? 'ถอด' : 'ใส่'}</button>`;
    return it.price ? priceBtn(it.id, it.price) : '<span class="claimed muted-text">สตรีค 30 วัน</span>';
  }
  const b = it.blocked?.();
  return b ? `<span class="claimed ${it.id === 'free' ? '' : 'muted-text'}">${b}</span>` : priceBtn(it.id, it.price);
}
function viewShop() {
  const secs = uniq(SHOP.map((it) => it.sec));
  return shell(`<div class="sub-body">
    <details class="earn-how"><summary>${icon('drop', 18)}<span>หาน้ำหวานเพิ่มได้จากไหน?</span>${icon('chevron', 18)}</summary>
      <ul>${[['จบบทเรียน', NECTAR.lesson], ['จบแบบไม่ผิดเลย', NECTAR.perfect], ['รับรางวัลภารกิจ', NECTAR.quest], ['ผ่านด่านทดสอบ', NECTAR.test]]
        .map(([t, n]) => `<li><span>${t}</span><b>+${n}</b></li>`).join('')}<li><span>สตรีคครบ 7, 30, 100 วัน</span><b>โบนัส</b></li></ul></details>
    ${secs.map((sec) => `<section><h2 class="shop-sec">${sec}</h2><div class="list-card">${SHOP.filter((it) => it.sec === sec).map((it) =>
      `<div class="shop-row">${hex(icon(it.icon, 22), 'ico', tint(it))}
        <span class="setting-main"><b>${it.name}</b><small>${it.desc()}</small></span>${shopAction(it)}</div>`).join('')}</div></section>`).join('')}
    <div class="shop-preview">${bee(72)}<p>${S.outfit ? 'น้องผึ้งใส่' + SHOP.find((it) => it.id === S.outfit).name + 'อยู่' : 'ยังไม่ได้แต่งตัวน้องผึ้ง'}</p></div>
  </div>`, { sub: { title: 'ร้านค้า', extra: `<span class="chip nectar sub-chip">${icon('drop', 18)}${num(S.nectar)}</span>` } });
}

// ---------- ศูนย์ฝึกฝน ----------
// ความแข็งแรงของทักษะ (1–4) จากความแม่นยำ 10 ข้อล่าสุด และจำนวนวันที่ไม่ได้ฝึก
function lessonStrength(n) {
  const recs = n.gens.map((g) => S.skills[g]).filter(Boolean);
  if (!recs.length) return null;
  const r = recs.flatMap((s) => s.r);
  const acc = r.reduce((a, b) => a + b, 0) / r.length;
  const days = Math.floor((Date.now() - Math.max(...recs.map((s) => s.last))) / 864e5);
  let level = acc >= 0.9 ? 4 : acc >= 0.75 ? 3 : acc >= 0.6 ? 2 : 1;
  if (days >= 14) level -= 2; else if (days >= 7) level -= 1;
  return { level: Math.max(1, level), acc: Math.round(acc * 100), days };
}
const weakLessons = () => NODES.filter((n, i) => n.kind === 'lesson' && isUnlocked(i))
  .map((n) => ({ n, s: lessonStrength(n) })).filter((x) => x.s)
  .sort((a, b) => a.s.level - b.s.level || a.s.acc - b.s.acc);
const mistakeGens = () => uniq(S.mistakes.filter((m) => Date.now() - m.ts < 7 * 864e5).map((m) => m.gen));
const bars = (level) => `<span class="bars" role="img" aria-label="ความแข็งแรง ${level} จาก 4">${[1, 2, 3, 4].map((i) => `<i class="${i <= level ? 'l' + level : ''}"></i>`).join('')}</span>`;
function practiceGens(p) {
  if (p.gens) return p.gens;
  const reached = NODES.filter((n, i) => n.kind === 'lesson' && isUnlocked(i));
  return uniq(reached.flatMap((n) => n.gens));
}
// ตัวอย่างสมการของตัวสร้างโจทย์ (seed คงที่ตามชื่อ จึงไม่เปลี่ยนทุกครั้งที่วาดหน้า) · ไม่มีสมการ → null
const sampleEq = (gen) => { try { return makeQuestion(gen, 1, hash(gen)).eq || null; } catch (e) { return null; } };
const lessonSample = (n) => n.gens.map(sampleEq).find(Boolean) || null;
// หน้าฝึกฝน: น้องผึ้งชี้เรื่องเดียวที่ควรฝึกตอนนี้ (พร้อมสมการตัวอย่างจริง) · ที่เหลือเป็นทางเลือกรอง
function viewPracticeHub() {
  const weak = weakLessons(), top = weak[0];
  const mist = mistakeGens();
  const storiesOpen = STORIES.filter((st) => unitReached(st.unit));
  const storyNext = storiesOpen.find((st) => !S.stories[st.id]);
  const legendReady = UNITS.filter((u, ui) => unitDone(ui) && !S.legend[u.id]).length;
  const legendAny = legendReady || Object.keys(S.legend).length;
  const ex = top && lessonSample(top.n);
  const coach = top
    ? `<p>${top.s.days >= 7 ? `ไม่ได้ฝึกเรื่อง <b>${top.n.title}</b> มา ${top.s.days} วันแล้ว ลืมง่ายนะ` : `เรื่อง <b>${top.n.title}</b> ยังพลาดบ่อย ตอบถูก ${top.s.acc}% จาก 10 ข้อล่าสุด`}</p>
      ${ex ? `<div class="coach-eq" aria-label="ตัวอย่างโจทย์">${M(ex)}</div>` : ''}
      <button class="btn primary wide" data-act="skill" data-i="${NODES.indexOf(top.n)}">ฝึกเรื่องนี้ 8 ข้อ</button>`
    : `<p>เรียนบทเรียนสัก 1–2 บทก่อน น้องผึ้งจะดูให้ว่าเรื่องไหนควรฝึกเพิ่ม</p>
      <button class="btn primary wide" data-act="practice" data-id="mix">ฝึกแบบผสม 8 ข้อ</button>`;
  const topics = PRACTICE.filter((p) => unitReached(p.unit)), lockedTopics = PRACTICE.length - topics.length;
  return shell(`<h1 class="page-title">ฝึกฝน</h1>
    <p class="muted page-sub">ไม่ใช้หัวใจ ฝึกจบ 1 รอบได้หัวใจคืน 1 ดวง</p>
    <section class="coach">${bee(72, top ? 'happy' : 'cheer')}<div class="coach-body">${coach}</div></section>
    ${mist.length ? `<button class="mist-row" data-act="review-mistakes">${icon('refresh', 20)}
      <span class="setting-main"><b>ทบทวนข้อที่ผิด</b><small>${mist.length} แบบที่ตอบผิดใน 7 วันล่าสุด</small></span>${icon('chevron', 20, 'go')}</button>` : ''}
    ${weak.length > 1 ? `<div class="sec-row"><h2>เรื่องอื่นที่ควรทบทวน</h2></div>
      <div class="list-card">${weak.slice(1, 4).map(({ n, s }) => `<button class="skill-row" data-act="skill" data-i="${NODES.indexOf(n)}">
        <span class="setting-main"><b>${n.title}</b><small>${s.days >= 7 ? `ไม่ได้ฝึกมา ${s.days} วัน` : `ถูก ${s.acc}% จาก 10 ข้อล่าสุด`}</small></span>${bars(s.level)}</button>`).join('')}</div>` : ''}
    <div class="sec-row"><h2>เล่นแบบอื่น</h2></div>
    <div class="modes">
      <button class="mode" data-act="timed-start">${icon('timer', 22)}<span><b>ผึ้งเร่งรีบ</b><small>แก้สมการให้ได้มากที่สุดใน 60 วินาที</small></span>
        <span class="mode-rec">${S.stats.timedBest ? `<b>${S.stats.timedBest}</b><small>สถิติ</small>` : '<small>ยังไม่เคยเล่น</small>'}</span></button>
      <button class="mode" data-act="stories" ${storiesOpen.length ? '' : 'disabled'}>${icon('story', 22)}<span><b>เรื่องเล่าโจทย์</b>
        <small>${!storiesOpen.length ? 'เปิดเมื่อเรียนถึงบทที่ 2' : storyNext ? `เรื่องใหม่: ${storyNext.title}` : 'อ่านครบทุกเรื่องแล้ว'}</small></span></button>
      ${legendAny ? `<button class="mode" data-act="legend">${icon('crown', 22)}<span><b>ระดับตำนาน</b>
        <small>${legendReady ? `${legendReady} บทพร้อมท้าทาย ผิดได้ไม่เกิน 2 ข้อ` : 'ท้าทายบทที่ผ่านแล้วอีกครั้ง'}</small></span></button>` : ''}
    </div>
    <details class="topics"><summary>เลือกหัวข้อเอง <span>${topics.length} หัวข้อ</span>${icon('chevron', 20)}</summary>
      <div class="list-card">${topics.map((p) => {
        const eq = p.gens ? p.gens.map(sampleEq).find(Boolean) : null;
        return `<button class="topic-row" data-act="practice" data-id="${p.id}"><span class="setting-main"><b>${p.title}</b>
          <small>${eq ? M(eq) : p.desc}</small></span>${icon('chevron', 20, 'go')}</button>`;
      }).join('')}</div>
      ${lockedTopics ? `<p class="muted small">อีก ${lockedTopics} หัวข้อเปิดเมื่อเรียนไปถึง</p>` : ''}
    </details>`);
}
Object.assign(SHEETS, {
  legend() {
    return `<div class="sheet-card"><h2>ระดับตำนาน</h2><p>ทำโจทย์ 10 ข้อจากทั้งบท ผิดได้ไม่เกิน 2 ข้อ ไม่ใช้หัวใจ ผ่านแล้วด่านในบทจะเปลี่ยนเป็นมงกุฎ</p>
      <div class="list-card">${UNITS.map((u, ui) => {
        const ready = unitDone(ui), done = !!S.legend[u.id];
        return `<div class="shop-row">${hex(icon(done ? 'crown' : ready ? 'star' : 'lock', 20), 'ico', ready ? '--h:var(--ink);color:var(--honey)' : '')}
          <span class="setting-main"><b>บทที่ ${ui + 1} · ${u.title}</b><small>${done ? 'ถึงระดับตำนานแล้ว' : ready ? 'พร้อมท้าทาย +30 XP' : 'ผ่านทุกด่านในบทนี้ก่อน'}</small></span>
          ${ready ? `<button class="price-btn ${done ? 'ghost' : ''}" data-act="legend-start" data-u="${u.id}">${done ? 'เล่นอีก' : 'เริ่ม'}</button>` : ''}</div>`;
      }).join('')}</div></div>`;
  },
  stories() {
    return `<div class="sheet-card"><h2>เรื่องเล่าโจทย์</h2><p>อ่านสถานการณ์ แล้วตั้งสมการแก้ปัญหาไปกับตัวละคร ไม่ใช้หัวใจ จบเรื่องได้ 15 XP</p>
      <div class="list-card">${STORIES.map((st) => {
        const open = unitReached(st.unit), done = !!S.stories[st.id];
        return `<div class="shop-row">${hex(icon(open ? 'story' : 'lock', 20), 'ico', open ? '--h:var(--green);color:var(--green-ink)' : '')}
          <span class="setting-main"><b>${st.title}</b><small>${!open ? `ปลดล็อกเมื่อถึงบทที่ ${st.unit + 1}` : done ? 'อ่านแล้ว' : 'เรื่องใหม่'}</small></span>
          ${open ? `<button class="price-btn ${done ? 'ghost' : ''}" data-act="story-start" data-id="${st.id}">${done ? 'อ่านอีก' : 'อ่าน'}</button>` : ''}</div>`;
      }).join('')}</div></div>`;
  },
});

// ---------- เกมผึ้งเร่งรีบ (60 วินาที) ----------
// โจทย์ข้อที่ n สร้างจาก seed ของรอบ (makeTimedQuestion ใน js/data.js) เซิร์ฟเวอร์จึงตรวจคะแนนซ้ำได้
const RING = 352; // เส้นรอบวงของวงเวลา (r = 56)
const timedQuestion = (T) => makeTimedQuestion(subSeed(T.seed, T.n), skillLevel);
function startTimed() {
  const now = Date.now();
  UI.T = { n: 0, start: now, end: now + 60000, score: 0, combo: 0, bestCombo: 0, last: null, ...newRun('timed') };
  UI.T.q = timedQuestion(UI.T);
  UI.view = 'timed'; UI.sheet = null;
  clearInterval(timedTick.id);
  timedTick.id = setInterval(timedTick, 200);
  render();
  window.scrollTo(0, 0);
}
// อัปเดตเฉพาะตัวเลขเวลาและวงเวลา ไม่ต้องวาดใหม่ทั้งหน้า
function timedTick() {
  if (UI.view !== 'timed' || !UI.T) return clearInterval(timedTick.id);
  const left = UI.T.end - Date.now();
  if (left <= 0) return finishTimed();
  const n = document.querySelector('.timer-num'), ring = document.querySelector('.ring-fg');
  const sec = Math.ceil(left / 1000);
  if (sec <= 5 && sec !== UI.T.lastTick) { UI.T.lastTick = sec; SFX.play('tick'); } // นับถอยหลัง 5 วินาทีสุดท้าย
  if (n) n.textContent = sec;
  document.querySelector('.ring')?.classList.toggle('low', left < 10000);
  if (ring) ring.setAttribute('stroke-dasharray', `${Math.min(1, left / 60000) * RING} ${RING}`);
}
function answerTimed(k) {
  const T = UI.T;
  const ok = T.q.choices[k] === T.q.answer;
  SFX.play(ok ? 'correct' : 'wrong');
  T.log.push({ g: T.q.g, l: T.q.lvl, k, t: Date.now() - T.start }); // t = เวลาที่ตอบ นับจากเริ่มเกม (มิลลิวินาที)
  T.n++;
  trackSkill(T.q.g, ok);
  S.stats.answered++;
  if (ok) {
    T.score++; T.combo++; T.bestCombo = Math.max(T.bestCombo, T.combo); T.end += 2000;
    S.stats.correct++; S.stats.solved++; quest('solve');
    T.last = { ok: true };
  } else {
    T.combo = 0; T.end -= 5000;
    T.last = { ok: false, answer: T.q.answer };
  }
  T.q = timedQuestion(T);
  if (T.end <= Date.now()) return finishTimed();
  render();
}
function finishTimed() {
  clearInterval(timedTick.id);
  const T = UI.T;
  UI.T = null;
  const xp = T.score ? addXP(T.score) : 0;
  const nectar = Math.floor(T.score / 5);
  S.nectar += nectar;
  const newBest = T.score > S.stats.timedBest;
  if (newBest) S.stats.timedBest = T.score;
  S.records.bestCombo = Math.max(S.records.bestCombo, T.bestCombo);
  const streak = T.score ? learnToday() : null;
  const badges = checkBadges();
  save();
  submitRun('timed', T, {}, true);
  SFX.play(T.score ? 'complete' : 'fail');
  UI.result = { kind: 'timed', score: T.score, xp, nectar, newBest, bestCombo: T.bestCombo, milestone: streak?.milestone, goal: streak?.goal, badges, wrong: [] };
  UI.view = 'result';
  render();
}
function viewTimed() {
  const T = UI.T, left = Math.max(0, T.end - Date.now());
  const last = T.last ? (T.last.ok ? 'ถูก! +2 วินาที' : `ผิด −5 วินาที ข้อที่แล้วตอบ ${T.last.answer}`) : `หาค่าของ ${M('x')} ให้เร็วที่สุด`;
  return `<div class="timed">
    <header class="lesson-top"><button class="x" data-act="timed-quit" aria-label="ออกจากเกม">${icon('x', 22)}</button>
      <h1 class="timed-title">ผึ้งเร่งรีบ</h1><span class="chip">สถิติ ${S.stats.timedBest}</span></header>
    <main class="timed-body">
      <div class="timed-stats">
        <div class="ts ${T.last?.ok ? 'up' : ''}"><b>${T.score}</b><small>ข้อที่ถูก</small></div>
        <div class="ring ${left < 10000 ? 'low' : ''}" role="timer" aria-label="เวลาที่เหลือ">
          <svg viewBox="0 0 132 132" aria-hidden="true"><circle cx="66" cy="66" r="56" class="ring-bg"/>
            <circle cx="66" cy="66" r="56" class="ring-fg" stroke-dasharray="${Math.min(1, left / 60000) * RING} ${RING}" transform="rotate(-90 66 66)"/></svg>
          <span><b class="timer-num">${Math.ceil(left / 1000)}</b><small>วินาที</small></span>
        </div>
        <div class="ts combo-ts"><b>${icon('flame', 22)}×${T.combo}</b><small>คอมโบ</small></div>
      </div>
      <div class="timed-q card ${T.last ? (T.last.ok ? 'flash-ok' : 'flash-bad') : ''}">${T.q.visual}<p class="timed-last ${T.last ? (T.last.ok ? 'ok' : 'bad') : ''}" aria-live="polite">${last}</p></div>
      <p class="kbd-hint center">กด <kbd>1</kbd>–<kbd>4</kbd> เพื่อตอบได้เร็วขึ้น</p>
      <div class="timed-opts">${T.q.choices.map((c, k) => `<button class="topt" data-act="timed-ans" data-k="${k}"><span class="kbd">${k + 1}</span>${c}</button>`).join('')}</div>
    </main>
    <footer class="timed-foot">ถูกได้เวลาเพิ่ม 2 วินาที ผิดเสีย 5 วินาที ไม่เสียหัวใจ</footer>
  </div>`;
}
RESULT_VIEWS.timed = (r) => `<div class="result win">${HONEYCOMB}${r.newBest ? confetti() : ''}
  <div class="hero hex" ${r.newBest ? fxTag(r, 'win') : ''}>${bee(170, r.score ? 'cheer' : 'sad')}</div>
  <h1>หมดเวลา!</h1><p>${r.newBest ? 'ทำสถิติใหม่ได้แล้ว!' : `สถิติของคุณคือ ${S.stats.timedBest} ข้อ`}</p>
  <div class="tiles">${statTile('green', 'ข้อที่ถูก', 'target', r.score)}${statTile('gold', 'XP ที่ได้', 'bolt', r.xp)}${statTile('orange', 'คอมโบสูงสุด', 'flame', r.bestCombo)}</div>
  ${rewardsHTML(r)}
  <div class="result-actions"><button class="btn primary wide" data-act="timed-start">เล่นอีกครั้ง</button>
    <button class="btn link wide" data-act="tab" data-v="practice">กลับศูนย์ฝึกฝน</button></div></div>`;

// ---------- เรื่องเล่าโจทย์ ----------
function startStory(id) {
  UI.st = { id, step: 0, sel: null, input: '', checked: false, ok: false, correct: 0, ...newRun('story') };
  UI.view = 'story'; UI.sheet = null;
  render();
  window.scrollTo(0, 0);
}
function viewStory() {
  const st = UI.st, story = STORIES.find((x) => x.id === st.id), cur = story.steps[st.step];
  const pct = Math.round(((st.step + (st.checked || !cur.q ? 1 : 0)) / story.steps.length) * 100);
  const line = (s, fresh = false) => { const [name, ini, bg, fg] = story.cast[s.who];
    return `<div class="sline${fresh ? ' new' : ''}"><span class="sav" style="background:${bg};color:${fg}">${ini}</span><div><small style="color:${fg}">${name}</small><p>${s.text}</p></div></div>`; };
  const past = story.steps.slice(0, st.step).map((s) => (s.q
    ? `<div class="story-done">${icon('check', 16)}${s.q === 'choice' ? M(s.choices[s.answer]) : `${s.label || 'x ='} ${s.answer}`}</div>` : line(s))).join('');
  let area = '', foot;
  if (!cur.q) {
    area = line(cur, true);
    foot = `<footer class="lesson-foot">${kbdHint('line')}<button class="btn primary wide" data-act="s-next">${st.step === story.steps.length - 1 ? 'จบเรื่อง' : 'ต่อไป'}</button></footer>`;
  } else {
    area = `<section class="story-q"><p>${cur.prompt}</p>${cur.q === 'choice'
      ? `<div class="opts">${cur.choices.map((c, k) => {
          let cls = st.sel === k ? 'sel' : '';
          if (st.checked && k === cur.answer) cls = 'right'; else if (st.checked && st.sel === k) cls = 'wrong';
          return `<button class="opt ${cls}" data-act="s-opt" data-k="${k}" ${st.checked ? 'disabled' : ''}><span class="kbd">${k + 1}</span>${M(c)}</button>`;
        }).join('')}</div>`
      : answerPad(st.input, st.checked, st.ok, 's-key', cur.label)}</section>`;
    const ready = cur.q === 'choice' ? st.sel !== null : st.input !== '' && st.input !== '−';
    const answerHTML = cur.q === 'choice' ? M(cur.choices[cur.answer]) : `${cur.label || 'x ='} ${cur.answer}`;
    foot = st.checked ? feedbackFoot(st.ok, st.ok ? pick(PRAISE) : pick(COMFORT), answerHTML, cur.explain, 's-next')
      : `<footer class="lesson-foot">${kbdHint(cur.q)}<button class="btn primary wide" data-act="s-check" ${ready ? '' : 'disabled'}>ตรวจคำตอบ</button></footer>`;
  }
  return `<div class="lesson story">
    <header class="lesson-top"><button class="x" data-act="quit-story" aria-label="ออกจากเรื่อง">${icon('x', 22)}</button>
      <div class="progress" role="progressbar" aria-label="ความคืบหน้าของเรื่อง" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><div style="width:${pct}%"></div></div></header>
    <main class="lesson-body">
      <div class="story-title"><small>เรื่องเล่าโจทย์</small><h1>${story.title}</h1></div>
      ${past}${area}
    </main>
    ${foot}
  </div>`;
}
function checkStory() {
  const st = UI.st, cur = STORIES.find((x) => x.id === st.id).steps[st.step];
  const a = cur.q === 'choice' ? st.sel : Number(st.input.replace('−', '-'));
  st.ok = a === cur.answer;
  st.checked = true;
  st.log.push({ s: st.step, a });
  SFX.play(st.ok ? 'correct' : 'wrong');
  if (st.ok) st.correct++;
  render();
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}
function nextStory() {
  const st = UI.st, story = STORIES.find((x) => x.id === st.id);
  st.step++; st.sel = null; st.input = ''; st.checked = false;
  if (st.step < story.steps.length) { render(); window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); return; }
  const xp = addXP(15);
  S.nectar += 5;
  S.stories[story.id] = true;
  const streak = learnToday();
  const badges = checkBadges();
  save();
  submitRun('story', st, { story: story.id }, true);
  SFX.play('complete');
  UI.result = { kind: 'story', title: story.title, xp, nectar: 5, correct: st.correct, total: story.steps.filter((s) => s.q).length, milestone: streak?.milestone, goal: streak?.goal, badges, wrong: [] };
  UI.st = null; UI.view = 'result';
  render();
  window.scrollTo(0, 0);
}
RESULT_VIEWS.story = (r) => `<div class="result win">${HONEYCOMB}${confetti()}
  <div class="hero hex" ${fxTag(r, 'win')}>${bee(170, 'cheer')}</div>
  <h1>จบเรื่องแล้ว!</h1><p>${esc(r.title)}</p>
  <div class="tiles">${statTile('green', 'ตอบถูก', 'target', `${r.correct}/${r.total}`)}${statTile('gold', 'XP ที่ได้', 'bolt', r.xp)}${statTile('orange', 'สตรีค', 'flame', S.streak)}</div>
  ${rewardsHTML(r)}
  <div class="result-actions"><button class="btn primary wide" data-act="tab" data-v="practice">ไปต่อ</button></div></div>`;

// ---------- ความสำเร็จ ----------
function viewAchievements() {
  const now = new Date();
  const daysLeft = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate();
  const mp = Math.min(MONTH_GOAL, S.month.points), got = !!S.monthBadges[S.month.key];
  const monthName = (k) => new Date(k + '-01T00:00:00').toLocaleDateString('th-TH', { month: 'short', year: '2-digit' });
  const records = [
    ['flame', 'สตรีคยาวที่สุด', `${Math.max(S.records.bestStreak, S.streak)} วัน`, 'orange'],
    ['bolt', 'XP มากที่สุดใน 1 วัน', `${S.records.bestDayXP} XP`, 'gold'],
    ['target', 'ตอบถูกติดกันยาวที่สุด', `${S.records.bestCombo} ข้อ`, 'green'],
    ['timer', 'สถิติผึ้งเร่งรีบ', `${S.stats.timedBest} ข้อ`, 'blue'],
  ];
  return shell(`<div class="sub-body">
    <section class="month-hero">
      ${hex(`${icon('sun', 24)}<small>${monthName(S.month.key)}</small>`, 'month-hex', got ? '' : 'opacity:.55')}
      <div class="mh-main"><h2>${got ? 'ได้เหรียญเดือนนี้แล้ว!' : 'เหรียญประจำเดือน'}</h2>
        <div class="meter dark" role="img" aria-label="${mp} จาก ${MONTH_GOAL} แต้ม"><div style="width:${(mp / MONTH_GOAL) * 100}%"></div></div>
        <small><span class="nowrap">${mp} จาก ${MONTH_GOAL} แต้ม</span> <span class="nowrap">เหลืออีก ${daysLeft} วัน</span></small>
        ${got ? '' : '<p>รับรางวัลภารกิจประจำวัน 1 ข้อได้ 1 แต้ม</p>'}</div>
    </section>
    ${Object.keys(S.monthBadges).length ? `<div class="month-list">${Object.keys(S.monthBadges).sort().map((k) => hex(`<small>${monthName(k)}</small>`, 'month-mini')).join('')}</div>` : ''}
    <div class="sec-row tight"><h2>สถิติส่วนตัว</h2></div>
    <div class="records">${records.map(([ic, label, v, cls]) => `<div class="rec ${cls}">${icon(ic, 22)}<b>${v}</b><small>${label}</small></div>`).join('')}</div>
    <div class="sec-row tight"><h2>เหรียญตรา</h2><span>แต่ละเหรียญมี 5 ระดับ</span></div>
    <div class="list-card">${LEVEL_BADGES.map((b) => {
      const v = b.value(S), lvl = b.steps.filter((s) => v >= s).length, nextGoal = b.steps[lvl];
      const prev = lvl ? b.steps[lvl - 1] : 0;
      const pct = nextGoal ? Math.round(((v - prev) / (nextGoal - prev)) * 100) : 100;
      return `<div class="lvl-row">
        <span class="lvl-wrap">${hex(icon(lvl ? b.icon : 'lock', 22), 'ico lvl-hex', lvl ? tint(b) : '')}<span class="lvl-tag">ระดับ ${lvl}</span></span>
        <span class="setting-main"><span class="lvl-top"><b>${b.name}</b><small>${nextGoal ? `${num(v)} / ${num(nextGoal)}` : 'ระดับสูงสุด'}</small></span>
          <span class="meter" style="--m:${b.color}"><span class="fill" style="width:${pct}%"></span></span>
          <small>${nextGoal ? `ระดับ ${lvl + 1}: ${num(nextGoal)} ${b.unit}` : `ครบ ${num(b.steps[4])} ${b.unit} แล้ว`}</small></span></div>`;
    }).join('')}</div>
    <div class="sec-row tight"><h2>เหรียญพิเศษ</h2><span>ได้ครั้งเดียว</span></div>
    <div class="list-card">${BADGES.map((b) => {
      const got = S.badges[b.id];
      return `<button class="lvl-row" data-act="badge" data-id="${b.id}"><span class="lvl-wrap">${badgeHex(b, got, 'ico lvl-hex')}</span>
        <span class="setting-main"><b>${b.name}</b><small>${got ? 'ได้เมื่อ ' + thaiDate(got) : b.desc}</small></span></button>`;
    }).join('')}</div>
  </div>`, { sub: { title: 'ความสำเร็จ' } });
}

// ---------- ตั้งค่า ----------
const TEXT_SIZES = [['m', 'ปกติ'], ['l', 'ใหญ่'], ['xl', 'ใหญ่มาก']];
const setRow = (title, desc, control) => `<div class="set-row"><span class="setting-main"><b>${title}</b>${desc ? `<small>${desc}</small>` : ''}</span>${control}</div>`;
function viewSettings() {
  const st = S.settings;
  const sysReduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const signedIn = typeof Cloud !== 'undefined' && Cloud.user;
  return shell(`<div class="sub-body">
    <section><h2 class="shop-sec">บัญชี</h2><div class="list-card">
      ${setRow(signedIn ? esc(Cloud.user.email || 'บัญชีของฉัน') : 'บัญชี BeeMath', typeof syncLabel === 'function' ? esc(syncLabel()) : '',
        `<button class="price-btn ${signedIn ? 'ghost' : ''}" data-act="go" data-v="account">${signedIn ? 'จัดการ' : 'เข้าสู่ระบบ'}</button>`)}
      ${signedIn ? setRow('แสดงชื่อในรายชื่อลีก', st.leagueHidden ? 'ซ่อนอยู่ · คนที่แตะดูลีกจะเห็นแค่จำนวน (คนในกลุ่มลีกเดียวกันและเพื่อนยังเห็นชื่อ)' : 'ทุกคนที่แตะดูลีกจะเห็นชื่อที่แสดง สีอวตาร และ XP สัปดาห์นี้ของคุณ',
        switchHTML('leaguepub', !st.leagueHidden, 'แสดงชื่อในรายชื่อลีก')) : ''}
    </div></section>
    <section><h2 class="shop-sec">ห้องเรียน</h2><div class="list-card">
      ${setRow('ห้องเรียนและงานจากครู', 'ใส่รหัสห้องที่ได้จากครู หรือสร้างห้องถ้าคุณเป็นครู', '<button class="price-btn ghost" data-act="go" data-v="classes">เปิด</button>')}
    </div></section>
    <section><h2 class="shop-sec">เสียง</h2><div class="list-card">
      ${setRow('เสียงประกอบ', 'ตอบถูก ตอบผิด จบบทเรียน และรับรางวัล', switchHTML('sound', st.sound, 'เปิดเสียงประกอบ'))}
      ${setRow('เพลงประกอบ', 'เล่นวนระหว่างใช้แอป และเบาลงตอนทำโจทย์ กดปุ่มโน้ตข้างหัวใจเพื่อ<span class="nowrap">เปิดหรือปิด</span>ได้เร็ว ๆ', switchHTML('music', S.settings.music !== false, 'เปิดเพลงประกอบ'))}
      ${setRow('ระดับเสียง', '', `<span class="vol"><input type="range" id="volume" min="0" max="100" step="10" value="${Math.round(st.volume * 100)}" aria-label="ระดับเสียง" ${st.sound ? '' : 'disabled'}>
        <button class="price-btn ghost" data-act="sfx-test" ${st.sound ? '' : 'disabled'}>ลองฟัง</button></span>`)}
    </div></section>
    <section><h2 class="shop-sec">การแสดงผล</h2><div class="list-card">
      ${setRow('ลดการเคลื่อนไหว', sysReduce ? 'เครื่องของคุณตั้งค่าลดการเคลื่อนไหวไว้แล้ว แอปจะลดให้อัตโนมัติ' : 'ปิดแอนิเมชันเกือบทั้งหมด', switchHTML('motion', st.reduceMotion || sysReduce, 'ลดการเคลื่อนไหว'))}
      ${setRow('เอฟเฟกต์ 3 มิติ', !webglOK() ? 'เครื่องหรือเบราว์เซอร์นี้ไม่รองรับ ใช้แอนิเมชันปกติแทน' : st.reduceMotion || sysReduce ? 'ปิดอยู่เพราะเปิด "ลดการเคลื่อนไหว"' : 'น้องผึ้งและด่านบนหน้าหลัก โปรไฟล์ หน้าสตรีค และฉากฉลอง (ตอบถูก จบบท เลื่อนลีก เปิดหีบ) · ปิดได้ถ้าเครื่องช้า',
        switchHTML('fx3d', st.fx3d !== false && webglOK() && !(st.reduceMotion || sysReduce), 'เอฟเฟกต์ 3 มิติ'))}
      ${setRow('ขนาดตัวอักษร', 'มีผลกับเนื้อหาและโจทย์', `<span class="seg" role="radiogroup" aria-label="ขนาดตัวอักษร">${TEXT_SIZES.map(([v, t]) =>
        `<button role="radio" aria-checked="${st.textSize === v}" class="${st.textSize === v ? 'on' : ''}" data-act="text-size" data-s="${v}">${t}</button>`).join('')}</span>`)}
    </div></section>
    <section><h2 class="shop-sec">การเรียน</h2><div class="list-card">
      ${setRow('ปรับความยากอัตโนมัติ', 'ตอบถูกติดกันโจทย์จะยากขึ้นและได้ XP เพิ่ม ถ้าผิดบ่อยจะง่ายลง', switchHTML('adaptive', st.adaptive !== false, 'ปรับความยากอัตโนมัติ'))}
      ${setRow('เป้าหมายรายวัน', '', `<select id="goal-select" aria-label="เป้าหมายรายวัน">${GOALS.map(([xp, name]) => `<option value="${xp}" ${S.goal === xp ? 'selected' : ''}>${name} · ${xp} XP</option>`).join('')}</select>`)}
      ${setRow('เตือนให้มาเรียน', remindNote(), `<span class="vol"><input type="time" id="remind-time" value="${S.remind.time}" aria-label="เวลาเตือน" ${S.remind.on ? '' : 'disabled'}>${switchHTML('remind', S.remind.on, 'เปิดการเตือน')}</span>`)}
    </div></section>
    <section><h2 class="shop-sec">โปรไฟล์</h2><div class="list-card">
      ${setRow('ชื่อที่แสดง', '', `<input class="text-input" id="name" value="${esc(S.name)}" maxlength="20" aria-label="ชื่อที่แสดง">`)}
      ${setRow('สีกรอบอวตาร', '', `<button class="price-btn ghost" data-act="pick-avatar">${hex('', 'sw-dot', `background:${S.avatar}`)}เปลี่ยน</button>`)}
    </div></section>
    <section><h2 class="shop-sec">แอป</h2><div class="list-card">
      ${setRow('ติดตั้ง BeeMath เป็นแอป', installHint(), isStandalone() ? '<span class="claimed">ติดตั้งแล้ว</span>' : UI.installPrompt ? '<button class="price-btn" data-act="install">ติดตั้ง</button>' : '')}
      ${setRow('สถานะการเชื่อมต่อ', navigator.onLine ? 'ออนไลน์' : 'ไม่มีอินเทอร์เน็ต ยังเรียนต่อได้ ความคืบหน้าบันทึกไว้ในเครื่อง', '')}
    </div></section>
    <section><h2 class="shop-sec">ข้อมูลของฉัน</h2><div class="list-card">
      ${setRow('สำรองความคืบหน้า', 'ดาวน์โหลดไฟล์เก็บไว้กันหาย หรือใช้ย้ายไปเรียนต่อเครื่องอื่น', '<button class="price-btn" data-act="export">ดาวน์โหลด</button>')}
      ${setRow('กู้คืนจากไฟล์', 'เลือกไฟล์สำรองที่ดาวน์โหลดไว้', '<label class="price-btn ghost file-btn">เลือกไฟล์<input type="file" id="import-file" accept="application/json,.json"></label>')}
      ${setRow('แจ้งปัญหา / ข้อเสนอแนะ', 'เจอบั๊ก โจทย์ผิด หรืออยากให้มีอะไรเพิ่ม บอกผู้พัฒนาได้เลย', '<button class="price-btn" data-act="fb-open">เขียน</button>')}
      ${setRow('นโยบายความเป็นส่วนตัว', 'เก็บข้อมูลอะไร ใครเห็น และวิธีขอลบข้อมูล', `<a class="price-btn ghost" href="privacy.html" target="_blank" rel="noopener">อ่าน</a>`)}
      ${setRow('รีเซ็ตความคืบหน้า', 'ลบทุกอย่างแล้วเริ่มใหม่', '<button class="price-btn danger-btn" data-act="reset">รีเซ็ต</button>')}
    </div></section>
  </div>`, { sub: { title: 'ตั้งค่า' } });
}
// PWA: เปิดแบบแอปอยู่หรือไม่ และคำแนะนำการติดตั้งตามเบราว์เซอร์
const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
function installHint() {
  if (isStandalone()) return 'เปิดแบบแอปอยู่ ใช้ได้แม้ไม่มีอินเทอร์เน็ต';
  if (!location.protocol.startsWith('http')) return 'ต้องเปิดผ่านเว็บ (เช่น GitHub Pages) ก่อน จึงจะติดตั้งได้';
  if (UI.installPrompt) return 'มีไอคอนบนหน้าจอ เปิดเต็มจอ และเรียนได้แม้ไม่มีเน็ต';
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) return 'บน iPhone/iPad: แตะปุ่มแชร์ › "เพิ่มไปยังหน้าจอโฮม"';
  return 'ใช้เมนูของเบราว์เซอร์ › "ติดตั้งแอป" หรือ "เพิ่มลงในหน้าจอหลัก"';
}
// สำรอง/กู้คืนข้อมูลเป็นไฟล์ JSON
function exportProgress() {
  const data = JSON.stringify({ app: 'beemath', v: 1, exported: new Date().toISOString(), state: S }, null, 2);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
  a.download = `beemath-backup-${today()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  showToast('ดาวน์โหลดไฟล์สำรองแล้ว');
}
function readImport(file) {
  const fr = new FileReader();
  fr.onload = () => {
    try {
      const obj = JSON.parse(fr.result);
      if (obj?.app !== 'beemath' || typeof obj.state?.xp !== 'number' || typeof obj.state?.done !== 'object') throw Error('bad');
      UI.pendingImport = obj;
      UI.sheet = { type: 'import' };
      render();
    } catch (e) { showToast('ไฟล์นี้ไม่ใช่ไฟล์สำรองของ BeeMath'); }
  };
  fr.readAsText(file);
}
SHEETS.import = () => {
  const st = UI.pendingImport.state;
  return `<div class="sheet-card center"><h2>กู้คืนความคืบหน้า?</h2>
    <p>ไฟล์นี้มี ${num(st.xp)} XP · ผ่าน ${Object.keys(st.done).length} ด่าน · สตรีค ${st.streak || 0} วัน${UI.pendingImport.exported ? ` · สำรองเมื่อ ${thaiDate(UI.pendingImport.exported.slice(0, 10))}` : ''}</p>
    <p>ข้อมูลปัจจุบันในเครื่องนี้จะถูกแทนที่</p>
    <button class="btn primary" data-act="import-yes">กู้คืน</button><button class="btn ghost" data-act="close">ยกเลิก</button></div>`;
};

// ---------- ลงทะเบียนหน้าจอและ action ----------
Object.assign(VIEWS, {
  onboarding: viewOnboarding, streak: viewStreak, shop: viewShop, practice: viewPracticeHub,
  timed: viewTimed, story: viewStory, achievements: viewAchievements, settings: viewSettings,
});
Object.assign(ACT, {
  'ob-start': () => { UI.ob.step = 'goal'; render(); },
  'ob-goal': (d) => { UI.ob.goal = +d.g; render(); },
  'toggle-ob-remind': () => { UI.ob.remind = !UI.ob.remind; render(); },
  'ob-level': (d) => { UI.ob.level = d.l; render(); },
  'ob-back': () => { UI.ob.step = 'goal'; render(); },
  'ob-next': () => {
    const o = UI.ob;
    if (o.step === 'goal') {
      S.goal = o.goal; S.remind.on = o.remind; save();
      if (o.remind) requestNotify();
      o.step = 'level';
      return render();
    }
    if (o.level === 'test') return startPlacement();
    S.onboarded = true; save();
    UI.view = 'learn'; render(); scrollToCurrent();
    if (typeof consentCheck === 'function') consentCheck(); // เข้าสู่ระบบระหว่างหน้าเริ่มต้น → ถามนโยบาย/ชื่อตอนนี้
  },
  'toggle-sound': () => { S.settings.sound = !S.settings.sound; save(); render(); SFX.play('tap'); },
  'toggle-music': () => { S.settings.music = S.settings.music === false; save(); Music.sync(); render(); },
  'toggle-adaptive': () => { S.settings.adaptive = S.settings.adaptive === false; save(); render(); },
  'toggle-motion': () => { S.settings.reduceMotion = !S.settings.reduceMotion; save(); render(); },
  'toggle-fx3d': () => { if (!webglOK() || S.settings.reduceMotion) return; S.settings.fx3d = S.settings.fx3d === false; save(); render(); if (S.settings.fx3d) fx3dPreload(); },
  'text-size': (d) => { S.settings.textSize = d.s; save(); render(); },
  'sfx-test': () => SFX.play('complete'),
  export: () => exportProgress(),
  install: async () => {
    const p = UI.installPrompt;
    if (!p) return;
    p.prompt();
    const { outcome } = await p.userChoice;
    UI.installPrompt = null;
    if (outcome !== 'accepted') render();
  },
  'import-yes': () => {
    // XP ลีกของสัปดาห์นี้ไม่ได้มาจากไฟล์สำรอง (กันการแก้ไฟล์เพื่อเพิ่มอันดับ)
    const st = { ...UI.pendingImport.state, week: { ...S.week } };
    try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* ignore */ }
    S = load(); save();
    UI.pendingImport = null; UI.sheet = null;
    showToast('กู้คืนความคืบหน้าแล้ว');
  },
  'sgoal-set': (d) => { S.streakGoal = { n: +d.n, start: S.lastDay === today() ? S.streak - 1 : S.streak, done: false }; save(); SFX.play('tap'); render(); },
  'sgoal-reset': () => { S.streakGoal = null; save(); render(); },
  'toggle-remind': () => { S.remind.on = !S.remind.on; save(); render(); requestNotify(); },
  buy: (d) => {
    const it = SHOP.find((x) => x.id === d.id);
    if (!it.outfit && it.blocked?.()) return;
    if (S.nectar < it.price) return showToast(`น้ำหวานไม่พอ ต้องใช้ ${it.price} (มี ${S.nectar})`);
    S.nectar -= it.price;
    let msg;
    if (it.outfit) { S.owned[it.id] = true; S.outfit = it.id; msg = `น้องผึ้งใส่${it.name}แล้ว!`; } else msg = it.buy();
    save();
    SFX.play('reward');
    showToast(msg);
  },
  wear: (d) => { S.outfit = S.outfit === d.id ? null : d.id; save(); render(); },
  weak: () => startSession('practice', uniq(weakLessons().slice(0, 3).flatMap((x) => x.n.gens)), { weak: true }),
  skill: (d) => startSession('practice', NODES[+d.i].gens, { weak: true }),
  practice: (d) => { const p = PRACTICE.find((x) => x.id === d.id); startSession('practice', practiceGens(p), { practice: p.id }); },
  'review-mistakes': () => { const g = mistakeGens(); if (g.length) startSession('practice', g, { review: true }); },
  legend: () => { UI.sheet = { type: 'legend' }; render(); },
  'legend-start': (d) => { const u = UNITS.find((x) => x.id === d.u); startSession('legend', uniq(u.lessons.flatMap((l) => l.gens)), { unit: u.id }); },
  stories: () => { UI.sheet = { type: 'stories' }; render(); },
  'story-start': (d) => startStory(d.id),
  's-opt': (d) => { SFX.play('tap'); UI.st.sel = +d.k; render(); },
  's-key': (d) => { SFX.play('tap'); UI.st.input = editInput(UI.st.input, d.k); render(); },
  's-check': () => checkStory(),
  's-next': () => nextStory(),
  'quit-story': () => { UI.st = null; UI.view = 'practice'; render(); },
  'timed-start': () => startTimed(),
  'timed-ans': (d) => answerTimed(+d.k),
  'timed-quit': () => { clearInterval(timedTick.id); if (UI.T) submitRun('timed', UI.T, {}, false); UI.T = null; UI.view = 'practice'; render(); },
});
