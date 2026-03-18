"use client";
import { useState, useRef, useCallback } from "react";
import * as XLSX from "xlsx";

const WORKERS = 4;
const BATCH   = 2;
const SCALE   = 1.5;
const QUALITY = 0.72;

// ── Parse Excel → extract Summary-All rows ────────────────────
function parseExcel(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: "array" });
  const sheetName = wb.SheetNames.find(n => n.toLowerCase().includes("all")) || wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  // Find header row (row with "Serial" or "Serial No")
  let headerIdx = 0;
  for (let i = 0; i < Math.min(10, raw.length); i++) {
    if (raw[i].some(c => c && String(c).toLowerCase().includes("serial"))) {
      headerIdx = i; break;
    }
  }

  const rows = [];
  for (let i = headerIdx + 1; i < raw.length; i++) {
    const r = raw[i];
    const serial = r[2] ? String(r[2]).trim() : null;
    if (!serial || serial.length < 5) continue;
    rows.push({
      rowIdx:   i,          // 0-based index in raw
      seq:      r[0],
      model:    r[1],
      serial:   serial,
      location: r[3],
      floor:    r[4],
      ip:       r[5],
      totalOld: Number(r[6]  || 0),
      a5Old:    Number(r[7]  || 0),
      bwOld:    Number(r[8]  || 0),
      totalNew: Number(r[9]  || 0),  // will be replaced
      a5New:    Number(r[10] || 0),  // will be replaced
      note:     r[13] || null,
    });
  }
  return { wb, sheetName, raw, headerIdx, rows };
}

// ── Build merged Excel ────────────────────────────────────────
function buildMergedExcel(parsedExcel, pdfResults, periodLabel) {
  const { wb, sheetName, raw } = parsedExcel;
  const ws = wb.Sheets[sheetName];

  // PDF results map: serial → { grandTotal, printA5 }
  const pdfMap = {};
  pdfResults.forEach(r => { if (r.serial) pdfMap[r.serial] = r; });

  let matched = 0, unmatched = 0;

  parsedExcel.rows.forEach(row => {
    const excelRow = row.rowIdx + 1; // 1-based for XLSX
    const pdf = pdfMap[row.serial];

    if (pdf) {
      matched++;
      const totalNew = pdf.grandTotal || 0;
      const a5New    = pdf.printA5    || 0;

      // col J (index 9)  = TotalNew
      XLSX.utils.sheet_add_aoa(ws, [[totalNew]], { origin: { r: row.rowIdx, c: 9 } });
      // col K (index 10) = A5new
      XLSX.utils.sheet_add_aoa(ws, [[a5New]],    { origin: { r: row.rowIdx, c: 10 } });
    } else {
      unmatched++;
    }
  });

  return { wb, matched, unmatched, total: parsedExcel.rows.length };
}

