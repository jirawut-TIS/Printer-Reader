"use client";
import { useState, useRef, useCallback } from "react";
import * as XLSX from "xlsx";

/* ══════════════════════════════════════════════════════
   CONFIG FOR MAXIMUM SPEED & BATCH PROCESSING
══════════════════════════════════════════════════════ */
const WORKERS = 12;      // Concurrent workers
const BATCH   = 3;       // Pages per API call
const SCALE   = 1.0;     // Image scale
const QUALITY = 0.50;    // JPEG quality

/* ─── Styles ──────────────────────────────────────── */
const S = {
  page:     { fontFamily:"'Sarabun',sans-serif", background:"#0d1117", minHeight:"100vh", color:"#e6edf3" },
  header:   { background:"#161b22", borderBottom:"1px solid #30363d", padding:"14px 24px", display:"flex", alignItems:"center", gap:12 },
  hIcon:    { width:38, height:38, background:"linear-gradient(135deg,#38bdf8,#6366f1)", borderRadius:9, display:"flex", alignItems:"center", justifyContent:"center", fontSize:19, flexShrink:0 },
  hTitle:   { fontSize:17, fontWeight:700 },
  hSub:     { fontSize:12, color:"#8b949e", marginTop:2 },
  hBadge:   { marginLeft:"auto", background:"#1e293b", border:"1px solid #38bdf8", color:"#38bdf8", fontSize:11, padding:"4px 12px", borderRadius:20, fontFamily:"monospace", whiteSpace:"nowrap" },
  wrap:     { maxWidth:1000, margin:"0 auto", padding:"28px 18px 64px" },
  tabs:     { display:"flex", gap:0, borderBottom:"1px solid #30363d", marginBottom:20 },
  tab:      (active) => ({
    padding:"12px 20px", fontSize:14, fontWeight:700, cursor:"pointer",
    background: active ? "#161b22" : "transparent",
    border: active ? "1px solid #30363d" : "none",
    borderBottom: active ? "2px solid #38bdf8" : "none",
    color: active ? "#38bdf8" : "#8b949e",
    transition:"all .15s"
  }),
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
  stats:    { display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12, marginTop:20 },
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

const fmt = (n) => typeof n==="number" ? Math.floor(n).toLocaleString("en-US") : "—";

/* ══════════════════════════════════════════════════════
   MAIN COMPONENT - WITH BATCH PROCESSING
══════════════════════════════════════════════════════ */
export default function Home() {
  const [mode, setMode] = useState("single"); // "single" or "batch"
  const [files, setFiles] = useState([]);
  const [status, setStatus] = useState("idle");
  const [pct, setPct] = useState(0);
  const [msg, setMsg] = useState("");
  const [rows, setRows] = useState([]);
  const [liveCount, setLiveCount] = useState(0);
  const [errMsg, setErrMsg] = useState("");
  const [location, setLocation] = useState("");
  const [reportDate, setReportDate] = useState(() => new Date().toISOString().slice(0,10));
  const [batchResults, setBatchResults] = useState([]); // For batch mode
  
  const inputRef     = useRef(null);
  const abortRef     = useRef(false);
  const rlUntilRef   = useRef(0);
  const renderCache  = useRef({});
  const failedPagesRef = useRef(new Map());
  const retryQueueRef  = useRef([]);

  const totalA4    = rows.reduce((s,r) => s + (r.printA4||0), 0);
  const totalA5    = rows.reduce((s,r) => s + (r.printA5||0), 0);
  const totalGrand = rows.reduce((s,r) => s + (r.grandTotal||0), 0);

  // Single file mode
  const pickFile = (f) => {
    if (!f || f.type !== "application/pdf") return;
    setFiles([f]); 
    setRows([]); 
    setStatus("idle"); 
    setErrMsg(""); 
    setLiveCount(0);
    setBatchResults([]);
    failedPagesRef.current = new Map();
    retryQueueRef.current = [];
  };

  // Batch mode
  const pickFiles = (fileList) => {
    const pdfs = Array.from(fileList).filter(f => f.type === "application/pdf");
    if (!pdfs.length) return;
    setFiles(pdfs);
    setRows([]);
    setStatus("idle");
    setErrMsg("");
    setLiveCount(0);
    setBatchResults([]);
    failedPagesRef.current = new Map();
    retryQueueRef.current = [];
  };

  /* ── Image rendering ── */
  const toBase64 = useCallback(async (pdfDoc, pageNum) => {
    if (renderCache.current[pageNum]) return renderCache.current[pageNum];
    const page   = await pdfDoc.getPage(pageNum);
    const vp     = page.getViewport({ scale: SCALE });
    const canvas = document.createElement("canvas");
    canvas.width  = vp.width;
    canvas.height = vp.height;
    await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
    const b64 = canvas.toDataURL("image/jpeg", QUALITY).split(",")[1];
    renderCache.current[pageNum] = b64;
    return b64;
  }, []);

  /* ── API call with retry ── */
  const callBatch = useCallback(async (images, pageNums, retryCount = 0, batchId = "") => {
    const MAX_RETRIES = 5;
    
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      if (abortRef.current) return pageNums.map((p) => ({ pageNum: p, data: null, reason: "aborted", batchId }));

      const now = Date.now();
      if (now < rlUntilRef.current)
        await new Promise(r => setTimeout(r, rlUntilRef.current - now + 200));

      if (attempt > 0) {
        const backoff = Math.min(500 * Math.pow(2, attempt - 1), 10000);
        await new Promise(r => setTimeout(r, backoff));
      }

      try {
        const res = await fetch("/api/extract", {
          method:  "POST",
          headers: { "Content-Type":"application/json" },
          body:    JSON.stringify({ images, pageNums, batchId }),
        });
        
        if (res.status === 429) {
          rlUntilRef.current = Date.now() + 15000;
          continue;
        }
        
        if (!res.ok) continue;
        
        const data = await res.json();
        if (data.results) return data.results;
        
      } catch (_) {}
    }
    
    return pageNums.map((p) => ({ pageNum: p, data: null, reason: "max_retries_exceeded", batchId }));
  }, []);

  /* ── Process single file ── */
  const processSingleFile = async (file, fileIndex = 0) => {
    const batchId = `batch_${Date.now()}_${fileIndex}`;
    
    try {
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
      
      const queue     = Array.from({ length: total }, (_, i) => i + 1);
      const collected = [];
      let   processed = 0;

      /* ── Worker pool ── */
      const worker = async (workerId) => {
        while (queue.length > 0 && !abortRef.current) {
          const batch = [];
          while (batch.length < BATCH && queue.length > 0) batch.push(queue.shift());
          if (!batch.length) break;

          try {
            const images = await Promise.all(batch.map(p => toBase64(pdfDoc, p)));
            const results = await callBatch(images, batch, 0, batchId);

            results.forEach((result, idx) => {
              const pageNum = batch[idx];
              
              if (result.data) {
                collected.push({ ...result.data, _page: pageNum, _fileIndex: fileIndex });
                setLiveCount(collected.length);
              } else if (result.reason) {
                failedPagesRef.current.set(pageNum, result.reason);
                if (retryQueueRef.current.length < 10) {
                  retryQueueRef.current.push(pageNum);
                }
              }
            });
          } catch (_) {}

          processed += batch.length;
          const currentPct = Math.round((processed / total) * 100);
          setPct(currentPct);
          setMsg(`⚡ Processing: ${currentPct}% (${processed}/${total} pages)`);
        }
      };

      await Promise.all(Array.from({ length: WORKERS }, (_, i) => worker(i + 1)));

      /* ── Retry failed pages ── */
      if (retryQueueRef.current.length > 0) {
        setMsg(`⚠️ Retrying ${retryQueueRef.current.length} failed pages...`);
        
        const retryBatch = [];
        for (const pageNum of retryQueueRef.current) {
          if (retryBatch.length >= BATCH) {
            const images = await Promise.all(retryBatch.map(p => toBase64(pdfDoc, p)));
            const results = await callBatch(images, retryBatch, 0, batchId);
            
            results.forEach((result, idx) => {
              if (result.data) {
                collected.push({ ...result.data, _page: retryBatch[idx], _fileIndex: fileIndex });
              }
            });
            retryBatch.length = 0;
          }
          retryBatch.push(pageNum);
        }
        
        if (retryBatch.length > 0) {
          const images = await Promise.all(retryBatch.map(p => toBase64(pdfDoc, p)));
          const results = await callBatch(images, retryBatch, 0, batchId);
          results.forEach((result, idx) => {
            if (result.data) {
              collected.push({ ...result.data, _page: retryBatch[idx], _fileIndex: fileIndex });
            }
          });
        }
      }

      const map   = buildMap(collected);
      return { fileName: file.name, data: [...map.values()], success: true };

    } catch (err) {
      console.error(err);
      return { fileName: file.name, data: [], success: false, error: err.message };
    }
  };

  /* ── Process batch ── */
  const handleBatchProcess = async () => {
    if (!files.length) return;
    setStatus("loading");
    setPct(0);
    setRows([]);
    setErrMsg("");
    setLiveCount(0);
    abortRef.current = false;
    rlUntilRef.current = 0;
    renderCache.current = {};
    failedPagesRef.current = new Map();
    retryQueueRef.current = [];

    const results = [];
    const allData = [];

    for (let i = 0; i < files.length; i++) {
      setMsg(`📄 Processing file ${i + 1}/${files.length}: ${files[i].name}`);
      const result = await processSingleFile(files[i], i);
      results.push(result);
      
      if (result.success) {
        allData.push(...result.data);
      }
      
      const filePct = Math.round(((i + 1) / files.length) * 100);
      setPct(filePct);
    }

    setBatchResults(results);
    
    // Create master map
    const map = buildMap(allData);
    const final = [...map.values()];

    setRows(final);
    setPct(100);

    if (!final.length) {
      setErrMsg("❌ No data found in any files.");
      setStatus("error");
    } else {
      setStatus("done");
      const successCount = results.filter(r => r.success).length;
      setMsg(`✅ Complete! ${successCount}/${files.length} files processed, ${final.length} total printers found`);
    }
  };

  const handleRead = () => {
    if (mode === "single" && files.length > 0) {
      handleBatchProcess();
    } else if (mode === "batch" && files.length > 0) {
      handleBatchProcess();
    }
  };

  const handleStop = () => { abortRef.current = true; };

  function buildMap(collected) {
    const map = new Map();
    collected.forEach((r) => {
      if (map.has(r.serial)) {
        const e = map.get(r.serial);
        e.printA4    += r.printA4    || 0;
        e.printA5    += r.printA5    || 0;
        e.grandTotal += r.grandTotal || 0;
      } else {
        map.set(r.serial, { 
          ...r, 
          printA4: r.printA4||0, 
          printA5: r.printA5||0, 
          grandTotal: r.grandTotal||0
        });
      }
    });
    return map;
  }

  const handleExport = (individual = false) => {
    if (!rows.length) return;

    const BE_YEAR = new Date(reportDate).getFullYear() + 543;
    const dateStr = new Date(reportDate).toLocaleDateString("th-TH", { year:"numeric", month:"long", day:"numeric" });

    if (mode === "batch" && individual && batchResults.length > 0) {
      // Export individual files for batch
      batchResults.forEach((result, idx) => {
        if (!result.success) return;
        
        const ws = XLSX.utils.aoa_to_sheet([
          ["รายงานการใช้งานเครื่องพิมพ์"],
          ["สถานที่", location || "-"],
          ["วันที่",  `${dateStr} (พ.ศ. ${BE_YEAR})`],
          [],
          ["#", "Serial Number", "รุ่นเครื่องพิมพ์", "A4 Print", "A5 Print", "Grand Total"],
          ...result.data.map((r, i) => [i+1, r.serial, r.model, r.printA4||0, r.printA5||0, r.grandTotal||0]),
          [],
          ["รวม", "", "", result.data.reduce((s,r)=>s+(r.printA4||0),0), result.data.reduce((s,r)=>s+(r.printA5||0),0), result.data.reduce((s,r)=>s+(r.grandTotal||0),0)],
        ]);
        ws["!cols"] = [{ wch:5 },{ wch:15 },{ wch:22 },{ wch:12 },{ wch:12 },{ wch:16 }];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Report");
        XLSX.writeFile(wb, `report_${idx+1}_${location||"file"}_${reportDate}.xlsx`);
      });
    } else {
      // Export master file
      const ws = XLSX.utils.aoa_to_sheet([
        ["รายงานการใช้งานเครื่องพิมพ์"],
        ["สถานที่", location || "-"],
        ["วันที่",  `${dateStr} (พ.ศ. ${BE_YEAR})`],
        ...(mode === "batch" ? [["ไฟล์ที่ประมวลผล", batchResults.filter(r=>r.success).length]] : []),
        [],
        ["#", "Serial Number", "รุ่นเครื่องพิมพ์", "A4 Print", "A5 Print", "Grand Total"],
        ...rows.map((r, i) => [i+1, r.serial, r.model, r.printA4||0, r.printA5||0, r.grandTotal||0]),
        [],
        ["รวม", "", "", totalA4, totalA5, totalGrand],
      ]);
      ws["!cols"] = [{ wch:5 },{ wch:15 },{ wch:22 },{ wch:12 },{ wch:12 },{ wch:16 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Printer Usage");
      const fname = mode === "batch" 
        ? `master_report_${location||"batch"}_${reportDate}.xlsx`
        : `printer_report_${location||"export"}_${reportDate}.xlsx`;
      XLSX.writeFile(wb, fname);
    }
  };

  /* ═══════════════════════════════════════════════════════════
     RENDER
  ═══════════════════════════════════════════════════════════ */
  return (
    <div style={S.page}>
      <div style={S.header}>
        <div style={S.hIcon}>🖨️</div>
        <div>
          <div style={S.hTitle}>Printer Usage Reader v3 + Batch</div>
          <div style={S.hSub}>100% Extraction • Batch Processing • Integer Values</div>
        </div>
        <div style={S.hBadge}>⚡ {WORKERS} Workers • {mode === "batch" ? "Batch Mode" : "Single Mode"}</div>
      </div>

      <div style={S.wrap}>

        {/* ── Mode Selection ── */}
        <div style={S.tabs}>
          <div style={S.tab(mode === "single")} onClick={() => setMode("single")}>
            📄 Single File
          </div>
          <div style={S.tab(mode === "batch")} onClick={() => setMode("batch")}>
            📦 Batch Processing (Multiple Files)
          </div>
        </div>

        {/* ── Upload Area ── */}
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { 
            e.preventDefault(); 
            if (mode === "single") {
              pickFile(e.dataTransfer.files[0]);
            } else {
              pickFiles(e.dataTransfer.files);
            }
          }}
          style={{ ...S.dropBase, border:`2px dashed ${files.length?"#38bdf8":"#30363d"}`, background:files.length?"rgba(56,189,248,.04)":"#161b22" }}
        >
          <input 
            ref={inputRef} 
            type="file" 
            accept=".pdf" 
            multiple={mode === "batch"}
            style={{ display:"none" }}
            onChange={(e) => {
              if (mode === "single") {
                pickFile(e.target.files[0]);
              } else {
                pickFiles(e.target.files);
              }
            }} 
          />
          <div style={{ fontSize:38 }}>📄</div>
          <div style={{ fontSize:15, fontWeight:700, marginTop:10 }}>
            {files.length 
              ? `${files.length} file${files.length>1?"s":""} selected` 
              : mode === "batch" ? "Drag PDFs here or click to select (multiple)" : "Drag PDF here or click to select"}
          </div>
          <div style={{ fontSize:12, color:"#8b949e", marginTop:5 }}>
            {files.length
              ? files.map(f => `${f.name} (${(f.size/1024/1024).toFixed(1)}MB)`).join(", ")
              : "Supports multiple HP Printer Usage Reports"}
          </div>
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginTop:14 }}>
          <div>
            <label style={{ fontSize:12, color:"#8b949e", display:"block", marginBottom:5 }}>📍 Location</label>
            <input type="text" value={location} onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g., Bangkok Head Office"
              style={{ width:"100%", padding:"10px 14px", borderRadius:8, fontSize:14, background:"#161b22", border:"1px solid #30363d", color:"#e6edf3", outline:"none", fontFamily:"'Sarabun',sans-serif", boxSizing:"border-box" }}
            />
          </div>
          <div>
            <label style={{ fontSize:12, color:"#8b949e", display:"block", marginBottom:5 }}>📅 Date</label>
            <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)}
              style={{ width:"100%", padding:"10px 14px", borderRadius:8, fontSize:14, background:"#161b22", border:"1px solid #30363d", color:"#e6edf3", outline:"none", colorScheme:"dark", boxSizing:"border-box" }}
            />
          </div>
        </div>

        <div style={S.btnRow}>
          {status === "loading" ? (
            <button onClick={handleStop}
              style={{ ...S.btn(true,"#dc2626"), gridColumn:"1" }}>
              ⏹ Stop
            </button>
          ) : (
            <button onClick={handleRead} disabled={!files.length}
              style={S.btn(!!files.length, "#38bdf8")}>
              🔍 {mode === "batch" ? "Process Batch" : "Read Data"}
            </button>
          )}
          <button onClick={() => handleExport(mode === "batch")} disabled={!rows.length}
            style={S.btn(rows.length>0, "#166534")}>
            📊 Export {mode === "batch" ? "Master" : "Excel"}
          </button>
          {mode === "batch" && rows.length > 0 && (
            <button onClick={() => handleExport(true)} 
              style={{ ...S.btn(true, "#f59e0b"), gridColumn:"1" }}>
              📋 Export Individual Files
            </button>
          )}
        </div>

        {status === "loading" && (
          <div style={S.progWrap}>
            <div style={S.progLabel}>
              <span>Progress</span>
              <span>{pct}%</span>
            </div>
            <div style={S.progBg}>
              <div style={S.progFill(pct)} />
            </div>
            <div style={S.progMsg}>{msg}</div>
          </div>
        )}

        {errMsg && (
          <div style={S.alert(status === "error" ? "err" : "info")}>
            <span>ℹ️</span>
            <span>{errMsg}</span>
          </div>
        )}

        {status !== "idle" && msg && !errMsg && (
          <div style={S.alert("ok")}>
            <span>✅</span>
            <div>{msg}</div>
          </div>
        )}

        {rows.length > 0 && (
          <>
            <div style={S.stats}>
              <div style={S.statCard}>
                <div style={S.statVal}>{files.length}</div>
                <div style={S.statLbl}>Files</div>
              </div>
              <div style={S.statCard}>
                <div style={S.statVal}>{rows.length}</div>
                <div style={S.statLbl}>Printers</div>
              </div>
              <div style={S.statCard}>
                <div style={S.statVal}>{fmt(totalA4)}</div>
                <div style={S.statLbl}>A4 Total</div>
              </div>
              <div style={S.statCard}>
                <div style={S.statVal}>{fmt(totalA5)}</div>
                <div style={S.statLbl}>A5 Total</div>
              </div>
              <div style={S.statCard}>
                <div style={S.statVal}>{fmt(totalGrand)}</div>
                <div style={S.statLbl}>Grand Total</div>
              </div>
            </div>

            <div style={S.tWrap}>
              <div style={S.tHead}>
                <div style={S.hTitle}>Results ({rows.length} items)</div>
                <div style={S.tBadge}>✅ Complete</div>
              </div>
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <thead>
                  <tr style={{ background:"#0d1117" }}>
                    <th style={S.th(false)}>#</th>
                    <th style={S.th(false)}>Serial</th>
                    <th style={S.th(false)}>Model</th>
                    <th style={S.th(true)}>A4</th>
                    <th style={S.th(true)}>A5</th>
                    <th style={S.th(true)}>Grand Total</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 50).map((r, i) => (
                    <tr key={i} style={{ borderBottom:"1px solid #30363d" }}>
                      <td style={S.td(false)}>{i+1}</td>
                      <td style={S.td(false)}>{r.serial}</td>
                      <td style={S.td(false, "#7dd3fc")}>{r.model}</td>
                      <td style={S.td(true)}>{fmt(r.printA4)}</td>
                      <td style={S.td(true)}>{fmt(r.printA5)}</td>
                      <td style={S.td(true, "#38bdf8")}>{fmt(r.grandTotal)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={S.tfootRow}>
                    <td colSpan="3" style={S.td(false)}><strong>Total</strong></td>
                    <td style={S.td(true)}><strong>{fmt(totalA4)}</strong></td>
                    <td style={S.td(true)}><strong>{fmt(totalA5)}</strong></td>
                    <td style={S.td(true, "#38bdf8")}><strong>{fmt(totalGrand)}</strong></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {rows.length > 50 && (
              <div style={{marginTop:10, fontSize:12, color:"#8b949e", textAlign:"center"}}>
                Showing 50 of {rows.length} printers. Download Excel to see all.
              </div>
            )}
          </>
        )}

        <div style={S.footer}>Printer Reader v3 + Batch Processing • 100% Extraction • Maximum Speed ⚡</div>

      </div>
    </div>
  );
}
