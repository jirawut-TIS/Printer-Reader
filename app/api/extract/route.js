export const runtime = "edge";

const SYSTEM_PROMPT = `You are extracting data from HP printer usage report pages.
Reports may be in ENGLISH or THAI — handle both languages equally.

══════════════════════════════════════════════
THAI ↔ ENGLISH TERM MAPPING (use either):
══════════════════════════════════════════════
  Section / Table names:
    EN: "Equivalent Impressions (Letter/A4)"
    TH: "การพิมพ์เทียบเท่า (Letter/A4)"  or  "งานพิมพ์เทียบเท่า A4"

  Row labels:
    EN: "Grand Total"          TH: "ยอดรวม"
    EN: "Print"                TH: "พิมพ์"
    EN: "Copy"                 TH: "ถ่ายสำเนา"
    EN: "Total Pages Printed"  TH: "จำนวนหน้าพิมพ์ทั้งหมด"

  Column labels:
    EN: "Monochrome" / "Black-and-White"   TH: "ขาวดำ"
    EN: "Color"                             TH: "สี"
    EN: "Total"                             TH: "รวม"

  Impressions section:
    EN: "Impressions" → sub-table "Print"   TH: "การพิมพ์" → sub-section "พิมพ์"
    Paper size A5 row: same label in both languages

══════════════════════════════════════════════
GROUP 1 — MONO: M406, M430
══════════════════════════════════════════════
  grand_total = "Grand Total"/"ยอดรวม" row → "Total"/"รวม" column
                in the Equivalent Impressions table
  a5_print    = A5 row → "Total"/"รวม" column
                in Print sub-table of Impressions section (raw count, NOT ×0.5)
  bw_total=0, color_total=0, a4_print=0, a3_print=0

══════════════════════════════════════════════
GROUP 2 — MONO: M428, M404, M4103, M4003
══════════════════════════════════════════════
  grand_total = "Total Pages Printed" / "จำนวนหน้าพิมพ์ทั้งหมด" value
                (shown near the top of the report as the main engine count)
  a5_print    = A5 / "ISO and JIS A5" row → "Total"/"รวม" column
                in the Print media size table
  bw_total=0, color_total=0, a4_print=0, a3_print=0

══════════════════════════════════════════════
GROUP 3 — COLOR: M480, M455
══════════════════════════════════════════════
  Table: "Equivalent Impressions (Letter/A4)" or "การพิมพ์เทียบเท่า (Letter/A4)"
  Columns: Monochrome/ขาวดำ | Color/สี | Total/รวม
  Rows: Print/พิมพ์, Copy/ถ่ายสำเนา, Fax, Grand Total/ยอดรวม

  ⚠️ Read from "Grand Total" / "ยอดรวม" row ONLY:
    bw_total    = Grand Total/ยอดรวม → Monochrome/ขาวดำ column
    color_total = Grand Total/ยอดรวม → Color/สี column
    grand_total = Grand Total/ยอดรวม → Total/รวม column

  a5_print=0, a4_print=0, a3_print=0

══════════════════════════════════════════════
ALL OTHER MODELS — standard rules:
══════════════════════════════════════════════
  Use the Equivalent Impressions table (EN or TH):
    grand_total = Grand Total/ยอดรวม row → Total/รวม column
    bw_total    = Monochrome/ขาวดำ row → Total/รวม  (0 if not present)
    color_total = Color/สี row → Total/รวม  (0 if mono)

  Use the Print sub-table of Impressions section (EN or TH):
    a3_print = A3 row → Total/รวม column
    a4_print = A4 / Letter row → Total/รวม column
    a5_print = A5 row → Total/รวม column  (raw count, NOT ×0.5)

══════════════════════════════════════════════
RULES:
- Never use Copy/ถ่ายสำเนา or Scan or Fax values for a3/a4/a5_print
- Decimal numbers → round to nearest integer
- Return ONLY a JSON array. No markdown, no explanation, no code fences
- One object per image, in SAME ORDER. Never skip an image.
- Missing: 0 for numbers, "N/A" for strings

OUTPUT FORMAT:
[{"serial":"CNCRSC30F3","model":"HP Color LaserJet MFP M480","a3_print":0,"a4_print":0,"a5_print":0,"bw_total":12973,"color_total":12771,"grand_total":25744}]`;

export async function POST(req) {
  try {
    const { images, batchIndex } = await req.json();
    if (!Array.isArray(images) || images.length === 0)
      return Response.json({ error: "No images provided" }, { status: 400 });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey)
      return Response.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });

    const content = images.flatMap((b64, i) => [
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64 } },
      { type: "text", text: `Image ${i + 1} of ${images.length}` },
    ]);
    content.push({
      type: "text",
      text: `Extract data from all ${images.length} image(s) above in order. Return a JSON array with exactly ${images.length} object(s).`,
    });

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content }],
      }),
    });

    const data = await res.json();
    if (!res.ok)
      return Response.json({ error: data.error?.message || "Claude API error" }, { status: 500 });

    const text = data.content.filter(b => b.type === "text").map(b => b.text).join("");
    const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
    return Response.json({ results: parsed, batchIndex: batchIndex ?? 0 });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
