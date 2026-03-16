# 🔐 การเพิ่มระบบ Login + Access Log

## ไฟล์ที่เพิ่มเข้ามา

```
lib/
  auth.js                   ← ระบบ auth + log (localStorage)

components/
  LoginPage.jsx             ← หน้า Login
  TopBar.jsx                ← แถบด้านบน (ชื่อผู้ใช้ / Log / ออกจากระบบ)
  AccessLogPanel.jsx        ← Modal แสดง Access Log

app/
  page.jsx                  ← ไฟล์ใหม่ (wrapper)
  PrinterApp.jsx            ← โปรแกรมเดิมของคุณ (เปลี่ยนชื่อ)
```

---

## วิธีติดตั้ง (3 ขั้นตอน)

### ขั้นตอนที่ 1 — เปลี่ยนชื่อ page.jsx เดิม
```bash
# ใน folder app/
mv page.jsx PrinterApp.jsx
```

### ขั้นตอนที่ 2 — แก้ PrinterApp.jsx บรรทัดแรก
เปิด `app/PrinterApp.jsx` แล้วเพิ่ม `"use client";` บรรทัดแรก (ถ้ายังไม่มี)
และเปลี่ยน `export default function Page(` → `export default function PrinterApp(`

```jsx
"use client";
// app/PrinterApp.jsx  (เดิมชื่อ page.jsx)
// ...โค้ดเดิมทั้งหมด...

export default function PrinterApp() {  // ← เปลี่ยนชื่อฟังก์ชัน
  // ...
}
```

### ขั้นตอนที่ 3 — คัดลอกไฟล์ใหม่เข้าโปรเจกต์
วางไฟล์ทั้งหมดตามโครงสร้างด้านบน แล้วรัน:
```bash
npm run dev
```

---

## บัญชีผู้ใช้เริ่มต้น

| username  | password  | บทบาท         |
|-----------|-----------|---------------|
| admin     | admin123  | ผู้ดูแลระบบ   |
| printer1  | op1234    | เจ้าหน้าที่ 1 |
| printer2  | op5678    | เจ้าหน้าที่ 2 |

### เพิ่ม/แก้ไขผู้ใช้
แก้ไขที่ `lib/auth.js` ส่วน `USERS`:

```js
export const USERS = {
  admin:    { name: 'ผู้ดูแลระบบ', role: 'admin',    password: 'admin123' },
  somchai:  { name: 'สมชาย ใจดี',  role: 'operator', password: 'pass001' },
  // เพิ่มได้เลย...
};
```

---

## ฟีเจอร์

### หน้า Login
- ตรวจสอบ username/password
- บันทึก log ทั้งสำเร็จและล้มเหลว
- จำ session ด้วย localStorage (ไม่ต้อง login ใหม่เมื่อรีเฟรช)

### TopBar
- แสดงชื่อผู้ใช้และบทบาท
- ปุ่ม Access Log (เปิด modal)
- ปุ่มออกจากระบบ

### Access Log Modal
- แสดงรายการล็อกทั้งหมดแบบ real-time
- กรองได้: ทั้งหมด / สำเร็จ / ล้มเหลว
- แสดงสถิติ: ทั้งหมด / สำเร็จ / ล้มเหลว
- แอดมินเท่านั้นที่ล้าง log ได้
- เก็บล็อกล่าสุด 200 รายการ

---

## หมายเหตุ

- Log เก็บใน `localStorage` ของเบราว์เซอร์ (เหมาะสำหรับใช้ภายใน)
- ถ้าต้องการเก็บ log บน server ให้ส่งข้อมูลจาก `lib/auth.js` → API route เพิ่มเติม
- รหัสผ่านอยู่ใน client-side code เหมาะสำหรับ internal tool เท่านั้น
  ถ้าต้องการความปลอดภัยสูงขึ้น ควรย้ายการตรวจสอบไปที่ Next.js API route หรือใช้ NextAuth.js
