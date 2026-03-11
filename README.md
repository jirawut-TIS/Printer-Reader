# 🖨️ Printer Usage Reader

อ่านข้อมูลจาก HP Printer Report PDF และ Export Excel  
รองรับ PDF 200+ หน้า · ใช้งานบนมือถือได้ · **ฟรีทั้งหมด**

---

## ✨ วิธีทำงาน

```
PDF (ผู้ใช้เลือก)
  │
  ▼  PDF.js — แปลงเป็นรูป JPEG ในเบราว์เซอร์ (ไม่ upload ไฟล์ขึ้น server)
รูปภาพทีละหน้า
  │
  ▼  Parallel Batches — ส่ง 4 หน้า × 4 threads พร้อมกัน = 16 หน้า/รอบ
/api/extract (Next.js Edge Function — 25s timeout)
  │
  ▼  Claude AI
JSON: serial, a5_impressions, grand_total, model
  │
  ▼  ตาราง + Export Excel
```

---

## 🚀 Deploy ฟรี: Vercel + GitHub

### Step 1 — สร้าง GitHub repo

1. ไปที่ [github.com](https://github.com) → **New repository**
2. ตั้งชื่อ `printer-reader` → กด **Create repository**
3. รันคำสั่งนี้ในโฟลเดอร์โปรเจกต์:

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/printer-reader.git
git branch -M main
git push -u origin main
```

### Step 2 — Deploy บน Vercel (ฟรี)

1. ไปที่ [vercel.com](https://vercel.com) → สมัครด้วย GitHub
2. กด **Add New → Project**
3. เลือก repo `printer-reader` → กด **Deploy**
4. รอ ~1 นาที → ได้ URL เช่น `https://printer-reader-xxx.vercel.app`

### Step 3 — ใส่ API Key

1. Vercel Dashboard → Project → **Settings → Environment Variables**
2. กด **Add**:
   ```
   Name:  ANTHROPIC_API_KEY
   Value: sk-ant-xxxxxxxxxx   ← key จาก console.anthropic.com
   ```
3. กด **Save** แล้วไปที่ **Deployments → ⋯ → Redeploy**

✅ เสร็จแล้ว! เปิด URL แล้วใช้งานได้เลย

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

## 📊 Performance (Free tier)

| PDF ขนาด | เวลาโดยประมาณ |
|----------|--------------|
| 10 หน้า  | ~15 วินาที   |
| 50 หน้า  | ~1 นาที      |
| 100 หน้า | ~2 นาที      |
| 200 หน้า | ~4 นาที      |

*4 parallel threads × 4 หน้า/call = 16 หน้าพร้อมกัน*

---

## 💰 ค่าใช้จ่าย

| บริการ | Plan | ราคา |
|--------|------|------|
| Vercel | Hobby (Free) | ฟรี |
| GitHub | Free | ฟรี |
| Anthropic API | Pay-as-you-go | ~$0.003/หน้า ≈ ฿0.10/หน้า |

**PDF 200 หน้า ≈ $0.60 (~฿22) ต่อครั้ง**

---

## ⚠️ ข้อจำกัด Free Tier

- **Vercel Edge Function timeout: 25 วินาที** — แต่ละ batch (4 หน้า) ต้องเสร็จใน 25s
- ถ้า timeout บ่อย → ลด `PAGES_PER_BATCH` จาก 4 → 2 ใน `app/page.jsx`
- **iOS Safari + PDF ใหญ่** อาจ crash เพราะ RAM น้อย → ใช้ Chrome แทน
