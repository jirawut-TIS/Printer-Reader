/**
 * POST /api/extract  — HP Printer Usage Report extractor
 * Claude returns {page, serial, ...} so frontend can sort by page reliably
 * แม้ batch=2 ก็ sort ถูกต้องเพราะ Claude ส่ง page number กลับมา
 */
export const runtime     = "edge";
export const maxDuration = 30;

const CLAUDE_API = "https://api.anthropic.com/v1/messages";
const MODEL      = "claude-opus-4-6";

const SYSTEM = `You extract data from HP Printer Usage Report pages (English or Thai).

For each image labeled "Page N:", return one JSON object with field "page": N.

══════════════════════════════════════
FIELD EXTRACTION RULES
══════════════════════════════════════

[page] Use the integer N from the "Page N:" label above each image.

[serial] Product Serial Number
  English: "Product Serial Number:" | Thai: "หมายเลขผลิตภัณฑ์ของเครื่องพิมพ์:"
  Copy EXACTLY character by character — 10 uppercase chars. Do not correct anything.

[model] Product Name
  English: "Product Name:" | Thai: "ชื่อเครื่อง:"

[printA4] A4 count — PRINT section ONLY, never Copy/สำเนา
  Row: "A4" or "A4 (210x297 mm)" or "A4 (210x297 มม.)"
  Value: rightmost Total/รวม column. Return 0 if no A4 row.

[printA5] A5 count — PRINT section ONLY, never Copy/สำเนา
  Row: contains "A5" or "148x210"
  WARNING: "Legal (8.5x14)" is NOT A5. "Letter" is NOT A5.
  Return 0 if no A5 row.

[grandTotal] Grand Total decimal
  English: "Equivalent Impressions (Letter/A4)" section → "Grand Total" row
  Thai:    "การพิมพ์เทียบเท่า (Letter/A4)" section → "ยอดรวม" row
  Return exact decimal e.g. 60519.5. NEVER use Scan Counts values.

══════════════════════════════════════
OUTPUT — pure JSON array, no markdown:
══════════════════════════════════════
[
  {"page":1,"serial":"PHCBG29182","model":"HP LaserJet M406","printA4":10291,"printA5":0,"grandTotal":10291.0},
  {"page":2,"serial":"CNBRS650HQ","model":"HP LaserJet MFP M430","printA4":15965,"printA5":0,"grandTotal":20231.0}
]

Non-usage page: {"page":N,"serial":null}`;

/* ── OCR serial correction ───────────────────────────────────────── */
const DIGIT_FIX = { O:"0", I:"1", L:"1", B:"8", G:"6", S:"5", Z:"2", D:"0" };

function correctSerial(raw) {
  const s = String(raw).toUpperCase().replace(/[^A-Z0-9]/g,"");
  if (s.length !== 10) return s;

  // PHCBG series (M406): prefix=PHCBG, chars 6-10 all digits
  if (s.slice(0,4) === "PHCB") {
    // char[4] should be G — OCR often returns '6','5','C' instead
    const c5 = s[4];
    const suf = (c5==="G"||c5==="6"||c5==="5"||c5==="C") ? s.slice(5) : s.slice(4);
    return "PHCBG" + suf.slice(0,5).split("").map(c=>DIGIT_FIX[c]??c).join("");
  }

  // CNBRS series (M430): prefix=CNBRS, char6 may be 'C' (CNBRSC subtype)
  if (s.slice(0,4) === "CNBR") {
    // char[4] should be S — OCR returns '5','C','8' sometimes
    const c5 = s[4];
    const inner = (c5==="S"||c5==="5"||c5==="C"||c5==="8") ? s.slice(5) : s.slice(4);

    if (inner[0] === "C") {
      // CNBRSC type: C + 3 digits + 2 as-printed
      const digits = inner.slice(1,4).split("").map(c=>DIGIT_FIX[c]??c).join("");
      return "CNBRSC" + digits + inner.slice(4);
    } else {
      // CNBRS type: 3 digits + 2 as-printed
      const digits = inner.slice(0,3).split("").map(c=>DIGIT_FIX[c]??c).join("");
      return "CNBRS" + digits + inner.slice(3);
    }
  }

  return s;
}

/* ── Handler ─────────────────────────────────────────────────────── */
export async function POST(req) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Response.json({ error:"ANTHROPIC_API_KEY not set" }, { status:500 });

  let body;
  try { body = await req.json(); }
  catch { return Response.json({ error:"Invalid JSON" }, { status:400 }); }

  const { images, pageNums } = body;
  if (!Array.isArray(images)||!images.length)
    return Response.json({ error:"images[] required" }, { status:400 });

  // Build multi-image content with labeled page numbers
  const content = [];
  images.forEach((b64,i) => {
    content.push({ type:"text", text:`Page ${pageNums?.[i]??i+1}:` });
    content.push({ type:"image", source:{ type:"base64", media_type:"image/jpeg", data:b64 } });
  });
  content.push({ type:"text", text:`Return JSON array with ${images.length} element(s), one per page.` });

  const resp = await fetch(CLAUDE_API, {
    method:"POST",
    headers:{ "Content-Type":"application/json","x-api-key":apiKey,"anthropic-version":"2023-06-01" },
    body: JSON.stringify({ model:MODEL, max_tokens:1024, system:SYSTEM, messages:[{role:"user",content}] }),
  });

  if (!resp.ok) {
    if (resp.status===429||resp.status===529)
      return new Response(JSON.stringify({error:"rate_limit"}),{status:429,headers:{"Content-Type":"application/json"}});
    return Response.json({ results: pageNums.map(p=>({page:p,serial:null})) });
  }

  const data = await resp.json();
  const text = (data.content?.[0]?.text??"[]").replace(/```json|```/g,"").trim();

  let parsed;
  try { parsed = JSON.parse(text); }
  catch { return Response.json({ results: pageNums.map(p=>({page:p,serial:null})) }); }

  const arr = Array.isArray(parsed) ? parsed : pageNums.map(p=>({page:p,serial:null}));

  const results = arr.map((r,i)=>{
    const pg = r?.page ?? pageNums?.[i] ?? i+1;
    if (!r?.serial) return { page:pg, serial:null };
    const gt = Math.floor(parseFloat(String(r.grandTotal??"0").replace(/,/g,"")));
    return {
      page:       pg,
      serial:     correctSerial(String(r.serial).trim()),
      model:      String(r.model??"HP LaserJet").trim(),
      printA4:    Math.round(Number(r.printA4??0)),
      printA5:    Math.round(Number(r.printA5??0)),
      grandTotal: isNaN(gt)?0:gt,
    };
  });

  return Response.json({ results });
}
