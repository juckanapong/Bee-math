/* BeeMath — เพื่อน · สตรีคเพื่อน · ภารกิจคู่หู (ระยะ 2c)
   ต้องล็อกอิน (js/cloud.js) และรัน supabase/friends.sql แล้ว · เรียกข้อมูลผ่านฟังก์ชัน RPC เท่านั้น */

const Friends = { data: null, at: 0, error: null, notified: {}, sent: {} };
const FQ_REWARD = 30; // น้ำหวานที่ได้คนละเท่านี้เมื่อภารกิจคู่หูสำเร็จ

const msgText = (m) => (m.kind === 'cheer' ? `${m.name} ส่งกำลังใจให้คุณ` : `${m.name} เตือนให้มาเรียนวันนี้`);
// จำนวนเรื่องที่รอดู: คำขอเป็นเพื่อน + ข้อความที่ยังไม่อ่าน (ใช้แสดงจุดแจ้งเตือน)
const friendsAlert = () => (Friends.data ? Friends.data.incoming.length + Friends.data.inbox.filter((m) => !m.seen).length : 0);

async function friendsSync(force = false) {
  if (!Cloud.client || !Cloud.user || !netOK()) return;
  if (!force && Date.now() - Friends.at < 60000) return;
  Friends.at = Date.now();
  const { data, error } = await Cloud.client.rpc('friends_overview');
  if (error || !data) { Friends.error = cloudError(error); return; }
  Friends.data = data; Friends.error = null;
  const fresh = data.inbox.filter((m) => !m.seen && !Friends.notified[m.id]);
  fresh.forEach((m) => { Friends.notified[m.id] = true; });
  if (fresh.length && UI.view !== 'friends' && !['lesson', 'timed', 'story'].includes(UI.view)) {
    SFX.play('reward');
    showToast(msgText(fresh[0]) + (fresh.length > 1 ? ` และอีก ${fresh.length - 1} ข้อความ` : ''));
  } else cloudRender();
}
// เปิดหน้าเพื่อน: ดึงข้อมูลใหม่ถ้าเก่ากว่า 20 วินาที และทำเครื่องหมายว่าอ่านข้อความแล้ว
function friendsRefresh() {
  if (!Cloud.user) return;
  if (typeof feedSync === 'function') setTimeout(() => feedSync(), 0);
  if (Date.now() - Friends.at > 20000) setTimeout(() => friendsSync(true), 0);
  if (Friends.data?.inbox.some((m) => !m.seen)) {
    Friends.data.inbox.forEach((m) => { m.seen = true; });
    Cloud.client.rpc('inbox_seen');
  }
}
async function friendsCall(fn, args) {
  const { data, error } = await Cloud.client.rpc(fn, args);
  if (error) { showToast(cloudError(error)); return null; }
  return data ?? true;
}

// ---------- ฟีดความเคลื่อนไหว (supabase/notify_feed.sql) ----------
const FEED_ICON = { unit: 'trophy', legend: 'crown', league: 'up', streak: 'flame', goal: 'target' };
function feedText(e) {
  const who = e.me ? 'คุณ' : esc(e.name), d = e.data || {};
  if (e.kind === 'unit') return `${who}ผ่านบทที่ ${d.unit} · ${esc(d.title || '')}`;
  if (e.kind === 'legend') return `${who}ผ่านระดับตำนานบทที่ ${d.unit}`;
  if (e.kind === 'league') return `${who}เลื่อนขึ้นลีก${esc(d.name || '')}`;
  if (e.kind === 'streak') return `${who}เรียนต่อเนื่องครบ ${d.days} วัน`;
  return `${who}ทำเป้าหมายสตรีค ${d.days} วันสำเร็จ`;
}
function feedHTML() {
  const list = (flag('feed') && typeof Feed !== 'undefined' && Feed.data) || [];
  if (!list.length) return '';
  return `<section><h2 class="shop-sec">ความเคลื่อนไหว</h2><div class="list-card">${list.slice(0, 12).map((e) => `<div class="friend-row feed-row">
    ${e.me ? `<span class="av" style="background:var(--honey)">คุณ</span>` : friendAv(e.name, e.avatar)}
    <span class="setting-main"><b>${feedText(e)}</b><small>${icon(FEED_ICON[e.kind] || 'star', 13)} ${timeAgo(new Date(e.at).getTime())}</small></span>
    ${e.me ? (e.kudos ? `<span class="kudos-count" aria-label="ได้กำลังใจ ${e.kudos} คน">${icon('heart', 16)}${e.kudos}</span>` : '')
      : `<button class="kudos-btn ${e.gave ? 'on' : ''}" data-act="feed-kudos" data-id="${e.id}" aria-pressed="${e.gave}" aria-label="${e.gave ? 'ให้กำลังใจแล้ว' : 'ให้กำลังใจ'}" ${e.gave ? 'disabled' : ''}>${icon('heart', 18)}<span>${e.kudos || ''}</span></button>`}
  </div>`).join('')}</div></section>`;
}

