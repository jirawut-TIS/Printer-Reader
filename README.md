# 🖨️ Printer Usage Reader v2.2

อ่านข้อมูลจาก HP Printer Report PDF และ Export Excel  
รองรับ PDF 200+ หน้า · ใช้งานบนมือถือได้ · **ฟรีทั้งหมด**

---

## ✨ Features

- 📄 อ่าน HP Printer Usage Report PDF (ภาษาไทย + English)
- ⚡ Pipeline Parallel Processing — render + AI พร้อมกัน
- 📍 กรอกสถานที่และวันที่ → ใส่ใน Excel อัตโนมัติ
- 📊 Export Excel พร้อม header สถานที่/วันที่
- 🔒 PDF ประมวลผลในเบราว์เซอร์ — ไม่ upload ขึ้น server

---

## 🚀 Deploy ฟรี: Vercel + GitHub

### Step 1 — สร้าง GitHub repo

```bash
git init
git add .
git commit -m "Printer Reader v2.2"
git remote add origin https://github.com/YOUR_USERNAME/printer-reader.git
git branch -M main
git push -u origin main
```

### Step 2 — Deploy บน Vercel (ฟรี)

1. ไปที่ [vercel.com](https://vercel.com) → สมัครด้วย GitHub
2. กด **Add New → Project** → เลือก repo `printer-reader` → กด **Deploy**

### Step 3 — ใส่ API Key

1. Vercel Dashboard → Project → **Settings → Environment Variables**
2. เพิ่ม:
   ```
   Name:  ANTHROPIC_API_KEY
   Value: sk-ant-xxxxxxxxxx
   ```
3. **Deployments → ⋯ → Redeploy**

---

## 💻 Run บนเครื่อง (Dev)

```bash
npm install
cp .env.example .env.local
# แก้ .env.local ใส่ ANTHROPIC_API_KEY
npm run dev
# เปิด http://localhost:3000
```

---

## ⚙️ ปรับ Performance

แก้ใน `app/page.jsx` บรรทัดบนสุด:

```js
const PAGES_PER_BATCH = 4;  // หน้าต่อ 1 API call (ลดเป็น 2 ถ้า timeout)
const PARALLEL_CALLS  = 6;  // API calls พร้อมกัน
```

---

## 📊 Performance

| PDF ขนาด | เวลาโดยประมาณ |
|----------|--------------|
| 10 หน้า  | ~6–8 วินาที  |
| 50 หน้า  | ~30 วินาที   |
| 100 หน้า | ~1 นาที      |
| 200 หน้า | ~2 นาที      |

*Pipeline: render group N+1 ขณะที่ AI process group N พร้อมกัน*

---

## 💰 ค่าใช้จ่าย

| บริการ | Plan | ราคา |
|--------|------|------|
| Vercel | Hobby (Free) | ฟรี |
| GitHub | Free | ฟรี |
| Anthropic API | Pay-as-you-go | ~$0.003/หน้า ≈ ฿0.10/หน้า |
