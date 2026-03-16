"use client";
/**
 * app/page.jsx  — Printer Usage Reader with Auth
 *
 * วิธีเชื่อม:
 *  1. เปลี่ยนชื่อ page.jsx เดิมเป็น PrinterApp.jsx (แล้ว export default เป็น PrinterApp)
 *  2. ใช้ไฟล์นี้เป็น page.jsx แทน
 *  3. ระบบจะแสดง LoginPage ก่อน — เมื่อ login สำเร็จจึงแสดง PrinterApp
 */

import { useState, useEffect } from "react";
import { getSession, logout } from "../lib/auth";
import LoginPage  from "../components/LoginPage";
import TopBar     from "../components/TopBar";
import PrinterApp from "./PrinterApp"; // <-- โปรแกรมเดิมของคุณ

export default function Page() {
  const [session, setSession] = useState(null);
  const [ready,   setReady]   = useState(false);

  // Restore session on mount (SSR-safe)
  useEffect(() => {
    setSession(getSession());
    setReady(true);
  }, []);

  if (!ready) return null; // avoid hydration mismatch

  if (!session) {
    return <LoginPage onLogin={sess => setSession(sess)} />;
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f5f5f0" }}>
      <TopBar
        session={session}
        onLogout={() => setSession(null)}
      />
      {/* โปรแกรมเดิมอยู่ตรงนี้ ไม่ต้องแก้อะไรใน PrinterApp เลย */}
      <PrinterApp />
    </div>
  );
}
