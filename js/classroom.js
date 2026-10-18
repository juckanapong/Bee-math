/* BeeMath — ห้องเรียนและแดชบอร์ดครู (ระยะ 2d) · ใช้ RPC ใน supabase/classroom.sql
   นักเรียน: เข้าห้องด้วยรหัส (บัญชีอีเมล หรือบัญชีห้องเรียนแบบไม่ใช้อีเมล) · เห็นงานที่ครูมอบหมายบนหน้าหลัก
   ครู: สร้างห้อง แจกรหัส ดูความคืบหน้ารายคนและจุดอ่อนรายทักษะ มอบหมายงานพร้อมวันส่ง */

const Classroom = { mine: null, at: 0, teach: null, dash: {}, sel: null, error: null, loading: false };

// ---------- ข้อมูล ----------
async function classroomSync(force = false) {
  if (!Cloud.client || !Cloud.user || !netOK()) return;
  if (!force && Date.now() - Classroom.at < 60000) return;
  Classroom.at = Date.now();
  const { data, error } = await Cloud.client.rpc('my_classes');
  if (error) { Classroom.error = cloudError(error); return; }
  Classroom.mine = data || [];
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
async function classCall(fn, args) {
  const { data, error } = await Cloud.client.rpc(fn, args);
  if (error) { showToast(cloudError(error)); return null; }
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
  if (typeof Cloud === 'undefined' || !Cloud.enabled() || !Cloud.user) {
    body = `<div class="card acct-card"><div class="acct-intro">${bee(64)}<p>เข้าห้องเรียนด้วยรหัสจากครู เพื่อรับงานและให้ครูช่วยดูความคืบหน้า</p></div>
      ${Cloud?.enabled?.() ? `<button class="btn primary" data-act="acct-class">เข้าห้องเรียนด้วยรหัส (ไม่ต้องใช้อีเมล)</button>
        <button class="btn" data-act="go" data-v="account">เข้าสู่ระบบด้วยอีเมล</button>` : '<p class="muted">ยังไม่ได้เปิดระบบบัญชี</p>'}</div>`;
  } else {
    if (Date.now() - Classroom.at > 20000) setTimeout(() => classroomSync(true), 0);
    const done = new Set(Object.keys(S.done));
    const mine = Classroom.mine;
    body = `
      <section><h3 class="shop-sec">ห้องเรียนของฉัน</h3>
        ${mine === null ? '<p class="muted">กำลังโหลด…</p>' : mine.length ? mine.map((c) => `<div class="card class-card">
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
  if (typeof Cloud === 'undefined' || !Cloud.user || Cloud.user.is_anonymous) {
    body = `<div class="card acct-card"><p>แดชบอร์ดครูต้องเข้าสู่ระบบด้วยอีเมล</p><button class="btn primary" data-act="go" data-v="account">เข้าสู่ระบบ</button></div>`;
  } else if (Classroom.teach === null) {
    if (!Classroom.loading) setTimeout(() => teacherLoad(), 0);
    body = `<div class="card acct-card"><p class="muted">${Classroom.error ? esc(Classroom.error) : 'กำลังโหลดห้องเรียน…'}</p></div>`;
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
        <button class="price-btn ghost" data-act="teacher-refresh" ${Classroom.loading ? 'disabled' : ''}>${icon('refresh', 16)} รีเฟรช</button></div></div>`;
    if (!d) body = head + '<p class="muted">กำลังโหลดข้อมูลห้อง…</p>';
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
        <section class="card t-card"><div class="rail-head"><h2>นักเรียน</h2><span class="muted small">คนที่ควรตามดูอยู่บนสุด · แตะชื่อเพื่อดูรายละเอียด</span></div>
          ${n ? `<div class="t-table-wrap"><table class="t-table"><thead><tr><th>ชื่อ</th><th>กำลังเรียน</th><th>ตอบถูก</th><th>สตรีค</th><th>งานค้าง</th><th>สถานะ</th></tr></thead><tbody>
            ${sts.sort((a, b) => ['help', 'away', 'ok'].indexOf(a.status.cls) - ['help', 'away', 'ok'].indexOf(b.status.cls) || a.name.localeCompare(b.name, 'th')).map((s) => `<tr>
              <td><span class="t-name"><span class="av" style="background:${s.avatar}">${esc(initial(s.name))}</span>${nameBtn(s)}</span></td>
              <td>${esc(currentOf(s.doneSet))}</td><td>${s.status.acc === null ? '–' : s.status.acc + '%'}</td><td>${s.streak} วัน</td>
              <td>${d.assignments.filter((a) => doneCount(s.doneSet, a.nodes) < a.nodes.length).length}</td>
              <td><span class="chip-st ${s.status.cls}">${s.status.text}</span></td></tr>`).join('')}
            </tbody></table></div>` : `<p class="muted">ยังไม่มีนักเรียน แจกรหัส <b>${esc(cls.code)}</b> ให้นักเรียนกรอกที่ ตั้งค่า › ห้องเรียน หรือหน้าบัญชี › "เข้าห้องเรียน"</p>`}
        </section>
        <div class="t-foot"><p class="muted small">อัปเดตล่าสุด ${timeAgo(d.at)} ข้อมูลมาจากการซิงก์ของนักเรียนแต่ละคน</p>
          <button class="btn danger-text small" data-act="class-delete-ask">ลบห้องเรียนนี้</button></div>`;
    }
  }
  return shell(`<div class="sub-body teacher">${body}</div>`, { sub: { title: 'แดชบอร์ดครู' }, wide: true, teacher: true });
}

// ---------- แผ่นป๊อปอัป ----------
Object.assign(SHEETS, {
  'class-new'() {
    return `<div class="sheet-card"><h3>สร้างห้องเรียน</h3>
      <form class="acct-form" data-form="class-new"><label class="fld">ชื่อห้อง<input id="class-name" maxlength="40" placeholder="เช่น ม.1/3 คณิตศาสตร์" required></label>
        ${consentBox(`ฉันจะแจ้งนักเรียนและผู้ปกครองเรื่อง${privacyLink()}ก่อนให้นักเรียนเข้าห้อง (ครูจะเห็นชื่อและความคืบหน้าของนักเรียน)`)}
        <button class="btn primary" type="submit">สร้างห้อง</button></form></div>`;
  },
  'assign-new'(s) {
    const u = s.u ?? 0;
    const nodes = NODES.filter((n) => n.ui === u);
    return `<div class="sheet-card"><h3>มอบหมายงาน</h3>
      <form class="acct-form" data-form="assign-new">
        <label class="fld">บท<select id="assign-unit" data-act-change="assign-unit">${UNITS.map((x, i) => `<option value="${i}" ${i === u ? 'selected' : ''}>บทที่ ${i + 1} · ${x.title}</option>`).join('')}</select></label>
        <fieldset class="fld node-picks"><legend>ด่านที่ต้องทำ</legend>${nodes.map((n) => `<label class="pick-node"><input type="checkbox" name="assign-node" value="${n.id}" checked> ${esc(n.kind === 'test' ? 'ด่านทดสอบท้ายบท' : n.title)}</label>`).join('')}</fieldset>
        <label class="fld">ชื่องาน<input id="assign-title" maxlength="60" value="${esc(UNITS[u].title)}" required></label>
        <label class="fld">วันส่ง<input type="date" id="assign-due" value="${keyOfDay(dayNum(today()) + 7)}"></label>
        <button class="btn primary" type="submit">มอบหมายงาน</button></form></div>`;
  },
  'class-leave'(s) {
    return `<div class="sheet-card center"><h3>ออกจากห้อง ${esc(s.name)}?</h3><p>ครูจะไม่เห็นความคืบหน้าของคุณอีก และงานจากห้องนี้จะหายไป</p>
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
        <span class="setting-main"><h3>${esc(st.name)}</h3><small>${status.idle >= 99 ? 'ยังไม่เริ่มเรียน' : status.idle === 0 ? 'เข้าเรียนวันนี้' : `เข้าเรียนล่าสุด ${status.idle} วันก่อน`}</small></span>
        <span class="chip-st ${status.cls}">${status.text}</span></div>
      <dl class="st-facts"><div><dt>กำลังเรียน</dt><dd>${esc(currentOf(done))}</dd></div>
        <div><dt>ตอบถูก</dt><dd>${status.acc === null ? '–' : `${status.acc}% <small>(${st.correct}/${st.answered} ข้อ)</small>`}</dd></div>
        <div><dt>สตรีค</dt><dd>${st.streak} วัน</dd></div><div><dt>XP สัปดาห์นี้</dt><dd>${st.week_xp}</dd></div></dl>
      <h4>เรื่องที่ยังอ่อน</h4>
      ${weak.length ? `<ul class="st-list">${weak.map((x) => `<li><span>${esc(x.n.title)}</span><b class="${x.p < 60 ? 'low' : ''}">${x.p}%</b></li>`).join('')}</ul>` : '<p class="muted small">ยังไม่มีเรื่องที่ตอบถูกต่ำกว่า 75%</p>'}
      <h4>งานค้าง</h4>
      ${pending.length ? `<ul class="st-list">${pending.map((a) => `<li><span>${esc(a.title)}</span><b>${doneCount(done, a.nodes)}/${a.nodes.length}</b></li>`).join('')}</ul>` : '<p class="muted small">ทำงานครบทุกชิ้นแล้ว</p>'}
      <button class="btn ghost" data-act="close">ปิด</button>
      <button class="btn danger-text small" data-act="student-remove-ask" data-id="${st.id}" data-n="${esc(st.name)}">นำออกจากห้อง</button></div>`;
  },
  'student-remove'(s) {
    return `<div class="sheet-card center"><h3>นำ ${esc(s.name)} ออกจากห้อง?</h3><p>นักเรียนเข้าห้องใหม่ได้ด้วยรหัสเดิม</p>
      <button class="btn danger" data-act="student-remove" data-id="${s.id}">นำออก</button><button class="btn ghost" data-act="close">ยกเลิก</button></div>`;
  },
  'class-delete'() {
    const c = Classroom.teach.find((x) => x.id === Classroom.sel);
    return `<div class="sheet-card center"><h3>ลบห้อง ${esc(c.name)}?</h3><p>รายชื่อนักเรียนในห้องและงานที่มอบหมายจะถูกลบ (ความคืบหน้าของนักเรียนยังอยู่)</p>
      <button class="btn danger" data-act="class-delete">ลบห้องเรียน</button><button class="btn ghost" data-act="close">ยกเลิก</button></div>`;
  },
});

// ---------- ฟอร์ม ----------
const JOIN_MSG = { joined: (n) => `เข้าห้อง ${n} แล้ว!`, already: (n) => `อยู่ในห้อง ${n} แล้ว`, own: () => 'นี่คือห้องที่คุณเป็นครู', not_found: () => 'ไม่พบรหัสห้องนี้ ลองตรวจตัวอักษรอีกครั้ง', limit: () => 'เข้าได้สูงสุด 10 ห้อง' };
const normCode = (raw) => { let c = (raw || '').trim().toUpperCase().replace(/\s/g, ''); if (c && !c.startsWith('HIVE-')) c = 'HIVE-' + c.replace(/^HIVE/, ''); return c; };
async function joinClass(code) {
  const r = await classCall('class_join', { p_code: normCode(code) });
  if (!r) return false;
  showToast((JOIN_MSG[r.status] || (() => r.status))(r.name));
  if (r.status === 'joined') SFX.play('reward');
  await classroomSync(true);
  return r.status === 'joined' || r.status === 'already';
}
FORM_HANDLERS['class-join'] = async () => { if (await joinClass(document.getElementById('class-code')?.value)) render(); };
FORM_HANDLERS['class-new'] = async () => {
  const name = document.getElementById('class-name')?.value.trim();
  const r = await classCall('class_create', { p_name: name });
  if (!r) return;
  UI.sheet = null; SFX.play('reward'); showToast(`สร้างห้อง ${r.name} แล้ว รหัสเข้าห้อง ${r.code}`);
  Classroom.sel = r.id; teacherLoad(r.id);
};
FORM_HANDLERS['assign-new'] = async () => {
  const nodes = [...document.querySelectorAll('input[name="assign-node"]:checked')].map((x) => x.value);
  if (!nodes.length) return showToast('เลือกอย่างน้อย 1 ด่าน');
  const title = document.getElementById('assign-title')?.value.trim(), due = document.getElementById('assign-due')?.value || null;
  const r = await classCall('assignment_create', { p_class: Classroom.sel, p_title: title, p_nodes: nodes, p_due: due });
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
    Cloud.user = data.user; S.name = name || S.name; giveConsent('class');
    await cloudPull();
    await joinClass(code);
    UI.acct = { tab: 'signin' };
  } catch (e) { a.err = cloudError(e); }
  a.busy = false; render();
};

