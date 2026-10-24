/* BeeMath — ห้องเรียนและแดชบอร์ดครู (ระยะ 2d) · ใช้ RPC ใน supabase/classroom.sql
   นักเรียน: เข้าห้องด้วยรหัส (บัญชีอีเมล หรือบัญชีห้องเรียนแบบไม่ใช้อีเมล) · เห็นงานที่ครูมอบหมายบนหน้าหลัก
   ครู: สร้างห้อง แจกรหัส ดูความคืบหน้ารายคนและจุดอ่อนรายทักษะ มอบหมายงานพร้อมวันส่ง */

const Classroom = { mine: null, mineErr: null, at: 0, teach: null, dash: {}, sel: null, error: null, loading: false, league: {}, leagueErr: null, leagueBusy: false, teachTried: false };

// ---------- ข้อมูล ----------
async function classroomSync(force = false) {
  if (!Cloud.client || !Cloud.user || !netOK()) return;
  if (!force && Date.now() - Classroom.at < 60000) return;
  Classroom.at = Date.now();
  const { data, error } = await Cloud.client.rpc('my_classes');
  if (error) { Classroom.mineErr = cloudError(error); if (UI.view === 'classes') cloudRender(); return; }
  Classroom.mine = data || []; Classroom.mineErr = null;
  if (['learn', 'classes'].includes(UI.view)) cloudRender();
}
async function teacherLoad(classId = Classroom.sel) {
  if (!Cloud.user) return;
  Classroom.loading = true;
  const { data, error } = await Cloud.client.rpc('teacher_classes');
  if (error) { Classroom.error = cloudError(error); Classroom.loading = false; return cloudRender(); }
  Classroom.teach = data || [];
  Classroom.sel = Classroom.teach.some((c) => c.id === classId) ? classId : Classroom.teach[0]?.id ?? null;
  if (Classroom.sel !== null) {
    const r = await Cloud.client.rpc('class_dashboard', { p_class: Classroom.sel });
    if (r.error) Classroom.error = cloudError(r.error);
    else { Classroom.dash[Classroom.sel] = { ...r.data, at: Date.now() }; Classroom.error = null; }
  }
  Classroom.loading = false;
  cloudRender();
}
// รายชื่อห้องที่เป็นครู (ไม่โหลดแดชบอร์ด) ใช้ตัดสินว่าจะแสดงแท็บ "นักเรียนในห้อง" บนหน้าอันดับหรือไม่ · โหลดครั้งเดียวต่อการเข้าสู่ระบบ
async function teachList() {
  if (Classroom.teachTried || Classroom.teach !== null || !Cloud.client || !Cloud.user || Cloud.user.is_anonymous || !netOK()) return;
  Classroom.teachTried = true;
  const { data, error } = await Cloud.client.rpc('teacher_classes');
  if (error) return;
  Classroom.teach = data || [];
  if (!Classroom.teach.some((c) => c.id === Classroom.sel)) Classroom.sel = Classroom.teach[0]?.id ?? null;
  if (Classroom.teach.length && UI.view === 'board') cloudRender();
}
// ลีกของนักเรียนในห้อง (supabase/league_class.sql) · เก็บแยกตามห้อง โหลดใหม่ได้ทุก 1 นาที
async function classLeagueLoad(classId = Classroom.sel, force = false) {
  if (!Cloud.client || !Cloud.user || classId == null || Classroom.leagueBusy || !netOK()) return;
  const have = Classroom.league[classId];
  if (!force && (have && Date.now() - have.at < 60000)) return;
  Classroom.leagueBusy = true;
  const { data, error } = await Cloud.client.rpc('class_league', { p_class: classId });
  Classroom.leagueBusy = false;
  if (error) Classroom.leagueErr = cloudError(error);
  else { Classroom.league[classId] = { ...data, at: Date.now() }; Classroom.leagueErr = null; }
  cloudRender();
}
async function classCall(fn, args, form) {
  const { data, error } = await Cloud.client.rpc(fn, args);
  if (error) { form ? formError(form, cloudError(error)) : showToast(cloudError(error)); return null; }
  return data ?? true;
}

// ---------- ตัวช่วยคำนวณ ----------
const nodeById = (id) => NODES.find((n) => n.id === id);
const nodeLabel = (id) => { const n = nodeById(id); return n ? (n.kind === 'test' ? `ด่านทดสอบบทที่ ${n.ui + 1}` : n.title) : id; };
const doneCount = (doneSet, nodes) => nodes.filter((id) => doneSet.has(id)).length;
// สถานะงาน: เสร็จ / เลยกำหนด / ใกล้ส่ง / ปกติ
function dueInfo(a, finished) {
  if (finished) return { cls: 'ok', text: 'ทำครบแล้ว' };
  if (!a.due) return { cls: '', text: 'ไม่มีกำหนดส่ง' };
  const days = dayNum(a.due) - dayNum(today());
  const date = new Date(a.due + 'T00:00:00').toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' });
  if (days < 0) return { cls: 'late', text: `เลยกำหนด (${date})` };
  if (days <= 1) return { cls: 'soon', text: days === 0 ? 'ส่งวันนี้' : 'ส่งพรุ่งนี้' };
  return { cls: '', text: `ส่ง ${date}` };
}
// งานที่ยังไม่เสร็จของฉัน (เรียงตามวันส่ง) สำหรับแถบบนหน้าหลัก
function pendingAssignments() {
  const done = new Set(Object.keys(S.done));
  return (Classroom.mine || []).flatMap((c) => c.assignments.map((a) => ({ ...a, cls: c.name })))
    .filter((a) => doneCount(done, a.nodes) < a.nodes.length)
    .sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
}
function assignmentBanner() {
  const list = pendingAssignments().slice(0, 2);
  if (!list.length) return '';
  const done = new Set(Object.keys(S.done));
  return list.map((a) => {
    const d = dueInfo(a, false), next = a.nodes.find((id) => !done.has(id)), i = NODES.findIndex((n) => n.id === next);
    return `<button class="banner hw ${d.cls}" data-act="${i >= 0 ? 'node' : 'go'}" data-i="${i}" data-v="classes">
      ${icon('cap', 22)}<span><b>งานจากครู: ${esc(a.title)}</b><small>${esc(a.cls)} · ${doneCount(done, a.nodes)}/${a.nodes.length} ด่าน · ${d.text}</small></span>${icon('chevron', 20)}</button>`;
  }).join('');
}

