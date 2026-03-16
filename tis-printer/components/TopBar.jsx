"use client";
import { useState } from "react";
import { logout } from "../lib/auth";
import AccessLogPanel from "./AccessLogPanel";

export default function TopBar({ session, onLogout }) {
  const [showLog, setShowLog] = useState(false);
  const role = session?.role || "operator";

  return (
    <>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 24px", background: "#161b22", borderBottom: "1px solid #30363d",
        fontFamily: "'Sarabun',sans-serif", position: "sticky", top: 0, zIndex: 100,
      }}>
        {/* Left: TIS Logo + app title */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img
            src="/logo.png"
            alt="TIS Logo"
            style={{ height: 38, width: "auto", objectFit: "contain" }}
          />
          <div style={{ width: "1px", height: 32, background: "#30363d" }} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#e6edf3" }}>TIS Printer Reader</div>
            <div style={{ fontSize: 11, color: "#8b949e" }}>HP LaserJet · AI Vision</div>
          </div>
        </div>

        {/* Right: user + buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{
            fontSize: 11, padding: "2px 9px", borderRadius: 20, fontWeight: 600,
            background: role === "admin" ? "rgba(56,189,248,.15)" : "rgba(99,102,241,.15)",
            color: role === "admin" ? "#38bdf8" : "#a5b4fc",
            border: `1px solid ${role === "admin" ? "#38bdf833" : "#6366f133"}`,
          }}>
            {role === "admin" ? "แอดมิน" : "เจ้าหน้าที่"}
          </span>

          <span style={{ fontSize: 14, color: "#c9d1d9", fontWeight: 500 }}>{session?.name}</span>

          <button onClick={() => setShowLog(true)} style={{
            padding: "6px 13px", fontSize: 12, borderRadius: 8,
            border: "1px solid #30363d", background: "#0d1117",
            cursor: "pointer", fontFamily: "'Sarabun',sans-serif", color: "#8b949e",
          }}>📋 Access Log</button>

          <button onClick={() => { logout(session); onLogout(); }} style={{
            padding: "6px 13px", fontSize: 12, borderRadius: 8,
            border: "1px solid rgba(248,81,73,.4)", background: "rgba(248,81,73,.08)",
            cursor: "pointer", fontFamily: "'Sarabun',sans-serif", color: "#f85149",
          }}>ออกจากระบบ</button>
        </div>
      </div>

      {showLog && <AccessLogPanel currentUser={session} onClose={() => setShowLog(false)} />}
    </>
  );
}
