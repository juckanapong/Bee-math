// สร้างอัตโนมัติจาก js/data.js ด้วย tools/build-shared.mjs ห้ามแก้ไฟล์นี้โดยตรง
// source sha256: 44bdd2554a8d2e8c
/* BeeMath — เนื้อหาบทเรียนและตัวสร้างโจทย์ (สุ่มตัวเลขใหม่ทุกครั้ง) */

// ---------- utilities ----------
// ตัวสุ่มของตัวสร้างโจทย์: ปกติคือ Math.random · makeQuestion() สลับเป็นตัวสุ่มจาก seed ชั่วคราว
// เพื่อให้เซิร์ฟเวอร์ (supabase/functions/session-submit) สร้างโจทย์ชุดเดิมซ้ำแล้วตรวจคำตอบได้
// ห้ามเรียก Math.random ตรง ๆ ในไฟล์นี้ ใช้ rand() / R() / pick() / shuffle() เท่านั้น
let rand = Math.random;
// mulberry32: ตัวสุ่ม 32 บิตที่ให้ลำดับเดิมทุกครั้งเมื่อ seed เท่ากัน (ทั้งในเบราว์เซอร์และ Deno)
function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// seed ของข้อที่ n ในรอบ (ข้อเดียวกันได้โจทย์เดิมเสมอ ไม่ขึ้นกับลำดับที่แสดง)
const subSeed = (seed, n) => (Math.imul((seed ^ Math.imul(n + 1, 0x9e3779b1)) >>> 0, 0x85ebca6b) ^ n) >>> 0;
const R = (a, b) => Math.floor(rand() * (b - a + 1)) + a;
// ระดับความยากของโจทย์ที่กำลังสร้าง: 0 ง่าย · 1 ปกติ · 2 ท้าทาย (ตั้งโดย materialize() ใน js/app.js)
let LEVEL = 1;
// สุ่ม "ขนาดตัวเลข" ตามระดับความยาก: ง่าย = 60% ล่างของช่วง · ท้าทาย = เลื่อนขึ้น 30% และขยายช่วงบนอีก 60%
// ใช้เฉพาะตัวเลขที่เป็นอิสระ (ไม่ใช้กับจำนวนกล่องบาร์โมเดลหรือค่าที่ต้องน้อยกว่าค่าอื่น)
function RV(a, b) {
  if (LEVEL <= 0) return R(a, Math.max(a, a + Math.floor((b - a) * 0.6)));
  if (LEVEL >= 2) return R(a + Math.floor((b - a) * 0.3), b + Math.ceil((b - a) * 0.6));
  return R(a, b);
}
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const uniq = (arr) => [...new Set(arr)];
const VARS = ['x', 'y', 'n', 'k', 'm'];

// a·v + b  →  "3x + 4", "x - 2", "-x"
function lin(a, b, v = 'x') {
  let s = a === 1 ? v : a === -1 ? '-' + v : a + v;
  if (b > 0) s += ' + ' + b;
  else if (b < 0) s += ' - ' + -b;
  return s;
}

// แปลงสตริงคณิตเป็น HTML: ตัวแปรเอียง, เศษส่วน, เครื่องหมายลบ/คูณ
function fmt(s) {
  return String(s)
    .replace(/-/g, '−')
    .replace(/\*/g, '×')
    .replace(/frac\(([^,]+),([^)]+)\)/g, '<span class="frac"><span>$1</span><span>$2</span></span>')
    .replace(/(?<![a-zA-Z])([a-z])(?![a-zA-Z])/g, '<i class="v">$1</i>');
}
const M = (s) => `<span class="math">${fmt(s)}</span>`;

// ขั้นตอนเฉลย: [[สมการ, คำอธิบาย], ...]
const steps = (rows) =>
  `<div class="steps">${rows
    .map(([e, note], i) => `<div class="step"><span class="num">${i + 1}</span><div>${M(e)}${note ? `<small>${note}</small>` : ''}</div></div>`)
    .join('')}</div>`;

// ---------- visuals ----------
function barSVG(a, b, x, c, reveal = false) {
  const W = 300, X0 = 10, Y0 = 8, H = 46;
  const parts = [];
  for (let i = 0; i < a; i++) parts.push({ v: x, t: 'x', k: 'x' });
  if (b > 0) parts.push({ v: b, t: String(b), k: 'c' });
  let ws = parts.map((p) => Math.max(30, (p.v / c) * W));
  const sum = ws.reduce((m, n) => m + n, 0);
  ws = ws.map((w) => (w * W) / sum);
  let cx = X0;
  const rects = parts
    .map((p, i) => {
      const w = ws[i];
      const label = reveal && p.k === 'x' ? x : p.t;
      const g = `<rect x="${cx}" y="${Y0}" width="${w}" height="${H}" rx="6" class="bar-${p.k}"/>
        <text x="${cx + w / 2}" y="${Y0 + H / 2 + 7}" class="bar-t${p.k === 'x' && !reveal ? ' it' : ''}">${label}</text>`;
      cx += w;
      return g;
    })
    .join('');
  const by = Y0 + H + 8, mid = X0 + W / 2, end = X0 + W;
  return `<svg class="barsvg" viewBox="0 0 320 ${by + 48}" role="img" aria-label="บาร์โมเดล">
    ${rects}
    <path d="M${X0} ${by} q0 10 10 10 H${mid - 10} q10 0 10 10 q0 -10 10 -10 H${end - 10} q10 0 10 -10" class="brace"/>
    <text x="${mid}" y="${by + 42}" class="bar-total">${c}</text>
  </svg>`;
}

function balanceHTML(left, right) {
  return `<div class="balance">
    <div class="pans"><div class="pan">${M(left)}</div><div class="pan">${M(right)}</div></div>
    <div class="beam"></div><div class="pivot"></div>
  </div>`;
}

// ---------- question builders ----------
function choiceQ({ prompt, visual = '', correct, wrongs, explain, tags = [], math = true }) {
  const w = uniq(wrongs.map(String)).filter((z) => z !== String(correct));
  const opts = shuffle([String(correct), ...shuffle(w).slice(0, 3)]);
  return {
    type: 'choice', prompt, visual, explain, tags,
    choices: opts.map((o) => (math ? M(o) : o)),
    answer: opts.indexOf(String(correct)),
  };
}

function inputQ({ prompt, eq, answer, explain, tags = ['solve'], visual }) {
  return {
    type: 'input',
    prompt: prompt || `แก้สมการ หาค่าของ ${M('x')}`,
    visual: visual ?? `<div class="eq-big">${M(eq)}</div>`,
    answer, explain, tags, eq,
  };
}

// สี่เหลี่ยมผืนผ้าที่มีป้ายด้านกว้าง/ยาว (ใช้กับโจทย์ความยาวรอบรูป)
function rectSVG(wLabel, hLabel) {
  return `<svg class="rectsvg" viewBox="0 0 300 150" role="img" aria-label="สี่เหลี่ยมผืนผ้า กว้าง ${wLabel} ยาว ${hLabel}">
    <rect x="70" y="20" width="200" height="90" rx="6" class="rect-shape"/>
    <text x="170" y="138" class="rect-t">${hLabel}</text>
    <text x="40" y="72" class="rect-t">${wLabel}</text>
  </svg>`;
}
// คู่สำหรับโจทย์จับคู่: a/b เป็น HTML ที่แสดงบนปุ่มฝั่งซ้าย/ขวา
const matchQ = ({ prompt, pairs, tags = [], explain }) => {
  const ids = pairs.map((_, i) => i);
  return { type: 'match', prompt, pairs: pairs.map((p, i) => ({ ...p, id: i })), left: shuffle(ids), right: shuffle(ids), tags, explain };
};

// ---------- โจทย์แบบใหม่ (ระยะ 5): ประกอบสมการ · เส้นจำนวน · เลือกหลายข้อ ----------
// ตัวตรวจคำตอบของโจทย์แบบใหม่ใช้ร่วมกันทั้งแอป (check() ใน js/app.js) และเซิร์ฟเวอร์ (verify.mjs)

// อ่านด้านหนึ่งของสมการจากชิ้นส่วน เช่น ['3','x','+','5'] → { a: 3, b: 5, nums: [3, 5] } (ไม่ใช่รูป ax ± b → null)
function parseSide(ts) {
  let a = 0, b = 0, sign = 1, i = 0;
  const nums = [];
  for (;;) {
    let coef = null, t = ts[i];
    if (/^\d+$/.test(t ?? '')) { coef = +t; nums.push(coef); t = ts[++i]; }
    if (t === 'x') { a += sign * (coef ?? 1); i++; } else if (coef === null) return null; else b += sign * coef;
    if (i === ts.length) return { a, b, nums };
    if (ts[i] === '+') sign = 1; else if (ts[i] === '-') sign = -1; else return null;
    i++;
  }
}
// สมการจากชิ้นส่วน → { a, b, nums } หมายถึง a·x = b (ย้ายข้างแล้ว) · ไม่ใช่สมการเชิงเส้นที่มี x → null
function parseTiles(tokens) {
  const at = tokens.indexOf('=');
  if (at < 1 || at !== tokens.lastIndexOf('=') || at === tokens.length - 1) return null;
  const L = parseSide(tokens.slice(0, at)), Rs = parseSide(tokens.slice(at + 1));
  if (!L || !Rs || L.a === Rs.a) return null;
  return { a: L.a - Rs.a, b: Rs.b - L.b, nums: [...L.nums, ...Rs.nums] };
}
const sameNums = (p, q) => p.length === q.length && [...p].sort((m, n) => m - n).every((v, i) => v === [...q].sort((m, n) => m - n)[i]);

