"use client";
import { useState, useRef, useCallback } from "react";
import * as XLSX from "xlsx";

/* ══════════════════════════════════════════════════════
   CONFIG  — ปรับตามความต้องการ
   WORKERS  : จำนวน API calls พร้อมกัน (3 = ปลอดภัย, 5 = เร็วขึ้น)
   SCALE    : ความละเอียดภาพ (1.5 = เร็ว, 2.0 = ชัดกว่า)
══════════════════════════════════════════════════════ */
const WORKERS = 4;
const SCALE   = 1.6;
const QUALITY = 0.75;

/* ─── Styles ──────────────────────────────────────── */
const S = {
  page:     { fontFamily:"'Sarabun',sans-serif", background:"#0d1117", minHeight:"100vh", color:"#e6edf3" },
  header:   { background:"#161b22", borderBottom:"1px solid #30363d", padding:"14px 24px", display:"flex", alignItems:"center", gap:12 },
  hIcon:    { width:38, height:38, background:"linear-gradient(135deg,#38bdf8,#6366f1)", borderRadius:9, display:"flex", alignItems:"center", justifyContent:"center", fontSize:19, flexShrink:0 },
  hTitle:   { fontSize:17, fontWeight:700 },
  hSub:     { fontSize:12, color:"#8b949e", marginTop:2 },
  hBadge:   { marginLeft:"auto", background:"#1e293b", border:"1px solid #38bdf8", color:"#38bdf8", fontSize:11, padding:"4px 12px", borderRadius:20, fontFamily:"monospace", whiteSpace:"nowrap" },
  wrap:     { maxWidth:960, margin:"0 auto", padding:"28px 18px 64px" },
  dropBase: { borderRadius:12, padding:"38px 20px", textAlign:"center", cursor:"pointer", transition:"all .2s" },
  btnRow:   { display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginTop:14 },
  btn:      (on,col) => ({
    padding:"13px 0", border:"none", borderRadius:9, fontSize:14, fontWeight:700,
    cursor: on?"pointer":"not-allowed",
    background: on ? col : "#1e293b",
    color: on ? (col==="#38bdf8"?"#0d1117":"#fff") : "#4b5563",
    transition:"all .15s",
  }),
  progWrap:  { marginTop:20 },
  progLabel: { display:"flex", justifyContent:"space-between", fontSize:12, color:"#8b949e", marginBottom:6 },
  progBg:    { height:8, background:"#1e293b", borderRadius:4, overflow:"hidden" },
  progFill:  (p) => ({ height:"100%", width:`${p}%`, background:"linear-gradient(90deg,#38bdf8,#6366f1)", borderRadius:4, transition:"width .4s" }),
  progMsg:   { fontSize:11, color:"#4b5563", marginTop:5, fontFamily:"monospace" },
  alert:     (t) => ({
    marginTop:14, padding:"11px 16px", borderRadius:8, fontSize:13, display:"flex", gap:8, alignItems:"flex-start", lineHeight:1.6,
    background: t==="ok"?"rgba(63,185,80,.1)":t==="err"?"rgba(248,81,73,.1)":"rgba(56,189,248,.1)",
    border:`1px solid ${t==="ok"?"#3fb950":t==="err"?"#f85149":"#38bdf8"}`,
    color: t==="ok"?"#7ee787":t==="err"?"#fca5a5":"#7dd3fc",
  }),
  stats:    { display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginTop:20 },
  statCard: { background:"#161b22", border:"1px solid #30363d", borderRadius:10, padding:"14px 18px", textAlign:"center" },
  statVal:  { fontSize:22, fontWeight:800, color:"#38bdf8", fontFamily:"monospace", letterSpacing:-1 },
  statLbl:  { fontSize:11, color:"#8b949e", marginTop:4 },
  tWrap:    { marginTop:20, background:"#161b22", border:"1px solid #30363d", borderRadius:12, overflow:"hidden" },
  tHead:    { padding:"12px 18px", borderBottom:"1px solid #30363d", display:"flex", alignItems:"center", justifyContent:"space-between" },
  tBadge:   { fontSize:11, background:"#0d1117", border:"1px solid #30363d", borderRadius:20, padding:"3px 10px", color:"#8b949e", fontFamily:"monospace" },
  th:       (r) => ({ padding:"9px 14px", textAlign:r?"right":"left", fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:".5px", color:"#8b949e", whiteSpace:"nowrap", borderBottom:"1px solid #30363d" }),
  td:       (r,c) => ({ padding:"10px 14px", textAlign:r?"right":"left", color:c||"#e6edf3", fontFamily:"monospace", fontSize:13 }),
  tfootRow: { background:"#0d1117", borderTop:"2px solid #30363d" },
  footer:   { marginTop:32, textAlign:"center", fontSize:11, color:"#30363d" },
};

