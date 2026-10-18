// สร้าง supabase/functions/_shared/content.mjs จาก js/data.js ให้ Edge Function ใช้ตัวสร้างโจทย์ชุดเดียวกับแอป
// รัน: node tools/build-shared.mjs   (ทุกครั้งที่แก้ js/data.js แล้ว deploy ฟังก์ชันใหม่)
// ตรวจว่าไฟล์ยังตรงกัน: node tools/build-shared.mjs --check
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'js/data.js'), 'utf8');
const hash = createHash('sha256').update(src).digest('hex').slice(0, 16);
const EXPORTS = ['G', 'UNITS', 'NODES', 'PRACTICE', 'QUESTS', 'STORIES', 'TIMED_GENS', 'makeQuestion', 'makeTimedQuestion', 'subSeed', 'uniq'];
const out = `// สร้างอัตโนมัติจาก js/data.js ด้วย tools/build-shared.mjs ห้ามแก้ไฟล์นี้โดยตรง
// source sha256: ${hash}
${src}
export const CONTENT_HASH = '${hash}';
export { ${EXPORTS.join(', ')} };
`;
const target = join(root, 'supabase/functions/_shared/content.mjs');
if (process.argv.includes('--check')) {
  let cur = '';
  try { cur = readFileSync(target, 'utf8'); } catch { /* ไม่มีไฟล์ */ }
  if (cur !== out) { console.error('content.mjs ไม่ตรงกับ js/data.js: รัน node tools/build-shared.mjs'); process.exit(1); }
  console.log('content.mjs ตรงกับ js/data.js แล้ว');
} else {
  writeFileSync(target, out);
  console.log(`เขียน ${target} (sha256 ${hash})`);
}