// ตรวจคำตอบโจทย์แบบใหม่: true ถูก · false ผิด · null รูปแบบคำตอบไม่ถูกต้อง
// build: a = ลำดับตำแหน่งชิ้นส่วน (ใช้ได้ชิ้นละครั้ง) · ต้องใช้ตัวเลขของโจทย์ครบ และได้คำตอบเท่ากับ q.answer (เรียงแบบไหนก็ได้)
// numline: a = ตำแหน่งบนเส้นจำนวน · แบบประมาณ (q.est) คลาดได้ไม่เกิน q.tol
// multi: a = ตำแหน่งตัวเลือกที่เลือก (เรียงจากน้อยไปมาก)
function gradeAnswer(q, a) {
  if (q.type === 'build') {
    if (!Array.isArray(a) || a.length > q.tiles.length || new Set(a).size !== a.length
      || !a.every((k) => Number.isInteger(k) && k >= 0 && k < q.tiles.length)) return null;
    const e = parseTiles(a.map((k) => q.tiles[k]));
    return !!e && sameNums(e.nums, q.nums) && e.b === e.a * q.answer;
  }
  if (q.type === 'numline') {
    if (typeof a !== 'number' || !Number.isFinite(a) || a < q.min - 1 || a > q.max + 1) return null;
    return q.est ? Math.abs(a - q.answer) <= q.tol : a === q.answer;
  }
  if (q.type === 'multi') {
    if (!Array.isArray(a) || a.length > q.choices.length || !a.every((k, i) => Number.isInteger(k) && k >= 0 && k < q.choices.length && (i === 0 || k > a[i - 1]))) return null;
    return a.length === q.answers.length && a.every((k, i) => k === q.answers[i]);
  }
  return null;
}

// เส้นจำนวน min..max ทุก 1 หน่วย (ใช้ทั้งโจทย์และเฉลย) · miss = ตำแหน่งที่ผู้เรียนวางผิด (วงกลมแดงกลวง)
function numlineSVG(min, max, mark = null, miss = null) {
  const W = 320, X0 = 16, X1 = W - 16, Y = 30, step = (X1 - X0) / (max - min);
  const xAt = (v) => X0 + (v - min) * step;
  let ticks = '';
  for (let v = min; v <= max; v++) ticks += `<line x1="${xAt(v)}" y1="${Y - 8}" x2="${xAt(v)}" y2="${Y + 8}" class="nl-tick"/><text x="${xAt(v)}" y="${Y + 28}" class="nl-num">${v < 0 ? '−' + -v : v}</text>`;
  return `<svg class="nlsvg" viewBox="0 0 ${W} 66" role="img" aria-label="เส้นจำนวนตั้งแต่ ${min} ถึง ${max}">
    <line x1="${X0 - 8}" y1="${Y}" x2="${X1 + 8}" y2="${Y}" class="nl-axis"/>${ticks}
    ${miss === null ? '' : `<circle cx="${xAt(miss)}" cy="${Y}" r="9" class="nl-miss"/>`}
    ${mark === null ? '' : `<circle cx="${xAt(mark)}" cy="${Y}" r="9" class="nl-dot"/>`}</svg>`;
}

// โจทย์ปัญหาที่แปลงเป็น ax + b = c ได้
const WORD_TEMPLATES = [
  (a, b, c) => `ปิ่นซื้อดินสอ ${a} แท่ง ราคาแท่งละเท่ากัน และซื้อยางลบ 1 ก้อนราคา ${b} บาท จ่ายเงินทั้งหมด ${c} บาท ดินสอราคาแท่งละกี่บาท?`,
  (a, b, c) => `ผึ้งน้อยเก็บน้ำหวานได้วันละเท่า ๆ กันเป็นเวลา ${a} วัน รวมกับที่มีอยู่เดิม ${b} หยด ได้ทั้งหมด ${c} หยด ผึ้งเก็บน้ำหวานได้วันละกี่หยด?`,
  (a, b, c) => `นำจำนวนหนึ่งคูณด้วย ${a} แล้วบวกด้วย ${b} ได้ผลลัพธ์เป็น ${c} จำนวนนั้นคือเท่าไร?`,
  (a, b, c) => `ต้นมีเงิน ${c} บาท ซื้อขนม ${a} ชิ้น ราคาชิ้นละเท่ากัน แล้วเหลือเงิน ${b} บาท ขนมราคาชิ้นละกี่บาท?`,
  (a, b, c) => `ห้องสมุดมีชั้นวาง ${a} ชั้น แต่ละชั้นมีหนังสือเท่ากัน และมีหนังสือวางบนโต๊ะอีก ${b} เล่ม รวมทั้งหมด ${c} เล่ม ชั้นวางแต่ละชั้นมีหนังสือกี่เล่ม?`,
];