const fmt   = (n) => typeof n==="number" ? Math.floor(n).toLocaleString("en-US") : "—";
const fmtA5 = (n) => typeof n==="number" ? n.toLocaleString("en-US") : "—";

/* ══════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════ */
export default function Home() {
  const [file,       setFile]       = useState(null);
  const [status,     setStatus]     = useState("idle");
  const [pct,        setPct]        = useState(0);
  const [msg,        setMsg]        = useState("");
  const [rows,       setRows]       = useState([]);
  const [liveCount,  setLiveCount]  = useState(0);
  const [errMsg,     setErrMsg]     = useState("");
  const [location,   setLocation]   = useState("");
  const [reportDate, setReportDate] = useState(() => new Date().toISOString().slice(0,10));
  const inputRef     = useRef(null);
  const abortRef     = useRef(false);      // สำหรับ cancel
  const rlUntilRef   = useRef(0);          // rate-limit cooldown timestamp

  /* ── totals ── */
  const totalA4    = rows.reduce((s,r) => s + (r.printA4||0), 0);
  const totalA5    = rows.reduce((s,r) => s + (r.printA5||0), 0);
  const totalGrand = rows.reduce((s,r) => s + (r.grandTotal||0), 0);

  /* ── file pick ── */
  const pickFile = (f) => {
    if (!f || f.type !== "application/pdf") return;
    setFile(f); setRows([]); setStatus("idle"); setErrMsg(""); setLiveCount(0);
  };

  /* ── render 1 page → base64 JPEG ── */
  const toBase64 = useCallback(async (pdfDoc, pageNum) => {
    const page   = await pdfDoc.getPage(pageNum);
    const vp     = page.getViewport({ scale: SCALE });
    const canvas = document.createElement("canvas");
    canvas.width  = vp.width;
    canvas.height = vp.height;
    await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
    return canvas.toDataURL("image/jpeg", QUALITY).split(",")[1];
  }, []);

  /* ── call API 1 page, exponential backoff on 429 ── */
  const callOne = useCallback(async (image, pageNum) => {
    const MAX = 6;
    for (let attempt = 0; attempt < MAX; attempt++) {
      if (abortRef.current) return null;

      /* รอ global rate-limit cooldown */
      const now = Date.now();
      if (now < rlUntilRef.current) {
        await new Promise(r => setTimeout(r, rlUntilRef.current - now + 200));
      }

      /* exponential backoff ก่อน retry */
      if (attempt > 0) {
        await new Promise(r => setTimeout(r, Math.min(1000 * Math.pow(2, attempt-1), 30000)));
      }

      try {
        const res = await fetch("/api/extract", {
          method:  "POST",
          headers: { "Content-Type":"application/json" },
          body:    JSON.stringify({ images:[image], pageNums:[pageNum] }),
        });

        if (res.status === 429) {
          /* rate limit — set global cooldown 20s ให้ทุก worker รอ */
          rlUntilRef.current = Date.now() + 20000;
          continue;
        }
        if (!res.ok) continue;

        const data = await res.json();
        const item = data.results?.[0];
        if (item) return item;

        /* Claude คืน null = ไม่ใช่ Usage Page → ไม่ต้อง retry */
        return null;

      } catch (_) { /* network error → retry */ }
    }
    return null;
  }, []);

  /* ══════════════════════════════════════════════════
     WORKER POOL — หัวใจของระบบ
     สร้าง WORKERS workers ที่แย่งกันดึงหน้าจาก queue
     ไม่มีการรอ "ทั้ง group" — ทุก worker ทำงานตลอดเวลา
  ══════════════════════════════════════════════════ */
  const handleRead = async () => {
    if (!file) return;
    setStatus("loading"); setPct(0); setRows([]); setErrMsg("");
    setLiveCount(0); abortRef.current = false; rlUntilRef.current = 0;

    try {
      /* โหลด PDF.js จาก CDN */
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

      const pdfDoc = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
      const total  = pdfDoc.numPages;
      setMsg(`พบ ${total} หน้า — เริ่มประมวลผลด้วย ${WORKERS} workers...`);

      /* ── Shared state (ใช้ closure refs ไม่ใช่ React state เพื่อความเร็ว) ── */
      const queue      = Array.from({ length: total }, (_, i) => i + 1); // [1..N]
      const collected  = [];    // ผลที่ได้
      let   processed  = 0;     // หน้าที่ประมวลผลแล้ว

      /* ── Worker function ── */
      const worker = async (workerId) => {
        while (queue.length > 0 && !abortRef.current) {
          const pageNum = queue.shift();
          if (pageNum === undefined) break;

          try {
            /* render + API */
            const img  = await toBase64(pdfDoc, pageNum);
            const item = await callOne(img, pageNum);
            if (item) {
              collected.push(item);
              setLiveCount(collected.length);

              /* live table update ทุก 3 เครื่อง */
              if (collected.length % 3 === 0 || collected.length <= 5) {
                const map = buildMap(collected);
                setRows([...map.values()]);
              }
            }
          } catch (_) { /* individual page error — skip */ }

          processed++;
          setPct(Math.round((processed / total) * 100));
          setMsg(`⚡ Worker${workerId}: หน้า ${pageNum}/${total} — พบ ${collected.length} เครื่องพิมพ์`);
        }
      };

      /* ── เริ่ม WORKERS workers พร้อมกัน ── */
      await Promise.all(Array.from({ length: WORKERS }, (_, i) => worker(i + 1)));

      /* ── Final aggregation ── */
      const map   = buildMap(collected);
      const final = [...map.values()];

      setRows(final);
      setPct(100);

      if (!final.length) {
        setErrMsg("ไม่พบข้อมูลเครื่องพิมพ์ กรุณาตรวจสอบว่าเป็น HP Printer Usage Report");
        setStatus("error");
      } else {
        setStatus("done");
        setMsg(`✅ เสร็จสิ้น — อ่านครบ ${total} หน้า พบ ${final.length} เครื่องพิมพ์`);
      }

    } catch (err) {
      console.error(err);
      setErrMsg("เกิดข้อผิดพลาด: " + err.message);
      setStatus("error");
    }
  };

  /* ── หยุดการทำงาน ── */
  const handleStop = () => { abortRef.current = true; };

  /* ── Aggregate collected → Map by serial ── */
  function buildMap(collected) {
    const map = new Map();
    collected.forEach((r) => {
      if (map.has(r.serial)) {
        const e = map.get(r.serial);
        e.printA4    += r.printA4    || 0;
        e.printA5    += r.printA5    || 0;
        e.grandTotal += r.grandTotal || 0;
      } else {
        map.set(r.serial, { ...r, printA4: r.printA4||0, printA5: r.printA5||0, grandTotal: r.grandTotal||0 });
      }
    });
    return map;
  }

  /* ── Export Excel ── */
  const handleExport = () => {
    if (!rows.length) return;

    const BE_YEAR = new Date(reportDate).getFullYear() + 543;
    const dateStr = new Date(reportDate).toLocaleDateString("th-TH", { year:"numeric", month:"long", day:"numeric" });

    const ws = XLSX.utils.aoa_to_sheet([
      ["รายงานการใช้งานเครื่องพิมพ์"],
      ["สถานที่", location || "-"],
      ["วันที่",  `${dateStr} (พ.ศ. ${BE_YEAR})`],
      [],
      ["#", "Serial Number", "รุ่นเครื่องพิมพ์", "A4 Print", "A5 Print", "Grand Total (A4)"],
      ...rows.map((r, i) => [i+1, r.serial, r.model, r.printA4||0, r.printA5||0, r.grandTotal||0]),
      [],
      ["รวม", "", "", totalA4, totalA5, totalGrand],
    ]);

    /* column widths */
    ws["!cols"] = [{ wch:5 },{ wch:15 },{ wch:22 },{ wch:12 },{ wch:12 },{ wch:16 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Printer Usage");
    const fname = `printer_report_${location||"export"}_${reportDate}.xlsx`;
    XLSX.writeFile(wb, fname);
  };

  /* ══════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════ */
  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        <div style={S.hIcon}>🖨️</div>
        <div>
          <div style={S.hTitle}>Printer Usage Reader</div>
          <div style={S.hSub}>HP Printer Usage Report · Worker Pool · Claude Vision</div>
        </div>
        <div style={S.hBadge}>⚡ {WORKERS} Workers Parallel</div>
      </div>

      <div style={S.wrap}>

        {/* Drop zone */}
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); pickFile(e.dataTransfer.files[0]); }}
          style={{ ...S.dropBase, border:`2px dashed ${file?"#38bdf8":"#30363d"}`, background:file?"rgba(56,189,248,.04)":"#161b22" }}
        >
          <input ref={inputRef} type="file" accept=".pdf" style={{ display:"none" }}
            onChange={(e) => pickFile(e.target.files[0])} />
          <div style={{ fontSize:38 }}>📄</div>
          <div style={{ fontSize:15, fontWeight:700, marginTop:10 }}>
            {file ? file.name : "วางไฟล์ PDF ที่นี่ หรือคลิกเพื่อเลือก"}
          </div>
          <div style={{ fontSize:12, color:"#8b949e", marginTop:5 }}>
            {file
              ? `${(file.size/1024/1024).toFixed(1)} MB · คลิกเพื่อเปลี่ยนไฟล์`
              : "รองรับ HP Printer Usage Report PDF 1–300+ หน้า · ประมวลผลในเบราว์เซอร์"}
          </div>
        </div>

        {/* สถานที่ + วันที่ */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginTop:14 }}>
          <div>
            <label style={{ fontSize:12, color:"#8b949e", display:"block", marginBottom:5 }}>📍 สถานที่</label>
            <input type="text" value={location} onChange={(e) => setLocation(e.target.value)}
              placeholder="เช่น สำนักงานใหญ่ กรุงเทพฯ"
              style={{ width:"100%", padding:"10px 14px", borderRadius:8, fontSize:14, background:"#161b22", border:"1px solid #30363d", color:"#e6edf3", outline:"none", fontFamily:"'Sarabun',sans-serif", boxSizing:"border-box" }}
            />
          </div>
          <div>
            <label style={{ fontSize:12, color:"#8b949e", display:"block", marginBottom:5 }}>📅 วันที่</label>
            <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)}
              style={{ width:"100%", padding:"10px 14px", borderRadius:8, fontSize:14, background:"#161b22", border:"1px solid #30363d", color:"#e6edf3", outline:"none", colorScheme:"dark", boxSizing:"border-box" }}
            />
          </div>
        </div>

        {/* Buttons */}
        <div style={S.btnRow}>
          {status === "loading" ? (
            <button onClick={handleStop}
              style={{ ...S.btn(true,"#dc2626"), gridColumn:"1" }}>
              ⏹ หยุด
            </button>
          ) : (
            <button onClick={handleRead} disabled={!file}
              style={S.btn(!!file, "#38bdf8")}>
              🔍 อ่านข้อมูล
            </button>
          )}
          <button onClick={handleExport} disabled={!rows.length}
            style={S.btn(rows.length>0, "#166534")}>
            📊 Export Excel
          </button>
        </div>

        {/* Progress */}
        {status === "loading" && (
          <div style={S.progWrap}>
            <div style={S.progLabel}>
              <span>⚡ {WORKERS} Workers · พบ {liveCount} เครื่องพิมพ์</span>
              <span>{pct}%</span>
            </div>
            <div style={S.progBg}><div style={S.progFill(pct)} /></div>
            <div style={S.progMsg}>{msg}</div>
          </div>
        )}

        {/* Alert */}
        {status === "error" && <div style={S.alert("err")}>❌ {errMsg}</div>}
        {status === "done"  && <div style={S.alert("ok")}>✅ {msg}</div>}

        {/* Live stats */}
        {rows.length > 0 && (
          <div style={S.stats}>
            {[
              { lbl:"เครื่องทั้งหมด",        val: rows.length        },
              { lbl:"A4 Print รวม",           val: fmt(totalA4)       },
              { lbl:"A5 Print รวม (หน้าจริง)",val: fmtA5(totalA5)     },
              { lbl:"Grand Total รวม (A4)",   val: fmt(totalGrand)    },
            ].map((s) => (
              <div key={s.lbl} style={S.statCard}>
                <div style={S.statVal}>{s.val}</div>
                <div style={S.statLbl}>{s.lbl}</div>
              </div>
            ))}
          </div>
        )}

        {/* Live Table */}
        {rows.length > 0 && (
          <div style={S.tWrap}>
            <div style={S.tHead}>
              <span style={{ fontSize:14, fontWeight:700 }}>ผลการอ่านข้อมูล
                {status==="loading" && <span style={{ fontSize:11, color:"#38bdf8", marginLeft:8 }}>● กำลังอ่าน...</span>}
              </span>
              <span style={S.tBadge}>{rows.length} เครื่อง</span>
            </div>
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <thead style={{ background:"#0d1117" }}>
                  <tr>
                    <th style={S.th(false)}>#</th>
                    <th style={S.th(false)}>Serial</th>
                    <th style={S.th(false)}>Model</th>
                    <th style={S.th(true)}>A4 Print</th>
                    <th style={S.th(true)}>A5 Print</th>
                    <th style={S.th(true)}>Grand Total (A4)</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.serial} style={{ borderBottom:"1px solid #1c2128" }}>
                      <td style={S.td(false,"#8b949e")}>{i+1}</td>
                      <td style={{ ...S.td(false,"#7dd3fc"), fontWeight:600 }}>{r.serial}</td>
                      <td style={{ ...S.td(false,"#8b949e"), fontFamily:"'Sarabun',sans-serif", fontSize:13 }}>{r.model}</td>
                      <td style={{ ...S.td(true, r.printA4>0?"#60a5fa":"#4b5563"), fontWeight:r.printA4>0?700:400 }}>
                        {fmt(r.printA4)}
                      </td>
                      <td style={{ ...S.td(true, r.printA5>0?"#fbbf24":"#4b5563"), fontWeight:r.printA5>0?700:400 }}>
                        {fmtA5(r.printA5)}
                      </td>
                      <td style={{ ...S.td(true), fontWeight:700 }}>{fmt(r.grandTotal)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={S.tfootRow}>
                    <td colSpan={3} style={{ ...S.td(true,"#8b949e"), fontSize:12 }}>รวม</td>
                    <td style={{ ...S.td(true,"#60a5fa"), fontWeight:800 }}>{fmt(totalA4)}</td>
                    <td style={{ ...S.td(true,"#fbbf24"), fontWeight:800 }}>{fmtA5(totalA5)}</td>
                    <td style={{ ...S.td(true,"#38bdf8"), fontWeight:800 }}>{fmt(totalGrand)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {(location || reportDate) && (
              <div style={{ padding:"10px 18px", borderTop:"1px solid #30363d", display:"flex", gap:24, fontSize:13, color:"#8b949e" }}>
                {location   && <span>📍 {location}</span>}
                {reportDate && <span>📅 {new Date(reportDate).toLocaleDateString("th-TH",{ year:"numeric", month:"long", day:"numeric" })}</span>}
              </div>
            )}
          </div>
        )}

        <div style={S.footer}>
          Printer Usage Reader v3.0 · Worker Pool · ประมวลผลในเบราว์เซอร์ · ไม่อัปโหลดไฟล์ขึ้น server
        </div>
      </div>
    </div>
  );
}
