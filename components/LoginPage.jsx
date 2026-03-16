"use client";
import { useState } from "react";
import { login } from "../lib/auth";

export default function LoginPage({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(""); setLoading(true);
    await new Promise(r => setTimeout(r, 280));
    const result = login(username.trim(), password);
    setLoading(false);
    if (result.ok) { onLogin(result.session); }
    else { setError("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง"); }
  }

  const inp = {
    width: "100%", padding: "10px 14px", borderRadius: 8, fontSize: 14,
    background: "#0d1117", border: "1px solid #30363d", color: "#e6edf3",
    outline: "none", fontFamily: "'Sarabun',sans-serif", boxSizing: "border-box",
  };

  return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#0d1117", fontFamily:"'Sarabun',sans-serif" }}>
      <div style={{ background:"#161b22", border:"1px solid #30363d", borderRadius:16, padding:"40px 36px", width:"100%", maxWidth:380, boxShadow:"0 8px 32px rgba(0,0,0,0.5)" }}>

        <div style={{ textAlign:"center", marginBottom:28 }}>
          <img src="/logo.png" alt="TIS" style={{ height:56, width:"auto", objectFit:"contain", marginBottom:16 }} />
          <div style={{ fontSize:20, fontWeight:700, color:"#e6edf3" }}>TIS Printer Reader</div>
          <div style={{ fontSize:13, color:"#8b949e", marginTop:4 }}>กรุณาเข้าสู่ระบบเพื่อดำเนินการ</div>
        </div>

        <form onSubmit={handleSubmit} style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <div>
            <label style={{ fontSize:12, color:"#8b949e", display:"block", marginBottom:5 }}>ชื่อผู้ใช้</label>
            <input type="text" value={username} onChange={e=>setUsername(e.target.value)} placeholder="กรอกชื่อผู้ใช้" required autoFocus style={inp} />
          </div>
          <div>
            <label style={{ fontSize:12, color:"#8b949e", display:"block", marginBottom:5 }}>รหัสผ่าน</label>
            <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="กรอกรหัสผ่าน" required style={inp} />
          </div>
          {error && (
            <div style={{ padding:"10px 14px", borderRadius:8, fontSize:13, background:"rgba(248,81,73,.1)", border:"1px solid #f85149", color:"#fca5a5" }}>⚠️ {error}</div>
          )}
          <button type="submit" disabled={loading} style={{ padding:"12px 0", border:"none", borderRadius:9, fontSize:15, fontWeight:700, cursor:loading?"not-allowed":"pointer", marginTop:4, background:loading?"#1e293b":"linear-gradient(135deg,#38bdf8,#6366f1)", color:loading?"#4b5563":"#0d1117", fontFamily:"'Sarabun',sans-serif" }}>
            {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
          </button>
        </form>

      </div>
    </div>
  );
}
