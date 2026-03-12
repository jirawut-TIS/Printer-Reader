/**
 * POST /api/extract
 * รับ base64 JPEG image (1 หน้า) → Claude Vision → JSON
 */
export const runtime     = "edge";
export const maxDuration = 30;

const CLAUDE_API = "https://api.anthropic.com/v1/messages";
const MODEL      = "claude-opus-4-6";

const SYSTEM = `You are a precise data extractor for HP Printer Usage Report pages.
Each image is one scanned page. Extract exactly these 5 fields:

1. serial — Product Serial Number
From "Device Information" -> "Product Serial Number:" line. Read EXACTLY what is printed.
OCR rules for HP serials (always 10 uppercase chars):
  CNBRS serials: chars 1-5=letters(CNBRS), chars 6-8=DIGITS(fix G->6,B->8,O->0,I->1), chars 9-10=as-printed
  PHCBG serials: chars 1-5=letters(PHCBG), chars 6-10=all DIGITS(fix G->6,B->8,O->0,I->1)
  Examples: CNBRS650GY CNBRS651F8 CNBRS650MB CNBRS6509F PHCBG29182 PHCBG31125

2. model — Product Name from Device Information. Example: HP LaserJet M406, HP LaserJet MFP M430

3. printA4 — INTEGER. From PRINT table only (inside "Impressions" section).
  Find row "A4" or "A4 (210x297 mm)". Return rightmost Total column number. No math.
  DO NOT use Copy table. No A4 row -> return 0.

4. printA5 — INTEGER. From PRINT table only (inside "Impressions" section).
  Find row containing "A5" or "148x210". Return rightmost Total column number. No math.
  WARNING: "Legal (8.5x14)" is NOT A5. "Letter (8.5x11)" is NOT A5.
  DO NOT use Copy table. No A5 row -> return 0.

5. grandTotal — FLOAT. From "Equivalent Impressions (Letter/A4)" section ONLY.
  Read "Grand Total" row value EXACTLY as printed. Keep all decimals.
  60519.5 stays 60519.5, NOT 60520. 143225.5 stays 143225.5, NOT 143226.
  NEVER use Scan Counts sections.

Return ONLY valid JSON array, no markdown:
[{"serial":"...","model":"...","printA4":0,"printA5":0,"grandTotal":0.0}]
Non-Usage page (blank/cover) -> return [null]`;

const OCR_FIX  = { O:"0",I:"1",L:"1",B:"8",G:"6",S:"5",Z:"2" };
const toDigit  = (c) => OCR_FIX[c] ?? c;
function correctSerial(raw) {
  const s = String(raw).toUpperCase().replace(/[^A-Z0-9]/g,"");
  if (s.length !== 10) return s;
  const pre = s.slice(0,5), suf = s.slice(5);
  if (/^PHC[A-Z]{2}$/.test(pre)) return pre + suf.split("").map(toDigit).join("");
  if (/^CNB[A-Z]{2}$/.test(pre)) return pre + suf.slice(0,3).split("").map(toDigit).join("") + suf.slice(3);
  return s;
}

export async function POST(req) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Response.json({ error:"ANTHROPIC_API_KEY not set" }, { status:500 });

  let body;
  try { body = await req.json(); }
  catch { return Response.json({ error:"Invalid JSON" }, { status:400 }); }

  const { images, pageNums } = body;
  if (!Array.isArray(images) || !images.length)
    return Response.json({ error:"images[] required" }, { status:400 });

  const content = [];
  images.forEach((b64,i) => {
    content.push({ type:"text", text:`Page ${pageNums?.[i] ?? i+1}:` });
    content.push({ type:"image", source:{ type:"base64", media_type:"image/jpeg", data:b64 } });
  });
  content.push({ type:"text", text:`Extract from ${images.length} page(s). Return JSON array with exactly ${images.length} element(s).` });

  const claudeRes = await fetch(CLAUDE_API, {
    method:"POST",
    headers:{ "Content-Type":"application/json","x-api-key":apiKey,"anthropic-version":"2023-06-01" },
    body: JSON.stringify({ model:MODEL, max_tokens:1024, system:SYSTEM, messages:[{ role:"user", content }] }),
  });

  if (!claudeRes.ok) {
    if (claudeRes.status===429 || claudeRes.status===529)
      return new Response(JSON.stringify({error:"rate_limit"}), { status:429, headers:{"Content-Type":"application/json"} });
    return Response.json({ results:images.map(()=>null) });
  }

  const data = await claudeRes.json();
  const raw  = data.content?.[0]?.text ?? "[]";

  let parsed;
  try { parsed = JSON.parse(raw.replace(/```json|```/g,"").trim()); }
  catch { return Response.json({ results:images.map(()=>null) }); }

  const arr = Array.isArray(parsed) ? parsed : images.map(()=>null);
  while (arr.length < images.length) arr.push(null);

  const results = arr.slice(0,images.length).map((r) => {
    if (!r || !r.serial) return null;
    const gt = Math.floor(parseFloat(String(r.grandTotal??"0").replace(/,/g,"")));
    return {
      serial:     correctSerial(String(r.serial).trim()),
      model:      String(r.model??"HP LaserJet").trim(),
      printA4:    Math.round(Number(r.printA4??0)),
      printA5:    Math.round(Number(r.printA5??0)),
      grandTotal: isNaN(gt) ? 0 : gt,
    };
  });

  return Response.json({ results });
}
