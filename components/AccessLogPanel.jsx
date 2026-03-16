"use client";
import { useState } from "react";
import { getLogs, clearLogs } from "../lib/auth";

function fmt(iso) {
  try {
    return new Date(iso).toLocaleString("th-TH", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  } catch { return iso; }
}

function exportCSV(logs) {
  const header = ["ลำดับ","ชื่อผู้ใช้","ชื่อ-นามสกุล","บทบาท","การกระทำ","สถานะ","เวลา"];
  const roleLabel   = { admin:"แอดมิน", operator:"เจ้าหน้าที่" };
  const actionLabel = { login:"เข้าระบบ", logout:"ออกระบบ" };
  const rows = logs.map((l, i) => [
    i + 1,
    l.username,
    l.name || "-",
    roleLabel[l.role] || l.role || "-",
    actionLabel[l.action] || l.action,
    l.success ? "สำเร็จ" : "ล้มเหลว",
    fmt(l.time),
  ]);
  const csv = "\uFEFF" + [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url;
  a.download = `access_log_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportExcel(logs) {
  // Build HTML table → Excel-compatible .xls
  const roleLabel   = { admin:"แอดมิน", operator:"เจ้าหน้าที่" };
  const actionLabel = { login:"เข้าระบบ", logout:"ออกระบบ" };
  const rows = logs.map((l, i) => `
    <tr>
      <td>${i+1}</td>
      <td>${l.username}</td>
      <td>${l.name||"-"}</td>
      <td>${roleLabel[l.role]||l.role||"-"}</td>
      <td>${actionLabel[l.action]||l.action}</td>
      <td>${l.success?"สำเร็จ":"ล้มเหลว"}</td>
      <td>${fmt(l.time)}</td>
    </tr>`).join("");
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
  <head><meta charset="UTF-8"/></head>
  <body><table>
    <tr style="background:#1E3A5F;color:white;font-weight:bold">
      <th>ลำดับ</th><th>ชื่อผู้ใช้</th><th>ชื่อ-นามสกุล</th><th>บทบาท</th><th>การกระทำ</th><th>สถานะ</th><th>เวลา</th>
    </tr>${rows}
  </table></body></html>`;
  const blob = new Blob(["\uFEFF"+html], { type:"application/vnd.ms-excel;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url;
  a.download = `access_log_${new Date().toISOString().slice(0,10)}.xls`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AccessLogPanel({ currentUser, onClose }) {
  const [logs,   setLogs]   = useState(getLogs());
  const [filter, setFilter] = useState("all");

  const isAdmin  = currentUser?.role === "admin";
  const filtered = logs.filter(l =>
    filter === "success" ? l.success : filter === "fail" ? !l.success : true
  );
  const total   = logs.length;
  const success = logs.filter(l => l.success).length;
  const fail    = total - success;

  const fBtn = (v, label) => (
    <button key={v} onClick={() => setFilter(v)} style={{
      padding: "5px 13px", fontSize: 12, borderRadius: 7, cursor: "pointer",
      fontFamily: "'Sarabun',sans-serif",
      border: filter===v ? "1px solid #38bdf8" : "1px solid #30363d",
      background: filter===v ? "rgba(56,189,248,.15)" : "#0d1117",
      color: filter===v ? "#38bdf8" : "#8b949e",
    }}>{label}</button>
  );

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000, fontFamily:"'Sarabun',sans-serif" }}>
      <div style={{ background:"#161b22", border:"1px solid #30363d", borderRadius:16, width:"100%", maxWidth:720, maxHeight:"88vh", display:"flex", flexDirection:"column", boxShadow:"0 16px 48px rgba(0,0,0,0.6)", margin:"0 16px" }}>

        {/* Header */}
        <div style={{ padding:"16px 24px", borderBottom:"1px solid #30363d", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div>
            <div style={{ fontSize:16, fontWeight:700, color:"#e6edf3" }}>📋 Access Log</div>
            <div style={{ fontSize:12, color:"#8b949e", marginTop:2 }}>บันทึกการเข้าใช้งานระบบ</div>
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:20, cursor:"pointer", color:"#8b949e" }}>✕</button>
        </div>

        {/* Stats */}
        <div style={{ display:"flex", gap:10, padding:"12px 24px", borderBottom:"1px solid #21262d" }}>
          {[
            { label:"ทั้งหมด", value:total,   color:"#38bdf8", bg:"rgba(56,189,248,.08)" },
            { label:"สำเร็จ",  value:success, color:"#3fb950", bg:"rgba(63,185,80,.08)"  },
            { label:"ล้มเหลว", value:fail,    color:"#f85149", bg:"rgba(248,81,73,.08)"  },
          ].map(s => (
            <div key={s.label} style={{ background:s.bg, borderRadius:10, padding:"10px 18px", flex:1, textAlign:"center", border:`1px solid ${s.color}33` }}>
              <div style={{ fontSize:22, fontWeight:800, color:s.color, fontFamily:"monospace" }}>{s.value}</div>
              <div style={{ fontSize:11, color:"#8b949e", marginTop:2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Filter + Actions */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 24px", borderBottom:"1px solid #21262d", gap:8, flexWrap:"wrap" }}>
          <div style={{ display:"flex", gap:6 }}>
            {fBtn("all","ทั้งหมด")}{fBtn("success","สำเร็จ")}{fBtn("fail","ล้มเหลว")}
          </div>
          <div style={{ display:"flex", gap:6 }}>
            {/* Export CSV */}
            <button onClick={()=>exportCSV(filtered)} disabled={filtered.length===0} style={{
              padding:"5px 13px", fontSize:12, borderRadius:7, cursor:filtered.length===0?"not-allowed":"pointer",
              border:"1px solid #30363d", background:"#0d1117", color:filtered.length===0?"#4b5563":"#8b949e",
              fontFamily:"'Sarabun',sans-serif",
            }}>⬇ CSV</button>
            {/* Export Excel */}
            <button onClick={()=>exportExcel(filtered)} disabled={filtered.length===0} style={{
              padding:"5px 13px", fontSize:12, borderRadius:7, cursor:filtered.length===0?"not-allowed":"pointer",
              border:"1px solid rgba(56,189,248,.4)", background:"rgba(56,189,248,.08)", color:filtered.length===0?"#4b5563":"#38bdf8",
              fontFamily:"'Sarabun',sans-serif",
            }}>⬇ Excel</button>
            {/* Clear (admin only) */}
            {isAdmin && (
              <button onClick={()=>{ if(confirm("ล้าง Log ทั้งหมด?")){ clearLogs(); setLogs([]); } }} style={{
                padding:"5px 13px", fontSize:12, borderRadius:7, cursor:"pointer",
                border:"1px solid rgba(248,81,73,.4)", background:"rgba(248,81,73,.08)",
                color:"#f85149", fontFamily:"'Sarabun',sans-serif",
              }}>🗑 ล้าง Log</button>
            )}
          </div>
        </div>

        {/* Table */}
        <div style={{ overflowY:"auto", flex:1 }}>
          {filtered.length===0 ? (
            <div style={{ padding:40, textAlign:"center", color:"#4b5563", fontSize:14 }}>ไม่มีบันทึก</div>
          ) : (
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
              <thead>
                <tr style={{ background:"#0d1117" }}>
                  {["ผู้ใช้","บทบาท","การกระทำ","สถานะ","เวลา"].map(h=>(
                    <th key={h} style={{ padding:"9px 16px", textAlign:"left", fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:".5px", color:"#8b949e", borderBottom:"1px solid #30363d", whiteSpace:"nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((log,i)=>(
                  <tr key={log.id??i} style={{ borderBottom:"1px solid #1c2128", background:log.success?"transparent":"rgba(248,81,73,.03)" }}>
                    <td style={{ padding:"9px 16px", color:"#e6edf3", fontWeight:500 }}>
                      {log.name||log.username}
                      <span style={{ color:"#4b5563", fontSize:11, marginLeft:6 }}>({log.username})</span>
                    </td>
                    <td style={{ padding:"9px 16px", color:"#8b949e" }}>
                      {{admin:"แอดมิน",operator:"เจ้าหน้าที่"}[log.role]||log.role||"-"}
                    </td>
                    <td style={{ padding:"9px 16px", color:"#c9d1d9" }}>
                      {{login:"เข้าระบบ",logout:"ออกระบบ"}[log.action]||log.action}
                    </td>
                    <td style={{ padding:"9px 16px" }}>
                      {log.success
                        ? <span style={{ color:"#3fb950", background:"rgba(63,185,80,.1)", padding:"2px 9px", borderRadius:5, fontSize:12 }}>✓ สำเร็จ</span>
                        : <span style={{ color:"#f85149", background:"rgba(248,81,73,.1)", padding:"2px 9px", borderRadius:5, fontSize:12 }}>✗ ล้มเหลว</span>
                      }
                    </td>
                    <td style={{ padding:"9px 16px", color:"#4b5563", fontSize:12, whiteSpace:"nowrap", fontFamily:"monospace" }}>{fmt(log.time)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
