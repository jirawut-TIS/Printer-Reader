"use client";
import { useState, useRef, useCallback } from "react";
import * as XLSX from "xlsx";
import MergePanel from "../components/MergePanel";

const WORKERS = 6;
const BATCH   = 2;
const SCALE   = 1.5;
const QUALITY = 0.72;

const S = {
  wrap:     { maxWidth:1000, margin:"0 auto", padding:"28px 18px 64px" },
  dropBase: { borderRadius:12, padding:"32px 20px", textAlign:"center", cursor:"pointer", transition:"all .2s" },
  btnRow:   { display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginTop:14 },
  btn:      (on,col)=>({ padding:"13px 0",border:"none",borderRadius:9,fontSize:14,fontWeight:700,cursor:on?"pointer":"not-allowed",background:on?col:"#1e293b",color:on?(col==="#38bdf8"?"#0d1117":"#fff"):"#4b5563",transition:"all .15s" }),
  progWrap: { marginTop:20 },
  progLabel:{ display:"flex",justifyContent:"space-between",fontSize:12,color:"#8b949e",marginBottom:6 },
  progBg:   { height:8,background:"#1e293b",borderRadius:4,overflow:"hidden" },
  progFill: (p)=>({ height:"100%",width:`${p}%`,background:"linear-gradient(90deg,#38bdf8,#6366f1)",borderRadius:4,transition:"width .4s" }),
  progMsg:  { fontSize:11,color:"#4b5563",marginTop:5,fontFamily:"monospace" },
  alert:    (t)=>({ marginTop:14,padding:"11px 16px",borderRadius:8,fontSize:13,display:"flex",gap:8,alignItems:"flex-start",lineHeight:1.6,
    background:t==="ok"?"rgba(63,185,80,.1)":t==="err"?"rgba(248,81,73,.1)":t==="warn"?"rgba(234,179,8,.1)":"rgba(56,189,248,.1)",
    border:`1px solid ${t==="ok"?"#3fb950":t==="err"?"#f85149":t==="warn"?"#eab308":"#38bdf8"}`,
    color:t==="ok"?"#7ee787":t==="err"?"#fca5a5":t==="warn"?"#fde047":"#7dd3fc" }),
  stats:    { display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginTop:20 },
  statCard: { background:"#161b22",border:"1px solid #30363d",borderRadius:10,padding:"14px 18px",textAlign:"center" },
  statVal:  { fontSize:22,fontWeight:800,color:"#38bdf8",fontFamily:"monospace",letterSpacing:-1 },
  statLbl:  { fontSize:11,color:"#8b949e",marginTop:4 },
  tWrap:    { marginTop:20,background:"#161b22",border:"1px solid #30363d",borderRadius:12,overflow:"hidden" },
  tHead:    { padding:"12px 18px",borderBottom:"1px solid #30363d",display:"flex",alignItems:"center",justifyContent:"space-between" },
  tBadge:   { fontSize:11,background:"#0d1117",border:"1px solid #30363d",borderRadius:20,padding:"3px 10px",color:"#8b949e",fontFamily:"monospace" },
  th:       (r)=>({ padding:"9px 12px",textAlign:r?"right":"left",fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:".5px",color:"#8b949e",whiteSpace:"nowrap",borderBottom:"1px solid #30363d" }),
  td:       (r,c)=>({ padding:"9px 12px",textAlign:r?"right":"left",color:c||"#e6edf3",fontFamily:"monospace",fontSize:13 }),
  tfootRow: { background:"#0d1117",borderTop:"2px solid #30363d" },
};

const fmt = (n) => typeof n==="number" ? Math.floor(n).toLocaleString("en-US") : "—";

// ── อ่าน Excel เดิม → array of rows ──────────────────────────────
function readExcelRows(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb   = XLSX.read(e.target.result, { type: "array" });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { defval: "" });
        // normalize column names (รองรับทั้ง Thai และ English headers)
        const rows = data
          .map(r => {
            const serial     = r["Serial Number"] || r["serial"] || "";
            const model      = r["รุ่นเครื่องพิมพ์"] || r["Model"] || r["model"] || "";
            const printA4    = Number(r["A4 Print"]    || r["printA4"]    || 0);
            const printA5    = Number(r["A5 Print"]    || r["printA5"]    || 0);
            const grandTotal = Number(r["Grand Total (A4)"] || r["grandTotal"] || r["Grand Total"] || 0);
            return serial ? { serial: String(serial).trim(), model, printA4, printA5, grandTotal, fromExcel: true } : null;
          })
          .filter(Boolean);
        resolve(rows);
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