// ---------- หน้า "ห้องเรียน" (นักเรียน + ทางเข้าแดชบอร์ดครู) ----------
function viewClasses() {
  let body;
  if (acctPending()) body = acctWaitCard();
  else if (typeof Cloud === 'undefined' || !Cloud.enabled() || !Cloud.user) {
    body = `<div class="card acct-card"><div class="acct-intro">${bee(64)}<p>เข้าห้องเรียนด้วยรหัสจากครู เพื่อรับงานและให้ครูช่วยดูความคืบหน้า</p></div>
      ${Cloud?.enabled?.() ? `<button class="btn primary" data-act="acct-class">เข้าห้องเรียนด้วยรหัส (ไม่ต้องใช้อีเมล)</button>
        <button class="btn" data-act="go" data-v="account">เข้าสู่ระบบด้วยอีเมล</button>` : '<p class="muted">ยังไม่ได้เปิดระบบบัญชี</p>'}</div>`;
  } else {
    if (Date.now() - Classroom.at > 20000) setTimeout(() => classroomSync(true), 0);
    const done = new Set(Object.keys(S.done));
    const mine = Classroom.mine;
    body = `
      <section><h2 class="shop-sec">ห้องเรียนของฉัน</h2>
        ${mine === null ? (Classroom.mineErr ? retryCard(Classroom.mineErr, 'classes-retry') : '<p class="muted">กำลังโหลด…</p>') : mine.length ? mine.map((c) => `<div class="card class-card">
          <div class="class-head"><span class="setting-main"><b>${esc(c.name)}</b><small>${esc(/^ครู/.test(c.teacher || '') ? c.teacher : 'ครู' + (c.teacher || ''))}</small></span>
            <button class="x mini" data-act="class-leave-ask" data-id="${c.id}" data-n="${esc(c.name)}" aria-label="ออกจากห้อง ${esc(c.name)}">${icon('x', 16)}</button></div>
          ${c.assignments.length ? c.assignments.map((a) => {
            const k = doneCount(done, a.nodes), fin = k === a.nodes.length, d = dueInfo(a, fin);
            return `<div class="hw-row ${fin ? 'fin' : ''}"><span class="setting-main"><b>${esc(a.title)}</b><small class="${d.cls}">${d.text}</small></span>
              <span class="hw-count">${k}/${a.nodes.length}</span></div>`;
          }).join('') : '<p class="muted small">ยังไม่มีงานที่ได้รับมอบหมาย</p>'}
        </div>`).join('') : '<p class="muted">ยังไม่ได้เข้าห้องเรียน</p>'}
      </section>
      <form class="card acct-card acct-form" data-form="class-join">
        <label class="fld">รหัสห้องเรียนจากครู<input id="class-code" placeholder="HIVE-XXXX" maxlength="9" autocapitalize="characters" autocomplete="off" required></label>
        <button class="btn primary" type="submit">เข้าห้องเรียน</button></form>
      ${Cloud.user.is_anonymous ? '' : `<section class="card acct-card"><b>สำหรับครู</b>
        <p class="muted">สร้างห้องเรียน แจกรหัสให้นักเรียน แล้วดูความคืบหน้าและมอบหมายงานได้</p>
        <button class="btn" data-act="go" data-v="teacher">${icon('bar', 18)} เปิดแดชบอร์ดครู</button></section>`}`;
  }
  return shell(`<div class="sub-body">${body}</div>`, { sub: { title: 'ห้องเรียน' } });
}

