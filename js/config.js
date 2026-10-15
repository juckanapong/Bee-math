/* BeeMath — ตั้งค่าการเชื่อมต่อ Supabase (ระบบบัญชีและซิงก์ ระยะ 2)
   ปล่อยว่างไว้ = แอปทำงานแบบไม่มีบัญชีเหมือนเดิม
   ค่าทั้งสองนี้เปิดเผยได้: publishable/anon key ออกแบบมาให้ใช้ในเบราว์เซอร์ ความปลอดภัยมาจาก Row Level Security ใน supabase/schema.sql
   ห้ามใส่ service_role key หรือรหัสผ่านฐานข้อมูลในไฟล์นี้เด็ดขาด (repository เป็น Public) */
window.BEEMATH_CONFIG = {
  supabaseUrl: 'https://vgzyystxqwtchtianjzw.supabase.co',      // Project Settings › API › Project URL เช่น 'https://abcdefghij.supabase.co'
  supabaseAnonKey: 'sb_publishable_uz0c222MFDIxdCpD1k07QQ_tJPAtYN3',  // Project Settings › API Keys › publishable key (หรือ anon public key แบบเดิม)
};