const G = {
  // ----- บทที่ 1 -----
  whichIsEquation() {
    const a = R(2, 9), x = RV(1, 9), b = RV(1, 9), c = a * x + b;
    return choiceQ({
      prompt: 'ข้อใดเป็น <b>สมการ</b>?',
      correct: `${lin(a, b)} = ${c}`,
      wrongs: [lin(a, b), `${c} - ${b}`, `${a} + ${b} > ${x}`],
      explain: 'สมการต้องมีเครื่องหมาย <b>=</b> เพื่อบอกว่าข้างซ้ายกับข้างขวามีค่าเท่ากัน',
    });
  },
  findVariable() {
    const v = pick(VARS), a = R(2, 9), x = RV(2, 9), b = R(1, a * x - 1), c = a * x - b;
    return choiceQ({
      prompt: `ในสมการ ${M(`${lin(a, -b, v)} = ${c}`)} ข้อใดคือ <b>ตัวแปร</b>?`,
      correct: v,
      wrongs: [a, b, c],
      explain: `ตัวแปรคือตัวอักษรที่ใช้แทนจำนวนที่เรายังไม่รู้ค่า ในที่นี้คือ ${M(v)}`,
    });
  },
  checkSolution() {
    const a = R(2, 6), x = RV(1, 9), b = RV(1, 12), c = a * x + b;
    const yes = rand() < 0.5;
    const t = yes ? x : x + pick([-1, 1, 2]);
    const val = a * t + b;
    return choiceQ({
      prompt: `${M('x = ' + t)} เป็นคำตอบของสมการ ${M(`${lin(a, b)} = ${c}`)} หรือไม่?`,
      correct: yes ? 'ใช่ เป็นคำตอบ' : 'ไม่ใช่',
      wrongs: [yes ? 'ไม่ใช่' : 'ใช่ เป็นคำตอบ'],
      math: false,
      explain: `แทนค่า ${M('x = ' + t)} จะได้ ${M(`${a}*${t} + ${b} = ${val}`)} ซึ่ง${val === c ? 'เท่ากับ' : 'ไม่เท่ากับ'} ${c}`,
    });
  },
  guessSolution() {
    const x = RV(1, 15), a = RV(2, 12), b = x + a;
    return choiceQ({
      prompt: `ค่าใดของ ${M('x')} ทำให้สมการ ${M(`x + ${a} = ${b}`)} เป็นจริง?`,
      correct: x,
      wrongs: [b + a, b, x + 1, x > 1 ? x - 1 : x + 2],
      explain: `${M(`${x} + ${a} = ${b}`)} เป็นจริง ดังนั้น ${M('x = ' + x)}`,
    });
  },
  balance() {
    const x = R(2, 9);
    if (rand() < 0.6) {
      const a = R(1, 9), b = x + a;
      return choiceQ({
        prompt: `ตาชั่งสมดุลแทนสมการ ${M(`x + ${a} = ${b}`)} ถ้าหยิบ <b>${a}</b> ออกจากจานซ้าย ต้องทำอย่างไรกับจานขวาจึงจะยังสมดุล?`,
        visual: balanceHTML(`x + ${a}`, String(b)),
        correct: `หยิบ ${a} ออกจากจานขวาด้วย`,
        wrongs: [`เพิ่ม ${a} ลงในจานขวา`, 'ไม่ต้องทำอะไร', `หยิบ ${b} ออกจากจานขวา`],
        math: false,
        explain: `ทำอะไรกับข้างหนึ่ง ต้องทำเหมือนกันกับอีกข้าง: ${M(`x = ${b} - ${a} = ${x}`)}`,
      });
    }
    const b = 2 * x;
    return choiceQ({
      prompt: `ตาชั่งสมดุลแทนสมการ ${M(`2x = ${b}`)} ถ้าแบ่งของบนจานซ้ายให้เหลือ <b>ครึ่งเดียว</b> ต้องทำอย่างไรกับจานขวา?`,
      visual: balanceHTML('2x', String(b)),
      correct: 'แบ่งจานขวาให้เหลือครึ่งเดียวด้วย',
      wrongs: ['เพิ่มจานขวาเป็น 2 เท่า', 'ไม่ต้องทำอะไร', 'หยิบ 2 ออกจากจานขวา'],
      math: false,
      explain: `หารด้วย 2 ทั้งสองข้าง: ${M(`x = ${b} ÷ 2 = ${x}`)}`,
    });
  },

  // ----- บทที่ 2 -----
  addEq() {
    const x = RV(1, 20), a = RV(1, 15), b = x + a;
    return inputQ({
      eq: `x + ${a} = ${b}`, answer: x,
      explain: steps([[`x + ${a} - ${a} = ${b} - ${a}`, `ลบ ${a} ทั้งสองข้าง`], [`x = ${x}`]]),
    });
  },
  subEq() {
    const a = RV(1, 12), x = R(a + 1, a + 15), b = x - a;
    return inputQ({
      eq: `x - ${a} = ${b}`, answer: x,
      explain: steps([[`x - ${a} + ${a} = ${b} + ${a}`, `บวก ${a} ทั้งสองข้าง`], [`x = ${x}`]]),
    });
  },
  mulEq() {
    const a = RV(2, 9), x = RV(1, 12), b = a * x;
    return inputQ({
      eq: `${a}x = ${b}`, answer: x,
      explain: steps([[`frac(${a}x,${a}) = frac(${b},${a})`, `หารด้วย ${a} ทั้งสองข้าง`], [`x = ${x}`]]),
    });
  },
  divEq() {
    const a = R(2, 6), y = RV(1, 10), x = a * y;
    return inputQ({
      eq: `frac(x,${a}) = ${y}`, answer: x,
      explain: steps([[`frac(x,${a}) * ${a} = ${y} * ${a}`, `คูณด้วย ${a} ทั้งสองข้าง`], [`x = ${x}`]]),
    });
  },
  inverseOp() {
    const a = R(2, 9), x = R(2, 9);
    const ops = {
      add: [`x + ${a} = ${x + a}`, `ลบ ${a} ทั้งสองข้าง`],
      sub: [`x - ${a} = ${x}`, `บวก ${a} ทั้งสองข้าง`],
      mul: [`${a}x = ${a * x}`, `หารด้วย ${a} ทั้งสองข้าง`],
      div: [`frac(x,${a}) = ${x}`, `คูณด้วย ${a} ทั้งสองข้าง`],
    };
    const k = pick(Object.keys(ops));
    return choiceQ({
      prompt: `ต้องทำอะไร <b>ทั้งสองข้าง</b> เพื่อให้เหลือ ${M('x')} ตัวเดียว?`,
      visual: `<div class="eq-big">${M(ops[k][0])}</div>`,
      correct: ops[k][1],
      wrongs: Object.keys(ops).filter((o) => o !== k).map((o) => ops[o][1]),
      math: false,
      explain: 'ใช้ <b>การดำเนินการตรงข้าม</b>: บวก ↔ ลบ และ คูณ ↔ หาร',
    });
  },
  nextStep() {
    const a = R(2, 6), x = RV(1, 9), b = RV(1, 12), c = a * x + b;
    return choiceQ({
      prompt: 'ขั้นแรกของการแก้สมการนี้ควรทำอะไร?',
      visual: `<div class="eq-big">${M(`${lin(a, b)} = ${c}`)}</div>`,
      correct: `ลบ ${b} ทั้งสองข้าง`,
      wrongs: [`บวก ${b} ทั้งสองข้าง`, `คูณด้วย ${a} ทั้งสองข้าง`, `ลบ ${a} ทั้งสองข้าง`],
      math: false,
      explain: 'กำจัดตัวเลขที่บวกหรือลบอยู่ก่อน แล้วจึงหาร' +
        steps([[`${lin(a, b)} = ${c}`], [`${a}x = ${c - b}`, `ลบ ${b} ทั้งสองข้าง`], [`x = ${x}`, `หารด้วย ${a}`]]),
    });
  },
  twoStep() {
    const a = R(2, 7), x = RV(1, 10);
    let b = pick([1, -1]) * RV(1, 12);
    if (a * x + b <= 0) b = -b;
    const c = a * x + b;
    return inputQ({
      eq: `${lin(a, b)} = ${c}`, answer: x,
      explain: steps([
        [`${a}x = ${c - b}`, b > 0 ? `ลบ ${b} ทั้งสองข้าง` : `บวก ${-b} ทั้งสองข้าง`],
        [`x = ${x}`, `หารด้วย ${a} ทั้งสองข้าง`],
      ]),
    });
  },

  // ----- บทที่ 3: บาร์โมเดล -----
  barRead() {
    const a = R(2, 4), x = R(2, 9), b = R(1, 12), c = a * x + b;
    return choiceQ({
      prompt: 'บาร์โมเดลนี้แทนสมการใด?',
      visual: barSVG(a, b, x, c),
      correct: `${lin(a, b)} = ${c}`,
      wrongs: [`${a}x = ${c}`, `${lin(a, c)} = ${b}`, `x + ${b} = ${c}`, `${lin(a, -b)} = ${c}`],
      tags: ['bar'],
      explain: `มีกล่อง ${M('x')} อยู่ ${a} กล่อง ต่อกับอีกส่วนที่ยาว ${b} รวมทั้งหมดยาว ${c}`,
    });
  },
  barEqual() {
    const a = R(2, 5), x = R(2, 12), c = a * x;
    return inputQ({
      prompt: `บาร์ยาว ${c} แบ่งเป็นกล่อง ${M('x')} เท่า ๆ กัน ${a} กล่อง กล่องละเท่าไร?`,
      visual: barSVG(a, 0, x, c), eq: `${a}x = ${c}`,
      answer: x, tags: ['bar', 'solve'],
      explain: steps([[`${a}x = ${c}`], [`x = ${c} ÷ ${a} = ${x}`]]) + barSVG(a, 0, x, c, true),
    });
  },
  barBuild() {
    const a = R(2, 4), x = R(2, 9), b = R(2, 12), c = a * x + b;
    const palette = shuffle(uniq([b, c, a, b + R(1, 3)]));
    return {
      type: 'barbuild',
      prompt: 'แตะชิ้นส่วนเพื่อ <b>สร้างบาร์โมเดล</b> ของสมการนี้',
      visual: `<div class="eq-big">${M(`${lin(a, b)} = ${c}`)}</div>`,
      a, b, c, x, palette, tags: ['bar'],
      explain: `ใช้กล่อง ${M('x')} จำนวน ${a} กล่อง ต่อกับส่วนที่ยาว ${b} ให้ยาวรวมเท่ากับ ${c}` + barSVG(a, b, x, c),
    };
  },
  barSolve() {
    const a = R(2, 4), x = R(2, 9), b = R(1, 12), c = a * x + b;
    return inputQ({
      prompt: `ใช้บาร์โมเดลหาค่าของ ${M('x')}`,
      visual: barSVG(a, b, x, c) + `<div class="eq-small">${M(`${lin(a, b)} = ${c}`)}</div>`, eq: `${lin(a, b)} = ${c}`,
      answer: x, tags: ['bar', 'solve'],
      explain: steps([
        [`${c} - ${b} = ${c - b}`, `ตัดส่วนที่ยาว ${b} ออก จะเหลือกล่อง x ${a} กล่อง`],
        [`${c - b} ÷ ${a} = ${x}`, 'แบ่งให้แต่ละกล่องเท่า ๆ กัน'],
      ]) + barSVG(a, b, x, c, true),
    });
  },

  // ----- บทที่ 4: โจทย์ท้าทาย -----
  wordToEq() {
    const a = R(2, 6), x = RV(3, 15), b = RV(2, 20), c = a * x + b;
    return choiceQ({
      prompt: `${pick(WORD_TEMPLATES)(a, b, c)}<br><span class="sub">ให้ ${M('x')} แทนสิ่งที่โจทย์ถาม สมการใดถูกต้อง?</span>`,
      correct: `${lin(a, b)} = ${c}`,
      wrongs: [`${lin(a, -b)} = ${c}`, `${lin(b, a)} = ${c}`, `${lin(a, c)} = ${b}`, `x + ${b} = ${c}`],
      explain: `"${a} ส่วนเท่า ๆ กัน" คือ ${M(a + 'x')} และอีก ${b} รวมเป็น ${c} → ${M(`${lin(a, b)} = ${c}`)}`,
    });
  },
  word() {
    const a = R(2, 6), x = RV(3, 15), b = RV(2, 20), c = a * x + b;
    return inputQ({
      prompt: pick(WORD_TEMPLATES)(a, b, c),
      visual: '', eq: `${lin(a, b)} = ${c}`,
      answer: x,
      explain: steps([[`${lin(a, b)} = ${c}`, 'เขียนสมการ'], [`${a}x = ${c - b}`, `ลบ ${b} ทั้งสองข้าง`], [`x = ${x}`, `หารด้วย ${a}`]]),
    });
  },
  bothSides() {
    const a = R(3, 8), c = R(1, a - 1), x = RV(1, 10), b = RV(1, 10), d = (a - c) * x + b;
    return inputQ({
      eq: `${lin(a, b)} = ${lin(c, d)}`, answer: x,
      explain: steps([
        [`${lin(a - c, b)} = ${d}`, `ลบ ${lin(c, 0)} ทั้งสองข้าง`],
        [`${a - c === 1 ? '' : a - c}x = ${d - b}`, `ลบ ${b} ทั้งสองข้าง`],
        [`x = ${x}`, a - c === 1 ? '' : `หารด้วย ${a - c}`],
      ]),
    });
  },
  brackets() {
    const a = R(2, 5), b = RV(1, 8), x = RV(1, 10), c = a * (x + b);
    return inputQ({
      eq: `${a}(x + ${b}) = ${c}`, answer: x,
      explain: steps([[`x + ${b} = ${x + b}`, `หารด้วย ${a} ทั้งสองข้าง`], [`x = ${x}`, `ลบ ${b} ทั้งสองข้าง`]]),
    });
  },
  negative() {
    const a = RV(6, 15), x = -R(1, a - 1), b = x + a;
    return inputQ({
      prompt: `แก้สมการ หาค่าของ ${M('x')} <span class="sub">(คำตอบอาจติดลบ!)</span>`,
      eq: `x + ${a} = ${b}`, answer: x,
      explain: steps([[`x = ${b} - ${a}`, `ลบ ${a} ทั้งสองข้าง`], [`x = ${x}`]]),
    });
  },

  // ----- โจทย์แบบใหม่: จับคู่ · เรียงขั้นตอน · หาขั้นที่ผิด -----
  matchSolve() {
    const pairs = [], used = new Set();
    for (const g of shuffle(['addEq', 'subEq', 'mulEq', 'divEq', 'twoStep'])) {
      if (pairs.length >= 4) break;
      for (let t = 0; t < 20; t++) {
        const q = G[g]();
        if (!used.has(q.answer)) { used.add(q.answer); pairs.push({ a: M(q.eq), b: M('x = ' + q.answer), eq: q.eq, x: q.answer }); break; }
      }
    }
    return matchQ({
      prompt: 'จับคู่สมการกับคำตอบที่ถูกต้อง', pairs, tags: ['solve'],
      explain: `<div class="steps">${pairs.map((p, i) => `<div class="step"><span class="num">${i + 1}</span><div>${M(p.eq)}<small>คำตอบคือ ${M('x = ' + p.x)}</small></div></div>`).join('')}</div>`,
    });
  },
  matchWords() {
    const a = R(2, 9), b = pick([2, 3, 4, 5, 6, 7, 8, 9].filter((n) => n !== a));
    const all = [
      [`${a} เท่าของจำนวนหนึ่ง`, `${a}x`],
      [`จำนวนหนึ่งเพิ่มขึ้น ${b}`, `x + ${b}`],
      [`จำนวนหนึ่งลดลง ${b}`, `x - ${b}`],
      ['ครึ่งหนึ่งของจำนวนหนึ่ง', 'frac(x,2)'],
      [`${a} เท่าของจำนวนหนึ่ง แล้วบวก ${b}`, `${a}x + ${b}`],
      [`จำนวนหนึ่งบวก ${b} แล้วคูณด้วย ${a}`, `${a}(x + ${b})`],
    ];
    const pairs = shuffle(all).slice(0, 4).map(([t, e]) => ({ a: t, b: M(e), e }));
    return matchQ({
      prompt: `จับคู่ข้อความกับนิพจน์ ให้ ${M('x')} แทน "จำนวนหนึ่ง"`, pairs,
      explain: `<div class="steps">${pairs.map((p, i) => `<div class="step"><span class="num">${i + 1}</span><div>${M(p.e)}<small>${p.a}</small></div></div>`).join('')}</div>`,
    });
  },
  orderSteps() {
    let start, stepsList, notes, decoy;
    if (rand() < 0.5) {
      const a = R(4, 8), c = R(1, a - 2), x = RV(1, 9), b = RV(1, 9), d = (a - c) * x + b;
      start = `${lin(a, b)} = ${lin(c, d)}`;
      stepsList = [`${lin(a - c, b)} = ${d}`, `${a - c}x = ${d - b}`, `x = ${x}`];
      notes = [`ลบ ${lin(c, 0)} ทั้งสองข้าง`, `ลบ ${b} ทั้งสองข้าง`, `หารด้วย ${a - c}`];
      decoy = `${lin(a + c, b)} = ${d}`;
    } else {
      const a = R(2, 6), b = R(1, 6), x = RV(1, 9), c = a * (x + b);
      start = `${a}(x + ${b}) = ${c}`;
      stepsList = [`${a}x + ${a * b} = ${c}`, `${a}x = ${a * x}`, `x = ${x}`];
      notes = ['กระจายวงเล็บ', `ลบ ${a * b} ทั้งสองข้าง`, `หารด้วย ${a}`];
      decoy = `${a}x + ${b} = ${c}`;
    }
    return {
      type: 'order', tags: ['solve'],
      prompt: 'แตะเรียงขั้นตอนการแก้สมการให้ถูกต้อง <span class="sub">(มีขั้นหลอกปนอยู่ 1 ขั้น)</span>',
      start, steps: stepsList, palette: shuffle([...stepsList, decoy]),
      explain: steps([[start], ...stepsList.map((st, i) => [st, notes[i]])]),
    };
  },
  findError() {
    const a = R(2, 6), b = R(1, 6), x = RV(1, 9), ab = a * b, c = a * (x + b);
    const right = [`${a}x + ${ab} = ${c}`, `${a}x = ${c - ab}`, `x = ${x}`];
    const notes = ['กระจายวงเล็บ', `ลบ ${ab} ทั้งสองข้าง`, `หารด้วย ${a}`];
    const e = R(0, 2);
    let shown, reason;
    if (e === 0) {
      const r = c - b;
      shown = [`${a}x + ${b} = ${c}`, `${a}x = ${r}`, `x = ${r % a === 0 ? r / a : `frac(${r},${a})`}`];
      reason = `ต้องคูณ ${a} กับ ${b} ในวงเล็บด้วย จะได้ ${M(`${a}x + ${ab}`)}`;
    } else if (e === 1) {
      shown = [right[0], `${a}x = ${c + ab}`, `x = ${(c + ab) / a}`];
      reason = `ต้อง <b>ลบ</b> ${ab} ทั้งสองข้าง ไม่ใช่บวก`;
    } else {
      shown = [right[0], right[1], `x = ${a * a * x}`];
      reason = `ต้อง <b>หาร</b>ด้วย ${a} ไม่ใช่คูณ`;
    }
    return {
      type: 'choice', tags: ['solve'],
      prompt: 'ผึ้งน้อยแก้สมการนี้ผิดไป 1 ขั้น <b>ผิดที่ขั้นไหน?</b>',
      visual: `<div class="eq-big">${M(`${a}(x + ${b}) = ${c}`)}</div>`,
      choices: shown.map((st, i) => `<span class="step-no">ขั้นที่ ${i + 1}</span>${M(st)}`),
      answer: e,
      explain: `ขั้นที่ ${e + 1} ผิด: ${reason}` + steps(right.map((st, i) => [st, notes[i]])),
    };
  },

  // ----- บทที่ 5: วงเล็บและเศษส่วน -----
  distribute() {
    const a = RV(2, 9), b = RV(1, 9);
    if (rand() < 0.5) {
      return choiceQ({
        prompt: `${M(`${a}(x + ${b})`)} เท่ากับข้อใด?`,
        correct: `${a}x + ${a * b}`, wrongs: [`${a}x + ${b}`, `x + ${a * b}`, `${a + b}x`, `${a}x + ${a + b}`],
        explain: `คูณ ${a} เข้าไป <b>ทุกตัว</b> ในวงเล็บ: ${M(`${a} * x + ${a} * ${b} = ${a}x + ${a * b}`)}`,
      });
    }
    return choiceQ({
      prompt: `${M(`${a}(x - ${b})`)} เท่ากับข้อใด?`,
      correct: `${a}x - ${a * b}`, wrongs: [`${a}x - ${b}`, `${a}x + ${a * b}`, `x - ${a * b}`, `${a}x - ${a + b}`],
      explain: `คูณ ${a} เข้าไป <b>ทุกตัว</b> ในวงเล็บ: ${M(`${a} * x - ${a} * ${b} = ${a}x - ${a * b}`)}`,
    });
  },
  bracketsBoth() {
    const a = R(3, 6), c = R(1, a - 1), x = RV(1, 9), b = RV(1, 6), ab = a * b, d = (a - c) * x + ab;
    const k = a - c;
    return inputQ({
      eq: `${a}(x + ${b}) = ${lin(c, d)}`, answer: x,
      explain: steps([
        [`${a}x + ${ab} = ${lin(c, d)}`, 'กระจายวงเล็บ'],
        [`${lin(k, ab)} = ${d}`, `ลบ ${lin(c, 0)} ทั้งสองข้าง`],
        [`${k === 1 ? '' : k}x = ${d - ab}`, `ลบ ${ab} ทั้งสองข้าง`],
        [`x = ${x}`, k === 1 ? '' : `หารด้วย ${k}`],
      ]),
    });
  },
  fracTwoStep() {
    const a = R(2, 6), y = RV(1, 9), b = RV(1, 10);
    return inputQ({
      eq: `frac(x,${a}) + ${b} = ${y + b}`, answer: a * y,
      explain: steps([[`frac(x,${a}) = ${y}`, `ลบ ${b} ทั้งสองข้าง`], [`x = ${y} * ${a} = ${a * y}`, `คูณด้วย ${a} ทั้งสองข้าง`]]),
    });
  },
  fracGroup() {
    const a = R(2, 6), c = RV(2, 9), b = R(1, a * c - 1), x = a * c - b;
    return inputQ({
      eq: `frac(x + ${b},${a}) = ${c}`, answer: x,
      explain: steps([[`x + ${b} = ${a * c}`, `คูณด้วย ${a} ทั้งสองข้าง`], [`x = ${x}`, `ลบ ${b} ทั้งสองข้าง`]]),
    });
  },

  // ----- โจทย์แบบใหม่ (ระยะ 5) -----
  // ประกอบสมการจากชิ้นส่วน: ตัวเลขของโจทย์ + ตัวเลขหลอก 1 ตัว + x + − =
  buildEq() {
    const a = R(2, 6), x = RV(3, 15);
    let b = RV(2, 20), d = R(2, 20);
    if (b === a) b++;
    const c = a * x + b;
    while ([a, b, c].includes(d)) d++;
    const tiles = shuffle([String(a), String(b), String(c), String(d), 'x', '+', '-', '=']);
    const key = [String(a), 'x', '+', String(b), '=', String(c)].map((t) => tiles.indexOf(t)); // ชิ้นส่วนไม่ซ้ำกันเสมอ
    return {
      type: 'build', tags: ['word'],
      prompt: `${pick(WORD_TEMPLATES)(a, b, c)}<br><span class="sub">ให้ ${M('x')} แทนสิ่งที่โจทย์ถาม แตะชิ้นส่วนเพื่อสร้างสมการ</span>`,
      tiles, nums: [a, b, c], answer: x, key, eq: `${lin(a, b)} = ${c}`,
      explain: `"${a} ส่วนเท่า ๆ กัน" คือ ${M(a + 'x')} รวมกับ ${b} ได้ ${c} → ${M(`${lin(a, b)} = ${c}`)} <small>(เขียน ${M(`${c} - ${b} = ${a}x`)} ก็ถูกเหมือนกัน · ตัวเลข ${d} ไม่ได้ใช้)</small>`,
    };
  },
  // แก้สมการแล้วปักคำตอบ (อาจติดลบ) บนเส้นจำนวน
  numlineSolve() {
    const x = R(-9, 6) || -1, a = RV(2, 12), mul = rand() < 0.4;
    const k = R(2, 4), eq = mul ? `${k}x = ${k * x}` : `x + ${a} = ${x + a}`;
    const min = x - R(2, 8);
    return {
      type: 'numline', tags: ['solve'], min, max: min + 10, answer: x, eq,
      prompt: `แก้สมการ แล้ววางจุดที่คำตอบบนเส้นจำนวน`,
      visual: `<div class="eq-big">${M(eq)}</div>`,
      explain: steps(mul ? [[`x = ${k * x} ÷ ${k}`, `หารด้วย ${k} ทั้งสองข้าง`], [`x = ${x}`, x < 0 ? 'ลบหารบวกได้ลบ' : '']]
        : [[`x = ${x + a} - ${a}`, `ลบ ${a} ทั้งสองข้าง`], [`x = ${x}`, x < 0 ? 'ตัวลบมากกว่าตัวตั้ง คำตอบจึงติดลบ' : '']]),
    };
  },
  // คำตอบเป็นเศษส่วน: กะตำแหน่งบนเส้นจำนวน 0–10
  estimateFrac() {
    const a = R(2, 5);
    let b = Math.min(RV(a + 1, 9 * a - 1), 9 * a - 1); // คำตอบอยู่ในช่วง 1–9 เสมอ
    if (b % a === 0) b--;
    const x = b / a, whole = Math.floor(x);
    return {
      type: 'numline', est: true, tol: 0.3, tags: ['solve'], min: 0, max: 10, answer: x, eq: `${a}x = ${b}`,
      prompt: `คำตอบของสมการนี้ไม่ใช่จำนวนเต็ม <b>กะตำแหน่ง</b>ของ ${M('x')} บนเส้นจำนวน`,
      visual: `<div class="eq-big">${M(`${a}x = ${b}`)}</div>`,
      explain: steps([[`x = frac(${b},${a})`, `หารด้วย ${a} ทั้งสองข้าง`],
        [`x = ${whole} frac(${b - whole * a},${a})`, `อยู่ระหว่าง ${whole} กับ ${whole + 1} (ประมาณ ${x.toFixed(1)})`]]),
    };
  },
  // เลือกทุกสมการที่มีคำตอบเดียวกับสมการที่ให้ (สมการที่ได้จากการทำเหมือนกันทั้งสองข้าง)
  multiEquiv() {
    const a = R(2, 6), x = RV(1, 9), b = RV(1, 12), c = a * x + b;
    const show = ([p, q, r]) => `${lin(p, q)} = ${r}`;
    const right = shuffle([[a, 0, c - b], [1, 0, x], [2 * a, 2 * b, 2 * c], [a, b + 1, c + 1]]).slice(0, R(2, 3));
    const seen = new Set(right.map(show));
    const wrong = shuffle([[a, 0, c + b], [1, 0, c - b], [a, b, c + a], [1, 0, x + 1], [a, 0, c], [2 * a, b, 2 * c], [a, 0, c - b + a]])
      .filter((t) => (t[2] - t[1]) / t[0] !== x && !seen.has(show(t)) && seen.add(show(t)));
    const opts = shuffle([...right.map((t) => ({ t, ok: true })), ...wrong.slice(0, 5 - right.length).map((t) => ({ t, ok: false }))]);
    return {
      type: 'multi', tags: ['solve'], eq: `${lin(a, b)} = ${c}`,
      prompt: `เลือก<b>ทุกสมการ</b>ที่มีคำตอบเดียวกับ ${M(`${lin(a, b)} = ${c}`)} <span class="sub">(เลือกได้มากกว่า 1 ข้อ)</span>`,
      choices: opts.map((o) => M(show(o.t))), answers: opts.map((o, i) => (o.ok ? i : -1)).filter((i) => i >= 0),
      explain: `คำตอบคือ ${M('x = ' + x)} สมการที่ได้จากการ<b>ทำเหมือนกันทั้งสองข้าง</b> (บวก ลบ คูณ หาร) มีคำตอบเดิมเสมอ · ลองแทน ${M('x = ' + x)} ในแต่ละข้อเพื่อตรวจ`,
    };
  },
  // อ่านตารางค่าบริการ (ค่าเริ่มต้น + อัตรา × จำนวน) แล้วหาจำนวนจากยอดรวม
  tableRate() {
    const [f, r] = [R(2, 6) * 10, R(2, 9) * 5], x = RV(5, 20), total = f + r * x;
    const rows = [1, 2, 3].map((n) => `<tr><td>${n}</td><td>${f + r * n}</td></tr>`).join('');
    return inputQ({
      prompt: `สวนสนุกคิดค่าเข้า ${f} บาท บวกค่าเล่นเครื่องเล่นครั้งละเท่ากัน ดูตาราง แล้วหาว่าถ้าจ่าย <b>${total} บาท</b> ได้เล่นกี่ครั้ง`,
      visual: `<table class="vtable"><thead><tr><th>เล่น (ครั้ง)</th><th>จ่ายทั้งหมด (บาท)</th></tr></thead><tbody>${rows}<tr class="ask"><td>${M('x')}</td><td>${total}</td></tr></tbody></table>`,
      eq: `${lin(r, f)} = ${total}`, answer: x, tags: ['solve'],
      explain: steps([[`${f + r * 2} - ${f + r} = ${r}`, `เล่นเพิ่ม 1 ครั้ง จ่ายเพิ่ม ${r} บาท`], [`${lin(r, f)} = ${total}`, `ค่าเข้า ${f} + ${r} × จำนวนครั้ง`],
        [`${r}x = ${total - f}`, `ลบ ${f} ทั้งสองข้าง`], [`x = ${x}`, `หารด้วย ${r}`]]),
    });
  },

  // ----- บทที่ 6: สมการกับชีวิตจริง -----
  wordRate() {
    const kind = R(0, 2);
    const [f, r, x] = kind === 0 ? [R(30, 40), R(5, 9), RV(4, 15)] : kind === 1 ? [R(100, 200), R(2, 5), RV(10, 60)] : [R(100, 300), R(20, 50), RV(3, 12)];
    const total = f + r * x;
    const text = [
      `ค่าแท็กซี่เริ่มต้น ${f} บาท บวกกิโลเมตรละ ${r} บาท จ่ายทั้งหมด ${total} บาท นั่งไปกี่กิโลเมตร?`,
      `ค่าโทรศัพท์รายเดือน ${f} บาท บวกนาทีละ ${r} บาท เดือนนี้จ่าย ${total} บาท โทรไปกี่นาที?`,
      `สมัครสมาชิกสระว่ายน้ำ ${f} บาท และจ่ายครั้งละ ${r} บาท จ่ายไปแล้ว ${total} บาท ว่ายไปกี่ครั้ง?`,
    ][kind];
    return inputQ({
      prompt: text, visual: '', answer: x, eq: `${lin(r, f)} = ${total}`,
      explain: steps([[`${lin(r, f)} = ${total}`, 'ค่าเริ่มต้น + อัตรา × จำนวน = ทั้งหมด'], [`${r}x = ${total - f}`, `ลบ ${f} ทั้งสองข้าง`], [`x = ${x}`, `หารด้วย ${r}`]]),
    });
  },
  wordConsecutive() {
    const x = RV(5, 40), sum = 3 * x + 3;
    return inputQ({
      prompt: `ผลบวกของจำนวนนับ 3 จำนวนที่เรียงติดกันเท่ากับ ${sum} จำนวนที่น้อยที่สุดคือเท่าไร?`, visual: '', answer: x, eq: `x + (x + 1) + (x + 2) = ${sum}`,
      explain: steps([[`x + (x + 1) + (x + 2) = ${sum}`, 'ให้จำนวนที่น้อยที่สุดคือ x'], [`3x + 3 = ${sum}`, 'รวมพจน์'], [`3x = ${sum - 3}`, 'ลบ 3 ทั้งสองข้าง'], [`x = ${x}`, `สามจำนวนคือ ${x}, ${x + 1}, ${x + 2}`]]),
    });
  },
  wordAge() {
    const x = RV(5, 20), d = R(20, 35), sum = 2 * x + d;
    return inputQ({
      prompt: `แม่อายุมากกว่าลูก ${d} ปี และอายุรวมกัน ${sum} ปี ลูกอายุกี่ปี?`, visual: '', answer: x, eq: `x + (x + ${d}) = ${sum}`,
      explain: steps([[`x + (x + ${d}) = ${sum}`, `ลูกอายุ x ปี แม่อายุ x + ${d} ปี`], [`2x + ${d} = ${sum}`], [`2x = ${sum - d}`, `ลบ ${d} ทั้งสองข้าง`], [`x = ${x}`, 'หารด้วย 2']]),
    });
  },
  wordPerimeter() {
    const w = RV(3, 15), d = R(2, 8), P = 4 * w + 2 * d;
    return inputQ({
      prompt: `สี่เหลี่ยมผืนผ้ามีด้านยาวมากกว่าด้านกว้าง ${d} ซม. ความยาวรอบรูป ${P} ซม. ด้านกว้างยาวกี่ซม.?`,
      visual: rectSVG('x', `x + ${d}`), answer: w, eq: `2(x + x + ${d}) = ${P}`,
      explain: steps([[`2(x + x + ${d}) = ${P}`, 'ความยาวรอบรูป = 2 × (กว้าง + ยาว)'], [`4x + ${2 * d} = ${P}`, 'กระจายวงเล็บ'], [`4x = ${P - 2 * d}`, `ลบ ${2 * d} ทั้งสองข้าง`], [`x = ${w}`, 'หารด้วย 4']]),
    });
  },
  wordToEq2() {
    const kind = R(0, 2);
    if (kind === 0) {
      const f = R(30, 40), r = R(5, 9), x = RV(4, 15), total = f + r * x;
      return choiceQ({
        prompt: `ค่าแท็กซี่เริ่มต้น ${f} บาท บวกกิโลเมตรละ ${r} บาท จ่ายทั้งหมด ${total} บาท<br><span class="sub">ให้ ${M('x')} แทนระยะทาง สมการใดถูกต้อง?</span>`,
        correct: `${lin(r, f)} = ${total}`, wrongs: [`${lin(f, r)} = ${total}`, `${r}x - ${f} = ${total}`, `${r + f}x = ${total}`],
        explain: `ค่าเริ่มต้น ${f} + กิโลเมตรละ ${r} × ${M('x')} = ${total}`,
      });
    }
    if (kind === 1) {
      const w = RV(3, 15), d = R(2, 8), P = 4 * w + 2 * d;
      return choiceQ({
        prompt: `สี่เหลี่ยมผืนผ้ายาวกว่ากว้าง ${d} ซม. ความยาวรอบรูป ${P} ซม.<br><span class="sub">ให้ด้านกว้างยาว ${M('x')} ซม. สมการใดถูกต้อง?</span>`,
        visual: rectSVG('x', `x + ${d}`),
        correct: `2(x + x + ${d}) = ${P}`, wrongs: [`x + x + ${d} = ${P}`, `2x + ${d} = ${P}`, `x(x + ${d}) = ${P}`],
        explain: `ความยาวรอบรูป = 2 × (กว้าง + ยาว) = ${M(`2(x + x + ${d})`)}`,
      });
    }
    const x = RV(5, 40), sum = 3 * x + 3;
    return choiceQ({
      prompt: `ผลบวกของจำนวนนับ 3 จำนวนที่เรียงติดกันเท่ากับ ${sum}<br><span class="sub">ให้จำนวนที่น้อยที่สุดคือ ${M('x')} สมการใดถูกต้อง?</span>`,
      correct: `x + (x + 1) + (x + 2) = ${sum}`, wrongs: [`3x = ${sum}`, `x + 2x + 3x = ${sum}`, `x + (x + 2) + (x + 4) = ${sum}`],
      explain: `จำนวนที่เรียงติดกันคือ ${M('x')}, ${M('x + 1')}, ${M('x + 2')}`,
    });
  },
};

