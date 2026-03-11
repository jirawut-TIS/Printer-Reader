"use client";
import { useState, useRef, useMemo } from "react";
import * as XLSX from "xlsx";

const PAGES_PER_BATCH = 4;
const CONCURRENCY     = 4;

let pdfjsCache = null;
async function loadPdfJs() {
  if (pdfjsCache) return pdfjsCache;
  await new Promise((res, rej) => {
    if (document.querySelector("[data-pdfjs]")) return res();
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    s.setAttribute("data-pdfjs", "1");
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  pdfjsCache = window.pdfjsLib;
  return pdfjsCache;
}

async function pdfToImages(file, onProgress) {
  const lib = await loadPdfJs();
  const pdf = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
  const images = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    onProgress(`📄 แปลงหน้า ${i} / ${pdf.numPages}`, Math.round((i / pdf.numPages) * 40));
    const page = await pdf.getPage(i);
    const vp   = page.getViewport({ scale: 1.8 });
    const canvas = document.createElement("canvas");
    canvas.width = vp.width; canvas.height = vp.height;
    await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
    images.push(canvas.toDataURL("image/jpeg", 0.82).split(",")[1]);
  }
  return images;
}

function makeBatches(images) {
  const out = [];
  for (let i = 0; i < images.length; i += PAGES_PER_BATCH)
    out.push({ batchIndex: Math.floor(i / PAGES_PER_BATCH), imgs: images.slice(i, i + PAGES_PER_BATCH) });
  return out;
}

async function extractParallel(images, onProgress) {
  const batches = makeBatches(images);
  const results = new Array(batches.length);
  let donePages = 0;
  const queue = [...batches];
  async function worker() {
    while (queue.length > 0) {
      const batch = queue.shift();
      if (!batch) break;
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: batch.imgs, batchIndex: batch.batchIndex }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `Batch ${batch.batchIndex + 1} failed`); }
      const data = await res.json();
      results[data.batchIndex] = data.results;
      donePages += batch.imgs.length;
      onProgress(`🤖 วิเคราะห์ ${donePages} / ${images.length} หน้า`, 40 + Math.round((donePages / images.length) * 58));
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, worker));
  return results.flat();
}

const n   = (v) => Number(v) || 0;
const fmt = (v) => n(v).toLocaleString();
const sum = (rows, key) => rows.reduce((s, r) => s + n(r[key]), 0);

