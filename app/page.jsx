"use client";
import { useState, useRef, useCallback } from "react";
import * as XLSX from "xlsx";

/* ─────────────────────────────────────────────
   CONFIG  —  ปรับได้ถ้า Vercel timeout บ่อย
   PAGES_PER_BATCH : หน้าต่อ 1 API call  (แนะนำ 4)
   PARALLEL_CALLS  : calls พร้อมกัน       (แนะนำ 4)
───────────────────────────────────────────── */
const PAGES_PER_BATCH = 4;
const PARALLEL_CALLS  = 6;   // เพิ่มจาก 4 → 6

/* ─── Styles (inline — no Tailwind needed) ── */
const S = {
  page:      { fontFamily:"'Sarabun',sans-serif", background:"#0d1117", minHeight:"100vh", color:"#e6edf3" },
  header:    { background:"#161b22", borderBottom:"1px solid #30363d", padding:"14px 24px", display:"flex", alignItems:"center", gap:12 },
  hIcon:     { width:38, height:38, background:"linear-gradient(135deg,#38bdf8,#6366f1)", borderRadius:9, display:"flex", alignItems:"center", justifyContent:"center", fontSize:19, flexShrink:0 },
  hTitle:    { fontSize:17, fontWeight:700 },
  hSub:      { fontSize:12, color:"#8b949e", marginTop:2 },
  hBadge:    { marginLeft:"auto", background:"#1e293b", border:"1px solid #38bdf8", color:"#38bdf8", fontSize:11, padding:"4px 12px", borderRadius:20, fontFamily:"monospace", whiteSpace:"nowrap" },
  wrap:      { maxWidth:920, margin:"0 auto", padding:"28px 18px 64px" },
  dropBase:  { borderRadius:12, padding:"38px 20px", textAlign:"center", cursor:"pointer", transition:"all .2s" },
  btnRow:    { display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginTop:14 },
  btn:       (active,color) => ({
    padding:"13px 0", border:"none", borderRadius:9, fontSize:14, fontWeight:700,
    cursor: active ? "pointer" : "not-allowed",
    background: active ? color : "#1e293b",
    color: active ? (color==="#38bdf8" ? "#0d1117" : "#fff") : "#4b5563",
    transition:"all .15s",
  }),
  progWrap:  { marginTop:20 },
  progLabel: { display:"flex", justifyContent:"space-between", fontSize:12, color:"#8b949e", marginBottom:6 },
  progBg:    { height:6, background:"#1e293b", borderRadius:3, overflow:"hidden" },
  progFill:  (pct) => ({ height:"100%", width:`${pct}%`, background:"linear-gradient(90deg,#38bdf8,#6366f1)", borderRadius:3, transition:"width .3s" }),
  progMsg:   { fontSize:11, color:"#4b5563", marginTop:5, fontFamily:"monospace" },
  alert:     (type) => ({
    marginTop:14, padding:"11px 16px", borderRadius:8, fontSize:13, display:"flex", gap:8, alignItems:"flex-start", lineHeight:1.6,
    background: type==="ok" ? "rgba(63,185,80,.1)" : type==="err" ? "rgba(248,81,73,.1)" : "rgba(56,189,248,.1)",
    border: `1px solid ${type==="ok" ? "#3fb950" : type==="err" ? "#f85149" : "#38bdf8"}`,
    color: type==="ok" ? "#7ee787" : type==="err" ? "#fca5a5" : "#7dd3fc",
  }),
  stats:     { display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginTop:20 },
  statCard:  { background:"#161b22", border:"1px solid #30363d", borderRadius:10, padding:"14px 18px", textAlign:"center" },
  statVal:   { fontSize:26, fontWeight:800, color:"#38bdf8", fontFamily:"monospace", letterSpacing:-1 },
  statLbl:   { fontSize:11, color:"#8b949e", marginTop:4 },
  tableWrap: { marginTop:20, background:"#161b22", border:"1px solid #30363d", borderRadius:12, overflow:"hidden" },
  tableHead: { padding:"12px 18px", borderBottom:"1px solid #30363d", display:"flex", alignItems:"center", justifyContent:"space-between" },
  tBadge:    { fontSize:11, background:"#0d1117", border:"1px solid #30363d", borderRadius:20, padding:"3px 10px", color:"#8b949e", fontFamily:"monospace" },
  th:        (right) => ({ padding:"9px 14px", textAlign:right?"right":"left", fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:".5px", color:"#8b949e", whiteSpace:"nowrap", borderBottom:"1px solid #30363d" }),
  td:        (right,color) => ({ padding:"10px 14px", textAlign:right?"right":"left", color: color||"#e6edf3", fontFamily:"monospace", fontSize:13 }),
  tfootRow:  { background:"#0d1117", borderTop:"1px solid #30363d" },
  footer:    { marginTop:32, textAlign:"center", fontSize:11, color:"#30363d" },
};

