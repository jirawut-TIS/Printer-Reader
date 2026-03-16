"use client";
// components/LoginPage.jsx
import { useState } from "react";
import { login } from "../lib/auth";

export default function LoginPage({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    await new Promise(r => setTimeout(r, 300)); // small UX delay
    const result = login(username.trim(), password);
    setLoading(false);
    if (result.ok) {
      onLogin(result.session);
    } else {
      setError("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
    }
  }

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "#f5f5f0", fontFamily: "'Sarabun', sans-serif",
    }}>
      <div style={{
        background: "#fff", borderRadius: 16, padding: "40px 36px",
        width: "100%", maxWidth: 380, boxShadow: "0 2px 24px rgba(0,0,0,0.07)",
        border: "0.5px solid #e0e0d8",
      }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{
            width: 52, height: 52, background: "#1E3A5F", borderRadius: 14,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            fontSize: 26, marginBottom: 14,
          }}>🖨️</div>
          <div style={{ fontSize: 20, fontWeight: 600, color: "#1E3A5F" }}>Printer Usage Reader</div>
          <div style={{ fontSize: 13, color: "#888", marginTop: 4 }}>กรุณาเข้าสู่ระบบเพื่อดำเนินการ</div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ fontSize: 13, color: "#555", display: "block", marginBottom: 5, fontWeight: 500 }}>
              ชื่อผู้ใช้
            </label>
            <input
              type="text" value={username} onChange={e => setUsername(e.target.value)}
              placeholder="กรอกชื่อผู้ใช้" required autoFocus
              style={{
                width: "100%", padding: "10px 13px", border: "1px solid #ddd",
                borderRadius: 9, fontSize: 14, outline: "none", boxSizing: "border-box",
                fontFamily: "'Sarabun', sans-serif",
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: 13, color: "#555", display: "block", marginBottom: 5, fontWeight: 500 }}>
              รหัสผ่าน
            </label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="กรอกรหัสผ่าน" required
              style={{
                width: "100%", padding: "10px 13px", border: "1px solid #ddd",
                borderRadius: 9, fontSize: 14, outline: "none", boxSizing: "border-box",
                fontFamily: "'Sarabun', sans-serif",
              }}
            />
          </div>

          {error && (
            <div style={{
              background: "#fff5f5", border: "1px solid #fcc", borderRadius: 8,
              padding: "9px 12px", fontSize: 13, color: "#c0392b",
            }}>
              ⚠️ {error}
            </div>
          )}

          <button type="submit" disabled={loading} style={{
            background: loading ? "#aaa" : "#1E3A5F",
            color: "#fff", border: "none", padding: "11px 0",
            borderRadius: 9, fontSize: 15, fontWeight: 600,
            cursor: loading ? "not-allowed" : "pointer",
            fontFamily: "'Sarabun', sans-serif", marginTop: 4,
            transition: "background 0.15s",
          }}>
            {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
          </button>
        </form>

        {/* Demo hint */}
        <div style={{
          marginTop: 20, padding: "10px 12px", background: "#f8f8f4",
          borderRadius: 8, fontSize: 12, color: "#888", lineHeight: 1.8,
        }}>
          <strong style={{ color: "#555" }}>บัญชีทดสอบ</strong><br/>
          admin / admin123<br/>
          printer1 / op1234<br/>
          printer2 / op5678
        </div>
      </div>
    </div>
  );
}
