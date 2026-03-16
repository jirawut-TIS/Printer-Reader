"use client";
// components/TopBar.jsx
import { useState } from "react";
import { logout } from "../lib/auth";
import AccessLogPanel from "./AccessLogPanel";

const ROLE_LABEL = { admin: "แอดมิน", operator: "เจ้าหน้าที่" };
const ROLE_COLOR  = { admin: { bg: "#eef2f8", text: "#1E3A5F" }, operator: { bg: "#edf7f2", text: "#0B6E4F" } };

export default function TopBar({ session, onLogout }) {
  const [showLog, setShowLog] = useState(false);
  const role = session?.role || "operator";
  const rc   = ROLE_COLOR[role] || ROLE_COLOR.operator;

  function handleLogout() {
    logout(session);
    onLogout();
  }

  return (
    <>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 24px", background: "#fff", borderBottom: "1px solid #eee",
        fontFamily: "'Sarabun', sans-serif", position: "sticky", top: 0, zIndex: 100,
      }}>
        {/* Left: App title */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 20 }}>🖨️</span>
          <span style={{ fontSize: 16, fontWeight: 600, color: "#1E3A5F" }}>
            Printer Usage Reader
          </span>
        </div>

        {/* Right: user info + actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Avatar */}
          <div style={{
            width: 34, height: 34, borderRadius: "50%", background: rc.bg,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 13, fontWeight: 600, color: rc.text,
          }}>
            {session?.name?.slice(0,2) || "??"}
          </div>

          {/* Name + role */}
          <div style={{ lineHeight: 1.3 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#222" }}>{session?.name}</div>
            <div style={{ fontSize: 11 }}>
              <span style={{
                background: rc.bg, color: rc.text, padding: "1px 7px",
                borderRadius: 5, fontSize: 11, fontWeight: 500,
              }}>
                {ROLE_LABEL[role] || role}
              </span>
            </div>
          </div>

          {/* Log button */}
          <button onClick={() => setShowLog(true)} style={{
            padding: "6px 13px", fontSize: 12, borderRadius: 8,
            border: "1px solid #ddd", background: "#f8f8f4",
            cursor: "pointer", fontFamily: "'Sarabun', sans-serif", color: "#444",
          }}>
            📋 Access Log
          </button>

          {/* Logout */}
          <button onClick={handleLogout} style={{
            padding: "6px 13px", fontSize: 12, borderRadius: 8,
            border: "1px solid #fcc", background: "#fff5f5",
            cursor: "pointer", fontFamily: "'Sarabun', sans-serif", color: "#c0392b",
          }}>
            ออกจากระบบ
          </button>
        </div>
      </div>

      {showLog && (
        <AccessLogPanel currentUser={session} onClose={() => setShowLog(false)} />
      )}
    </>
  );
}
