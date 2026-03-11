/**
 * POST /api/extract
 * รับ base64 JPEG images (1–4 หน้า) → ส่ง Claude Vision → คืน JSON
 *
 * Body  : { images: string[], pageNums: number[] }
 * Return: { results: Array<{serial, model, printA5, grandTotal} | null> }
 *
 * กฎการอ่าน A5 ที่ถูกต้อง:
 *   - อ่านจาก PRINT section เท่านั้น (ไม่รวม Copy)
 *   - ใช้ค่าจาก Total column โดยตรง (ไม่ × Units 0.5)
 *   - Grand Total อ่านจาก Equivalent Impressions section
 */

export const runtime    = "edge";
export const maxDuration = 25;        // Vercel Hobby = 25s

const CLAUDE_API = "https://api.anthropic.com/v1/messages";
const MODEL      = "claude-opus-4-6";

/* ─── System Prompt ────────────────────────────────────────────────────────── */
const SYSTEM = `You are a precise data extractor for HP Printer Usage Report pages.
Each image is one scanned "Usage Page" from an HP printer.

Extract these 4 fields per page:

════════════════════════════════
1. serial — Product Serial Number
════════════════════════════════
Read from the "Device Information" section, line "Product Serial Number:".

⚠️ CRITICAL OCR RULES — common scan errors on HP serials:
  • Digit "6" vs Letter "G" — HP serials use DIGIT "6", NEVER letter "G" inside the number portion.
    ✅ CNBRS650GY  (digit 6, digit 5, digit 0, then letters GY at the END)
    ❌ CNBRSG50GY  (wrong — G is not a digit here)
    Rule: if you see what looks like "G" followed by digits, it is almost certainly digit "6".
  • Digit "8" vs Letter "B" — HP serials use DIGIT "8", NEVER letter "B" mid-serial.
    ✅ CNBRS651F8   ❌ CNBRS651FB
    ✅ CNBRS6509F   ❌ CNBRS650BF
  • Digit "0" vs Letter "O" — read carefully from context.
  • Digit "1" vs Letter "I" — read carefully from context.
  Known serial patterns (10 chars, all uppercase):
    PHCBG29182, PHCBG31125, PHCBG29972, PHCBG28280
    CNBRS650GY, CNBRS651F8, CNBRS650K6, CNBRS6509F, CNBRS650MB, CNBRS650HQ

════════════════════════════════
2. model — Product Name
════════════════════════════════
Examples: HP LaserJet M406, HP LaserJet MFP M430

════════════════════════════════
3. printA5 — A5 count from PRINT table only
════════════════════════════════
  • Look ONLY at the table under heading "Print" inside "Impressions" section.
  • Find the row whose Paper Size column contains "A5" or "148x210".
  • ⚠️ "Legal (8.5x14)" is NOT A5. "Letter (8.5x11)" is NOT A5. Only rows with "A5" or "148x210".
  • Return the number in the rightmost "Total" column of the A5 row. DO NOT multiply or divide.
  • DO NOT include A5 from the "Copy" table.
  • If no A5 row exists in Print → return 0.
  Examples:
    Print row: "A5 (148x210mm) | 0.5 | 20,318"  → printA5 = 20318
    Print row: "A5 (148x210 mm) | 0.5 | 8,307"  → printA5 = 8307
    Print row: "Legal (8.5x14) | 1.3 | 146"      → printA5 = 0 (Legal is NOT A5)
    No A5 row in Print table                      → printA5 = 0

════════════════════════════════
4. grandTotal — from Equivalent Impressions section
════════════════════════════════
  • Read ONLY from the section titled "Equivalent Impressions (Letter/A4)".
  • That section has rows: Print, Copy, Fax, Grand Total.
  • Read the "Grand Total" row value EXACTLY as printed — keep all decimals.
  • ⚠️ DO NOT round. DO NOT truncate. DO NOT add .0 if not printed.
    If printed as "60,519.5"  → grandTotal = 60519.5  (NOT 60520)
    If printed as "143,225.5" → grandTotal = 143225.5 (NOT 143226)
    If printed as "14,173.5"  → grandTotal = 14173.5  (NOT 14174)
    If printed as "20,231.1"  → grandTotal = 20231.1  (NOT 20231 or 20232)
    If printed as "71,142.0"  → grandTotal = 71142.0
    If printed as "10,291.0"  → grandTotal = 10291.0
  • DO NOT use values from "Scan Counts by Size", "Scan Counts by Destination",
    or individual paper-size rows (Legal 146, A4 15965 etc.) as Grand Total.
  • The Grand Total is always the LARGEST summary number in the Equivalent Impressions table.

════════════════════════════════
Output format
════════════════════════════════
Return ONLY a valid JSON array, no markdown, no explanation:
[
  {"serial":"...","model":"...","printA5":0,"grandTotal":0.0},
  ...
]
Array length MUST equal the number of images sent.
Non-Usage pages → null:
[null, {"serial":"...","model":"...","printA5":0,"grandTotal":0.0}]`;

/* ─── Edge handler ─────────────────────────────────────────────────────────── */
export async function POST(req) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });
  }

  let body;
  try { body = await req.json(); }
  catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const { images, pageNums } = body;
  if (!Array.isArray(images) || !images.length) {
    return Response.json({ error: "images[] required" }, { status: 400 });
  }

  /* Build message content — one text label + one image per page */
  const content = [];
  images.forEach((b64, i) => {
    content.push({ type: "text", text: `Page ${pageNums?.[i] ?? i + 1}:` });
    content.push({
      type:   "image",
      source: { type: "base64", media_type: "image/jpeg", data: b64 },
    });
  });
  content.push({
    type: "text",
    text: `Extract data from all ${images.length} page(s) above. Return a JSON array with exactly ${images.length} element(s).`,
  });

  /* Call Claude */
  const claudeRes = await fetch(CLAUDE_API, {
    method:  "POST",
    headers: {
      "Content-Type":      "application/json",
      "x-api-key":         apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model:      MODEL,
      max_tokens: 1024,
      system:     SYSTEM,
      messages:   [{ role: "user", content }],
    }),
  });

  if (!claudeRes.ok) {
    console.error("Claude error:", await claudeRes.text());
    return Response.json({ results: images.map(() => null) });
  }

  const data = await claudeRes.json();
  const raw  = data.content?.[0]?.text ?? "[]";

  /* Parse JSON — strip markdown fences if present */
  let parsed;
  try {
    parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch {
    console.error("JSON parse failed:", raw);
    return Response.json({ results: images.map(() => null) });
  }

  /* Normalise & validate */
  const arr = Array.isArray(parsed) ? parsed : images.map(() => null);
  while (arr.length < images.length) arr.push(null);

  const results = arr.slice(0, images.length).map((r) => {
    if (!r || !r.serial) return null;

    const rawGT = String(r.grandTotal ?? "0").replace(/,/g, "");
    const gt    = Math.floor(parseFloat(rawGT));  // ตัดทศนิยมออก ไม่ปัดขึ้น

    return {
      serial:     String(r.serial).trim().toUpperCase(),
      model:      String(r.model  ?? "HP LaserJet").trim(),
      printA5:    Math.round(Number(r.printA5 ?? 0)),
      grandTotal: gt,
    };
  });

  return Response.json({ results });
}