export default function PrinterApp() {
  const [pdfFile,     setPdfFile]     = useState(null);
  const [xlsFile,     setXlsFile]     = useState(null);   // Excel เดิม (optional)
  const [xlsRows,     setXlsRows]     = useState([]);     // data จาก Excel เดิม
  const [xlsErr,      setXlsErr]      = useState("");
  const [status,      setStatus]      = useState("idle");
  const [pct,         setPct]         = useState(0);
  const [msg,         setMsg]         = useState("");
  const [rows,        setRows]        = useState([]);     // merged result
  const [liveCount,   setLiveCount]   = useState(0);
  const [warnMsg,     setWarnMsg]     = useState("");
  const [errMsg,      setErrMsg]      = useState("");
  const [location,    setLocation]    = useState("");
  const [reportDate,  setReportDate]  = useState(()=>new Date().toISOString().slice(0,10));
  const [tab,         setTab]         = useState("single"); // "single" | "merge"
  const pdfInputRef = useRef(null);
  const xlsInputRef = useRef(null);
  const abortRef    = useRef(false);
  const rlUntilRef  = useRef(0);
  const renderCache = useRef({});

  const totalA4    = rows.reduce((s,r)=>s+(r.printA4||0),0);
  const totalA5    = rows.reduce((s,r)=>s+(r.printA5||0),0);
  const totalGrand = rows.reduce((s,r)=>s+(r.grandTotal||0),0);

  // ── รับ Excel เดิม ──────────────────────────────────────────────
  const pickXls = async (f) => {
    if (!f) return;
    const ext = f.name.split(".").pop().toLowerCase();
    if (!["xlsx","xls","csv"].includes(ext)) { setXlsErr("รองรับเฉพาะ .xlsx .xls .csv"); return; }
    setXlsErr(""); setXlsFile(f);
    try {
      const parsed = await readExcelRows(f);
      setXlsRows(parsed);
    } catch { setXlsErr("อ่านไฟล์ Excel ไม่ได้ กรุณาตรวจสอบรูปแบบ"); setXlsFile(null); }
  };

  const pickPdf = (f) => {
    if (!f || f.type!=="application/pdf") return;
    setPdfFile(f); setRows([]); setStatus("idle"); setErrMsg(""); setWarnMsg(""); setLiveCount(0);
  };

  const toBase64 = useCallback(async (pdfDoc, pageNum) => {
    if (renderCache.current[pageNum]) return renderCache.current[pageNum];
    const page   = await pdfDoc.getPage(pageNum);
    const vp     = page.getViewport({ scale:SCALE });
    const canvas = document.createElement("canvas");
    canvas.width = vp.width; canvas.height = vp.height;
    await page.render({ canvasContext:canvas.getContext("2d"), viewport:vp }).promise;
    const b64 = canvas.toDataURL("image/jpeg", QUALITY).split(",")[1];
    renderCache.current[pageNum] = b64;
    return b64;
  }, []);

  const callBatch = useCallback(async (images, pageNums) => {
    for (let attempt = 0; attempt < 6; attempt++) {
      if (abortRef.current) return pageNums.map(p=>({page:p,serial:null}));
      const now = Date.now();
      if (now < rlUntilRef.current) await new Promise(r=>setTimeout(r, rlUntilRef.current-now+300));
      if (attempt>0) await new Promise(r=>setTimeout(r, Math.min(1500*Math.pow(2,attempt-1),25000)));
      try {
        const res = await fetch("/api/extract",{
          method:"POST", headers:{"Content-Type":"application/json"},
          body:JSON.stringify({images,pageNums}),
        });
        if (res.status===429){ rlUntilRef.current=Date.now()+15000; continue; }
        if (!res.ok) continue;
        const data = await res.json();
        return data.results ?? pageNums.map(p=>({page:p,serial:null}));
      } catch(_){}
    }
    return pageNums.map(p=>({page:p,serial:null}));
  }, []);

  // ── Merge: Excel เดิม + PDF ใหม่ (PDF ใหม่ทับค่าเดิมถ้า serial ซ้ำ) ──
  function mergeRows(excelRows, pdfRows) {
    const map = new Map();
    // ใส่ Excel เดิมก่อน
    excelRows.forEach(r => { if (r.serial) map.set(r.serial, { ...r }); });
    // PDF ใหม่ทับ/เพิ่ม
    pdfRows.forEach(r => {
      if (!r.serial) return;
      map.set(r.serial, { ...r, fromExcel: false });
    });
    return [...map.values()];
  }

  function buildPdfRows(collected) {
    const sorted = [...collected].sort((a,b)=>(a.page||0)-(b.page||0));
    const map = new Map();
    sorted.forEach(r=>{
      if (!r.serial) return;
      if (map.has(r.serial)) {
        const e = map.get(r.serial);
        e.printA4    += r.printA4||0;
        e.printA5    += r.printA5||0;
        e.grandTotal += r.grandTotal||0;
      } else {
        map.set(r.serial, {...r, printA4:r.printA4||0, printA5:r.printA5||0, grandTotal:r.grandTotal||0});
      }
    });
    return [...map.values()];
  }

  const handleRead = async () => {
    if (!pdfFile) return;
    setStatus("loading"); setPct(0); setRows([]); setErrMsg(""); setWarnMsg("");
    setLiveCount(0); abortRef.current=false; rlUntilRef.current=0; renderCache.current={};

    try {
      if (!window.pdfjsLib) {
        await new Promise((resolve,reject)=>{
          const s=document.createElement("script");
          s.src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
          s.onload=resolve; s.onerror=reject; document.head.appendChild(s);
        });
      }
      window.pdfjsLib.GlobalWorkerOptions.workerSrc=
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

      const pdfDoc = await window.pdfjsLib.getDocument({data:await pdfFile.arrayBuffer()}).promise;
      const total  = pdfDoc.numPages;
      setMsg(`พบ ${total} หน้า — ${WORKERS} workers × ${BATCH} หน้า/call`);

      const queue     = Array.from({length:total},(_,i)=>i+1);
      const collected = [];
      const nullPages = [];
      let   processed = 0;

      const worker = async (wid) => {
        while (queue.length>0 && !abortRef.current) {
          const batch = [];
          while (batch.length<BATCH && queue.length>0) batch.push(queue.shift());
          if (!batch.length) break;
          try {
            const images = await Promise.all(batch.map(p=>toBase64(pdfDoc,p)));
            const next = queue.slice(0,BATCH);
            if (next.length) Promise.all(next.map(p=>toBase64(pdfDoc,p)));
            const results = await callBatch(images, batch);
            results.forEach(r=>{
              if (!r) return;
              if (r.serial) {
                collected.push(r); setLiveCount(collected.length);
                if (collected.length%3===0||collected.length<=5)
                  setRows(mergeRows(xlsRows, buildPdfRows(collected)));
              } else { nullPages.push(r.page); }
            });
          } catch(_){}
          processed += batch.length;
          setPct(Math.round((processed/total)*100));
          setMsg(`⚡ W${wid}: ${batch[batch.length-1]}/${total} — พบ ${collected.length} เครื่อง`);
        }
      };

      await Promise.all(Array.from({length:WORKERS},(_,i)=>worker(i+1)));

      const alreadyFound = new Set(collected.map(r=>r.page));
      const retryList    = nullPages.filter(p=>!alreadyFound.has(p));
      if (retryList.length>0 && !abortRef.current) {
        setMsg(`🔄 Retry ${retryList.length} หน้า...`);
        for (let i=0; i<retryList.length; i+=BATCH) {
          if (abortRef.current) break;
          const batch = retryList.slice(i,i+BATCH);
          try {
            const images  = await Promise.all(batch.map(p=>toBase64(pdfDoc,p)));
            const results = await callBatch(images, batch);
            results.forEach(r=>{
              if (r?.serial && !alreadyFound.has(r.page)) { collected.push(r); alreadyFound.add(r.page); }
            });
          } catch(_){}
        }
      }

      const pdfRows = buildPdfRows(collected);
      const final   = mergeRows(xlsRows, pdfRows);
      setRows(final); setPct(100);

      const stillMissed = retryList.filter(p=>!new Set(collected.map(r=>r.page)).has(p));
      if (stillMissed.length>0)
        setWarnMsg(`⚠️ พลาดข้อมูล ${stillMissed.length} หน้า: ${stillMissed.slice(0,20).join(", ")}${stillMissed.length>20?"...":""}`);

      if (!final.length) {
        setErrMsg("ไม่พบข้อมูล กรุณาตรวจสอบว่าเป็น HP Printer Usage Report"); setStatus("error");
      } else {
        setStatus("done");
        const mergeNote = xlsRows.length>0 ? ` (รวมกับ Excel เดิม ${xlsRows.length} เครื่อง)` : "";
        setMsg(`✅ เสร็จสิ้น — ${total} หน้า → ${pdfRows.length} เครื่องจาก PDF${mergeNote} → รวม ${final.length} เครื่อง`);
      }
    } catch(err) {
      setErrMsg("เกิดข้อผิดพลาด: "+err.message); setStatus("error");
    }
  };

  const handleStop = () => { abortRef.current=true; };

  const handleExport = () => {
    if (!rows.length) return;
    const BE_YEAR = new Date(reportDate).getFullYear()+543;
    const dateStr = new Date(reportDate).toLocaleDateString("th-TH",{year:"numeric",month:"long",day:"numeric"});
    const ws = XLSX.utils.aoa_to_sheet([
      ["รายงานการใช้งานเครื่องพิมพ์"],
      ["สถานที่", location||"-"],
      ["วันที่", `${dateStr} (พ.ศ. ${BE_YEAR})`],
      xlsRows.length>0 ? ["หมายเหตุ", `รวมข้อมูลจาก Excel เดิม ${xlsRows.length} เครื่อง + PDF ใหม่`] : [],
      [],
      ["#","Serial Number","รุ่นเครื่องพิมพ์","A4 Print","A5 Print","Grand Total (A4)","แหล่งข้อมูล"],
      ...rows.map((r,i)=>[
        i+1, r.serial, r.model,
        r.printA4||0, r.printA5||0, r.grandTotal||0,
        r.fromExcel ? "Excel เดิม" : "PDF ใหม่",
      ]),
      [],
      ["รวม","","", totalA4, totalA5, totalGrand, ""],
    ]);
    ws["!cols"]=[{wch:4},{wch:14},{wch:24},{wch:12},{wch:12},{wch:16},{wch:12}];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,"Printer Usage");
    XLSX.writeFile(wb,`printer_report_${location||"export"}_${reportDate}.xlsx`);
  };

  const inp = { width:"100%",padding:"10px 14px",borderRadius:8,fontSize:14,background:"#161b22",border:"1px solid #30363d",color:"#e6edf3",outline:"none",fontFamily:"'Sarabun',sans-serif",boxSizing:"border-box" };

  const tabBtn = (id, label) => (
    <button onClick={() => setTab(id)} style={{
      padding: "7px 18px", fontSize: 13, borderRadius: 8, cursor: "pointer",
      fontFamily: "'Sarabun',sans-serif", fontWeight: 600,
      border: tab === id ? "1px solid #38bdf8" : "1px solid #30363d",
      background: tab === id ? "rgba(56,189,248,.15)" : "#161b22",
      color: tab === id ? "#38bdf8" : "#8b949e",
      transition: "all .15s",
    }}>{label}</button>
  );

  return (
    <div style={S.wrap}>

      {/* ── Tab bar ── */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {tabBtn("single", "🔍 อ่าน PDF")}
        {tabBtn("merge",  "🔄 Merge Excel + PDF")}
      </div>

      {tab === "merge" && <MergePanel />}

      {tab === "single" && <>

      {/* ── Upload zone: Excel เดิม + PDF ใหม่ ── */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:4 }}>

        {/* Excel เดิม */}
        <div
          onClick={()=>xlsInputRef.current?.click()}
          onDragOver={e=>e.preventDefault()}
          onDrop={e=>{e.preventDefault();pickXls(e.dataTransfer.files[0]);}}
          style={{...S.dropBase, border:`2px dashed ${xlsFile?"#3fb950":"#30363d"}`, background:xlsFile?"rgba(63,185,80,.04)":"#161b22", padding:"24px 16px"}}
        >
          <input ref={xlsInputRef} type="file" accept=".xlsx,.xls,.csv" style={{display:"none"}} onChange={e=>pickXls(e.target.files[0])} />
          <div style={{fontSize:28}}>📊</div>
          <div style={{fontSize:13,fontWeight:700,marginTop:8,color:xlsFile?"#3fb950":"#e6edf3"}}>
            {xlsFile ? xlsFile.name : "Excel เดิม (ถ้ามี)"}
          </div>
          <div style={{fontSize:11,color:"#8b949e",marginTop:4}}>
            {xlsFile ? `${xlsRows.length} เครื่อง · ลาก/คลิกเพื่อเปลี่ยน` : ".xlsx .xls .csv · ไม่บังคับ"}
          </div>
          {xlsFile && (
            <button onClick={e=>{e.stopPropagation();setXlsFile(null);setXlsRows([]);}} style={{marginTop:8,padding:"3px 10px",fontSize:11,borderRadius:6,border:"1px solid #30363d",background:"transparent",color:"#8b949e",cursor:"pointer"}}>✕ ลบออก</button>
          )}
        </div>

        {/* PDF ใหม่ */}
        <div
          onClick={()=>pdfInputRef.current?.click()}
          onDragOver={e=>e.preventDefault()}
          onDrop={e=>{e.preventDefault();pickPdf(e.dataTransfer.files[0]);}}
          style={{...S.dropBase, border:`2px dashed ${pdfFile?"#38bdf8":"#30363d"}`, background:pdfFile?"rgba(56,189,248,.04)":"#161b22", padding:"24px 16px"}}
        >
          <input ref={pdfInputRef} type="file" accept=".pdf" style={{display:"none"}} onChange={e=>pickPdf(e.target.files[0])} />
          <div style={{fontSize:28}}>📄</div>
          <div style={{fontSize:13,fontWeight:700,marginTop:8,color:pdfFile?"#38bdf8":"#e6edf3"}}>
            {pdfFile ? pdfFile.name : "PDF ใหม่ (บังคับ)"}
          </div>
          <div style={{fontSize:11,color:"#8b949e",marginTop:4}}>
            {pdfFile ? `${(pdfFile.size/1024/1024).toFixed(1)} MB · ลาก/คลิกเพื่อเปลี่ยน` : "HP Printer Usage Report · ภาษาไทย + English"}
          </div>
        </div>
      </div>

      {xlsErr && <div style={S.alert("err")}>❌ {xlsErr}</div>}

      {/* Excel เดิม badge */}
      {xlsRows.length>0 && (
        <div style={{marginTop:8,padding:"8px 14px",borderRadius:8,fontSize:12,background:"rgba(63,185,80,.08)",border:"1px solid rgba(63,185,80,.3)",color:"#7ee787",display:"flex",alignItems:"center",gap:8}}>
          ✅ โหลด Excel เดิมแล้ว <strong>{xlsRows.length}</strong> เครื่อง — จะ merge กับข้อมูลจาก PDF ใหม่
        </div>
      )}

      {/* Location + Date */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginTop:12}}>
        <div>
          <label style={{fontSize:12,color:"#8b949e",display:"block",marginBottom:5}}>📍 สถานที่</label>
          <input type="text" value={location} onChange={e=>setLocation(e.target.value)} placeholder="เช่น สำนักงานใหญ่" style={inp} />
        </div>
        <div>
          <label style={{fontSize:12,color:"#8b949e",display:"block",marginBottom:5}}>📅 วันที่</label>
          <input type="date" value={reportDate} onChange={e=>setReportDate(e.target.value)} style={{...inp,colorScheme:"dark"}} />
        </div>
      </div>

      {/* Buttons */}
      <div style={S.btnRow}>
        {status==="loading"
          ? <button onClick={handleStop} style={S.btn(true,"#dc2626")}>⏹ หยุด</button>
          : <button onClick={handleRead} disabled={!pdfFile} style={S.btn(!!pdfFile,"#38bdf8")}>🔍 อ่านข้อมูล PDF</button>
        }
        <button onClick={handleExport} disabled={!rows.length} style={S.btn(rows.length>0,"#166534")}>📊 Export Excel รวม</button>
      </div>

      {/* Progress */}
      {status==="loading" && (
        <div style={S.progWrap}>
          <div style={S.progLabel}><span>พบ {liveCount} เครื่อง</span><span>{pct}%</span></div>
          <div style={S.progBg}><div style={S.progFill(pct)}/></div>
          <div style={S.progMsg}>{msg}</div>
        </div>
      )}

      {errMsg  && <div style={S.alert("err")}>❌ {errMsg}</div>}
      {status==="done" && <div style={S.alert("ok")}>✅ {msg}</div>}
      {warnMsg && <div style={S.alert("warn")}>{warnMsg}</div>}

      {/* Stats */}
      {rows.length>0 && (
        <div style={S.stats}>
          {[
            {lbl:"เครื่องทั้งหมด", val:rows.length},
            {lbl:"A4 Print รวม",   val:fmt(totalA4)},
            {lbl:"A5 Print รวม",   val:totalA5.toLocaleString("en-US")},
            {lbl:"Grand Total รวม",val:fmt(totalGrand)},
          ].map(s=>(
            <div key={s.lbl} style={S.statCard}>
              <div style={S.statVal}>{s.val}</div>
              <div style={S.statLbl}>{s.lbl}</div>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      {rows.length>0 && (
        <div style={S.tWrap}>
          <div style={S.tHead}>
            <span style={{fontSize:14,fontWeight:700}}>
              ผลการอ่านข้อมูล
              {status==="loading" && <span style={{fontSize:11,color:"#38bdf8",marginLeft:8}}>● กำลังอ่าน...</span>}
            </span>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              {xlsRows.length>0 && <span style={{fontSize:11,color:"#3fb950",background:"rgba(63,185,80,.1)",padding:"2px 9px",borderRadius:5}}>📊 Excel + PDF</span>}
              <span style={S.tBadge}>{rows.length} เครื่อง</span>
            </div>
          </div>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead style={{background:"#0d1117"}}>
                <tr>
                  <th style={S.th(false)}>#</th>
                  <th style={S.th(false)}>Serial Number</th>
                  <th style={S.th(false)}>Model</th>
                  <th style={S.th(true)}>A4 Print</th>
                  <th style={S.th(true)}>A5 Print</th>
                  <th style={S.th(true)}>Grand Total (A4)</th>
                  <th style={S.th(false)}>แหล่ง</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r,i)=>(
                  <tr key={r.serial+i} style={{borderBottom:"1px solid #1c2128",background:r.fromExcel?"rgba(63,185,80,.03)":"transparent"}}>
                    <td style={S.td(false,"#8b949e")}>{i+1}</td>
                    <td style={{...S.td(false,"#7dd3fc"),fontWeight:600}}>{r.serial}</td>
                    <td style={{...S.td(false,"#8b949e"),fontFamily:"'Sarabun',sans-serif",fontSize:13}}>{r.model}</td>
                    <td style={{...S.td(true,r.printA4>0?"#60a5fa":"#4b5563"),fontWeight:r.printA4>0?700:400}}>{fmt(r.printA4)}</td>
                    <td style={{...S.td(true,r.printA5>0?"#fbbf24":"#4b5563"),fontWeight:r.printA5>0?700:400}}>{(r.printA5||0).toLocaleString("en-US")}</td>
                    <td style={{...S.td(true),fontWeight:700}}>{fmt(r.grandTotal)}</td>
                    <td style={{padding:"9px 12px"}}>
                      {r.fromExcel
                        ? <span style={{fontSize:11,color:"#3fb950",background:"rgba(63,185,80,.1)",padding:"2px 8px",borderRadius:5}}>Excel</span>
                        : <span style={{fontSize:11,color:"#38bdf8",background:"rgba(56,189,248,.1)",padding:"2px 8px",borderRadius:5}}>PDF</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={S.tfootRow}>
                  <td colSpan={3} style={{...S.td(true,"#8b949e"),fontSize:12}}>รวม</td>
                  <td style={{...S.td(true,"#60a5fa"),fontWeight:800}}>{fmt(totalA4)}</td>
                  <td style={{...S.td(true,"#fbbf24"),fontWeight:800}}>{totalA5.toLocaleString("en-US")}</td>
                  <td style={{...S.td(true,"#38bdf8"),fontWeight:800}}>{fmt(totalGrand)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
          {(location||reportDate) && (
            <div style={{padding:"10px 18px",borderTop:"1px solid #30363d",display:"flex",gap:24,fontSize:13,color:"#8b949e"}}>
              {location   && <span>📍 {location}</span>}
              {reportDate && <span>📅 {new Date(reportDate).toLocaleDateString("th-TH",{year:"numeric",month:"long",day:"numeric"})}</span>}
            </div>
          )}
        </div>
      )}

      <div style={{marginTop:32,textAlign:"center",fontSize:11,color:"#30363d"}}>
        TIS Printer Reader v3.2 · Excel + PDF Merge · English + Thai
      </div>

      </>}
    </div>
  );
}