// ---------- curriculum ----------
// สร้างโจทย์ 1 ข้อจากตัวสร้าง gen ที่ระดับความยาก lvl ด้วย seed (seed เดียวกัน = โจทย์เดียวกันทุกตัวเลขและลำดับตัวเลือก)
function makeQuestion(gen, lvl, seed) {
  const prevRand = rand, prevLevel = LEVEL;
  rand = seededRandom(seed); LEVEL = lvl;
  try { return G[gen](); } finally { rand = prevRand; LEVEL = prevLevel; }
}

// เกมผึ้งเร่งรีบ: โจทย์แก้สมการแบบเลือกตอบ 4 ตัวเลือก · lvlOf(gen) = ระดับความยากของทักษะนั้น
const TIMED_GENS = ['addEq', 'subEq', 'mulEq', 'divEq', 'twoStep'];
function makeTimedQuestion(seed, lvlOf) {
  const prevRand = rand;
  rand = seededRandom(seed);
  try {
    const g = pick(TIMED_GENS), lvl = lvlOf(g);
    const q = makeQuestion(g, lvl, Math.floor(rand() * 4294967296));
    const a = q.answer;
    const opts = new Set([a]);
    for (const c of shuffle([a + 1, a - 1, a + 2, a - 2, a * 2, a + 10, a + 3])) {
      if (opts.size >= 4) break;
      if (c >= 0) opts.add(c);
    }
    for (let k = 4; opts.size < 4; k++) opts.add(a + k);
    return { g, lvl, visual: q.visual, answer: a, choices: shuffle([...opts]) };
  } finally { rand = prevRand; }
}

