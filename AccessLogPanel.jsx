"use client";
// components/AccessLogPanel.jsx
import { useState } from "react";
import { getLogs, clearLogs } from "../lib/auth";

const ACTION_LABEL = { login: "เข้าระบบ", logout: "ออกระบบ" };
const ROLE_LABEL   = { admin: "แอดมิน", operator: "เจ้าหน้าที่" };

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleString("th-TH", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  } catch { return iso; }
}

export default function AccessLogPanel({ currentUser, onClose }) {
  const [logs, setLogs] = useState(getLogs());
  const [filter, setFilter] = useState("all"); // all | success | fail

  const isAdmin = currentUser?.role === "admin";

  const filtered = logs.filter(l => {
    if (filter === "success") return l.success;
    if (filter === "fail")    return !l.success;
    return true;
  });

  function handleClear() {
    if (confirm("ล้าง Log ทั้งหมดหรือไม่?")) {
      clearLogs();
      setLogs([]);
    }
  }

  const total   = logs.length;
  const success = logs.filter(l => l.success).length;
  const fail    = total - success;

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000, fontFamily: "'Sarabun', sans-serif",
    }}>
      <div style={{
        background: "#fff", borderRadius: 16, width: "100%", maxWidth: 700,
        maxHeight: "88vh", display: "flex", flexDirection: "column",
        boxShadow: "0 8px 40px rgba(0,0,0,0.15)",
        margin: "0 16px",
      }}>
        {/* Header */}
        <div style={{
          padding: "18px 24px", borderBottom: "1px solid #eee",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 600, color: "#1E3A5F" }}>📋 Access Log</div>
            <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>บันทึกการเข้าใช้งานระบบ</div>
          </div>
          <button onClick={onClose} style={{
            background: "none", border: "none", fontSize: 20,
            cursor: "pointer", color: "#aaa", padding: "4px 8px",
          }}>✕</button>
        </div>

        {/* Stats */}
        <div style={{ display: "flex", gap: 12, padding: "14px 24px", borderBottom: "1px solid #f0f0e8" }}>
          {[
            { label: "ทั้งหมด", value: total, color: "#1E3A5F", bg: "#eef2f8" },
            { label: "สำเร็จ",  value: success, color: "#0B6E4F", bg: "#edf7f2" },
            { label: "ล้มเหลว", value: fail,    color: "#c0392b", bg: "#fff5f5" },
          ].map(s => (
            <div key={s.label} style={{
              background: s.bg, borderRadius: 10, padding: "10px 16px", flex: 1, textAlign: "center",
            }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 12, color: "#888" }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Filter + Clear */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 24px", borderBottom: "1px solid #f0f0e8", gap: 10,
        }}>
          <div style={{ display: "flex", gap: 6 }}>
            {[["all","ทั้งหมด"],["success","สำเร็จ"],["fail","ล้มเหลว"]].map(([v, label]) => (
              <button key={v} onClick={() => setFilter(v)} style={{
                padding: "5px 13px", fontSize: 12, borderRadius: 7, cursor: "pointer",
                border: filter === v ? "1px solid #1E3A5F" : "1px solid #ddd",
                background: filter === v ? "#1E3A5F" : "#fff",
                color: filter === v ? "#fff" : "#555",
                fontFamily: "'Sarabun', sans-serif",
              }}>{label}</button>
            ))}
          </div>
          {isAdmin && (
            <button onClick={handleClear} style={{
              padding: "5px 13px", fontSize: 12, borderRadius: 7, cursor: "pointer",
              border: "1px solid #fcc", background: "#fff5f5", color: "#c0392b",
              fontFamily: "'Sarabun', sans-serif",
            }}>🗑 ล้าง Log</button>
          )}
        </div>

        {/* Log List */}
        <div style={{ overflowY: "auto", flex: 1 }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "#bbb", fontSize: 14 }}>
              ไม่มีบันทึก
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f8f8f4", borderBottom: "1px solid #eee" }}>
                  {["ผู้ใช้","บทบาท","การกระทำ","สถานะ","เวลา"].map(h => (
                    <th key={h} style={{
                      padding: "9px 16px", textAlign: "left", fontWeight: 600,
                      color: "#555", fontSize: 12, whiteSpace: "nowrap",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((log, i) => (
                  <tr key={log.id ?? i} style={{
                    borderBottom: "1px solid #f5f5f0",
                    background: log.success ? "transparent" : "#fff9f9",
                  }}>
                    <td style={{ padding: "9px 16px", color: "#222", fontWeight: 500 }}>
                      {log.name || log.username}
                      <span style={{ color: "#aaa", fontSize: 11, marginLeft: 5 }}>
                        ({log.username})
                      </span>
                    </td>
                    <td style={{ padding: "9px 16px", color: "#666" }}>
                      {ROLE_LABEL[log.role] || log.role || "-"}
                    </td>
                    <td style={{ padding: "9px 16px", color: "#444" }}>
                      {ACTION_LABEL[log.action] || log.action}
                    </td>
                    <td style={{ padding: "9px 16px" }}>
                      {log.success
                        ? <span style={{ color: "#0B6E4F", background: "#edf7f2", padding: "2px 8px", borderRadius: 5, fontSize: 12 }}>✓ สำเร็จ</span>
                        : <span style={{ color: "#c0392b", background: "#fff5f5", padding: "2px 8px", borderRadius: 5, fontSize: 12 }}>✗ ล้มเหลว</span>
                      }
                    </td>
                    <td style={{ padding: "9px 16px", color: "#888", whiteSpace: "nowrap", fontSize: 12 }}>
                      {formatTime(log.time)}
                    </td>
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