// ---------- หน้าเพื่อน ----------
const friendAv = (name, avatar, cls = 'av') => `<span class="${cls}" style="background:${avatar}">${esc(initial(name))}</span>`;
function questCard(d) {
  const q = d.quest;
  if (!q) {
    if (!d.friends.length) return '';
    return `<section class="card fq-card">
      <div class="fq-top"><span class="fq-label">ภารกิจคู่หู · สัปดาห์นี้</span><span class="fq-reward">${icon('drop', 15)}คนละ ${FQ_REWARD}</span></div>
      <b class="fq-title">ชวนเพื่อนสะสม XP รวมกันให้ได้ 300 XP</b>
      <button class="btn primary" data-act="fq-pick">${icon('users', 20)} เลือกเพื่อนคู่หู</button></section>`;
  }
  const mine = q.mine, total = mine + q.theirs, done = total >= q.target; // XP ลีกจากเซิร์ฟเวอร์ (ไม่ใช้ XP ในเครื่อง)
  const claimed = !!S.fqClaimed[q.week];
  const pm = Math.min(100, (mine / q.target) * 100), pt = Math.min(100 - pm, (q.theirs / q.target) * 100);
  return `<section class="card fq-card">
    <div class="fq-top"><span class="fq-label">ภารกิจคู่หู · เหลือ ${weekLeft()}</span><span class="fq-reward">${icon('drop', 15)}คนละ ${FQ_REWARD}</span></div>
    <div class="fq-pair">${friendAv('คุณ', 'var(--honey)', 'av me-av')}${friendAv(q.partner_name, q.partner_avatar)}<b class="fq-title">สะสม XP รวมกันให้ได้ ${q.target} XP</b></div>
    <div class="fq-bar" role="img" aria-label="คุณ ${mine} XP ${esc(q.partner_name)} ${q.theirs} XP รวม ${total} จาก ${q.target}">
      <i style="width:${pm}%;background:var(--honey)"></i><i style="width:${pt}%;background:var(--blue)"></i><span>${Math.min(total, q.target)} / ${q.target}</span></div>
    <div class="fq-legend"><span><i style="background:var(--honey)"></i>คุณ ${mine}</span><span><i style="background:var(--blue)"></i>${esc(q.partner_name)} ${q.theirs}</span></div>
    ${claimed ? `<span class="claimed">${icon('check', 16)} รับรางวัลแล้ว</span>`
      : done ? `<button class="btn primary" data-act="fq-claim" data-w="${q.week}">${icon('drop', 18)} รับ ${FQ_REWARD} น้ำหวาน</button>` : ''}
  </section>`;
}
function viewFriends() {
  let body;
  if (typeof Cloud === 'undefined' || !Cloud.enabled() || !Cloud.user) {
    body = `<div class="card acct-card"><div class="acct-intro">${bee(64)}<p>เพิ่มเพื่อน ส่งกำลังใจ และทำภารกิจคู่หูได้เมื่อเข้าสู่ระบบ</p></div>
      ${Cloud?.enabled?.() ? '<button class="btn primary" data-act="go" data-v="account">เข้าสู่ระบบ / สมัครบัญชี</button>' : '<p class="muted">ยังไม่ได้เปิดระบบบัญชี</p>'}</div>`;
  } else if (!Friends.data) {
    friendsRefresh();
    body = `<div class="card acct-card"><p class="muted">${Friends.error ? esc(Friends.error) : 'กำลังโหลดรายชื่อเพื่อน…'}</p></div>`;
  } else {
    friendsRefresh();
    const d = Friends.data;
    const inbox = d.inbox.slice(0, 5);
    body = `
      ${inbox.length ? `<section><h2 class="shop-sec">ข้อความจากเพื่อน</h2><div class="list-card">${inbox.map((m) =>
        `<div class="friend-row">${friendAv(m.name, m.avatar)}<span class="setting-main"><b>${esc(msgText(m))}</b><small>${timeAgo(new Date(m.at).getTime())}</small></span>
          ${icon(m.kind === 'cheer' ? 'heart' : 'bell', 20)}</div>`).join('')}</div></section>` : ''}
      ${feedHTML()}
      ${questCard(d)}
      ${d.incoming.length ? `<section><h2 class="shop-sec">คำขอเป็นเพื่อน</h2><div class="list-card">${d.incoming.map((f) =>
        `<div class="friend-row">${friendAv(f.name, f.avatar)}<span class="setting-main"><b>${esc(f.name)}</b><small>อยากเป็นเพื่อนกับคุณ</small></span>
          <button class="price-btn" data-act="friend-accept" data-id="${f.id}">ยอมรับ</button>
          <button class="price-btn ghost" data-act="friend-decline" data-id="${f.id}">ปฏิเสธ</button></div>`).join('')}</div></section>` : ''}
      <section><div class="sec-row tight"><h2>เพื่อนของฉัน</h2><span>${d.friends.length} คน</span></div>
        ${d.friends.length ? `<div class="list-card">${d.friends.map((f) => {
          const kind = f.today ? 'cheer' : 'nudge', sent = Friends.sent[f.id + ':' + kind];
          return `<div class="friend-row">${friendAv(f.name, f.avatar)}
            <span class="setting-main"><b>${esc(f.name)}</b><small class="${f.today ? 'ok' : 'warn'}">${f.today ? 'เรียนวันนี้แล้ว' : 'ยังไม่ได้เรียนวันนี้'} · ${f.week_xp} XP สัปดาห์นี้${f.streak ? ` · สตรีค ${f.streak} วัน` : ''}</small></span>
            ${f.pair_streak ? `<span class="pair-streak" title="สตรีคคู่: เรียนพร้อมกัน ${f.pair_streak} วันติด" aria-label="สตรีคคู่ ${f.pair_streak} วัน">${icon('flame', 18)}${f.pair_streak}</span>` : ''}
            <button class="price-btn ${f.today ? 'ghost' : ''}" data-act="friend-send" data-id="${f.id}" data-k="${kind}" data-n="${esc(f.name)}" ${sent ? 'disabled' : ''}>${sent ? 'ส่งแล้ว' : f.today ? 'ส่งกำลังใจ' : 'เตือน'}</button>
            <button class="x mini" data-act="friend-remove-ask" data-id="${f.id}" data-n="${esc(f.name)}" aria-label="เลิกเป็นเพื่อนกับ ${esc(f.name)}">${icon('x', 16)}</button></div>`;
        }).join('')}</div>`
          : `<div class="card acct-card"><p class="muted">ยังไม่มีเพื่อน ส่งรหัสของคุณให้เพื่อน หรือกด "เพิ่มเพื่อน" แล้วกรอกรหัสของเพื่อน</p></div>`}
      </section>
      ${d.outgoing.length ? `<p class="muted small">รอตอบรับ: ${d.outgoing.map((f) => esc(f.name)).join(', ')}</p>` : ''}
      <section class="code-card">
        <span class="setting-main"><small>รหัสเพื่อนของคุณ</small><b class="friend-code">${esc(d.code)}</b></span>
        <button class="price-btn ghost" data-act="friend-copy">คัดลอก</button></section>
      <p class="muted small">เพื่อนจะเห็นแค่ชื่อที่แสดง สีอวตาร สตรีค และ XP ของสัปดาห์นี้ และส่งหากันได้แค่ข้อความสำเร็จรูป</p>`;
  }
  const add = Cloud?.user ? `<button class="price-btn" data-act="friend-add">${icon('plus', 16)} เพิ่มเพื่อน</button>` : '';
  return shell(`<div class="sub-body">${body}</div>`, { sub: { title: 'เพื่อน', extra: add } });
}