export default function App() {
  const [file, setFile]               = useState(null);
  const [rows, setRows]               = useState([]);
  const [loading, setLoading]         = useState(false);
  const [progressMsg, setProgressMsg] = useState("");
  const [progressPct, setProgressPct] = useState(0);
  const [error, setError]             = useState("");
  const [dragOver, setDragOver]       = useState(false);
  const inputRef = useRef();

  const cols = useMemo(() => ({
    hasA3:    rows.some(r => n(r.a3_print)    > 0),
    hasA4:    rows.some(r => n(r.a4_print)    > 0),
    hasA5:    rows.some(r => n(r.a5_print)    > 0),
    hasColor: rows.some(r => n(r.color_total) > 0),
    hasBW:    rows.some(r => n(r.bw_total)    > 0),
  }), [rows]);

  const handleFile = (f) => {
    if (!f || f.type !== "application/pdf") { setError("กรุณาเลือกไฟล์ PDF เท่านั้น"); return; }
    setFile(f); setRows([]); setError(""); setProgressPct(0); setProgressMsg("");
  };

  const extractData = async () => {
    if (!file) return;
    setLoading(true); setError(""); setRows([]); setProgressPct(0);
    try {
      const images  = await pdfToImages(file, (msg, pct) => { setProgressMsg(msg); setProgressPct(pct); });
      const allRows = await extractParallel(images, (msg, pct) => { setProgressMsg(msg); setProgressPct(pct); });
      setRows(allRows);
      setProgressPct(100);
      setProgressMsg(`✅ เสร็จสิ้น อ่านได้ ${allRows.length} เครื่อง`);
    } catch (e) {
      setError("เกิดข้อผิดพลาด: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const exportExcel = () => {
    if (!rows.length) return;
    const data = rows.map((r, i) => {
      const row = {
        "ลำดับ":            i + 1,
        "Serial Number":   r.serial || "N/A",
        "รุ่นเครื่องพิมพ์": r.model  || "N/A",
      };
      if (cols.hasA3)    row["A3 Print"]    = n(r.a3_print);
      if (cols.hasA4)    row["A4 Print"]    = n(r.a4_print);
      if (cols.hasA5)    row["A5 Print"]    = n(r.a5_print);
      if (cols.hasBW)    row["BW Total"]    = n(r.bw_total);
      if (cols.hasColor) row["Color Total"] = n(r.color_total);
      row["Grand Total"] = n(r.grand_total);
      return row;
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const cw = [{ wch: 7 }, { wch: 18 }, { wch: 28 }];
    if (cols.hasA3)    cw.push({ wch: 11 });
    if (cols.hasA4)    cw.push({ wch: 11 });
    if (cols.hasA5)    cw.push({ wch: 11 });
    if (cols.hasBW)    cw.push({ wch: 13 });
    if (cols.hasColor) cw.push({ wch: 13 });
    cw.push({ wch: 13 });
    ws["!cols"] = cw;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Printer Report");

    const summaryData = [
      { รายการ: "จำนวนเครื่องทั้งหมด", ค่า: rows.length },
      { รายการ: "Grand Total รวม",      ค่า: sum(rows, "grand_total") },
    ];
    if (cols.hasA3)    summaryData.push({ รายการ: "A3 Print รวม",    ค่า: sum(rows, "a3_print") });
    if (cols.hasA4)    summaryData.push({ รายการ: "A4 Print รวม",    ค่า: sum(rows, "a4_print") });
    if (cols.hasA5)    summaryData.push({ รายการ: "A5 Print รวม",    ค่า: sum(rows, "a5_print") });
    if (cols.hasBW)    summaryData.push({ รายการ: "BW Total รวม",    ค่า: sum(rows, "bw_total") });
    if (cols.hasColor) summaryData.push({ รายการ: "Color Total รวม", ค่า: sum(rows, "color_total") });
    summaryData.push({ รายการ: "วันที่ Export", ค่า: new Date().toLocaleString("th-TH") });
    const ws2 = XLSX.utils.json_to_sheet(summaryData);
    ws2["!cols"] = [{ wch: 22 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws2, "Summary");
    XLSX.writeFile(wb, "printer_report.xlsx");
  };

  const tableCols = [
    { key: "idx",         label: "#",            always: true },
    { key: "serial",      label: "Serial",       always: true },
    { key: "model",       label: "Model",        always: true },
    { key: "a3_print",    label: "A3",           show: cols.hasA3 },
    { key: "a4_print",    label: "A4",           show: cols.hasA4 },
    { key: "a5_print",    label: "A5",           show: cols.hasA5 },
    { key: "bw_total",    label: "⬛ BW",         show: cols.hasBW },
    { key: "color_total", label: "🌈 Color",     show: cols.hasColor },
    { key: "grand_total", label: "Grand Total",  always: true },
  ].filter(c => c.always || c.show);

  const showBar = loading || (progressPct > 0 && progressPct < 100);

  const cardItems = [
    { val: rows.length,                  label: "เครื่องทั้งหมด",  always: true },
    { val: fmt(sum(rows,"grand_total")), label: "Grand Total รวม", always: true },
    { val: fmt(sum(rows,"bw_total")),    label: "⬛ BW รวม",        show: cols.hasBW },
    { val: fmt(sum(rows,"color_total")), label: "🌈 Color รวม",    show: cols.hasColor },
    { val: fmt(sum(rows,"a5_print")),    label: "A5 รวม",          show: cols.hasA5 },
    { val: fmt(sum(rows,"a4_print")),    label: "A4 รวม",          show: cols.hasA4 },
    { val: fmt(sum(rows,"a3_print")),    label: "A3 รวม",          show: cols.hasA3 },
  ].filter(c => c.always || c.show);

  return (
    <div style={S.app}>
      <div style={S.header}>
        <span style={{ fontSize: 28 }}>🖨️</span>
        <div>
          <div style={S.title}>Printer Usage Reader</div>
          <div style={S.sub}>HP Mono &amp; Color · รองรับ 200+ หน้า</div>
        </div>
      </div>

      {/* Legend */}
      <div style={S.legend}>
        <div style={S.legendItem}><span style={{ color:"#374151", fontWeight:700 }}>⬛ MONO</span> M406 · M430 → Grand Total + A5</div>
        <div style={S.legendItem}><span style={{ color:"#374151", fontWeight:700 }}>⬛ MONO</span> M428 · M404 · M4103 · M4003 → Total Pages Printed + A5</div>
        <div style={S.legendItem}><span style={{ color:"#b45309", fontWeight:700 }}>🌈 COLOR</span> M480 · M455 → Grand Total + BW + Color</div>
      </div>

      <div
        style={{ ...S.drop, ...(dragOver ? S.dropActive : {}) }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
        onClick={() => inputRef.current?.click()}
      >
        <input ref={inputRef} type="file" accept="application/pdf"
          style={{ display: "none" }} onChange={(e) => handleFile(e.target.files[0])} />
        <div style={{ fontSize: 36 }}>{file ? "📄" : "📁"}</div>
        <div style={S.dropText}>{file ? file.name : "แตะเพื่อเลือกไฟล์ PDF"}</div>
        <div style={S.dropSub}>{file ? `${(file.size / 1024).toFixed(1)} KB` : "รองรับ PDF ทุกขนาด"}</div>
      </div>

      <div style={S.btnRow}>
        <button style={{ ...S.btn, background: "#1E3A5F", opacity: (!file || loading) ? 0.5 : 1 }}
          onClick={extractData} disabled={!file || loading}>
          {loading ? "⏳ กำลังอ่าน..." : "🔍 อ่านข้อมูล"}
        </button>
        <button style={{ ...S.btn, background: "#16a34a", opacity: rows.length === 0 ? 0.5 : 1 }}
          onClick={exportExcel} disabled={rows.length === 0}>
          📊 Export Excel
        </button>
      </div>

      {showBar && (
        <div style={S.progressBox}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 13, color: "#334" }}>{progressMsg}</span>
            <span style={{ fontSize: 12, color: "#555", fontWeight: 600 }}>{progressPct}%</span>
          </div>
          <div style={S.barBg}><div style={{ ...S.bar, width: `${progressPct}%` }} /></div>
        </div>
      )}
      {!loading && progressPct === 100 && <div style={S.doneBanner}>{progressMsg}</div>}
      {error && <div style={S.err}>⚠️ {error}</div>}

      {rows.length > 0 && (
        <>
          <div style={{ ...S.cards, gridTemplateColumns: `repeat(${Math.min(cardItems.length, 4)}, 1fr)` }}>
            {cardItems.map((c, i) => (
              <div key={i} style={S.card}>
                <div style={S.cardVal}>{c.val}</div>
                <div style={S.cardLabel}>{c.label}</div>
              </div>
            ))}
          </div>

          <div style={S.tableWrap}>
            <div style={{ overflowX: "auto" }}>
              <table style={S.table}>
                <thead>
                  <tr>{tableCols.map(c => <th key={c.key} style={S.th}>{c.label}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#f7faff" }}>
                      {tableCols.map(c => {
                        if (c.key === "idx")          return <td key="idx"   style={S.td}>{i + 1}</td>;
                        if (c.key === "serial")        return <td key="sn"    style={{ ...S.td, fontFamily: "monospace", fontSize: 11 }}>{r.serial}</td>;
                        if (c.key === "model")         return <td key="model" style={{ ...S.td, fontSize: 11, color: "#444" }}>{r.model}</td>;
                        if (c.key === "grand_total")   return <td key="gt"    style={{ ...S.td, textAlign: "right", fontWeight: 700, color: "#1E3A5F" }}>{fmt(r.grand_total)}</td>;
                        if (c.key === "color_total")   return <td key="color" style={{ ...S.td, textAlign: "right", color: "#b45309", fontWeight: 600 }}>{fmt(r.color_total)}</td>;
                        if (c.key === "bw_total")      return <td key="bw"    style={{ ...S.td, textAlign: "right", color: "#374151", fontWeight: 600 }}>{fmt(r.bw_total)}</td>;
                        return <td key={c.key} style={{ ...S.td, textAlign: "right" }}>{fmt(r[c.key])}</td>;
                      })}
                    </tr>
                  ))}
                  <tr style={{ background: "#1E3A5F" }}>
                    {tableCols.map((c, ci) => {
                      if (ci === 0) return <td key="lbl" style={S.tdf} colSpan={3}>รวม</td>;
                      if (c.key === "serial" || c.key === "model") return null;
                      const numKeys = ["a3_print","a4_print","a5_print","bw_total","color_total","grand_total"];
                      return <td key={c.key} style={{ ...S.tdf, textAlign: "right" }}>{numKeys.includes(c.key) ? fmt(sum(rows, c.key)) : ""}</td>;
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <div style={{ textAlign: "center", fontSize: 11, color: "#bbb", marginTop: 16, paddingBottom: 8 }}>
        Powered by Claude AI
      </div>
    </div>
  );
}

const S = {
  app:        { minHeight: "100vh", background: "linear-gradient(135deg,#f0f4f8,#e8edf4)", fontFamily: "'Segoe UI',sans-serif", padding: 16, maxWidth: 800, margin: "0 auto", boxSizing: "border-box" },
  header:     { display: "flex", alignItems: "center", gap: 12, marginBottom: 12, padding: "16px 20px", background: "#1E3A5F", borderRadius: 16, color: "#fff", boxShadow: "0 4px 20px rgba(30,58,95,.3)" },
  title:      { fontSize: 18, fontWeight: 700 },
  sub:        { fontSize: 11, opacity: 0.75, marginTop: 2 },
  legend:     { background: "#fff", borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 12, display: "flex", flexDirection: "column", gap: 4, boxShadow: "0 1px 6px rgba(0,0,0,.07)", border: "1px solid #e2e8f0" },
  legendItem: { color: "#555" },
  drop:       { border: "2px dashed #94a8c4", borderRadius: 16, padding: "28px 20px", textAlign: "center", cursor: "pointer", background: "#fff", marginBottom: 14, transition: "all .2s", boxShadow: "0 2px 10px rgba(0,0,0,.06)" },
  dropActive: { borderColor: "#1E3A5F", background: "#eef3f9" },
  dropText:   { fontSize: 15, color: "#1E3A5F", fontWeight: 600, marginTop: 6 },
  dropSub:    { fontSize: 12, color: "#888", marginTop: 4 },
  btnRow:     { display: "flex", gap: 10, marginBottom: 14 },
  btn:        { flex: 1, padding: 14, border: "none", borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: "pointer", color: "#fff", boxShadow: "0 4px 14px rgba(0,0,0,.15)", transition: "opacity .2s" },
  progressBox:{ background: "#fff", borderRadius: 12, padding: "14px 16px", marginBottom: 12, boxShadow: "0 2px 8px rgba(0,0,0,.07)" },
  barBg:      { background: "#e2e8f0", borderRadius: 99, height: 8, overflow: "hidden" },
  bar:        { background: "linear-gradient(90deg,#1E3A5F,#3b82f6)", height: "100%", borderRadius: 99, transition: "width .4s" },
  doneBanner: { padding: "10px 16px", background: "#dcfce7", color: "#15803d", borderRadius: 10, marginBottom: 12, fontSize: 13, fontWeight: 600 },
  err:        { padding: "12px 16px", background: "#fee2e2", color: "#b91c1c", borderRadius: 10, marginBottom: 12, fontSize: 13 },
  cards:      { display: "grid", gap: 8, marginBottom: 14 },
  card:       { background: "#fff", borderRadius: 12, padding: "12px 8px", textAlign: "center", boxShadow: "0 2px 10px rgba(0,0,0,.07)" },
  cardVal:    { fontSize: 16, fontWeight: 800, color: "#1E3A5F", lineHeight: 1.2 },
  cardLabel:  { fontSize: 10, color: "#888", marginTop: 3 },
  tableWrap:  { background: "#fff", borderRadius: 14, boxShadow: "0 2px 10px rgba(0,0,0,.07)", overflow: "hidden", marginBottom: 16 },
  table:      { width: "100%", borderCollapse: "collapse", minWidth: 420 },
  th:         { padding: "10px 8px", background: "#1E3A5F", color: "#fff", fontSize: 11, fontWeight: 700, textAlign: "left", whiteSpace: "nowrap" },
  td:         { padding: "8px 8px", fontSize: 12, color: "#333", borderBottom: "1px solid #f0f0f0" },
  tdf:        { padding: "10px 8px", fontWeight: 700, color: "#fff", fontSize: 12 },
};