export default function MergePanel() {
  const [excelFile, setExcelFile] = useState(null);
  const [pdfFile,   setPdfFile]   = useState(null);
  const [status,    setStatus]    = useState("idle"); // idle | loading | done | error
  const [pct,       setPct]       = useState(0);
  const [msg,       setMsg]       = useState("");
  const [result,    setResult]    = useState(null);  // { matched, unmatched, total, wb }
  const [errMsg,    setErrMsg]    = useState("");
  const [periodLabel, setPeriodLabel] = useState("");

  const excelRef = useRef(null);
  const pdfRef   = useRef(null);
  const abortRef = useRef(false);
  const rlUntil  = useRef(0);
  const cache    = useRef({});

  const toBase64 = useCallback(async (pdfDoc, pageNum) => {
    if (cache.current[pageNum]) return cache.current[pageNum];
    const page = await pdfDoc.getPage(pageNum);
    const vp   = page.getViewport({ scale: SCALE });
    const cv   = document.createElement("canvas");
    cv.width = vp.width; cv.height = vp.height;
    await page.render({ canvasContext: cv.getContext("2d"), viewport: vp }).promise;
    const b64 = cv.toDataURL("image/jpeg", QUALITY).split(",")[1];
    cache.current[pageNum] = b64;
    return b64;
  }, []);

  const callBatch = useCallback(async (images, pageNums) => {
    for (let attempt = 0; attempt < 6; attempt++) {
      if (abortRef.current) return pageNums.map(p => ({ page: p, serial: null }));
      const now = Date.now();
      if (now < rlUntil.current) await new Promise(r => setTimeout(r, rlUntil.current - now + 300));
      if (attempt > 0) await new Promise(r => setTimeout(r, Math.min(1500 * Math.pow(2, attempt - 1), 20000)));
      try {
        const res = await fetch("/api/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ images, pageNums }),
        });
        if (res.status === 429) { rlUntil.current = Date.now() + 15000; continue; }
        if (!res.ok) continue;
        const data = await res.json();
        return data.results ?? pageNums.map(p => ({ page: p, serial: null }));
      } catch (_) {}
    }
    return pageNums.map(p => ({ page: p, serial: null }));
  }, []);

  async function handleProcess() {
    if (!excelFile || !pdfFile) return;
    setStatus("loading"); setPct(0); setMsg(""); setErrMsg(""); setResult(null);
    abortRef.current = false; rlUntil.current = 0; cache.current = {};

    try {
      // 1. Parse Excel
      setMsg("📊 กำลังอ่านไฟล์ Excel...");
      const excelBuf = await excelFile.arrayBuffer();
      const parsed   = parseExcel(new Uint8Array(excelBuf));
      setMsg(`📊 Excel: พบ ${parsed.rows.length} เครื่องพิมพ์`);

      // 2. Load PDF.js
      if (!window.pdfjsLib) {
        await new Promise((resolve, reject) => {
          const s = document.createElement("script");
          s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
          s.onload = resolve; s.onerror = reject;
          document.head.appendChild(s);
        });
      }
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

      const pdfDoc = await window.pdfjsLib.getDocument({ data: await pdfFile.arrayBuffer() }).promise;
      const total  = pdfDoc.numPages;
      setMsg(`📄 PDF: ${total} หน้า — กำลังส่ง AI อ่านข้อมูล...`);

      // 3. Process PDF (parallel workers)
      const queue     = Array.from({ length: total }, (_, i) => i + 1);
      const collected = [];
      let   processed = 0;

      const worker = async (wid) => {
        while (queue.length > 0 && !abortRef.current) {
          const batch = [];
          while (batch.length < BATCH && queue.length > 0) batch.push(queue.shift());
          if (!batch.length) break;
          try {
            const images  = await Promise.all(batch.map(p => toBase64(pdfDoc, p)));
            const results = await callBatch(images, batch);
            results.forEach(r => { if (r?.serial) collected.push(r); });
          } catch (_) {}
          processed += batch.length;
          setPct(Math.round((processed / total) * 100));
          setMsg(`⚡ W${wid}: ${batch[batch.length - 1]}/${total} — อ่านได้ ${collected.length} เครื่อง`);
        }
      };

      await Promise.all(Array.from({ length: WORKERS }, (_, i) => worker(i + 1)));

      // Dedupe PDF results by serial (keep latest)
      const pdfMap = {};
      collected.sort((a, b) => (a.page || 0) - (b.page || 0));
      collected.forEach(r => { pdfMap[r.serial] = r; });
      const pdfResults = Object.values(pdfMap);

      setMsg(`✅ PDF: อ่านได้ ${pdfResults.length} เครื่อง — กำลัง Merge...`);

      // 4. Merge & build Excel
      const { wb, matched, unmatched } = buildMergedExcel(parsed, pdfResults, periodLabel);

      setPct(100);
      setResult({ wb, matched, unmatched, total: parsed.rows.length, pdfFound: pdfResults.length });
      setStatus("done");
      setMsg(`✅ Merge สำเร็จ: Match ${matched}/${parsed.rows.length} เครื่อง`);

    } catch (err) {
      setErrMsg("เกิดข้อผิดพลาด: " + err.message);
      setStatus("error");
    }
  }

  function handleExport() {
    if (!result?.wb) return;
    const baseName = excelFile.name.replace(/\.xlsx?$/i, "");
    const suffix   = periodLabel ? `_${periodLabel}` : `_updated`;
    XLSX.writeFile(result.wb, `${baseName}${suffix}.xlsx`);
  }

  const dropStyle = (hasFile) => ({
    border: `2px dashed ${hasFile ? "#38bdf8" : "#30363d"}`,
    background: hasFile ? "rgba(56,189,248,.04)" : "#161b22",
    borderRadius: 10, padding: "20px 16px", textAlign: "center",
    cursor: "pointer", transition: "all .2s",
  });

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "28px 18px 64px", fontFamily: "'Sarabun',sans-serif", color: "#e6edf3" }}>

      {/* Title */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#e6edf3" }}>🔄 Merge Excel + PDF</div>
        <div style={{ fontSize: 13, color: "#8b949e", marginTop: 4 }}>โยน Excel เดิม + PDF งวดใหม่ → ได้ Excel อัปเดตอัตโนมัติ</div>
      </div>

      {/* Upload area */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>

        {/* Excel */}
        <div onClick={() => excelRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.name.match(/\.xlsx?$/i)) setExcelFile(f); }}
          style={dropStyle(!!excelFile)}>
          <input ref={excelRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }}
            onChange={e => { const f = e.target.files[0]; if (f) setExcelFile(f); }} />
          <div style={{ fontSize: 28, marginBottom: 8 }}>📊</div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{excelFile ? excelFile.name : "Excel เดิม"}</div>
          <div style={{ fontSize: 12, color: "#8b949e", marginTop: 4 }}>
            {excelFile ? `${(excelFile.size / 1024).toFixed(0)} KB` : "ไฟล์ .xlsx ที่มีข้อมูลงวดก่อน"}
          </div>
        </div>

        {/* PDF */}
        <div onClick={() => pdfRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type === "application/pdf") setPdfFile(f); }}
          style={dropStyle(!!pdfFile)}>
          <input ref={pdfRef} type="file" accept=".pdf" style={{ display: "none" }}
            onChange={e => { const f = e.target.files[0]; if (f) setPdfFile(f); }} />
          <div style={{ fontSize: 28, marginBottom: 8 }}>📄</div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{pdfFile ? pdfFile.name : "PDF งวดใหม่"}</div>
          <div style={{ fontSize: 12, color: "#8b949e", marginTop: 4 }}>
            {pdfFile ? `${(pdfFile.size / 1024 / 1024).toFixed(1)} MB` : "HP Printer Usage Report งวดล่าสุด"}
          </div>
        </div>
      </div>

      {/* Period label */}
      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 12, color: "#8b949e", display: "block", marginBottom: 5 }}>📅 งวดที่ / ชื่อไฟล์ผลลัพธ์ (ไม่บังคับ)</label>
        <input type="text" value={periodLabel} onChange={e => setPeriodLabel(e.target.value)}
          placeholder="เช่น งวด14 หรือ มีนาคม_2569"
          style={{ width: "100%", padding: "10px 14px", borderRadius: 8, fontSize: 14, background: "#161b22", border: "1px solid #30363d", color: "#e6edf3", outline: "none", fontFamily: "'Sarabun',sans-serif", boxSizing: "border-box" }}
        />
      </div>

      {/* Buttons */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
        <button onClick={handleProcess} disabled={!excelFile || !pdfFile || status === "loading"}
          style={{ padding: "13px 0", border: "none", borderRadius: 9, fontSize: 14, fontWeight: 700, cursor: (!excelFile || !pdfFile || status === "loading") ? "not-allowed" : "pointer", background: (!excelFile || !pdfFile || status === "loading") ? "#1e293b" : "#38bdf8", color: (!excelFile || !pdfFile || status === "loading") ? "#4b5563" : "#0d1117", fontFamily: "'Sarabun',sans-serif" }}>
          {status === "loading" ? "⏳ กำลังประมวลผล..." : "🔄 ประมวลผล"}
        </button>
        <button onClick={handleExport} disabled={status !== "done"}
          style={{ padding: "13px 0", border: "none", borderRadius: 9, fontSize: 14, fontWeight: 700, cursor: status !== "done" ? "not-allowed" : "pointer", background: status !== "done" ? "#1e293b" : "#166534", color: status !== "done" ? "#4b5563" : "#fff", fontFamily: "'Sarabun',sans-serif" }}>
          📥 Export Excel
        </button>
      </div>

      {/* Progress */}
      {status === "loading" && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#8b949e", marginBottom: 6 }}>
            <span>{msg}</span><span>{pct}%</span>
          </div>
          <div style={{ height: 8, background: "#1e293b", borderRadius: 4, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: "linear-gradient(90deg,#38bdf8,#6366f1)", borderRadius: 4, transition: "width .4s" }} />
          </div>
        </div>
      )}

      {/* Error */}
      {errMsg && (
        <div style={{ padding: "11px 16px", borderRadius: 8, fontSize: 13, background: "rgba(248,81,73,.1)", border: "1px solid #f85149", color: "#fca5a5", marginBottom: 14 }}>❌ {errMsg}</div>
      )}

      {/* Result summary */}
      {status === "done" && result && (
        <>
          <div style={{ padding: "11px 16px", borderRadius: 8, fontSize: 13, background: "rgba(63,185,80,.1)", border: "1px solid #3fb950", color: "#7ee787", marginBottom: 16 }}>
            ✅ {msg}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
            {[
              { label: "เครื่องใน Excel", value: result.total,      color: "#38bdf8" },
              { label: "Match สำเร็จ",   value: result.matched,     color: "#3fb950" },
              { label: "ไม่พบใน PDF",    value: result.unmatched,   color: result.unmatched > 0 ? "#eab308" : "#4b5563" },
            ].map(s => (
              <div key={s.label} style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 10, padding: "14px 18px", textAlign: "center" }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: s.color, fontFamily: "monospace" }}>{s.value}</div>
                <div style={{ fontSize: 11, color: "#8b949e", marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </>
      )}

    </div>
  );
}
