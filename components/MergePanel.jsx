"use client";
/**
 * MergePanel — อ่าน PDF แล้ว Merge เข้า Excel ที่เปิดอยู่
 * - รับเฉพาะ PDF (ลบ Excel upload ออก)
 * - อ่านทุกหน้า แบบ BATCH=1 + retry ครบ 8 รอบ = แม่นยำสูงสุด
 */
import { useState, useRef, useCallback } from "react";
import * as XLSX from "xlsx";

const WORKERS   = 4;   // parallel workers
const BATCH     = 1;   // 1 หน้า/call → แม่นสุด
const MAX_RETRY = 8;   // retry สูงสุดต่อ batch
const SCALE     = 1.8;
const QUALITY   = 0.80;

// ── Build output Excel from PDF results ──────────────────────────
function buildExcel(rows, filename) {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Detail
  const detail = [
    ["#", "Serial Number", "รุ่นเครื่องพิมพ์", "A4 Print", "A5 Print", "Grand Total (A4)"],
    ...rows.map((r, i) => [
      i + 1,
      r.serial || "",
      r.model  || "",
      r.printA4    ?? 0,
      r.printA5    ?? 0,
      r.grandTotal ?? 0,
    ]),
    [],
    ["รวม", "", "",
      rows.reduce((s, r) => s + (r.printA4    ?? 0), 0),
      rows.reduce((s, r) => s + (r.printA5    ?? 0), 0),
      rows.reduce((s, r) => s + (r.grandTotal ?? 0), 0),
    ],
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(detail);
  ws1["!cols"] = [{ wch: 4 }, { wch: 14 }, { wch: 24 }, { wch: 12 }, { wch: 12 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, ws1, "Printer Data");

  // Sheet 2: Summary
  const totalA4    = rows.reduce((s, r) => s + (r.printA4    ?? 0), 0);
  const totalA5    = rows.reduce((s, r) => s + (r.printA5    ?? 0), 0);
  const totalGrand = rows.reduce((s, r) => s + (r.grandTotal ?? 0), 0);
  const summary = XLSX.utils.aoa_to_sheet([
    ["สรุป"],
    ["เครื่องทั้งหมด",   rows.length],
    ["A4 Print รวม",     totalA4],
    ["A5 Print รวม",     totalA5],
    ["Grand Total รวม",  totalGrand],
    ["วันที่", new Date().toLocaleString("th-TH")],
  ]);
  XLSX.utils.book_append_sheet(wb, summary, "Summary");

  XLSX.writeFile(wb, filename);
}

export default function MergePanel() {
  const [pdfFile,  setPdfFile]  = useState(null);
  const [status,   setStatus]   = useState("idle");
  const [pct,      setPct]      = useState(0);
  const [msg,      setMsg]      = useState("");
  const [rows,     setRows]     = useState([]);
  const [errMsg,   setErrMsg]   = useState("");
  const [warnMsg,  setWarnMsg]  = useState("");
  const [liveCount,setLiveCount]= useState(0);
  const [reportName, setReportName] = useState("");

  const pdfRef    = useRef(null);
  const abortRef  = useRef(false);
  const rlUntil   = useRef(0);
  const cache     = useRef({});

  // ── Render page to base64 ──────────────────────────────────────
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

  // ── Call API with aggressive retry ────────────────────────────
  const callBatch = useCallback(async (images, pageNums) => {
    for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
      if (abortRef.current) return pageNums.map(p => ({ page: p, serial: null }));
      const now = Date.now();
      if (now < rlUntil.current)
        await new Promise(r => setTimeout(r, rlUntil.current - now + 500));
      if (attempt > 0)
        await new Promise(r => setTimeout(r, Math.min(800 * Math.pow(1.8, attempt - 1), 20000)));
      try {
        const res = await fetch("/api/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ images, pageNums }),
        });
        if (res.status === 429 || res.status === 529) {
          rlUntil.current = Date.now() + 20000;
          continue;
        }
        if (!res.ok) continue;
        const data = await res.json();
        const results = data.results ?? pageNums.map(p => ({ page: p, serial: null }));
        // If got serial → success; if null → retry unless last attempt
        const hasSerial = results.some(r => r?.serial);
        if (hasSerial || attempt === MAX_RETRY - 1) return results;
        // null result on non-last attempt → retry silently
      } catch (_) {}
    }
    return pageNums.map(p => ({ page: p, serial: null }));
  }, []);

  // ── Main process ───────────────────────────────────────────────
  async function handleProcess() {
    if (!pdfFile) return;
    setStatus("loading"); setPct(0); setRows([]); setErrMsg(""); setWarnMsg("");
    setLiveCount(0); abortRef.current = false; rlUntil.current = 0; cache.current = {};

    try {
      // Load PDF.js
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
      setMsg(`📄 PDF: ${total} หน้า — เริ่มอ่าน...`);

      // Pre-render ทุกหน้าพร้อมกัน
      setMsg(`🖼 กำลัง render ${total} หน้า...`);
      await Promise.all(
        Array.from({ length: total }, (_, i) => toBase64(pdfDoc, i + 1))
      );
      setPct(10);
      setMsg(`✅ Render ครบ ${total} หน้า — ส่ง AI อ่าน...`);

      // ── Pass 1: parallel workers ──────────────────────────────
      const queue     = Array.from({ length: total }, (_, i) => i + 1);
      const collected = [];
      const nullPages = new Set();
      let   processed = 0;

      const worker = async (wid) => {
        while (queue.length > 0 && !abortRef.current) {
          const batch = [];
          while (batch.length < BATCH && queue.length > 0) batch.push(queue.shift());
          if (!batch.length) break;
          try {
            const images  = [await toBase64(pdfDoc, batch[0])];
            const results = await callBatch(images, batch);
            results.forEach(r => {
              if (r?.serial) {
                collected.push(r);
                setLiveCount(c => c + 1);
              } else {
                nullPages.add(batch[0]);
              }
            });
          } catch (_) { batch.forEach(p => nullPages.add(p)); }
          processed++;
          // 10-90% = pass1
          setPct(10 + Math.round((processed / total) * 80));
          setMsg(`⚡ W${wid}: ${processed}/${total} — พบ ${collected.length} เครื่อง`);
        }
      };

      await Promise.all(Array.from({ length: WORKERS }, (_, i) => worker(i + 1)));

      // ── Pass 2: retry null pages one-by-one ──────────────────
      const foundPages = new Set(collected.map(r => r.page));
      const retryList  = [...nullPages].filter(p => !foundPages.has(p)).sort((a, b) => a - b);

      if (retryList.length > 0 && !abortRef.current) {
        setMsg(`🔄 Retry ${retryList.length} หน้า (pass 2)...`);
        let ri = 0;
        for (const p of retryList) {
          if (abortRef.current) break;
          try {
            const images  = [await toBase64(pdfDoc, p)];
            const results = await callBatch(images, [p]);
            results.forEach(r => {
              if (r?.serial && !foundPages.has(r.page)) {
                collected.push(r);
                foundPages.add(r.page);
              }
            });
          } catch (_) {}
          ri++;
          setPct(90 + Math.round((ri / retryList.length) * 8));
        }
      }

      // ── Dedupe by serial ──────────────────────────────────────
      collected.sort((a, b) => (a.page || 0) - (b.page || 0));
      const map = new Map();
      collected.forEach(r => {
        if (!r.serial) return;
        if (map.has(r.serial)) {
          const e = map.get(r.serial);
          e.printA4    = (e.printA4    ?? 0) + (r.printA4    ?? 0);
          e.printA5    = (e.printA5    ?? 0) + (r.printA5    ?? 0);
          e.grandTotal = (e.grandTotal ?? 0) + (r.grandTotal ?? 0);
        } else {
          map.set(r.serial, {
            ...r,
            printA4:    r.printA4    ?? 0,
            printA5:    r.printA5    ?? 0,
            grandTotal: r.grandTotal ?? 0,
          });
        }
      });
      const finalRows = [...map.values()];

      // ── Check coverage ────────────────────────────────────────
      const coveredPages  = new Set(collected.map(r => r.page));
      const missedPages   = Array.from({ length: total }, (_, i) => i + 1)
        .filter(p => !coveredPages.has(p));

      setPct(100);
      setRows(finalRows);
      setStatus("done");
      setMsg(`✅ เสร็จ — ${total} หน้า → ${finalRows.length} เครื่องพิมพ์`);
      if (missedPages.length > 0)
        setWarnMsg(`⚠️ หน้าที่ไม่มีข้อมูลปริ้นเตอร์ (${missedPages.length} หน้า): ${missedPages.slice(0, 20).join(", ")}${missedPages.length > 20 ? "..." : ""}`);

    } catch (err) {
      setErrMsg("เกิดข้อผิดพลาด: " + err.message);
      setStatus("error");
    }
  }

  function handleExport() {
    if (!rows.length) return;
    const base = pdfFile?.name.replace(/\.pdf$/i, "") || "printer_report";
    const name = reportName || base;
    buildExcel(rows, `${name}_${new Date().toISOString().slice(0,10)}.xlsx`);
  }

  const fmt = n => typeof n === "number" ? Math.floor(n).toLocaleString("en-US") : "—";

  const dropStyle = (has) => ({
    border: `2px dashed ${has ? "#38bdf8" : "#30363d"}`,
    background: has ? "rgba(56,189,248,.04)" : "#161b22",
    borderRadius: 10, padding: "28px 20px", textAlign: "center",
    cursor: "pointer", transition: "all .2s",
  });

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "8px 0 64px", fontFamily: "'Sarabun',sans-serif", color: "#e6edf3" }}>

      {/* Title */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#e6edf3" }}>📄 อ่าน PDF → Export Excel</div>
        <div style={{ fontSize: 13, color: "#8b949e", marginTop: 4 }}>อ่านครบทุกหน้า · retry อัตโนมัติ · แม่นยำสูงสุด</div>
      </div>

      {/* PDF drop zone */}
      <div onClick={() => pdfRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type === "application/pdf") setPdfFile(f); }}
        style={dropStyle(!!pdfFile)}>
        <input ref={pdfRef} type="file" accept=".pdf" style={{ display: "none" }}
          onChange={e => { const f = e.target.files[0]; if (f) setPdfFile(f); }} />
        <div style={{ fontSize: 36, marginBottom: 10 }}>📄</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: pdfFile ? "#38bdf8" : "#e6edf3" }}>
          {pdfFile ? pdfFile.name : "วางไฟล์ PDF ที่นี่ หรือคลิกเพื่อเลือก"}
        </div>
        <div style={{ fontSize: 12, color: "#8b949e", marginTop: 5 }}>
          {pdfFile ? `${(pdfFile.size / 1024 / 1024).toFixed(1)} MB` : "HP Printer Usage Report · ภาษาไทย + English"}
        </div>
      </div>

      {/* Report name */}
      <div style={{ marginTop: 14, marginBottom: 14 }}>
        <label style={{ fontSize: 12, color: "#8b949e", display: "block", marginBottom: 5 }}>📝 ชื่อไฟล์ผลลัพธ์ (ไม่บังคับ)</label>
        <input type="text" value={reportName} onChange={e => setReportName(e.target.value)}
          placeholder="เช่น KRH_มีนาคม_2569"
          style={{ width: "100%", padding: "10px 14px", borderRadius: 8, fontSize: 14, background: "#161b22", border: "1px solid #30363d", color: "#e6edf3", outline: "none", fontFamily: "'Sarabun',sans-serif", boxSizing: "border-box" }}
        />
      </div>

      {/* Buttons */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
        <button onClick={handleProcess} disabled={!pdfFile || status === "loading"}
          style={{ padding: "13px 0", border: "none", borderRadius: 9, fontSize: 14, fontWeight: 700,
            cursor: (!pdfFile || status === "loading") ? "not-allowed" : "pointer",
            background: (!pdfFile || status === "loading") ? "#1e293b" : "#38bdf8",
            color: (!pdfFile || status === "loading") ? "#4b5563" : "#0d1117",
            fontFamily: "'Sarabun',sans-serif" }}>
          {status === "loading" ? "⏳ กำลังอ่าน..." : "🔍 อ่านข้อมูล"}
        </button>
        <button onClick={handleExport} disabled={status !== "done" || !rows.length}
          style={{ padding: "13px 0", border: "none", borderRadius: 9, fontSize: 14, fontWeight: 700,
            cursor: (status !== "done" || !rows.length) ? "not-allowed" : "pointer",
            background: (status !== "done" || !rows.length) ? "#1e293b" : "#166534",
            color: (status !== "done" || !rows.length) ? "#4b5563" : "#fff",
            fontFamily: "'Sarabun',sans-serif" }}>
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
            <div style={{ height: "100%", width: `${pct}%`, background: "linear-gradient(90deg,#38bdf8,#6366f1)", borderRadius: 4, transition: "width .3s" }} />
          </div>
          <div style={{ fontSize: 11, color: "#4b5563", marginTop: 4, fontFamily: "monospace" }}>
            พบ {liveCount} เครื่องแล้ว
          </div>
        </div>
      )}

      {/* Messages */}
      {errMsg  && <div style={{ padding: "11px 16px", borderRadius: 8, fontSize: 13, background: "rgba(248,81,73,.1)", border: "1px solid #f85149", color: "#fca5a5", marginBottom: 14 }}>❌ {errMsg}</div>}
      {status === "done" && <div style={{ padding: "11px 16px", borderRadius: 8, fontSize: 13, background: "rgba(63,185,80,.1)", border: "1px solid #3fb950", color: "#7ee787", marginBottom: 14 }}>✅ {msg}</div>}
      {warnMsg && <div style={{ padding: "11px 16px", borderRadius: 8, fontSize: 13, background: "rgba(234,179,8,.1)", border: "1px solid #eab308", color: "#fde047", marginBottom: 14 }}>{warnMsg}</div>}

      {/* Stats */}
      {rows.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 20 }}>
          {[
            { label: "เครื่องทั้งหมด", val: rows.length,                                                          color: "#38bdf8" },
            { label: "A4 Print รวม",   val: fmt(rows.reduce((s,r) => s+(r.printA4    ??0),0)),                     color: "#60a5fa" },
            { label: "A5 Print รวม",   val: rows.reduce((s,r)=>s+(r.printA5??0),0).toLocaleString("en-US"),        color: "#fbbf24" },
            { label: "Grand Total รวม",val: fmt(rows.reduce((s,r) => s+(r.grandTotal ??0),0)),                     color: "#7dd3fc" },
          ].map(s => (
            <div key={s.label} style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 10, padding: "12px 14px", textAlign: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: s.color, fontFamily: "monospace" }}>{s.val}</div>
              <div style={{ fontSize: 11, color: "#8b949e", marginTop: 3 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      {rows.length > 0 && (
        <div style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "10px 18px", borderBottom: "1px solid #30363d", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>ผลการอ่านข้อมูล</span>
            <span style={{ fontSize: 11, background: "#0d1117", border: "1px solid #30363d", borderRadius: 20, padding: "3px 10px", color: "#8b949e", fontFamily: "monospace" }}>{rows.length} เครื่อง</span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead style={{ background: "#0d1117" }}>
                <tr>
                  {["#","หน้า PDF","Serial Number","Model","A4 Print","A5 Print","Grand Total"].map((h,i) => (
                    <th key={h} style={{ padding: "9px 12px", textAlign: i > 3 ? "right" : "left", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".5px", color: "#8b949e", borderBottom: "1px solid #30363d", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.serial + i} style={{ borderBottom: "1px solid #1c2128" }}>
                    <td style={{ padding: "8px 12px", color: "#8b949e", fontFamily: "monospace" }}>{i+1}</td>
                    <td style={{ padding: "8px 12px", color: "#4b5563", fontFamily: "monospace" }}>{r.page||"?"}</td>
                    <td style={{ padding: "8px 12px", color: "#7dd3fc", fontWeight: 600, fontFamily: "monospace" }}>{r.serial}</td>
                    <td style={{ padding: "8px 12px", color: "#8b949e" }}>{r.model}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right", color: (r.printA4??0)>0?"#60a5fa":"#4b5563", fontFamily: "monospace", fontWeight: (r.printA4??0)>0?700:400 }}>{fmt(r.printA4)}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right", color: (r.printA5??0)>0?"#fbbf24":"#4b5563", fontFamily: "monospace", fontWeight: (r.printA5??0)>0?700:400 }}>{(r.printA5??0).toLocaleString("en-US")}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right", color: "#e6edf3", fontFamily: "monospace", fontWeight: 700 }}>{fmt(r.grandTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