// ---------- แดชบอร์ดครู ----------
// ความแม่นยำของนักเรียน 1 คนในบทเรียน n (null = ตอบไม่ถึง 5 ข้อ)
function lessonPct(st, n) {
  let ok = 0, tot = 0;
  n.gens.forEach((g) => { const v = st.skills?.[g]; if (v) { ok += v[0]; tot += v[1]; } });
  return tot >= 5 ? Math.round((ok / tot) * 100) : null;
}
function studentStatus(st) {
  const idle = st.last_active ? Math.floor((Date.now() - new Date(st.last_active).getTime()) / 864e5) : 99;
  const acc = st.answered ? Math.round((st.correct / st.answered) * 100) : null;
  if (st.answered >= 10 && acc < 60) return { cls: 'help', text: 'ต้องช่วย', acc, idle };
  if (idle >= 3) return { cls: 'away', text: idle >= 99 ? 'ยังไม่เริ่ม' : `ไม่เข้า ${idle} วัน`, acc, idle };
  return { cls: 'ok', text: 'ปกติ', acc, idle };
}
const currentOf = (doneSet) => { const n = NODES.find((x) => !doneSet.has(x.id)); return n ? `บทที่ ${n.ui + 1} · ${n.kind === 'test' ? 'ด่านทดสอบ' : n.title}` : 'เรียนครบแล้ว'; };
// ความแม่นยำรายบทเรียนของทั้งห้อง จาก 10 ข้อล่าสุดของแต่ละตัวสร้างโจทย์
function classSkills(students) {
  return NODES.filter((n) => n.kind === 'lesson').map((n) => {
    let ok = 0, tot = 0;
    students.forEach((st) => n.gens.forEach((g) => { const v = st.skills[g]; if (v) { ok += v[0]; tot += v[1]; } }));
    return { n, tot, pct: tot ? Math.round((ok / tot) * 100) : null };
  }).filter((x) => x.tot >= 5).sort((a, b) => a.pct - b.pct);
}
function viewTeacher() {
  let body;
  if (acctPending()) body = acctWaitCard();
  else if (typeof Cloud === 'undefined' || !Cloud.user || Cloud.user.is_anonymous) {
    body = `<div class="card acct-card"><p>แดชบอร์ดครูต้องเข้าสู่ระบบด้วยอีเมล</p><button class="btn primary" data-act="go" data-v="account">เข้าสู่ระบบ</button></div>`;
  } else if (Classroom.teach === null) {
    // โหลดไม่สำเร็จ: แสดงปุ่มลองใหม่ ไม่โหลดซ้ำเอง (เดิมวนเรียกเซิร์ฟเวอร์ไม่หยุด)
    if (!Classroom.loading && !Classroom.error) setTimeout(() => teacherLoad(), 0);
    body = Classroom.error ? retryCard(Classroom.error, 'teacher-retry') : '<div class="card acct-card"><p class="muted">กำลังโหลดห้องเรียน…</p></div>';
  } else if (!Classroom.teach.length) {
    body = `<div class="card acct-card">${bee(64)}<b>ยังไม่มีห้องเรียน</b><p class="muted">สร้างห้องเรียนแล้วแจกรหัสเข้าห้องให้นักเรียน</p>
      <button class="btn primary" data-act="class-new">${icon('plus', 18)} สร้างห้องเรียน</button></div>`;
  } else {
    const d = Classroom.dash[Classroom.sel];
    const cls = Classroom.teach.find((c) => c.id === Classroom.sel);
    const head = `<div class="t-head">
      <label class="fld t-select">ห้องเรียน<select id="class-select">${Classroom.teach.map((c) => `<option value="${c.id}" ${c.id === Classroom.sel ? 'selected' : ''}>${esc(c.name)} · ${c.students} คน</option>`).join('')}</select></label>
      <div class="code-card"><span class="setting-main"><small>รหัสเข้าห้อง</small><b class="friend-code">${esc(cls.code)}</b></span><button class="price-btn ghost" data-act="class-copy" data-c="${esc(cls.code)}">คัดลอก</button></div>
      <div class="t-actions"><button class="price-btn" data-act="class-new">${icon('plus', 16)} ห้องใหม่</button>
        <button class="price-btn ghost" data-act="teacher-refresh" ${Classroom.loading ? 'disabled' : ''}>${icon('refresh', 16)} รีเฟรช</button></div></div>
      <div class="seg t-tabs" role="tablist" aria-label="แดชบอร์ด">${[['overview', 'ภาพรวม'], ['league', 'ลีก']].map(([t, l]) => `<button role="tab" aria-selected="${(UI.tTab || 'overview') === t}" class="${(UI.tTab || 'overview') === t ? 'on' : ''}" data-act="t-tab" data-t="${t}">${l}</button>`).join('')}</div>`;
    if (UI.tTab === 'league') body = head + teacherLeagueHTML();
    else if (!d) body = head + (Classroom.error && !Classroom.loading ? retryCard(Classroom.error, 'teacher-retry') : '<p class="muted">กำลังโหลดข้อมูลห้อง…</p>');
    else {
      const sts = d.students.map((st) => ({ ...st, doneSet: new Set(st.done), status: studentStatus(st) }));
      const n = sts.length;
      const accs = sts.filter((s) => s.status.acc !== null).map((s) => s.status.acc);
      const avgAcc = accs.length ? Math.round(accs.reduce((a, b) => a + b, 0) / accs.length) : null;
      const todayN = sts.filter((s) => s.today).length;
      const watch = sts.filter((s) => s.status.cls !== 'ok');
      const nameBtn = (s) => `<button class="t-name-link" data-act="student-open" data-id="${s.id}">${esc(s.name)}</button>`;
      const assignRows = d.assignments.map((a) => {
        const fin = sts.filter((s) => doneCount(s.doneSet, a.nodes) === a.nodes.length).length;
        const started = sts.filter((s) => { const k = doneCount(s.doneSet, a.nodes); return k > 0 && k < a.nodes.length; }).length;
        const di = dueInfo(a, n > 0 && fin === n);
        return `<div class="hw-row t"><span class="setting-main"><b>${esc(a.title)}</b><small class="${di.cls}">${di.text} · ${a.nodes.length} ด่าน</small>
            <span class="stack-bar" role="img" aria-label="ทำครบ ${fin} กำลังทำ ${started} ยังไม่เริ่ม ${n - fin - started}">
              <i style="width:${n ? (fin / n) * 100 : 0}%;background:var(--green)"></i><i style="width:${n ? (started / n) * 100 : 0}%;background:var(--honey)"></i></span>
            <small>ครบ ${fin} คน กำลังทำ ${started} คน ยังไม่เริ่ม ${n - fin - started} คน</small></span>
          <button class="x mini" data-act="assign-delete" data-id="${a.id}" aria-label="ลบงาน ${esc(a.title)}">${icon('x', 16)}</button></div>`;
      }).join('');
      // เรื่องที่ควรสอนซ้ำ: บทเรียนที่ทั้งห้องตอบถูกน้อยที่สุด (ต่ำกว่า 80%) พร้อมสมการตัวอย่างและจำนวนคนที่ยังต่ำกว่า 60%
      const reteach = classSkills(sts).filter((x) => x.pct < 80).slice(0, 3).map((x) => ({
        ...x, low: sts.filter((s) => { const p = lessonPct(s, x.n); return p !== null && p < 60; }), ex: typeof lessonSample === 'function' ? lessonSample(x.n) : null,
      }));
      body = `${head}
        <section class="t-today">
          <p>วันนี้มีนักเรียนเข้าเรียน <b>${todayN} จาก ${n} คน</b>${avgAcc !== null ? ` ทั้งห้องตอบถูกเฉลี่ย <b>${avgAcc}%</b>` : ''}</p>
          ${watch.length ? `<p class="t-watch">${icon('flag', 18)}<span>ควรตามดู ${watch.length} คน: ${watch.map((s) => `${nameBtn(s)} <small class="chip-st ${s.status.cls}">${s.status.text}</small>`).join(' ')}</span></p>`
            : n ? '<p class="t-ok">ทุกคนเรียนตามปกติ</p>' : ''}
        </section>
        <div class="t-grid">
          <section class="card t-card"><h2>เรื่องที่ควรสอนซ้ำ</h2>
            ${reteach.length ? reteach.map((x) => `<div class="rt-row">
                <span class="rt-main"><b>${esc(x.n.title)}</b><small>บทที่ ${x.n.ui + 1} · ทั้งห้องตอบถูก ${x.pct}%${x.low.length ? ` · ${x.low.length} คนยังต่ำกว่า 60%` : ''}</small>
                  ${x.ex ? `<span class="rt-eq">${M(x.ex)}</span>` : ''}</span>
                <span class="rt-pct ${x.pct < 65 ? 'low' : ''}">${x.pct}%</span></div>`).join('')
              : `<p class="muted">${classSkills(sts).length ? 'ห้องนี้ยังไม่มีเรื่องที่ตอบถูกต่ำกว่า 80%' : 'ยังมีข้อมูลไม่พอ (ต้องตอบอย่างน้อย 5 ข้อต่อบทเรียน)'}</p>`}
          </section>
          <section class="card t-card"><div class="rail-head"><h2>งานที่มอบหมาย</h2><button class="price-btn" data-act="assign-new">${icon('plus', 16)} มอบหมายงาน</button></div>
            ${assignRows ? `<div class="list-card plain">${assignRows}</div>` : '<p class="muted">ยังไม่มีงาน กด "มอบหมายงาน" เพื่อเลือกด่านให้นักเรียนทำ</p>'}</section>
        </div>
        <section class="card t-card"><div class="rail-head"><h2>นักเรียน</h2><span class="muted small">แตะชื่อเพื่อดูรายละเอียด</span></div>
          ${n ? `<div class="t-table-wrap"><table class="t-table"><thead><tr><th>ชื่อ</th><th>กำลังเรียน</th><th>ตอบถูก</th><th>สตรีค</th><th>งานค้าง</th><th>สถานะ</th></tr></thead><tbody>
            ${sts.sort((a, b) => ['help', 'away', 'ok'].indexOf(a.status.cls) - ['help', 'away', 'ok'].indexOf(b.status.cls) || a.name.localeCompare(b.name, 'th')).map((s) => `<tr>
              <td><span class="t-name"><span class="av" style="background:${s.avatar}">${esc(initial(s.name))}</span>${nameBtn(s)}</span></td>
              <td>${esc(currentOf(s.doneSet))}</td><td>${s.status.acc === null ? '–' : s.status.acc + '%'}</td><td>${s.streak} วัน</td>
              <td>${d.assignments.filter((a) => doneCount(s.doneSet, a.nodes) < a.nodes.length).length}</td>
              <td><span class="chip-st ${s.status.cls}">${s.status.text}</span></td></tr>`).join('')}
            </tbody></table></div>` : `<p class="muted">ยังไม่มีนักเรียน แจกรหัส <b>${esc(cls.code)}</b> ให้นักเรียนกรอกที่ ตั้งค่า › ห้องเรียน หรือหน้าบัญชี › "เข้าห้องเรียน"</p>`}
        </section>
        <div class="t-foot"><p class="muted small">อัปเดตล่าสุด ${timeAgo(d.at)} ตัวเลขจะเปลี่ยนเมื่อนักเรียนเปิดแอปครั้งถัดไป</p>
          <button class="btn danger-text small" data-act="class-delete-ask">ลบห้องเรียนนี้</button></div>`;
    }
  }
  return shell(`<div class="sub-body teacher">${body}</div>`, { sub: { title: 'แดชบอร์ดครู' }, wide: true, teacher: true });
}

