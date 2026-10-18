// สร้าง supabase/functions/_shared/content.mjs จาก js/data.js ให้ Edge Function ใช้ตัวสร้างโจทย์ชุดเดียวกับแอป
// รัน: node tools/build-shared.mjs   (ทุกครั้งที่แก้ js/data.js แล้ว deploy ฟังก์ชันใหม่)
// ตรวจว่าไฟล์ยังตรงกัน: node tools/build-shared.mjs --check
//
// content_prev.mjs = เนื้อหารุ่นที่ commit ล่าสุด (รุ่นที่ใช้งานอยู่) เมื่อรุ่นใหม่ต่างจากรุ่นนั้น
// เซิร์ฟเวอร์ลองตรวจกับรุ่นปัจจุบันก่อน ถ้าไม่ผ่านจึงลองกับรุ่นก่อนหน้า
// ผู้ใช้ที่ยังเปิดแอปรุ่นเก่าค้างไว้ระหว่างอัปเดตจึงไม่เสีย XP ลีก
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'js/data.js'), 'utf8');
const hash = createHash('sha256').update(src).digest('hex').slice(0, 16);
const EXPORTS = ['G', 'UNITS', 'NODES', 'PRACTICE', 'QUESTS', 'STORIES', 'TIMED_GENS', 'makeQuestion', 'makeTimedQuestion', 'subSeed', 'uniq', 'gradeAnswer'];
const out = `// สร้างอัตโนมัติจาก js/data.js ด้วย tools/build-shared.mjs ห้ามแก้ไฟล์นี้โดยตรง
// source sha256: ${hash}
${src}
export const CONTENT_HASH = '${hash}';
export { ${EXPORTS.join(', ')} };
`;
const target = join(root, 'supabase/functions/_shared/content.mjs');
const prevTarget = join(root, 'supabase/functions/_shared/content_prev.mjs');
if (process.argv.includes('--check')) {
  let cur = '';
  try { cur = readFileSync(target, 'utf8'); } catch { /* ไม่มีไฟล์ */ }
  if (cur !== out) { console.error('content.mjs ไม่ตรงกับ js/data.js: รัน node tools/build-shared.mjs'); process.exit(1); }
  if (!existsSync(prevTarget)) { console.error('ไม่มี content_prev.mjs: รัน node tools/build-shared.mjs'); process.exit(1); }
  console.log('content.mjs ตรงกับ js/data.js แล้ว');
} else {
  writeFileSync(target, out);
  console.log(`เขียน ${target} (sha256 ${hash})`);
  let head = null;
  try { head = execSync('git show HEAD:supabase/functions/_shared/content.mjs', { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { /* ยังไม่เคย commit */ }
  if (head && head !== out) {
    writeFileSync(prevTarget, head);
    console.log(`เขียน ${prevTarget} (รุ่นที่ commit ล่าสุด)`);
  } else if (!existsSync(prevTarget)) writeFileSync(prevTarget, out); // ยังไม่มีรุ่นก่อนหน้า: ใช้รุ่นเดียวกัน
}