Object.assign(ACT, {
  'acct-class': () => { UI.acct = { tab: 'class' }; ACT.go({ v: 'account' }); },
  'class-leave-ask': (d) => { UI.sheet = { type: 'class-leave', id: +d.id, name: d.n }; render(); },
  'class-leave': async (d) => { UI.sheet = null; if (await classCall('class_leave', { p_class: +d.id })) { showToast('ออกจากห้องแล้ว'); classroomSync(true); } },
  'class-new': () => { UI.sheet = { type: 'class-new' }; render(); document.getElementById('class-name')?.focus(); },
  'class-copy': async (d) => { try { await navigator.clipboard.writeText(d.c); showToast('คัดลอกรหัสห้องแล้ว'); } catch (e) { showToast(`รหัสห้อง: ${d.c}`); } },
  'teacher-refresh': () => teacherLoad(),
  'assign-new': () => { UI.sheet = { type: 'assign-new', u: 0 }; render(); },
  'assign-delete': async (d) => { if (await classCall('assignment_delete', { p_id: +d.id })) { showToast('ลบงานแล้ว'); teacherLoad(); } },
  'student-remove-ask': (d) => { UI.sheet = { type: 'student-remove', id: d.id, name: d.n }; render(); },
  'student-open': (d) => { UI.sheet = { type: 'student', id: d.id }; render(); },
  'student-remove': async (d) => { UI.sheet = null; if (await classCall('class_remove_student', { p_class: Classroom.sel, p_user: d.id })) { showToast('นำออกจากห้องแล้ว'); teacherLoad(); } },
  'class-delete-ask': () => { UI.sheet = { type: 'class-delete' }; render(); },
  'class-delete': async () => { UI.sheet = null; if (await classCall('class_delete', { p_class: Classroom.sel })) { showToast('ลบห้องเรียนแล้ว'); Classroom.sel = null; teacherLoad(null); } },
});
// เปลี่ยนห้องในแดชบอร์ด / เปลี่ยนบทในฟอร์มมอบหมายงาน
document.addEventListener('change', (e) => {
  if (e.target.id === 'class-select') { Classroom.sel = +e.target.value; teacherLoad(Classroom.sel); }
  if (e.target.id === 'assign-unit') { UI.sheet = { type: 'assign-new', u: +e.target.value }; render(); }
});

VIEWS.classes = viewClasses;
VIEWS.teacher = viewTeacher;
SUBPAGES.push('classes', 'teacher');