const UNITS = [
  {
    id: 'u1', title: 'รู้จักสมการตัวแปรเดียว', desc: 'สมการ ตัวแปร และคำตอบของสมการ',
    color: '#FFE08A', dark: '#E8B730', ink: '#2A1F14',
    lessons: [
      {
        id: 'u1l1', title: 'สมการคืออะไร?', gens: ['whichIsEquation', 'findVariable'],
        cards: [
          { title: 'สมการคืออะไร?', body: '<b>สมการ</b> คือประโยคทางคณิตศาสตร์ที่มีเครื่องหมาย <b>=</b> บอกว่าค่าทางซ้ายเท่ากับค่าทางขวา', demo: [['3 + 4 = 7', 'สมการที่รู้ค่าทุกตัว'], ['x + 4 = 7', 'สมการที่มีตัวที่ไม่รู้ค่า']] },
          { title: 'ตัวแปร', body: 'ตัวอักษร เช่น x, y, n คือ <b>ตัวแปร</b> ใช้แทนจำนวนที่เรายังไม่รู้ สมการที่มีตัวแปรเพียงตัวเดียวเรียกว่า <b>สมการตัวแปรเดียว</b>', demo: [['2y - 1 = 9', 'ตัวแปรคือ y']] },
        ],
      },
      {
        id: 'u1l2', title: 'คำตอบของสมการ', gens: ['checkSolution', 'guessSolution'],
        cards: [
          { title: 'คำตอบของสมการ', body: '<b>คำตอบของสมการ</b> คือค่าของตัวแปรที่แทนลงไปแล้วทำให้สมการเป็นจริง', demo: [['2x + 1 = 7', 'ลองแทน x = 3'], ['2*3 + 1 = 7', 'เป็นจริง ดังนั้น x = 3 คือคำตอบ']] },
        ],
      },
      {
        id: 'u1l3', title: 'สมการเหมือนตาชั่ง', gens: ['balance', 'guessSolution', 'checkSolution'],
        cards: [
          { title: 'สมการเหมือนตาชั่ง', body: 'สองข้างของสมการต้องหนักเท่ากันเสมอ ถ้าเพิ่ม ลด คูณ หรือหารข้างหนึ่ง ต้องทำ <b>แบบเดียวกัน</b> กับอีกข้าง', visual: balanceHTML('x + 3', '8') },
        ],
      },
    ],
  },
  {
    id: 'u2', title: 'การแก้สมการแบบพื้นฐาน', desc: 'บวก ลบ คูณ หาร และสมการสองขั้นตอน',
    color: '#FFD24D', dark: '#E0A800', ink: '#2A1F14',
    lessons: [
      {
        id: 'u2l1', title: 'บวกและลบ', gens: ['addEq', 'subEq', 'inverseOp'],
        cards: [
          { title: 'การดำเนินการตรงข้าม', body: 'ถ้ามี <b>+5</b> ติดอยู่กับ x ให้ <b>ลบ 5</b> ทั้งสองข้างเพื่อกำจัดมันออก', demo: [['x + 5 = 12'], ['x + 5 - 5 = 12 - 5', 'ลบ 5 ทั้งสองข้าง'], ['x = 7']] },
          { title: 'ลบ → ใช้บวก', body: 'ถ้ามี <b>−3</b> ให้ <b>บวก 3</b> ทั้งสองข้าง', demo: [['x - 3 = 8'], ['x - 3 + 3 = 8 + 3', 'บวก 3 ทั้งสองข้าง'], ['x = 11']] },
        ],
      },
      {
        id: 'u2l2', title: 'คูณและหาร', gens: ['mulEq', 'divEq', 'inverseOp'],
        cards: [
          { title: 'คูณ → ใช้หาร', body: '<b>4x</b> หมายถึง 4 × x ให้ <b>หารด้วย 4</b> ทั้งสองข้าง', demo: [['4x = 20'], ['frac(4x,4) = frac(20,4)', 'หารด้วย 4 ทั้งสองข้าง'], ['x = 5']] },
          { title: 'หาร → ใช้คูณ', body: 'ถ้า x ถูกหารด้วย 3 ให้ <b>คูณด้วย 3</b> ทั้งสองข้าง', demo: [['frac(x,3) = 6'], ['x = 6 * 3', 'คูณด้วย 3 ทั้งสองข้าง'], ['x = 18']] },
        ],
      },
      {
        id: 'u2l3', title: 'สมการสองขั้นตอน', gens: ['nextStep', 'twoStep', 'twoStep', 'matchSolve', 'multiEquiv'],
        cards: [
          { title: 'สองขั้นตอน', body: 'กำจัดตัวเลขที่ <b>บวก/ลบ</b> ก่อน แล้วค่อย <b>หาร/คูณ</b>', demo: [['3x + 4 = 19'], ['3x = 15', 'ขั้นที่ 1: ลบ 4 ทั้งสองข้าง'], ['x = 5', 'ขั้นที่ 2: หารด้วย 3 ทั้งสองข้าง']] },
        ],
      },
    ],
  },
  {
    id: 'u3', title: 'บาร์โมเดลช่วยแก้สมการ', desc: 'มองสมการเป็นภาพ แล้วแก้ได้ง่ายขึ้น',
    color: '#FFC21A', dark: '#E09A00', ink: '#2A1F14',
    lessons: [
      {
        id: 'u3l1', title: 'อ่านบาร์โมเดล', gens: ['barRead', 'barEqual'],
        cards: [
          { title: 'บาร์โมเดลคืออะไร?', body: 'บาร์โมเดลใช้ <b>แถบสี่เหลี่ยม</b> แทนจำนวน กล่องสีเหลืองคือ x ส่วนสีฟ้าคือตัวเลขที่รู้ค่า และวงเล็บด้านล่างคือผลรวม', visual: barSVG(3, 4, 5, 19), demo: [['3x + 4 = 19', 'บาร์นี้แทนสมการนี้']] },
        ],
      },
      {
        id: 'u3l2', title: 'สร้างบาร์โมเดล', gens: ['barBuild', 'barRead'],
        cards: [
          { title: 'สร้างบาร์โมเดล 3 ขั้น', body: '1) วางกล่อง x ตามจำนวนหน้า x<br>2) ต่อด้วยตัวเลขที่บวกอยู่<br>3) ผลรวมทั้งหมดอยู่ด้านล่าง', visual: barSVG(2, 6, 4, 14), demo: [['2x + 6 = 14', 'x 2 กล่อง + ส่วน 6 = รวม 14']] },
        ],
      },
      {
        id: 'u3l3', title: 'แก้สมการด้วยบาร์โมเดล', gens: ['barSolve', 'barBuild', 'barSolve'],
        cards: [
          { title: 'ตัดออก แล้วแบ่ง', body: 'ตัดส่วนที่รู้ค่าออกจากผลรวม แล้วแบ่งที่เหลือให้กล่อง x เท่า ๆ กัน', visual: barSVG(3, 4, 5, 19), demo: [['19 - 4 = 15', 'ตัดส่วน 4 ออก'], ['15 ÷ 3 = 5', 'แบ่ง 3 กล่อง → x = 5']] },
        ],
      },
    ],
  },
  {
    id: 'u4', title: 'แบบฝึกหัดและโจทย์ท้าทาย', desc: 'โจทย์ปัญหา ตัวแปรสองข้าง และวงเล็บ',
    color: '#F5A623', dark: '#C77F00', ink: '#2A1F14',
    lessons: [
      {
        id: 'u4l1', title: 'แปลงโจทย์เป็นสมการ', gens: ['wordToEq', 'buildEq', 'matchWords'],
        cards: [
          { title: 'อ่านโจทย์ให้เป็นสมการ', body: 'ให้ <b>x</b> แทนสิ่งที่โจทย์ถาม แล้วสังเกตคำสำคัญ:<br>• "ละ / แต่ละ / เท่า ๆ กัน" → คูณ<br>• "รวม / เพิ่ม" → บวก<br>• "เหลือ / ลดลง" → ลบ', demo: [['3x + 5 = 20', 'ซื้อของ 3 ชิ้น ชิ้นละ x บาท + ค่าส่ง 5 บาท = 20 บาท']] },
        ],
      },
      {
        id: 'u4l2', title: 'โจทย์ปัญหา', gens: ['word'],
        cards: [
          { title: 'ขั้นตอนแก้โจทย์ปัญหา', body: '1) อ่านโจทย์ให้เข้าใจ<br>2) ให้ x แทนสิ่งที่โจทย์ถาม<br>3) เขียนสมการ<br>4) แก้สมการ<br>5) <b>ตรวจคำตอบ</b> กับโจทย์อีกครั้ง' },
        ],
      },
      {
        id: 'u4l3', title: 'ตัวแปรสองข้าง & วงเล็บ', gens: ['bothSides', 'brackets', 'numlineSolve', 'orderSteps'],
        cards: [
          { title: 'ตัวแปรอยู่สองข้าง', body: 'ย้าย x ไปไว้ข้างเดียวกันก่อน โดยลบ x ออกจากทั้งสองข้าง', demo: [['5x + 2 = 3x + 10'], ['2x + 2 = 10', 'ลบ 3x ทั้งสองข้าง'], ['2x = 8', 'ลบ 2 ทั้งสองข้าง'], ['x = 4']] },
          { title: 'สมการที่มีวงเล็บ', body: 'หารตัวเลขหน้าวงเล็บออกก่อน แล้วแก้ต่อตามปกติ', demo: [['3(x + 2) = 21'], ['x + 2 = 7', 'หารด้วย 3 ทั้งสองข้าง'], ['x = 5', 'ลบ 2 ทั้งสองข้าง']] },
        ],
      },
    ],
  },
  {
    id: 'u5', title: 'วงเล็บและเศษส่วน', desc: 'กระจายวงเล็บ สมการเศษส่วน และตรวจหาจุดผิด',
    color: '#E8890C', dark: '#B86A00', ink: '#2A1F14',
    lessons: [
      {
        id: 'u5l1', title: 'กระจายวงเล็บ', gens: ['distribute', 'bracketsBoth', 'distribute'],
        cards: [
          { title: 'กระจายวงเล็บ', body: 'ตัวเลขหน้าวงเล็บต้องคูณ <b>ทุกตัว</b> ที่อยู่ในวงเล็บ', demo: [['3(x + 4)'], ['3x + 12', '3 × x และ 3 × 4']] },
          { title: 'วงเล็บกับตัวแปรสองข้าง', body: 'กระจายวงเล็บก่อน แล้วย้าย x ไปไว้ข้างเดียวกัน', demo: [['2(x + 3) = x + 10'], ['2x + 6 = x + 10', 'กระจายวงเล็บ'], ['x + 6 = 10', 'ลบ x ทั้งสองข้าง'], ['x = 4', 'ลบ 6 ทั้งสองข้าง']] },
        ],
      },
      {
        id: 'u5l2', title: 'สมการที่มีเศษส่วน', gens: ['fracTwoStep', 'fracGroup', 'matchSolve', 'estimateFrac'],
        cards: [
          { title: 'กำจัดตัวส่วน', body: 'ถ้า x ถูกหารอยู่ ให้ <b>คูณ</b> ด้วยตัวส่วนทั้งสองข้าง', demo: [['frac(x,4) + 3 = 8'], ['frac(x,4) = 5', 'ลบ 3 ทั้งสองข้าง'], ['x = 20', 'คูณด้วย 4 ทั้งสองข้าง']] },
          { title: 'ทั้งก้อนถูกหาร', body: 'ถ้าตัวเศษเป็นก้อน ให้คูณตัวส่วนออกก่อน แล้วค่อยแก้ต่อ', demo: [['frac(x + 2,3) = 5'], ['x + 2 = 15', 'คูณด้วย 3 ทั้งสองข้าง'], ['x = 13', 'ลบ 2 ทั้งสองข้าง']] },
        ],
      },
      {
        id: 'u5l3', title: 'เรียงขั้นตอนและหาจุดผิด', gens: ['orderSteps', 'findError', 'bracketsBoth'],
        cards: [
          { title: 'ตรวจทีละขั้น', body: 'ทุกขั้นต้องทำ <b>อย่างเดียวกันทั้งสองข้าง</b> ถ้าขั้นไหนทำข้างเดียว หรือคิดเลขผิด ขั้นนั้นคือจุดผิด', demo: [['4(x + 1) = 20'], ['4x + 1 = 20', 'ผิด! ลืมคูณ 4 กับ 1'], ['4x + 4 = 20', 'ถูกต้อง']] },
        ],
      },
    ],
  },
  {
    id: 'u6', title: 'สมการกับชีวิตจริง', desc: 'ค่าบริการ จำนวนเรียงกัน อายุ และรูปเรขาคณิต',
    color: '#D9730D', dark: '#A35400', ink: '#2A1F14',
    lessons: [
      {
        id: 'u6l1', title: 'ค่าบริการและอัตรา', gens: ['wordRate', 'tableRate', 'wordToEq2', 'matchWords'],
        cards: [
          { title: 'ค่าเริ่มต้น + อัตรา', body: 'โจทย์ค่าบริการมักเป็น <b>ค่าเริ่มต้น + อัตรา × จำนวน = ทั้งหมด</b>', demo: [['35 + 6x = 95', 'แท็กซี่เริ่ม 35 บาท กิโลเมตรละ 6 บาท'], ['6x = 60', 'ลบ 35 ทั้งสองข้าง'], ['x = 10', 'นั่งไป 10 กิโลเมตร']] },
        ],
      },
      {
        id: 'u6l2', title: 'จำนวนเรียงกันและอายุ', gens: ['wordConsecutive', 'wordAge', 'wordToEq2'],
        cards: [
          { title: 'จำนวนที่เรียงติดกัน', body: 'ให้จำนวนแรกเป็น x จำนวนถัดไปคือ x + 1 และ x + 2', demo: [['x + (x + 1) + (x + 2) = 33'], ['3x + 3 = 33', 'รวมพจน์'], ['x = 10', 'สามจำนวนคือ 10, 11, 12']] },
          { title: 'โจทย์อายุ', body: 'ให้คนที่อายุน้อยกว่าเป็น x แล้วเขียนอายุอีกคนจากความต่าง', demo: [['x + (x + 25) = 41', 'แม่อายุมากกว่าลูก 25 ปี รวมกัน 41 ปี'], ['2x = 16'], ['x = 8', 'ลูกอายุ 8 ปี']] },
        ],
      },
      {
        id: 'u6l3', title: 'รูปเรขาคณิต', gens: ['wordPerimeter', 'wordToEq2', 'wordRate'],
        cards: [
          { title: 'ความยาวรอบรูป', body: 'ความยาวรอบรูปสี่เหลี่ยมผืนผ้า = <b>2 × (กว้าง + ยาว)</b>', visual: rectSVG('x', 'x + 3'), demo: [['2(x + x + 3) = 34'], ['4x + 6 = 34', 'กระจายวงเล็บ'], ['x = 7', 'ลบ 6 แล้วหารด้วย 4']] },
        ],
      },
    ],
  },
];