Object.assign(SHEETS, {
  'friend-add'() {
    return `<div class="sheet-card"><h2>เพิ่มเพื่อน</h2>
      <form class="acct-form" data-form="friend-add">
        <label class="fld">รหัสเพื่อนของเพื่อน<input id="friend-code" placeholder="BEE-XXXXX" maxlength="9" autocapitalize="characters" autocomplete="off" required></label>
        <button class="btn primary" type="submit">ส่งคำขอเป็นเพื่อน</button></form>
      ${Friends.data ? `<p class="muted small">รหัสของคุณคือ <b>${esc(Friends.data.code)}</b> ให้เพื่อนกรอกรหัสนี้ แล้วกดยอมรับคำขอได้เลย</p>` : ''}</div>`;
  },
  'friend-remove'(s) {
    return `<div class="sheet-card center"><h2>เลิกเป็นเพื่อนกับ ${esc(s.name)}?</h2>
      <p>สตรีคคู่และภารกิจคู่หูกับเพื่อนคนนี้จะหายไป</p>
      <button class="btn danger" data-act="friend-remove" data-id="${s.id}">เลิกเป็นเพื่อน</button><button class="btn ghost" data-act="close">ยกเลิก</button></div>`;
  },
  'fq-pick'() {
    const fs = Friends.data?.friends || [];
    return `<div class="sheet-card"><h2>เลือกเพื่อนคู่หูสัปดาห์นี้</h2>
      <p>สะสม XP รวมกันให้ได้ 300 XP ก่อนจบสัปดาห์ สำเร็จแล้วได้คนละ ${FQ_REWARD} น้ำหวาน</p>
      <div class="list-card">${fs.map((f) => `<div class="friend-row">${friendAv(f.name, f.avatar)}<span class="setting-main"><b>${esc(f.name)}</b><small>${f.week_xp} XP สัปดาห์นี้</small></span>
        <button class="price-btn" data-act="fq-start" data-id="${f.id}" data-n="${esc(f.name)}">เลือก</button></div>`).join('')}</div></div>`;
  },
});