/* ─── Number formatters ── */
const fmt = (n) =>
  typeof n === "number"
    ? n.toLocaleString("en-US", { minimumFractionDigits:0, maximumFractionDigits:1 })
    : "—";

// Grand Total แสดงเป็นจำนวนเต็ม ไม่ปัดขึ้น
const fmtGT = (n) =>
  typeof n === "number"
    ? Math.floor(n).toLocaleString("en-US")
    : "—";

/* ════════════════════════════════════════════
   MAIN COMPONENT
════════════════════════════════════════════ */
export default function Home() {
  const [file,      setFile]      = useState(null);
  const [status,    setStatus]    = useState("idle");   // idle|loading|done|error
  const [pct,       setPct]       = useState(0);
  const [msg,       setMsg]       = useState("");
  const [rows,      setRows]      = useState([]);
  const [errMsg,    setErrMsg]    = useState("");
  // ── สถานที่และวันที่ ──
  const [location,  setLocation]  = useState("");
  const [reportDate, setReportDate] = useState(() => new Date().toISOString().slice(0, 10));
  const inputRef = useRef(null);

  /* ── File handler ── */
  const pickFile = (f) => {
    if (!f || f.type !== "application/pdf") return;
    setFile(f); setRows([]); setStatus("idle"); setErrMsg("");
  };

  /* ── Convert 1 PDF page → base64 JPEG (cropped to top 55%) ── */
  const toBase64 = useCallback(async (pdfDoc, pageNum) => {
    const page   = await pdfDoc.getPage(pageNum);
    const vp     = page.getViewport({ scale: 1.8 });

    // Render full page ก่อน
    const full        = document.createElement("canvas");
    full.width        = vp.width;
    full.height       = vp.height;
    await page.render({ canvasContext: full.getContext("2d"), viewport: vp }).promise;

    // Crop เฉพาะส่วนบน 55% — ครอบคลุม Device Info + Impressions + Equivalent Impressions
    // ตัด Scan Counts by Size / Destination ด้านล่างออก (ไม่ใช้)
    const cropH  = Math.floor(vp.height * 0.55);
    const out    = document.createElement("canvas");
    out.width    = vp.width;
    out.height   = cropH;
    out.getContext("2d").drawImage(full, 0, 0, vp.width, cropH, 0, 0, vp.width, cropH);

    return out.toDataURL("image/jpeg", 0.75).split(",")[1];
  }, []);

  /* ── Call /api/extract with a batch of images ── */
  const callAPI = useCallback(async (images, pageNums) => {
    const res = await fetch("/api/extract", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ images, pageNums }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }, []);

  /* ── MAIN: Read PDF ── */
  const handleRead = async () => {
    if (!file) return;
    setStatus("loading"); setPct(0); setRows([]); setErrMsg("");

    try {
      /* Load PDF.js from CDN — ไม่ต้อง install npm package จึงไม่มี canvas error */
      if (!window.pdfjsLib) {
        await new Promise((resolve, reject) => {
          const s = document.createElement("script");
          s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
          s.onload = resolve; s.onerror = reject;
          document.head.appendChild(s);
        });
      }
      const pdfjs = window.pdfjsLib;
      pdfjs.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

      const pdfDoc  = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
      const total   = pdfDoc.numPages;
      setMsg(`พบ ${total} หน้า — กำลังเตรียม...`);

      /* Split into batches */
      const allPages = Array.from({ length: total }, (_, i) => i + 1);
      const batches  = [];
      for (let i = 0; i < allPages.length; i += PAGES_PER_BATCH)
        batches.push(allPages.slice(i, i + PAGES_PER_BATCH));

      /* Split batches into groups */
      const groups = [];
      for (let i = 0; i < batches.length; i += PARALLEL_CALLS)
        groups.push(batches.slice(i, i + PARALLEL_CALLS));

      let done = 0;
      const collected = [];

      /* ── PIPELINE: render group[N+1] ขณะที่ API กำลัง process group[N] ── */
      const renderGroup = (group) =>
        Promise.all(
          group.map(async (batch) => ({
            pageNums: batch,
            images:   await Promise.all(batch.map((p) => toBase64(pdfDoc, p))),
          }))
        );

      // pre-render กลุ่มแรกก่อนเลย
      let nextRenderPromise = renderGroup(groups[0]);

      for (let g = 0; g < groups.length; g++) {
        const group = groups[g];
        setMsg(`🖼️ แปลงหน้า ${done + 1}–${Math.min(done + group.flat().length, total)} / ${total}...`);

        // รอ render กลุ่มนี้เสร็จ
        const rendered = await nextRenderPromise;

        // เริ่ม render กลุ่มถัดไปทันที (parallel กับ API call)
        if (g + 1 < groups.length) {
          nextRenderPromise = renderGroup(groups[g + 1]);
        }

        setMsg(`⚡ AI วิเคราะห์ ${rendered.length} กลุ่มพร้อมกัน (หน้า ${done + 1}–${Math.min(done + group.flat().length, total)})...`);

        /* Call API concurrently */
        const responses = await Promise.all(
          rendered.map(({ images, pageNums }) =>
            callAPI(images, pageNums).catch(() => ({ results: pageNums.map(() => null) }))
          )
        );

        responses.forEach((r) => r.results?.forEach((item) => { if (item) collected.push(item); }));
        done += group.flat().length;
        setPct(Math.round((done / total) * 100));
      }

      /* Aggregate by serial number */
      const map = new Map();
      collected.forEach((r) => {
        if (map.has(r.serial)) {
          const e = map.get(r.serial);
          e.printA5    += r.printA5    ?? 0;
          e.grandTotal  = e.grandTotal + (r.grandTotal ?? 0);
        } else {
          map.set(r.serial, {
            ...r,
            printA5:    r.printA5    ?? 0,
            grandTotal: r.grandTotal ?? 0,
          });
        }
      });

      const final = [...map.values()];

      if (!final.length) {
        setErrMsg("ไม่พบข้อมูลเครื่องพิมพ์ กรุณาตรวจสอบว่าเป็น HP Printer Usage Report PDF");
        setStatus("error"); return;
      }

      setRows(final);
      setStatus("done");
      setMsg(`✅ เสร็จสิ้น อ่านได้ ${final.length} เครื่อง จาก ${total} หน้า`);
    } catch (err) {
      console.error(err);
      setErrMsg("เกิดข้อผิดพลาด: " + err.message);
      setStatus("error");
    }
  };

  /* ── Export Excel ── */
  const handleExport = () => {
    if (!rows.length) return;

    // แปลงวันที่เป็น พ.ศ. แบบไทย
    const dateObj = reportDate ? new Date(reportDate) : new Date();
    const thaiDate = `${dateObj.getDate().toString().padStart(2,"0")}/${(dateObj.getMonth()+1).toString().padStart(2,"0")}/${dateObj.getFullYear()+543}`;

    // Header rows
    const header = [
      ["รายงานการใช้งานเครื่องพิมพ์"],
      ["สถานที่", location || "-"],
      ["วันที่", thaiDate],
      [],
      ["#", "Serial", "Model", "Print A5 (หน้าจริง)", "Grand Total (A4)"],
    ];

    const data = rows.map((r, i) => [
      i + 1,
      r.serial,
      r.model,
      r.printA5,
      r.grandTotal,
    ]);
    data.push([
      "รวม", "", "",
      rows.reduce((s, r) => s + r.printA5, 0),
      rows.reduce((s, r) => s + r.grandTotal, 0),
    ]);

    const ws = XLSX.utils.aoa_to_sheet([...header, ...data]);

    // column widths
    ws["!cols"] = [{ wch:5 }, { wch:16 }, { wch:24 }, { wch:20 }, { wch:20 }];

    // merge title cell A1
    ws["!merges"] = [{ s:{ r:0, c:0 }, e:{ r:0, c:4 } }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Printer Usage");
    XLSX.writeFile(wb, `printer-usage-${reportDate || new Date().toISOString().slice(0,10)}.xlsx`);
  };

  /* ── Derived totals ── */
  const totalA5    = rows.reduce((s, r) => s + r.printA5,    0);
  const totalGrand = rows.reduce((s, r) => s + r.grandTotal, 0);

  /* ════════════ RENDER ════════════ */
  return (
    <div style={S.page}>

      {/* ── Header ── */}
      <div style={S.header}>
        <div style={S.hIcon}>🖨️</div>
        <div>
          <div style={S.hTitle}>Printer Usage Reader</div>
          <div style={S.hSub}>อ่านค่าจาก HP Printer Report PDF · รองรับ 200+ หน้า</div>
        </div>
        <div style={S.hBadge}>⚡ Parallel · Claude Vision</div>
      </div>

      <div style={S.wrap}>

        {/* ── Drop zone ── */}
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); pickFile(e.dataTransfer.files[0]); }}
          style={{
            ...S.dropBase,
            border: `2px dashed ${file ? "#38bdf8" : "#30363d"}`,
            background: file ? "rgba(56,189,248,.04)" : "#161b22",
          }}
        >
          <input ref={inputRef} type="file" accept=".pdf" style={{ display:"none" }}
            onChange={(e) => pickFile(e.target.files[0])} />
          <div style={{ fontSize:38 }}>📄</div>
          <div style={{ fontSize:15, fontWeight:700, marginTop:10 }}>
            {file ? file.name : "วางไฟล์ PDF ที่นี่ หรือคลิกเพื่อเลือก"}
          </div>
          <div style={{ fontSize:12, color:"#8b949e", marginTop:5 }}>
            {file
              ? `${(file.size/1024).toFixed(1)} KB · คลิกเพื่อเปลี่ยนไฟล์`
              : "รองรับ HP Printer Usage Report PDF · ไม่มีการอัปโหลดไฟล์ขึ้น server"}
          </div>
        </div>

        {/* ── สถานที่ + วันที่ ── */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginTop:14 }}>
          <div>
            <label style={{ fontSize:12, color:"#8b949e", display:"block", marginBottom:5 }}>📍 สถานที่</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="เช่น สำนักงานใหญ่ กรุงเทพฯ"
              style={{
                width:"100%", padding:"10px 14px", borderRadius:8, fontSize:14,
                background:"#161b22", border:"1px solid #30363d", color:"#e6edf3",
                outline:"none", fontFamily:"'Sarabun',sans-serif",
              }}
            />
          </div>
          <div>
            <label style={{ fontSize:12, color:"#8b949e", display:"block", marginBottom:5 }}>📅 วันที่</label>
            <input
              type="date"
              value={reportDate}
              onChange={(e) => setReportDate(e.target.value)}
              style={{
                width:"100%", padding:"10px 14px", borderRadius:8, fontSize:14,
                background:"#161b22", border:"1px solid #30363d", color:"#e6edf3",
                outline:"none", fontFamily:"'Sarabun',sans-serif", colorScheme:"dark",
              }}
            />
          </div>
        </div>

        {/* ── Buttons ── */}
        <div style={S.btnRow}>
          <button
            onClick={handleRead}
            disabled={!file || status === "loading"}
            style={S.btn(!file || status==="loading" ? false : true, "#38bdf8")}
          >
            {status === "loading" ? "⏳ กำลังอ่าน..." : "🔍 อ่านข้อมูล"}
          </button>
          <button
            onClick={handleExport}
            disabled={!rows.length}
            style={S.btn(rows.length > 0, "#166534")}
          >
            📊 Export Excel
          </button>
        </div>

        {/* ── Progress ── */}
        {status === "loading" && (
          <div style={S.progWrap}>
            <div style={S.progLabel}>
              <span>Parallel {PARALLEL_CALLS}×{PAGES_PER_BATCH} หน้า/รอบ</span>
              <span>{pct}%</span>
            </div>
            <div style={S.progBg}>
              <div style={S.progFill(pct)} />
            </div>
            <div style={S.progMsg}>{msg}</div>
          </div>
        )}

        {/* ── Alerts ── */}
        {status === "error" && (
          <div style={S.alert("err")}>❌ {errMsg}</div>
        )}
        {status === "done" && (
          <div style={S.alert("ok")}>✅ {msg}</div>
        )}

        {/* ── Stats ── */}
        {rows.length > 0 && (
          <div style={S.stats}>
            {[
              { lbl: "เครื่องทั้งหมด",          val: rows.length   },
              { lbl: "Grand Total รวม (A4)",     val: fmtGT(totalGrand) },
              { lbl: "Print A5 รวม (หน้าจริง)", val: fmt(totalA5)    },
            ].map((s) => (
              <div key={s.lbl} style={S.statCard}>
                <div style={S.statVal}>{s.val}</div>
                <div style={S.statLbl}>{s.lbl}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── Table ── */}
        {rows.length > 0 && (
          <div style={S.tableWrap}>
            <div style={S.tableHead}>
              <span style={{ fontSize:14, fontWeight:700 }}>ผลการอ่านข้อมูล</span>
              <span style={S.tBadge}>{rows.length} เครื่อง</span>
            </div>
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <thead style={{ background:"#0d1117" }}>
                  <tr>
                    <th style={S.th(false)}>#</th>
                    <th style={S.th(false)}>Serial</th>
                    <th style={S.th(false)}>Model</th>
                    <th style={S.th(true)}>Print A5 (หน้าจริง)</th>
                    <th style={S.th(true)}>Grand Total (A4)</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.serial} style={{ borderBottom:"1px solid #1c2128" }}>
                      <td style={S.td(false, "#8b949e")}>{i+1}</td>
                      <td style={{ ...S.td(false, "#7dd3fc"), fontWeight:600 }}>{r.serial}</td>
                      <td style={{ ...S.td(false, "#8b949e"), fontFamily:"'Sarabun',sans-serif", fontSize:13 }}>{r.model}</td>
                      <td style={{ ...S.td(true, r.printA5 > 0 ? "#fbbf24" : "#4b5563"), fontWeight: r.printA5>0?700:400 }}>
                        {fmt(r.printA5)}
                      </td>
                      <td style={{ ...S.td(true), fontWeight:700 }}>{fmtGT(r.grandTotal)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={S.tfootRow}>
                    <td colSpan={3} style={{ ...S.td(true, "#8b949e"), fontSize:12 }}>รวม</td>
                    <td style={{ ...S.td(true, "#fbbf24"), fontWeight:800 }}>{fmt(totalA5)}</td>
                    <td style={{ ...S.td(true, "#38bdf8"), fontWeight:800 }}>{fmtGT(totalGrand)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          {/* ── แสดง สถานที่ + วันที่ ใต้ตาราง ── */}
          {(location || reportDate) && (
            <div style={{ padding:"10px 18px", borderTop:"1px solid #30363d", display:"flex", gap:24, fontSize:13, color:"#8b949e" }}>
              {location   && <span>📍 {location}</span>}
              {reportDate && <span>📅 {new Date(reportDate).toLocaleDateString("th-TH",{ year:"numeric", month:"long", day:"numeric" })}</span>}
            </div>
          )}
          </div>
        )}

        <div style={S.footer}>
          Printer Usage Reader v2.1 · ไฟล์ PDF ประมวลผลในเบราว์เซอร์ · ไม่มีการอัปโหลดขึ้น server
        </div>

      </div>
    </div>
  );
}