// โหมดฝึกฝน (ไม่เสียหัวใจ)
const PRACTICE = [
  { id: 'mix', icon: 'shuffle', color: '#FFC21A', ink: '#2A1F14', title: 'ทบทวนแบบผสม', desc: 'สุ่มโจทย์จากทุกบทที่ปลดล็อกแล้ว', unit: 0 },
  { id: 'solve', icon: 'equals', color: '#58C23A', ink: '#0F2E09', title: 'ฝึกแก้สมการ', desc: 'บวก ลบ คูณ หาร และสองขั้นตอน', unit: 1, gens: ['addEq', 'subEq', 'mulEq', 'divEq', 'twoStep', 'multiEquiv'] },
  { id: 'bar', icon: 'bar', color: '#2F6FED', ink: '#FFFFFF', title: 'ฝึกบาร์โมเดล', desc: 'อ่าน สร้าง และแก้สมการด้วยบาร์', unit: 2, gens: ['barRead', 'barBuild', 'barSolve', 'barEqual'] },
  { id: 'challenge', icon: 'mountain', color: '#FF7A1A', ink: '#2A1F14', title: 'โจทย์ท้าทาย', desc: 'โจทย์ปัญหา ตัวแปรสองข้าง วงเล็บ', unit: 3, gens: ['word', 'buildEq', 'bothSides', 'brackets', 'negative', 'numlineSolve'] },
  { id: 'steps', icon: 'target', color: '#E8890C', ink: '#2A1F14', title: 'วงเล็บ เศษส่วน และจุดผิด', desc: 'กระจายวงเล็บ เศษส่วน เรียงขั้นตอน หาขั้นที่ผิด', unit: 4, gens: ['bracketsBoth', 'fracTwoStep', 'fracGroup', 'estimateFrac', 'orderSteps', 'findError'] },
  { id: 'reallife', icon: 'flag', color: '#D9730D', ink: '#2A1F14', title: 'โจทย์ชีวิตจริง', desc: 'ค่าบริการ จำนวนเรียงกัน อายุ ความยาวรอบรูป', unit: 5, gens: ['wordRate', 'tableRate', 'wordConsecutive', 'wordAge', 'wordPerimeter', 'matchWords'] },
];