// ---------- ลีกของนักเรียนในห้อง ----------
const addDays = (key, n) => { const d = new Date(key + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const shortDay = (key) => { const [, m, d] = key.split('-'); return `${+d}/${+m}`; };
// สรุปจากข้อมูลดิบ: 8 สัปดาห์ (สัปดาห์นี้อยู่ท้าย) · ลีกตอนนี้/4 สัปดาห์ก่อน · แนวโน้ม · สัปดาห์ที่ไม่ได้แข่งติดกัน · ผลสัปดาห์ที่แล้ว
function classLeagueStats(L) {
  const tiers = L.tiers?.length ? L.tiers : TIERS.map((t, i) => ({ tier: i, ...t }));
  const top = tiers.length - 1;
  const weeks = Array.from({ length: 8 }, (_, i) => addDays(L.week, (i - 7) * 7));
  const students = L.students.map((s) => {
    const by = Object.fromEntries(s.weeks.map((w) => [w.week, w]));
    const cells = weeks.map((k) => by[k] || null);
    const played = cells.filter(Boolean);
    const never = s.tier == null && !played.length;
    const now = never ? null : Math.min(top, s.tier ?? played[played.length - 1].tier);
    const diff = never ? 0 : now - (played[0]?.tier ?? now);
    let missed = 0;
    for (let i = 6; i >= 0 && !cells[i]; i--) missed++;
    // ลีกเมื่อ 4 สัปดาห์ก่อน (ช่องที่ 4): สัปดาห์นั้นหรือก่อนหน้าที่แข่งล่าสุด · ไม่มีเลย = ลีกแรกที่เห็น (ยังไม่เคยแข่งในช่วงนี้ = ลีกตอนนี้)
    const before = cells.slice(0, 4).filter(Boolean);
    const then = never ? null : (before.length ? before[before.length - 1].tier : played[0]?.tier ?? now);
    return { ...s, cells, never, now, diff, missed, then, last: cells[6], curXp: cells[7]?.xp || 0, ups: played.filter((w) => w.settled && w.result > 0).length };
  });
  return { tiers, top, weeks, students };
}
const tierName = (tiers, i) => (i == null ? 'ยังไม่เคยแข่ง' : tiers[i]?.name || '');
function leagueTrend(s) {
  if (s.never) return { cls: '', text: 'ยังไม่เคยแข่ง' };
  if (s.missed >= 2) return { cls: 'down', text: `ไม่ได้แข่ง ${s.missed}${s.missed >= 7 ? '+' : ''} สัปดาห์` };
  if (s.diff > 0) return { cls: 'up', text: `↑ ขึ้น ${s.diff} ลีก` };
  if (s.diff < 0) return { cls: 'down', text: `↓ ลง ${-s.diff} ลีก` };
  return { cls: '', text: 'คงที่' };
}
// ประโยคสรุป: จำนวนคนที่อยู่ลีกที่ 3 ขึ้นไป เทียบ 4 สัปดาห์ก่อน + ผลสัปดาห์ที่แล้ว
function leagueSummary(st) {
  const k = Math.min(2, st.top), sts = st.students.filter((s) => !s.never);
  if (!sts.length) return 'ยังไม่มีนักเรียนในห้องนี้เข้าแข่งลีก นักเรียนจะเข้าลีกเองเมื่อเข้าสู่ระบบและเริ่มเรียน';
  const nowHi = sts.filter((s) => s.now >= k).length, thenHi = sts.filter((s) => s.then >= k).length;
  const lw = leagueLastWeek(st);
  return `4 สัปดาห์ที่ผ่านมา นักเรียนที่อยู่<b>ลีก${esc(tierName(st.tiers, k))}ขึ้นไป</b>${nowHi > thenHi ? `เพิ่มจาก <b>${thenHi} คน</b> เป็น <b>${nowHi} คน</b>` : nowHi < thenHi ? `ลดจาก <b>${thenHi} คน</b> เหลือ <b>${nowHi} คน</b>` : ` มี <b>${nowHi} คน</b>เท่าเดิม`}`
    + ` · สัปดาห์ที่แล้วเลื่อนขึ้น ${lw.up} คน ตก ${lw.down} คน`;
}
function leagueLastWeek(st) {
  const r = { up: 0, down: 0, stay: 0, missed: 0 };
  st.students.forEach((s) => { if (!s.last) r.missed++; else if (s.last.result > 0) r.up++; else if (s.last.result < 0) r.down++; else r.stay++; });
  return r;
}
const leagueChips = (lw) => `<div class="tl-chips">
  <span class="chip-st ok">${icon('up', 14)} เลื่อนขึ้น ${lw.up} คน</span><span class="chip-st away">${icon('down', 14)} ตก ${lw.down} คน</span>
  <span class="chip-st">อยู่ที่เดิม ${lw.stay} คน</span><span class="chip-st">ไม่ได้แข่ง ${lw.missed} คน</span></div>`;
// จำนวนนักเรียนในแต่ละลีก (ลีกสูงสุดอยู่บน) · แถบจาง = 4 สัปดาห์ก่อน
function leagueDistHTML(st) {
  const sts = st.students.filter((s) => !s.never);
  const now = st.tiers.map((_, i) => sts.filter((s) => s.now === i).length), then = st.tiers.map((_, i) => sts.filter((s) => s.then === i).length);
  const max = Math.max(1, ...now, ...then), never = st.students.length - sts.length;
  return `<div class="tl-dist" role="list">${st.tiers.map((t, i) => i).reverse().map((i) => {
    const t = st.tiers[i], d = now[i] - then[i];
    return `<div class="tl-dist-row" role="listitem"><span class="tl-sw" style="background:${t.color}"></span><span class="tl-dist-name">${esc(t.name)}</span>
      <span class="tl-bars" aria-hidden="true"><i style="width:${(now[i] / max) * 100}%;background:${t.color}"></i><i class="then" style="width:${(then[i] / max) * 100}%"></i></span>
      <b>${now[i]}</b><span class="tl-delta ${d > 0 ? 'up' : d < 0 ? 'down' : ''}">${d > 0 ? '+' + d : d < 0 ? '−' + -d : '0'}<span class="sr-only"> จาก 4 สัปดาห์ก่อน</span></span></div>`;
  }).join('')}${never ? `<p class="muted small">ยังไม่เคยแข่ง ${never} คน</p>` : ''}</div>`;
}
const tlAv = (s) => `<span class="av" style="background:${s.avatar}">${esc(initial(s.name))}</span>`;
// ช่องลีก 1 สัปดาห์ในตาราง (หกเหลี่ยมสีลีก · วงประ = ไม่ได้แข่ง)
function tlCell(st, s, i) {
  const c = s.cells[i], wk = i === 7 ? 'สัปดาห์นี้' : `สัปดาห์ ${shortDay(st.weeks[i])}`;
  const label = c ? `${wk}: ${tierName(st.tiers, c.tier)} อันดับ ${c.rank} จาก ${c.n}` : `${wk}: ${i === 7 ? 'ยังไม่ได้เรียน' : 'ไม่ได้แข่ง'}`;
  return `<td class="tl-td" title="${esc(label)}">${c ? `<span class="tl-cell" style="background:${st.tiers[c.tier]?.color}"></span>` : '<span class="tl-cell miss"></span>'}<span class="sr-only">${esc(label)}</span></td>`;
}
const TL_FILTERS = [['all', 'ทุกคน'], ['up', 'ขึ้นลีก'], ['down', 'ตกลีก'], ['missed', 'ไม่ได้แข่ง']];
const tlMatch = (f, s) => f === 'up' ? s.last?.result > 0 : f === 'down' ? s.last?.result < 0 : f === 'missed' ? !s.last : true;
const tlSorters = {
  tier: (a, b) => (b.now ?? -1) - (a.now ?? -1) || b.diff - a.diff || a.name.localeCompare(b.name, 'th'),
  trend: (a, b) => b.diff - a.diff || (b.now ?? -1) - (a.now ?? -1) || a.name.localeCompare(b.name, 'th'),
  name: (a, b) => a.name.localeCompare(b.name, 'th'),
};
// โหลดข้อมูลลีกของห้องที่เลือก: คืน null ระหว่างรอ (และเริ่มโหลด) หรือข้อความผิดพลาด
function classLeagueReady() {
  const L = Classroom.league[Classroom.sel];
  if (!L && !Classroom.leagueErr) setTimeout(() => classLeagueLoad(), 0);
  if (L) return { st: classLeagueStats(L) };
  return { msg: Classroom.leagueErr ? `<p class="muted">${esc(Classroom.leagueErr)}</p><button class="btn" data-act="tl-retry">${icon('refresh', 18)} ลองอีกครั้ง</button>` : '<p class="muted">กำลังโหลดลีกของนักเรียน…</p>' };
}
// แท็บ "ลีก" ในแดชบอร์ดครู
function teacherLeagueHTML() {
  const r = classLeagueReady();
  if (!r.st) return `<section class="card t-card">${r.msg}</section>`;
  const st = r.st, tl = UI.tl || (UI.tl = { f: 'all', sort: 'tier', all: false });
  if (!st.students.length) return '<section class="card t-card"><p class="muted">ยังไม่มีนักเรียนในห้องนี้</p></section>';
  const lw = leagueLastWeek(st);
  const watch = st.students.filter((s) => (!s.never && s.missed >= 2) || s.last?.result < 0);
  const rows = st.students.filter((s) => tlMatch(tl.f, s)).sort(tlSorters[tl.sort] || tlSorters.tier);
  const shown = tl.all ? rows : rows.slice(0, 15);
  const counts = { all: st.students.length, up: lw.up, down: lw.down, missed: lw.missed };
  const nameBtn = (s) => `<button class="t-name-link" data-act="student-league" data-id="${s.id}">${esc(s.name)}</button>`;
  return `<p class="tl-summary">${leagueSummary(st)}</p>
    <div class="t-grid">
      <section class="card t-card"><div class="rail-head"><h2>อยู่ลีกไหนกี่คน</h2><span class="muted small">แถบจาง = 4 สัปดาห์ก่อน</span></div>
        ${leagueDistHTML(st)}<p class="muted small">ผลสัปดาห์ที่แล้ว (${shortDay(st.weeks[6])}–${shortDay(addDays(st.weeks[6], 6))})</p>${leagueChips(lw)}</section>
      <section class="card t-card"><h2>ควรตามดู</h2>
        ${watch.length ? `<ul class="tl-watch">${watch.map((s) => `<li>${tlAv(s)}<span class="setting-main">${nameBtn(s)}<small>${s.last?.result < 0
          ? `ตกจาก${esc(tierName(st.tiers, s.last.tier))}เป็น${esc(tierName(st.tiers, s.now))}`
          : `ไม่ได้แข่ง ${s.missed}${s.missed >= 7 ? '+' : ''} สัปดาห์ติด · ค้างที่${esc(tierName(st.tiers, s.now))}`}</small></span></li>`).join('')}</ul>`
          : '<p class="muted">ไม่มีใครตกลีกหรือหายไปเกิน 1 สัปดาห์</p>'}</section>
    </div>
    <section class="card t-card"><div class="tl-tools"><h2>ลีกรายสัปดาห์ของนักเรียน</h2>
        <div class="tl-filters" role="group" aria-label="กรองนักเรียน">${TL_FILTERS.map(([f, l]) => `<button class="tl-filter ${tl.f === f ? 'on' : ''}" aria-pressed="${tl.f === f}" data-act="tl-filter" data-f="${f}">${l} ${counts[f]}</button>`).join('')}</div>
        <label class="tl-sort">เรียงตาม<select id="tl-sort">${[['tier', 'ลีกตอนนี้'], ['trend', 'ขึ้นมากที่สุด'], ['name', 'ชื่อ']].map(([v, l]) => `<option value="${v}" ${tl.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
      ${rows.length ? `<div class="t-table-wrap"><table class="t-table tl-table"><thead><tr><th scope="col">ชื่อ</th>${st.weeks.map((w, i) => `<th scope="col" class="tl-wk">${i === 7 ? 'ตอนนี้' : shortDay(w)}</th>`).join('')}<th scope="col">ลีกตอนนี้</th><th scope="col">8 สัปดาห์</th><th scope="col" class="num">XP สัปดาห์นี้</th></tr></thead><tbody>
        ${shown.map((s) => { const t = leagueTrend(s); return `<tr><th scope="row"><span class="t-name">${tlAv(s)}${nameBtn(s)}</span></th>
          ${st.weeks.map((_, i) => tlCell(st, s, i)).join('')}<td>${esc(tierName(st.tiers, s.now))}</td><td class="tl-trend ${t.cls}">${t.text}</td><td class="num">${s.curXp}</td></tr>`; }).join('')}
      </tbody></table></div>` : '<p class="muted">ไม่มีนักเรียนในกลุ่มนี้</p>'}
      <div class="tl-legend">${st.tiers.map((t) => `<span><i class="tl-sw" style="background:${t.color}"></i>${esc(t.name)}</span>`).join('')}<span><i class="tl-cell miss"></i>ไม่ได้แข่ง</span>
        ${rows.length > shown.length ? `<button class="btn link" data-act="tl-all">ดูอีก ${rows.length - shown.length} คน</button>` : ''}</div>
    </section>
    <p class="muted small">อัปเดตล่าสุด ${timeAgo(Classroom.league[Classroom.sel].at)} · ลีกจะเปลี่ยนเมื่อจบสัปดาห์ (คืนวันอาทิตย์)</p>`;
}
// กราฟขั้นบันไดของนักเรียน 1 คน: แนวนอน = สัปดาห์ แนวตั้ง = ลีก เลข = อันดับในกลุ่ม
function leagueChartHTML(st, s) {
  const rowH = 34, h = rowH * st.tiers.length, y = (t) => rowH / 2 + rowH * (st.top - t), x = (i) => (i + 0.5) * 100;
  const pts = s.cells.map((c, i) => (c ? [i, c.tier] : null)).filter(Boolean);
  const segs = pts.slice(1).map(([i, t], k) => { const [pi, pt] = pts[k]; return `<line x1="${x(pi)}" y1="${y(pt)}" x2="${x(i)}" y2="${y(t)}" class="${i - pi > 1 ? 'gap' : ''}" vector-effect="non-scaling-stroke"/>`; }).join('');
  const label = s.cells.map((c, i) => `${i === 7 ? 'สัปดาห์นี้' : shortDay(st.weeks[i])} ${c ? `${tierName(st.tiers, c.tier)} อันดับ ${c.rank}` : 'ไม่ได้แข่ง'}`).join(' · ');
  return `<div class="tl-chart" role="img" aria-label="${esc(label)}">
    <div class="tl-axis" style="height:${h}px">${st.tiers.map((t, i) => `<i class="tl-sw" title="${esc(t.name)}" style="top:${y(i) - 11}px;background:${t.color}"></i>`).join('')}</div>
    <div class="tl-plot" style="height:${h}px">
      <svg viewBox="0 0 800 ${h}" preserveAspectRatio="none" aria-hidden="true">${st.tiers.map((_, i) => `<line x1="0" x2="800" y1="${y(i)}" y2="${y(i)}" class="grid" vector-effect="non-scaling-stroke"/>`).join('')}${segs}</svg>
      ${s.cells.map((c, i) => c ? `<span class="tl-dot ${i === 7 ? 'now' : ''}" style="left:calc(${(i + 0.5) * 12.5}% - 13px);top:${y(c.tier) - 15}px;background:${st.tiers[c.tier]?.color};color:${st.tiers[c.tier]?.ink}">${c.rank}</span>`
        : `<span class="tl-dot miss" style="left:calc(${(i + 0.5) * 12.5}% - 10px);top:${y(s.cells.slice(0, i).reverse().find(Boolean)?.tier ?? s.now ?? 0) - 10}px"></span>`).join('')}
    </div></div>
    <div class="tl-xlabels"><span></span>${st.weeks.map((w, i) => `<span class="${i === 7 ? 'now' : ''}">${i === 7 ? 'ตอนนี้' : shortDay(w)}</span>`).join('')}</div>`;
}
// ส่วน "เส้นทางลีก" ในหน้าต่างนักเรียน (ใช้ทั้งในแดชบอร์ดและหน้าอันดับ)
function studentLeagueHTML(id) {
  const L = Classroom.league[Classroom.sel];
  if (!L) { if (!Classroom.leagueErr) setTimeout(() => classLeagueLoad(), 0); return ''; }
  const st = classLeagueStats(L), s = st.students.find((x) => x.id === id);
  if (!s) return '';
  if (s.never) return '<h4>เส้นทางลีก</h4><p class="muted small">ยังไม่เคยแข่งลีก นักเรียนจะเข้าลีกเองเมื่อเริ่มเรียน</p>';
  const missedN = s.cells.slice(0, 7).filter((c) => !c).length;
  return `<h4>เส้นทางลีก 8 สัปดาห์</h4>${leagueChartHTML(st, s)}
    <dl class="st-facts three"><div><dt>ลีกตอนนี้</dt><dd>${esc(tierName(st.tiers, s.now))}</dd></div><div><dt>เลื่อนลีก</dt><dd>${s.ups} ครั้ง</dd></div><div><dt>ไม่ได้แข่ง</dt><dd>${missedN} สัปดาห์</dd></div></dl>
    <p class="tl-note">เลขในหกเหลี่ยมคืออันดับในกลุ่มลีกของสัปดาห์นั้น นักเรียนในห้องเดียวกันอาจอยู่คนละกลุ่ม จึงใช้เทียบกับเพื่อนในห้องตรง ๆ ไม่ได้ ดูว่าลีกขึ้นหรือลงจะชัดกว่า</p>`;
}

// ---------- หน้าอันดับ: แท็บ "นักเรียนในห้อง" (เฉพาะบัญชีที่เป็นครู) ----------
const isTeacher = () => !!(Classroom.teach && Classroom.teach.length);
const boardTabs = () => `<div class="seg two board-tabs" role="tablist" aria-label="มุมมองอันดับ">
  <button role="tab" aria-selected="${UI.boardMode !== 'class'}" class="${UI.boardMode !== 'class' ? 'on' : ''}" data-act="board-mode" data-m="me">ลีกของฉัน</button>
  <button role="tab" aria-selected="${UI.boardMode === 'class'}" class="${UI.boardMode === 'class' ? 'on' : ''}" data-act="board-mode" data-m="class">นักเรียนในห้อง</button></div>`;
function boardClassHTML() {
  const sel = `<label class="fld t-select">ห้องเรียน<select id="class-select-board">${Classroom.teach.map((c) => `<option value="${c.id}" ${c.id === Classroom.sel ? 'selected' : ''}>${esc(c.name)} · ${c.students} คน</option>`).join('')}</select></label>`;
  const r = classLeagueReady();
  if (!r.st) return `${sel}<div class="card t-card">${r.msg}</div>`;
  const st = r.st;
  if (!st.students.length) return `${sel}<div class="card t-card"><p class="muted">ยังไม่มีนักเรียนในห้องนี้</p></div>`;
  // รายชื่อแยกตามลีก (ลีกสูงสุดก่อน) · เปิดสองกลุ่มบนสุดไว้ก่อน
  const groups = st.tiers.map((t, i) => ({ key: String(i), t, list: st.students.filter((s) => s.now === i) })).reverse();
  const never = st.students.filter((s) => s.never);
  if (never.length) groups.push({ key: 'never', t: { name: 'ยังไม่เคยแข่ง', color: 'var(--locked)' }, list: never });
  const filled = groups.filter((g) => g.list.length);
  const open = UI.tlOpen || (UI.tlOpen = new Set(filled.slice(0, 2).map((g) => g.key)));
  return `${sel}<p class="card tl-summary">${leagueSummary(st)}</p>
    <section class="card t-card"><div class="rail-head"><h2>อยู่ลีกไหนกี่คน</h2><span class="muted small">เทียบ 4 สัปดาห์ก่อน</span></div>
      ${leagueDistHTML(st)}<p class="muted small">ผลสัปดาห์ที่แล้ว</p>${leagueChips(leagueLastWeek(st))}</section>
    <h2 class="shop-sec">รายชื่อแยกตามลีก</h2>
    ${filled.map((g) => {
      const on = open.has(g.key), list = g.list.sort(tlSorters.trend);
      return `<section class="card tl-group"><button class="tl-group-head" aria-expanded="${on}" data-act="tl-group" data-k="${g.key}">
          <span class="tl-sw big" style="background:${g.t.color}"></span><b>${esc(g.t.name)}</b><span class="muted">${list.length} คน</span>${icon(on ? 'up' : 'down', 18)}</button>
        ${on ? list.map((s) => { const t = leagueTrend(s); return `<button class="tl-row" data-act="student-league" data-id="${s.id}">${tlAv(s)}
          <span class="setting-main"><b>${esc(s.name)}</b><small class="tl-trend ${t.cls}">${t.text}</small></span><span class="tl-xp">${s.curXp} XP</span></button>`; }).join('') : ''}</section>`;
    }).join('')}`;
}

// ---------- แผ่นป๊อปอัป ----------
Object.assign(SHEETS, {
  'class-new'() {
    return `<div class="sheet-card"><h2>สร้างห้องเรียน</h2>
      <form class="acct-form" data-form="class-new"><label class="fld">ชื่อห้อง<input id="class-name" maxlength="40" placeholder="เช่น ม.1/3 คณิตศาสตร์" required></label>
        ${consentBox(`ฉันจะแจ้งนักเรียนและผู้ปกครองเรื่อง${privacyLink()}ก่อนให้นักเรียนเข้าห้อง (ครูจะเห็นชื่อและความคืบหน้าของนักเรียน)`)}
        <button class="btn primary" type="submit">สร้างห้อง</button></form></div>`;
  },
  'assign-new'(s) {
    const u = s.u ?? 0;
    const nodes = NODES.filter((n) => n.ui === u);
    return `<div class="sheet-card"><h2>มอบหมายงาน</h2>
      <form class="acct-form" data-form="assign-new">
        <label class="fld">บท<select id="assign-unit" data-act-change="assign-unit">${UNITS.map((x, i) => `<option value="${i}" ${i === u ? 'selected' : ''}>บทที่ ${i + 1} · ${x.title}</option>`).join('')}</select></label>
        <fieldset class="fld node-picks"><legend>ด่านที่ต้องทำ</legend>${nodes.map((n) => `<label class="pick-node"><input type="checkbox" name="assign-node" value="${n.id}" checked> ${esc(n.kind === 'test' ? 'ด่านทดสอบท้ายบท' : n.title)}</label>`).join('')}</fieldset>
        <label class="fld">ชื่องาน<input id="assign-title" maxlength="60" value="${esc(UNITS[u].title)}" required></label>
        <label class="fld">วันส่ง<input type="date" id="assign-due" value="${keyOfDay(dayNum(today()) + 7)}"></label>
        <button class="btn primary" type="submit">มอบหมายงาน</button></form></div>`;
  },
  'class-leave'(s) {
    return `<div class="sheet-card center"><h2>ออกจากห้อง ${esc(s.name)}?</h2><p>ครูจะไม่เห็นความคืบหน้าของคุณอีก และงานจากห้องนี้จะหายไป</p>
      <button class="btn danger" data-act="class-leave" data-id="${s.id}">ออกจากห้อง</button><button class="btn ghost" data-act="close">ยกเลิก</button></div>`;
  },
  // รายละเอียดนักเรียน 1 คน: สถานะ งานค้าง และเรื่องที่ยังอ่อน · ปุ่มนำออกอยู่ที่นี่ (ไม่อยู่ในตาราง)
  student(s) {
    const d = Classroom.dash[Classroom.sel], st = d?.students.find((x) => x.id === s.id);
    if (!st) return '<div class="sheet-card"><p class="muted">ไม่พบข้อมูลนักเรียน</p></div>';
    const done = new Set(st.done), status = studentStatus(st);
    const pending = d.assignments.filter((a) => doneCount(done, a.nodes) < a.nodes.length);
    const weak = NODES.filter((n) => n.kind === 'lesson').map((n) => ({ n, p: lessonPct(st, n) })).filter((x) => x.p !== null && x.p < 75).sort((a, b) => a.p - b.p).slice(0, 3);
    return `<div class="sheet-card st-sheet">
      <div class="st-head"><span class="av" style="background:${st.avatar}">${esc(initial(st.name))}</span>
        <span class="setting-main"><h2>${esc(st.name)}</h2><small>${status.idle >= 99 ? 'ยังไม่เริ่มเรียน' : status.idle === 0 ? 'เข้าเรียนวันนี้' : `เข้าเรียนล่าสุด ${status.idle} วันก่อน`}</small></span>
        <span class="chip-st ${status.cls}">${status.text}</span></div>
      <dl class="st-facts"><div><dt>กำลังเรียน</dt><dd>${esc(currentOf(done))}</dd></div>
        <div><dt>ตอบถูก</dt><dd>${status.acc === null ? '–' : `${status.acc}% <small>(${st.correct}/${st.answered} ข้อ)</small>`}</dd></div>
        <div><dt>สตรีค</dt><dd>${st.streak} วัน</dd></div><div><dt>XP สัปดาห์นี้</dt><dd>${st.week_xp}</dd></div></dl>
      <h4>เรื่องที่ยังอ่อน</h4>
      ${weak.length ? `<ul class="st-list">${weak.map((x) => `<li><span>${esc(x.n.title)}</span><b class="${x.p < 60 ? 'low' : ''}">${x.p}%</b></li>`).join('')}</ul>` : '<p class="muted small">ยังไม่มีเรื่องที่ตอบถูกต่ำกว่า 75%</p>'}
      <h4>งานค้าง</h4>
      ${pending.length ? `<ul class="st-list">${pending.map((a) => `<li><span>${esc(a.title)}</span><b>${doneCount(done, a.nodes)}/${a.nodes.length}</b></li>`).join('')}</ul>` : '<p class="muted small">ทำงานครบทุกชิ้นแล้ว</p>'}
      ${studentLeagueHTML(st.id)}
      <button class="btn ghost" data-act="close">ปิด</button>
      <button class="btn danger-text small" data-act="student-remove-ask" data-id="${st.id}" data-n="${esc(st.name)}">นำออกจากห้อง</button></div>`;
  },
  // เส้นทางลีกของนักเรียน 1 คน (แตะชื่อในแท็บลีก หรือหน้าอันดับ › นักเรียนในห้อง)
  'student-league'(s) {
    const L = Classroom.league[Classroom.sel], st = L && classLeagueStats(L), x = st?.students.find((v) => v.id === s.id);
    if (!x) return '<div class="sheet-card"><p class="muted">ไม่พบข้อมูลนักเรียน</p><button class="btn ghost" data-act="close">ปิด</button></div>';
    const t = leagueTrend(x);
    return `<div class="sheet-card st-sheet">
      <div class="st-head">${tlAv(x)}<span class="setting-main"><h2>${esc(x.name)}</h2><small>${x.never ? 'ยังไม่เคยแข่งลีก' : `ตอนนี้อยู่ลีก${esc(tierName(st.tiers, x.now))} · XP สัปดาห์นี้ ${x.curXp}`}</small></span>
        <span class="chip-st ${t.cls === 'up' ? 'ok' : t.cls === 'down' ? 'away' : ''}">${t.text}</span></div>
      ${studentLeagueHTML(x.id)}
      <button class="btn ghost" data-act="close">ปิด</button></div>`;
  },
  'student-remove'(s) {
    return `<div class="sheet-card center"><h2>นำ ${esc(s.name)} ออกจากห้อง?</h2><p>นักเรียนเข้าห้องใหม่ได้ด้วยรหัสเดิม</p>
      <button class="btn danger" data-act="student-remove" data-id="${s.id}">นำออก</button><button class="btn ghost" data-act="close">ยกเลิก</button></div>`;
  },
  'class-delete'() {
    const c = Classroom.teach.find((x) => x.id === Classroom.sel);
    return `<div class="sheet-card center"><h2>ลบห้อง ${esc(c.name)}?</h2><p>รายชื่อนักเรียนในห้องและงานที่มอบหมายจะถูกลบ (ความคืบหน้าของนักเรียนยังอยู่)</p>
      <button class="btn danger" data-act="class-delete">ลบห้องเรียน</button><button class="btn ghost" data-act="close">ยกเลิก</button></div>`;
  },
});

// ---------- ฟอร์ม ----------
const JOIN_MSG = { joined: (n) => `เข้าห้อง ${n} แล้ว!`, already: (n) => `อยู่ในห้อง ${n} แล้ว`, own: () => 'นี่คือห้องที่คุณเป็นครู', not_found: () => 'ไม่พบรหัสห้องนี้ ลองตรวจตัวอักษรอีกครั้ง', limit: () => 'เข้าได้สูงสุด 10 ห้อง' };
const normCode = (raw) => { let c = (raw || '').trim().toUpperCase().replace(/\s/g, ''); if (c && !c.startsWith('HIVE-')) c = 'HIVE-' + c.replace(/^HIVE/, ''); return c; };
async function joinClass(code, form) {
  const r = await classCall('class_join', { p_code: normCode(code) }, form);
  if (!r) return false;
  const msg = (JOIN_MSG[r.status] || (() => r.status))(r.name);
  if (form && !['joined', 'already'].includes(r.status)) { formError(form, msg); return false; } // รหัสผิด: แจ้งใต้ช่อง ไม่ล้างรหัส
  showToast(msg);
  if (r.status === 'joined') SFX.play('reward');
  await classroomSync(true);
  return r.status === 'joined' || r.status === 'already';
}
FORM_HANDLERS['class-join'] = async () => { if (await joinClass(document.getElementById('class-code')?.value, 'class-join')) render(); };
FORM_HANDLERS['class-new'] = async () => {
  const name = document.getElementById('class-name')?.value.trim();
  const r = await classCall('class_create', { p_name: name }, 'class-new');
  if (!r) return;
  UI.sheet = null; SFX.play('reward'); showToast(`สร้างห้อง ${r.name} แล้ว รหัสเข้าห้อง ${r.code}`);
  Classroom.sel = r.id; teacherLoad(r.id);
};
FORM_HANDLERS['assign-new'] = async () => {
  const nodes = [...document.querySelectorAll('input[name="assign-node"]:checked')].map((x) => x.value);
  if (!nodes.length) return formError('assign-new', 'เลือกอย่างน้อย 1 ด่าน');
  const title = document.getElementById('assign-title')?.value.trim(), due = document.getElementById('assign-due')?.value || null;
  const r = await classCall('assignment_create', { p_class: Classroom.sel, p_title: title, p_nodes: nodes, p_due: due }, 'assign-new');
  if (!r) return;
  UI.sheet = null; showToast('มอบหมายงานแล้ว'); teacherLoad();
};
// บัญชีห้องเรียนแบบไม่ใช้อีเมล: ชื่อ + รหัสห้อง → Anonymous sign-in → เข้าห้อง
FORM_HANDLERS['anon-join'] = async () => {
  const a = UI.acct || (UI.acct = { tab: 'class' });
  const name = document.getElementById('acct-name')?.value.trim().slice(0, 20), code = document.getElementById('class-code')?.value;
  if (nameError(name)) { a.err = nameError(name); return render(); }
  a.err = null; a.busy = true; render();
  try {
    const { data, error } = await Cloud.client.auth.signInAnonymously({ options: { data: { display_name: name } } });
    if (error) throw error;
    Cloud.user = data.user;
    // เข้าห้องก่อนซิงก์: รหัสผิดแล้วลบบัญชีที่เพิ่งสร้างทิ้ง (เดิมได้บัญชีค้างที่ไม่ได้อยู่ในห้อง และกลับเข้าไม่ได้)
    const r = await Cloud.client.rpc('class_join', { p_code: normCode(code) });
    const st = r.data?.status;
    if (r.error || !['joined', 'already'].includes(st)) {
      try { await Cloud.client.rpc('delete_my_account'); } catch (e) { /* ignore */ }
      await Cloud.client.auth.signOut();
      Cloud.user = null; Cloud.status = 'ready'; setSyncMeta({});
      a.err = r.error ? cloudError(r.error) : (JOIN_MSG[st] || (() => 'เข้าห้องไม่สำเร็จ ลองตรวจรหัสอีกครั้ง'))(r.data?.name);
    } else {
      S.name = name || S.name; giveConsent('class');
      await cloudPull();
      await classroomSync(true);
      SFX.play('reward'); showToast(JOIN_MSG[st](r.data.name));
      UI.acct = { tab: 'signin' };
    }
  } catch (e) { a.err = cloudError(e); }
  a.busy = false; render();
};

Object.assign(ACT, {
  'acct-class': () => { UI.acct = { tab: 'class' }; ACT.go({ v: 'account' }); },
  'class-leave-ask': (d) => { UI.sheet = { type: 'class-leave', id: +d.id, name: d.n }; render(); },
  'class-leave': async (d) => { UI.sheet = null; if (await classCall('class_leave', { p_class: +d.id })) { showToast('ออกจากห้องแล้ว'); classroomSync(true); } },
  'class-new': () => { UI.sheet = { type: 'class-new' }; render(); document.getElementById('class-name')?.focus(); },
  'class-copy': async (d) => { try { await navigator.clipboard.writeText(d.c); showToast('คัดลอกรหัสห้องแล้ว'); } catch (e) { showToast(`รหัสห้อง: ${d.c}`); } },
  'teacher-retry': () => { Classroom.error = null; render(); teacherLoad(); },
  'classes-retry': () => { Classroom.mineErr = null; render(); classroomSync(true); },
  'teacher-refresh': () => { teacherLoad(); if (UI.tTab === 'league') classLeagueLoad(Classroom.sel, true); },
  'assign-new': () => { UI.sheet = { type: 'assign-new', u: 0 }; render(); },
  'assign-delete': async (d) => { if (await classCall('assignment_delete', { p_id: +d.id })) { showToast('ลบงานแล้ว'); teacherLoad(); } },
  'student-remove-ask': (d) => { UI.sheet = { type: 'student-remove', id: d.id, name: d.n }; render(); },
  'student-open': (d) => { UI.sheet = { type: 'student', id: d.id }; render(); },
  'student-remove': async (d) => { UI.sheet = null; if (await classCall('class_remove_student', { p_class: Classroom.sel, p_user: d.id })) { showToast('นำออกจากห้องแล้ว'); teacherLoad(); } },
  'class-delete-ask': () => { UI.sheet = { type: 'class-delete' }; render(); },
  't-tab': (d) => { UI.tTab = d.t; render(); },
  'tl-filter': (d) => { UI.tl.f = d.f; UI.tl.all = false; render(); },
  'tl-all': () => { UI.tl.all = true; render(); },
  'tl-retry': () => { Classroom.leagueErr = null; classLeagueLoad(Classroom.sel, true); render(); },
  'tl-group': (d) => { UI.tlOpen.has(d.k) ? UI.tlOpen.delete(d.k) : UI.tlOpen.add(d.k); render(); },
  'student-league': (d) => { UI.sheet = { type: 'student-league', id: d.id }; render(); },
  'board-mode': (d) => { UI.boardMode = d.m; render(); },
  'class-delete': async () => { UI.sheet = null; if (await classCall('class_delete', { p_class: Classroom.sel })) { showToast('ลบห้องเรียนแล้ว'); Classroom.sel = null; teacherLoad(null); } },
});
// เปลี่ยนห้องในแดชบอร์ด / เปลี่ยนบทในฟอร์มมอบหมายงาน
document.addEventListener('change', (e) => {
  if (e.target.id === 'class-select') { Classroom.sel = +e.target.value; Classroom.leagueErr = null; UI.tlOpen = null; teacherLoad(Classroom.sel); }
  if (e.target.id === 'class-select-board') { Classroom.sel = +e.target.value; Classroom.leagueErr = null; UI.tlOpen = null; render(); }
  if (e.target.id === 'tl-sort') { UI.tl.sort = e.target.value; render(); }
  if (e.target.id === 'assign-unit') { UI.sheet = { type: 'assign-new', u: +e.target.value }; render(); }
});

VIEWS.classes = viewClasses;
VIEWS.teacher = viewTeacher;
SUBPAGES.push('classes', 'teacher');
