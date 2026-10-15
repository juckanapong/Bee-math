/* BeeMath — ถามน้องผึ้ง (แบบไม่ใช้ AI)
   คำตอบทุกข้อสร้างจากตัวเลขของโจทย์ข้อนั้นจริง ๆ จึงถูกต้องเสมอ ฟรี และไม่มีข้อมูลส่งออกนอกแอป
   เปิดจากปุ่ม "ถามน้องผึ้ง" ในแถบเฉลยของทุกข้อ */

// ---------- วิเคราะห์สมการ (สตริงสมการมาจากตัวสร้างโจทย์ใน js/data.js เท่านั้น ไม่ใช่ข้อความที่ผู้ใช้พิมพ์) ----------
function exprFn(side) {
  const js = side
    .replace(/frac\(([^,]+),([^)]+)\)/g, '(($1)/($2))')
    .replace(/(\d)\s*([a-z(])/g, '$1*$2')
    .replace(/\)\s*\(/g, ')*(')
    .replace(/\b([a-z])\s*\(/g, '$1*(')
    .replace(/\b[a-z]\b/g, '(X)');
  return new Function('X', `return ${js};`);
}
// สมการเชิงเส้น: แต่ละข้างเขียนได้เป็น a·x + b
function analyze(eq) {
  const [l, r] = eq.split('=').map((t) => t.trim());
  const fl = exprFn(l), fr = exprFn(r);
  const lin = (f) => ({ a: f(1) - f(0), b: f(0) });
  return { eq, l, r, fl, fr, L: lin(fl), R: lin(fr) };
}
const nfmt = (n) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));
// แทนค่า x ลงในสตริงสมการเพื่อแสดงผล เช่น 3x + 4 → 3 × 5 + 4
function subst(side, v) {
  const vs = v < 0 ? `(${v})` : String(v);
  return side.replace(/(\d)x\b/g, `$1 * ${vs}`).replace(/\bx\b/g, vs);
}
const isConst = (side) => !/[a-z(]/.test(side.replace(/frac/g, ''));

// ---------- คำตอบแต่ละแบบ ----------
function askCheck(q, userInput, ok) {
  const A = analyze(q.eq);
  const side = (expr, f, v) => (isConst(expr) ? expr : `${subst(expr, v)} = ${nfmt(f(v))}`);
  const block = (v, title) => {
    const lv = A.fl(v), rv = A.fr(v), equal = Math.abs(lv - rv) < 1e-9;
    let verdict;
    if (equal) verdict = `<p class="ask-ok">${icon('check', 16)} สองข้างเท่ากัน ${M('x = ' + v)} จึงเป็นคำตอบที่ถูกต้อง</p>`;
    else {
      const slope = A.L.a - A.R.a, diff = lv - rv;
      verdict = `<p class="ask-bad">${icon('x', 16)} สองข้างไม่เท่ากัน (${nfmt(lv)} กับ ${nfmt(rv)})${slope ? ` แปลว่า ${M('x')} ต้อง<b>${diff * slope > 0 ? 'น้อยกว่า' : 'มากกว่า'}</b> ${v}` : ''}</p>`;
    }
    return `<p class="ask-sub">${title}</p><div class="steps">
      <div class="step"><span class="num">ซ</span><div>${M(side(A.l, A.fl, v))}<small>ข้างซ้าย</small></div></div>
      <div class="step"><span class="num">ข</span><div>${M(side(A.r, A.fr, v))}<small>ข้างขวา</small></div></div></div>${verdict}`;
  };
  const uv = Number(String(userInput || '').replace('−', '-'));
  const mine = !ok && userInput && Number.isFinite(uv) && uv !== q.answer ? block(uv, `ลองแทน ${M('x = ' + uv)} (คำตอบของคุณ)`) : '';
  return `ตรวจคำตอบได้เสมอโดย <b>แทนค่ากลับลงในสมการ</b> ถ้าสองข้างเท่ากันแปลว่าถูก${mine}${block(q.answer, `ลองแทน ${M('x = ' + q.answer)}`)}`;
}

function askWhy(q) {
  const A = analyze(q.eq), { a, b } = A.L, c = A.R.a, eq = q.eq;
  const nb = Math.abs(b), x = M('x');
  if (eq.includes('frac(x +')) {
    const [, inner, den] = eq.match(/frac\(([^,]+),([^)]+)\)/);
    return `ทั้งก้อน ${M(inner)} ถูก<b>หารด้วย ${den}</b> สิ่งที่อยู่นอกสุดคือการหาร จึงต้องจัดการก่อน
      <br>ตรงข้ามของการหารคือ <b>การคูณ</b> → คูณ ${den} ทั้งสองข้าง แล้วค่อยกำจัดตัวเลขที่บวกกับ ${x}`;
  }
  if (eq.includes('frac(')) {
    const den = eq.match(/frac\(x,([^)]+)\)/)?.[1];
    return `${x} ถูก<b>หารด้วย ${den}</b>${b ? ` แล้วจึง${b > 0 ? 'บวก' : 'ลบ'} ${nb}` : ''}
      <br>ตอนแก้ให้<b>ย้อนลำดับ</b>: ${b ? `กำจัด ${nb} ก่อน (${b > 0 ? 'ลบ' : 'บวก'} ${nb} ทั้งสองข้าง) แล้ว` : ''}ใช้ตรงข้ามของการหาร คือ <b>คูณ ${den}</b> ทั้งสองข้าง`;
  }
  if (/\d\(/.test(eq) && !eq.includes('x(')) {
    const k = eq.match(/(\d+)\(/)[1];
    return `ตัวเลข <b>${k}</b> หน้าวงเล็บคูณ<b>ทุกตัว</b>ในวงเล็บ ทำได้ 2 วิธี:
      <br>1) กระจายวงเล็บก่อน: ${M(`${k}(…)`)} → คูณ ${k} เข้าไปทุกตัว แล้วแก้ต่อตามปกติ
      <br>2) ถ้าอีกข้างเป็นตัวเลขอย่างเดียว ให้<b>หารด้วย ${k}</b> ทั้งสองข้างก่อนก็ได้${c ? '' : ' (วิธีนี้มักเร็วกว่า)'}${c ? `<br>ข้อนี้มี ${x} อยู่สองข้าง จึงควรกระจายวงเล็บก่อน แล้วย้าย ${x} ไปข้างเดียวกัน` : ''}`;
  }
  // วงเล็บรวมกลุ่ม เช่น x + (x + 1) + (x + 2): รวมพจน์ก่อน
  const pre = eq.includes('(') ? `รวมพจน์ข้างซ้ายก่อน: ${M(A.l)} = ${M(lin(a, b))}<br>` : '';
  if (c) {
    return `มี ${x} อยู่<b>ทั้งสองข้าง</b> ต้องย้ายให้ไปอยู่ข้างเดียวกันก่อน
      <br>ลบ ${M(c === 1 ? 'x' : c + 'x')} ทั้งสองข้าง จะเหลือ ${M((a - c === 1 ? '' : a - c) + 'x')} ข้างเดียว แล้วแก้ต่อเหมือนสมการสองขั้นตอน`;
  }
  if (a !== 1 && b) {
    return `${pre}${x} ถูกทำ 2 อย่างตามลำดับ: <b>คูณ ${a}</b> ก่อน แล้วจึง<b>${b > 0 ? 'บวก' : 'ลบ'} ${nb}</b>
      <br>เหมือนใส่ถุงเท้าแล้วค่อยใส่รองเท้า ตอนถอดต้องถอดรองเท้าก่อน → แก้สมการให้<b>ย้อนลำดับ</b>:
      <div class="steps"><div class="step"><span class="num">1</span><div>${M(`${a}x = ${nfmt(A.R.b - b)}`)}<small>${b > 0 ? 'ลบ' : 'บวก'} ${nb} ทั้งสองข้างก่อน</small></div></div>
      <div class="step"><span class="num">2</span><div>${M(`x = ${q.answer}`)}<small>แล้วค่อยหารด้วย ${a}</small></div></div></div>
      ถ้าหาร ${a} ก่อน ตัวเลข ${nb} จะต้องถูกหารด้วย กลายเป็นเศษส่วนยุ่งยากกว่า`;
  }
  if (a !== 1) return `${M(a + 'x')} หมายถึง ${a} × ${x} ตรงข้ามของการคูณคือ <b>การหาร</b> → หารด้วย ${a} ทั้งสองข้าง จะเหลือ ${x} ตัวเดียว`;
  if (b) return `${x} ถูก<b>${b > 0 ? 'บวก' : 'ลบ'} ${nb}</b> ตรงข้ามคือ<b>${b > 0 ? 'ลบ' : 'บวก'} ${nb}</b> → ทำทั้งสองข้างเพื่อให้เหลือ ${x} ตัวเดียว
    <br>เหตุผลที่ต้องทำทั้งสองข้าง: สมการเหมือนตาชั่ง ทำอะไรข้างหนึ่งต้องทำแบบเดียวกันอีกข้างเสมอ`;
  return 'สมการนี้มี x อยู่ตัวเดียวแล้ว คำตอบอ่านได้ทันที';
}

// บาร์โมเดลวาดได้เมื่อเป็นรูป ax + b = c (a 1–6 กล่อง, b ไม่ติดลบ, คำตอบเป็นจำนวนบวก)
function barOk(q) {
  if (!q.eq || q.eq.includes('frac') || q.eq.includes('(')) return false;
  const A = analyze(q.eq);
  return A.R.a === 0 && Number.isInteger(A.L.a) && A.L.a >= 1 && A.L.a <= 6 && A.L.b >= 0 && q.answer > 0;
}
function askBar(q) {
  const A = analyze(q.eq), a = A.L.a, b = A.L.b, c = A.R.b, x = q.answer;
  const part = b > 0 ? ` ต่อกับส่วนที่ยาว ${b}` : b < 0 ? ` แต่ถูกตัดออกไป ${-b}` : '';
  const undo = b > 0 ? [`${c} - ${b} = ${c - b}`, `ตัดส่วนที่ยาว ${b} ออก`] : [`${c} + ${-b} = ${c - b}`, `เติมส่วนที่ถูกตัดไป ${-b} กลับเข้ามา`];
  return `วาดสมการ ${M(q.eq)} เป็นแถบ: กล่อง ${M('x')} ${a} กล่อง${part} รวมยาว ${c}
    <div class="ask-bar">${barSVG(a, b, x, c)}</div>
    <div class="steps">${b ? `<div class="step"><span class="num">1</span><div>${M(undo[0])}<small>${undo[1]} เหลือกล่อง x ${a} กล่อง</small></div></div>` : ''}
    <div class="step"><span class="num">${b ? 2 : 1}</span><div>${M(`${c - b} ÷ ${a} = ${x}`)}<small>แบ่งให้แต่ละกล่องเท่า ๆ กัน</small></div></div></div>
    <div class="ask-bar">${barSVG(a, b, x, c, true)}</div>`;
}

// โจทย์คล้ายกัน 1 ข้อ (ระดับความยากเดียวกับทักษะนี้) ให้ลองเลือกคำตอบ
function makeSimilar(q) {
  LEVEL = skillLevel(q.gen);
  let s;
  try { s = G[q.gen](); } finally { LEVEL = 1; }
  if (s.type === 'input') {
    const opts = new Set([s.answer]);
    for (const d of shuffle([1, -1, 2, -2, 3, 5])) { if (opts.size >= 3) break; if (s.answer + d !== s.answer) opts.add(s.answer + d); }
    return { prompt: s.prompt, visual: s.visual, choices: shuffle([...opts]).map((v) => M('x = ' + v)), answer: null, value: s.answer, explain: s.explain, picked: null, fix() { this.answer = this.choices.indexOf(M('x = ' + this.value)); return this; } }.fix();
  }
  return { prompt: s.prompt, visual: s.visual, choices: s.choices, answer: s.answer, explain: s.explain, picked: null };
}
const similarOk = (q) => q.gen && ['choice', 'input'].includes(q.type) && !['findError'].includes(q.gen);
function similarHTML(sim, i) {
  return `ลองข้อนี้ดู ตัวเลขใหม่ วิธีเดิม:<div class="ask-sim"><p class="ask-sim-q">${sim.prompt}</p>${sim.visual ? `<div class="ask-sim-v">${sim.visual}</div>` : ''}
    <div class="ask-sim-opts">${sim.choices.map((c, k) => {
      const cls = sim.picked === null ? '' : k === sim.answer ? 'right' : k === sim.picked ? 'wrong' : '';
      return `<button class="opt ${cls}" data-act="ask-sim" data-i="${i}" data-k="${k}" ${sim.picked !== null ? 'disabled' : ''}>${c}</button>`;
    }).join('')}</div>
    ${sim.picked === null ? '' : `<p class="${sim.picked === sim.answer ? 'ask-ok' : 'ask-bad'}">${sim.picked === sim.answer ? 'ถูกต้อง! เข้าใจแล้วแน่ ๆ' : 'ยังไม่ใช่ ดูวิธีทำด้านล่างนะ'}</p>${sim.explain}`}</div>`;
}

function lessonOf(gen) { return NODES.find((n) => n.kind === 'lesson' && n.gens.includes(gen)); }
function askReview(q) {
  const n = lessonOf(q.gen);
  return `สรุปเรื่อง <b>${esc(n.title)}</b> (บทที่ ${n.ui + 1}):` + n.cards.map((c) => `<div class="ask-card"><b>${c.title}</b><p>${c.body}</p>
    ${c.visual ? `<div class="ask-bar">${c.visual}</div>` : ''}
    ${c.demo ? `<div class="steps">${c.demo.map(([e, note], i) => `<div class="step"><span class="num">${i + 1}</span><div>${M(e)}${note ? `<small>${note}</small>` : ''}</div></div>`).join('')}</div>` : ''}</div>`).join('');
}

// ---------- รายการคำถามที่ใช้ได้กับโจทย์ข้อนี้ ----------
function askChips(q, ok) {
  const list = [];
  if (q.eq && q.type === 'input') list.push(['check', ok ? 'ตรวจคำตอบด้วยการแทนค่าได้ยังไง?' : 'ทำไมคำตอบของฉันผิด?']);
  if (q.eq) list.push(['why', 'ทำไมต้องแก้ตามลำดับนี้?']);
  if (barOk(q)) list.push(['bar', 'อธิบายด้วยบาร์โมเดลหน่อย']);
  if (similarOk(q)) list.push(['similar', 'ขอโจทย์คล้าย ๆ กัน 1 ข้อ']);
  if (q.gen && lessonOf(q.gen)) list.push(['review', 'ทบทวนเนื้อหาเรื่องนี้']);
  if (q.explain) list.push(['steps', ok ? 'ดูวิธีทำแบบละเอียด' : 'ขอดูวิธีทำอีกครั้ง']);
  return list;
}
function askAnswer(k) {
  const A = UI.ask, q = A.q;
  if (k === 'check') return askCheck(q, A.user, A.ok);
  if (k === 'why') return askWhy(q);
  if (k === 'bar') return askBar(q);
  if (k === 'review') return askReview(q);
  if (k === 'steps') return q.explain;
  return '';
}

SHEETS.ask = () => {
  const A = UI.ask, q = A.q;
  const chips = askChips(q, A.ok).filter(([k]) => k === 'similar' || !A.items.some((it) => it.k === k));
  const ctx = q.eq ? M(q.eq) : `<span class="ask-ctx-t">${q.prompt}</span>`;
  return `<div class="sheet-card ask-sheet">
    <div class="ask-head">${bee(48, A.ok ? 'wow' : 'happy')}<div class="setting-main"><h3>ถามน้องผึ้ง</h3><small>คำอธิบายจากโจทย์ข้อนี้</small></div>
      <button class="x mini" data-act="close" aria-label="ปิด">${icon('x', 18)}</button></div>
    <div class="ask-ctx">${ctx}<span class="ask-tag ${A.ok ? 'ok' : 'bad'}">${A.ok ? 'ตอบถูก' : A.user ? `คุณตอบ ${esc(A.user)}` : 'ตอบผิด'}</span>${q.type === 'input' ? `<span class="ask-tag ok">คำตอบ ${q.answer}</span>` : ''}</div>
    <div class="ask-log" id="ask-log">
      <div class="ask-a">${bee(32)}<div class="bubble">สงสัยตรงไหน เลือกคำถามด้านล่างได้เลย น้องผึ้งจะอธิบายจากตัวเลขของข้อนี้</div></div>
      ${A.items.map((it, i) => `<p class="ask-q">${it.label}</p><div class="ask-a">${bee(32)}<div class="bubble">${it.k === 'similar' ? similarHTML(it.sim, i) : it.html}</div></div>`).join('')}
    </div>
    <div class="ask-chips">${chips.map(([k, l]) => `<button class="ask-chip" data-act="ask" data-k="${k}">${l}</button>`).join('')}</div>
  </div>`;
};
// เลื่อนบทสนทนาไปข้อความล่าสุดหลังวาดใหม่
const askScroll = () => requestAnimationFrame(() => { const el = document.querySelector('.ask-sheet'); if (el) el.scrollTop = el.scrollHeight; });

Object.assign(ACT, {
  'ask-open': () => {
    const L = UI.L, q = L.queue[L.idx];
    UI.ask = { q, user: q.type === 'input' ? L.input : '', ok: L.ok, items: [] };
    UI.sheet = { type: 'ask' };
    SFX.play('tap');
    render();
  },
  ask: (d) => {
    const A = UI.ask, label = askChips(A.q, A.ok).find(([k]) => k === d.k)?.[1] || '';
    A.items.push(d.k === 'similar' ? { k: 'similar', label, sim: makeSimilar(A.q) } : { k: d.k, label, html: askAnswer(d.k) });
    SFX.play('tap');
    render(); askScroll();
  },
  'ask-sim': (d) => {
    const sim = UI.ask.items[+d.i]?.sim;
    if (!sim || sim.picked !== null) return;
    sim.picked = +d.k;
    SFX.play(sim.picked === sim.answer ? 'correct' : 'wrong');
    render(); askScroll();
  },
});