const QUESTS = [
  { id: 'solve', icon: 'equals', color: '#FFC21A', ink: '#2A1F14', title: 'แก้สมการให้ถูก 5 ข้อ', goal: 5, reward: 10 },
  { id: 'bar', icon: 'bar', color: '#2F6FED', ink: '#FFFFFF', title: 'ใช้บาร์โมเดล 3 ครั้ง', goal: 3, reward: 10 },
  { id: 'xp', icon: 'bolt', color: '#58C23A', ink: '#0F2E09', title: 'สะสม 30 XP วันนี้', goal: 30, reward: 15 },
  { id: 'perfect', icon: 'target', color: '#E8650A', ink: '#FFFFFF', title: 'จบบทเรียนโดยไม่ผิดเลย 1 ครั้ง', goal: 1, reward: 20 },
];

const BADGES = [
  { id: 'first', icon: 'flag', color: '#58C23A', ink: '#0F2E09', name: 'ก้าวแรก', desc: 'จบบทเรียนแรก', test: (s) => s.stats.lessons >= 1 },
  { id: 'solver', icon: 'equals', color: '#FFC21A', ink: '#2A1F14', name: 'นักแก้สมการ', desc: 'แก้สมการถูก 25 ข้อ', test: (s) => s.stats.solved >= 25 },
  { id: 'bar', icon: 'bar', color: '#2F6FED', ink: '#FFFFFF', name: 'สถาปนิกบาร์โมเดล', desc: 'ทำโจทย์บาร์โมเดล 15 ข้อ', test: (s) => s.stats.bar >= 15 },
  { id: 'streak3', icon: 'flame', color: '#FF7A1A', ink: '#FFFFFF', name: 'ไฟลุกโชน', desc: 'เรียนต่อเนื่อง 3 วัน', test: (s) => s.streak >= 3 },
  { id: 'perfect', icon: 'target', color: '#2F6FED', ink: '#FFFFFF', name: 'ไร้ที่ติ', desc: 'จบบทเรียนโดยไม่ผิดเลย', test: (s) => s.stats.perfect >= 1 },
  { id: 'unit', icon: 'trophy', color: '#FFC21A', ink: '#2A1F14', name: 'ผู้พิชิตด่าน', desc: 'ผ่านด่านทดสอบ 1 ด่าน', test: (s) => s.stats.tests >= 1 },
  { id: 'xp500', icon: 'bolt', color: '#E8650A', ink: '#FFFFFF', name: 'พลังผึ้ง', desc: 'สะสมครบ 500 XP', test: (s) => s.xp >= 500 },
  { id: 'queen', icon: 'crown', color: '#2A1F14', ink: '#FFC21A', name: 'ราชินีผึ้ง', desc: 'ผ่านทุกด่านในเส้นทาง', test: (s) => NODES.every((n) => s.done[n.id]) },
];