const REQUEST_MSG = {
  sent: 'ส่งคำขอแล้ว รอเพื่อนกดยอมรับ', accepted: 'เป็นเพื่อนกันแล้ว!', already: 'เป็นเพื่อนกันอยู่แล้ว',
  self: 'นี่คือรหัสของคุณเอง', not_found: 'ไม่พบรหัสนี้ ลองตรวจตัวอักษรอีกครั้ง', limit: 'มีเพื่อนครบ 100 คนแล้ว',
};
FORM_HANDLERS['friend-add'] = async () => {
  let code = (document.getElementById('friend-code')?.value || '').trim().toUpperCase().replace(/\s/g, '');
  if (code && !code.startsWith('BEE-')) code = 'BEE-' + code.replace(/^BEE/, '');
  const r = await friendsCall('friend_request', { p_code: code });
  if (!r) return;
  UI.sheet = null;
  if (r === 'accepted' || r === 'sent') SFX.play('reward');
  showToast(REQUEST_MSG[r] || r);
  friendsSync(true);
};
Object.assign(ACT, {
  'friend-add': () => { UI.sheet = { type: 'friend-add' }; render(); document.getElementById('friend-code')?.focus(); },
  'friend-copy': async () => {
    try { await navigator.clipboard.writeText(Friends.data.code); showToast('คัดลอกรหัสแล้ว ส่งให้เพื่อนได้เลย'); }
    catch (e) { showToast(`รหัสของคุณ: ${Friends.data.code}`); }
  },
  'friend-accept': async (d) => { if (await friendsCall('friend_respond', { p_user: d.id, p_accept: true })) { SFX.play('reward'); showToast('เป็นเพื่อนกันแล้ว!'); friendsSync(true); } },
  'friend-decline': async (d) => { if (await friendsCall('friend_respond', { p_user: d.id, p_accept: false })) friendsSync(true); },
  'friend-remove-ask': (d) => { UI.sheet = { type: 'friend-remove', id: d.id, name: d.n }; render(); },
  'friend-remove': async (d) => { UI.sheet = null; if (await friendsCall('friend_remove', { p_user: d.id })) { showToast('เลิกเป็นเพื่อนแล้ว'); friendsSync(true); } },
  'friend-send': async (d) => {
    const r = await friendsCall('friend_send', { p_user: d.id, p_kind: d.k });
    if (!r) return;
    Friends.sent[d.id + ':' + d.k] = true;
    if (r === 'sent') SFX.play('tap');
    showToast(r === 'sent' ? (d.k === 'cheer' ? `ส่งกำลังใจให้${d.n}แล้ว` : `เตือน${d.n}แล้ว`) : r === 'already' ? 'วันนี้ส่งไปแล้ว' : 'ยังไม่ได้เป็นเพื่อนกัน');
  },
  'fq-pick': () => { UI.sheet = { type: 'fq-pick' }; render(); },
  'feed-kudos': (d) => { SFX.play('reward'); feedKudos(+d.id); },
  'fq-start': async (d) => {
    const r = await friendsCall('friend_quest_start', { p_user: d.id });
    if (!r) return;
    UI.sheet = null;
    showToast(r === 'started' ? `เริ่มภารกิจคู่หูกับ${d.n}แล้ว!` : r === 'busy' ? 'คุณหรือเพื่อนมีภารกิจคู่หูสัปดาห์นี้แล้ว' : 'ยังไม่ได้เป็นเพื่อนกัน');
    friendsSync(true);
  },
  'fq-claim': (d) => {
    if (S.fqClaimed[d.w]) return;
    S.fqClaimed[d.w] = true;
    S.nectar += FQ_REWARD;
    save();
    SFX.play('levelup');
    showToast(`ภารกิจคู่หูสำเร็จ! +${FQ_REWARD} น้ำหวาน`);
  },
});
VIEWS.friends = viewFriends;
SUBPAGES.push('friends');