// เส้นทางบทเรียนแบบแบน: บทเรียน… + ด่านทดสอบท้ายบท
const NODES = [];
UNITS.forEach((u, ui) => {
  u.lessons.forEach((l) => NODES.push({ ...l, unit: u, ui, kind: 'lesson' }));
  NODES.push({ id: u.id + '-test', title: 'ด่านทดสอบ', unit: u, ui, kind: 'test', gens: uniq(u.lessons.flatMap((l) => l.gens)) });
});

// ลีกรายสัปดาห์ 5 ระดับ (กลุ่มละ 20 คน: 5 อันดับแรกเลื่อนขึ้น 3 อันดับท้ายตกลีก)
const TIERS = [
  { name: 'ผึ้งน้อย', icon: 'egg', color: '#FFE08A', ink: '#2A1F14' },
  { name: 'ผึ้งงาน', icon: 'bee', color: '#58C23A', ink: '#0F2E09' },
  { name: 'ผึ้งสำรวจ', icon: 'compass', color: '#2F6FED', ink: '#FFFFFF' },
  { name: 'ผึ้งองครักษ์', icon: 'shield', color: '#FF7A1A', ink: '#2A1F14' },
  { name: 'นางพญา', icon: 'crown', color: '#2A1F14', ink: '#FFC21A' },
];
const PROMOTE_TOP = 5;
const DEMOTE_FROM = 18;

// เหรียญตราหลายระดับ (ระดับ 1–5)
const LEVEL_BADGES = [
  { id: 'solver', name: 'นักแก้สมการ', icon: 'equals', color: '#FFC21A', ink: '#2A1F14', unit: 'สมการ', steps: [10, 25, 50, 100, 250], value: (s) => s.stats.solved },
  { id: 'streak', name: 'ไฟลุกโชน', icon: 'flame', color: '#FF7A1A', ink: '#2A1F14', unit: 'วันติดกัน', steps: [3, 7, 14, 30, 100], value: (s) => Math.max(s.records.bestStreak, s.streak) },
  { id: 'bar', name: 'สถาปนิกบาร์โมเดล', icon: 'bar', color: '#2F6FED', ink: '#FFFFFF', unit: 'ข้อ', steps: [5, 15, 30, 60, 120], value: (s) => s.stats.bar },
  { id: 'xp', name: 'พลังผึ้ง', icon: 'bolt', color: '#58C23A', ink: '#0F2E09', unit: 'XP', steps: [100, 500, 1000, 2500, 5000], value: (s) => s.xp },
  { id: 'perfect', name: 'ไร้ที่ติ', icon: 'target', color: '#2F6FED', ink: '#FFFFFF', unit: 'บท', steps: [1, 3, 6, 10, 20], value: (s) => s.stats.perfect },
];
const MONTH_GOAL = 30; // แต้มภารกิจที่ต้องสะสมเพื่อรับเหรียญประจำเดือน

// เรื่องเล่าโจทย์: บทสนทนาสลับกับคำถาม (unit = บทที่ต้องไปถึงก่อนจึงปลดล็อก)
const STORIES = [
  {
    id: 'honey', title: 'ร้านน้ำผึ้งของป้าบี', unit: 1,
    cast: { b: ['ป้าบี', 'บี', '#FFC21A', '#2A1F14'], t: ['ต้นกล้า', 'ต', '#E8F8E0', '#2B7A1A'] },
    steps: [
      { who: 'b', text: 'วันนี้ป้าขายน้ำผึ้งไป 4 ขวด รวมกับค่าส่ง 30 บาท ได้เงินทั้งหมด 230 บาทจ้ะ' },
      { who: 't', text: 'ถ้าทุกขวดราคาเท่ากัน น้ำผึ้งขวดละกี่บาทนะ?' },
      { q: 'choice', prompt: `ให้ ${M('x')} แทนราคาขวดละ ${M('x')} บาท สมการใดถูกต้อง?`, choices: ['4x + 30 = 230', '4x - 30 = 230', '30x + 4 = 230'], answer: 0,
        explain: `ขาย 4 ขวด ขวดละ ${M('x')} บาท คือ ${M('4x')} แล้วบวกค่าส่ง 30 รวมเป็น 230` },
      { who: 'b', text: 'ถูกต้อง! ทีนี้ลองแก้สมการดูสิ' },
      { q: 'input', prompt: `แก้สมการ ${M('4x + 30 = 230')}`, answer: 50, explain: steps([['4x = 200', 'ลบ 30 ทั้งสองข้าง'], ['x = 50', 'หารด้วย 4']]) },
      { who: 't', text: 'ขวดละ 50 บาท! ลองตรวจดู 4 × 50 + 30 = 230 พอดีเลย' },
      { who: 'b', text: 'พรุ่งนี้ถ้าป้าขายได้ 6 ขวด ค่าส่งเท่าเดิม จะได้เงินเท่าไรนะ?' },
      { q: 'input', prompt: `คำนวณ ${M('6 * 50 + 30')}`, label: 'คำตอบ =', answer: 330, explain: steps([['6 * 50 = 300'], ['300 + 30 = 330']]) },
      { who: 'b', text: 'เก่งมาก! ไว้ป้าจะเลี้ยงน้ำผึ้งนะ' },
    ],
  },
  {
    id: 'trip', title: 'ทัศนศึกษาของห้องเรา', unit: 1,
    cast: { m: ['ครูมด', 'ม', '#FFE3D1', '#8A3700'], f: ['ฟ้าใส', 'ฟ', '#DDF1FF', '#1E4FB8'] },
    steps: [
      { who: 'm', text: 'ห้องเราจะไปทัศนศึกษา เช่ารถตู้ 3 คัน คันละราคาเท่ากัน บวกค่าทางด่วนอีก 150 บาท รวม 4,650 บาท' },
      { who: 'f', text: 'ค่าเช่ารถตู้คันละเท่าไรคะครู?' },
      { q: 'choice', prompt: `ให้ ${M('x')} แทนค่าเช่ารถคันละ ${M('x')} บาท สมการใดถูกต้อง?`, choices: ['3x + 150 = 4650', '150x + 3 = 4650', '3x - 150 = 4650'], answer: 0,
        explain: `รถ 3 คัน คือ ${M('3x')} บวกค่าทางด่วน 150 รวม 4,650` },
      { q: 'input', prompt: `แก้สมการ ${M('3x + 150 = 4650')}`, answer: 1500, explain: steps([['3x = 4500', 'ลบ 150 ทั้งสองข้าง'], ['x = 1500', 'หารด้วย 3']]) },
      { who: 'm', text: 'ถูกต้อง คันละ 1,500 บาท ถ้าแบ่งจ่ายเท่า ๆ กัน 30 คน คนละเท่าไร?' },
      { q: 'choice', prompt: `ให้ ${M('y')} แทนเงินที่แต่ละคนจ่าย สมการใดถูกต้อง?`, choices: ['30y = 4650', 'y + 30 = 4650', 'frac(y,30) = 4650'], answer: 0,
        explain: `30 คน คนละ ${M('y')} บาท รวมกันต้องเท่ากับ 4,650 จึงได้ ${M('30y = 4650')}` },
      { q: 'input', prompt: `แก้สมการ ${M('30y = 4650')}`, label: 'y =', answer: 155, explain: steps([['y = 4650 ÷ 30', 'หารด้วย 30 ทั้งสองข้าง'], ['y = 155']]) },
      { who: 'f', text: 'คนละ 155 บาทเอง ไม่แพงเลย!' },
    ],
  },
  {
    id: 'trees', title: 'แข่งกันปลูกต้นไม้', unit: 3,
    cast: { p: ['ภูผา', 'ภ', '#FFE3D1', '#A24400'], y: ['ใบเตย', 'บ', '#E8F8E0', '#2B7A1A'] },
    steps: [
      { who: 'p', text: 'ห้อง ก มีต้นกล้า 20 ต้น และจะปลูกเพิ่มวันละ 5 ต้น' },
      { who: 'y', text: 'ห้อง ข มีอยู่แล้ว 44 ต้น ปลูกเพิ่มวันละ 2 ต้น อีกกี่วันสองห้องจะมีเท่ากัน?' },
      { q: 'choice', prompt: `ให้ ${M('x')} แทนจำนวนวัน สมการใดถูกต้อง?`, choices: ['5x + 20 = 2x + 44', '5x + 44 = 2x + 20', '20x + 5 = 44x + 2'], answer: 0,
        explain: `ห้อง ก มี ${M('5x + 20')} ต้น ห้อง ข มี ${M('2x + 44')} ต้น ต้องเท่ากัน` },
      { q: 'input', prompt: `แก้สมการ ${M('5x + 20 = 2x + 44')}`, answer: 8, explain: steps([['3x + 20 = 44', 'ลบ 2x ทั้งสองข้าง'], ['3x = 24', 'ลบ 20 ทั้งสองข้าง'], ['x = 8', 'หารด้วย 3']]) },
      { who: 'p', text: 'อีก 8 วัน! วันนั้นแต่ละห้องมีกี่ต้นนะ?' },
      { q: 'input', prompt: `คำนวณ ${M('5 * 8 + 20')}`, label: 'คำตอบ =', answer: 60, explain: steps([['5 * 8 = 40'], ['40 + 20 = 60']]) },
      { who: 'y', text: 'ห้องละ 60 ต้น รวมกัน 120 ต้นเลย!' },
    ],
  },
];

export const CONTENT_HASH = '44bdd2554a8d2e8c';
export { G, UNITS, NODES, PRACTICE, QUESTS, STORIES, TIMED_GENS, makeQuestion, makeTimedQuestion, subSeed, uniq, gradeAnswer };
