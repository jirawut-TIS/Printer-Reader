"use client";
import { useState, useEffect } from "react";
import { getSession } from "../lib/auth";
import LoginPage  from "../components/LoginPage";
import TopBar     from "../components/TopBar";
import PrinterApp from "./PrinterApp";

export default function Page() {
  const [session, setSession] = useState(null);
  const [ready,   setReady]   = useState(false);

  useEffect(() => {
    setSession(getSession());
    setReady(true);
  }, []);

  if (!ready) return null;

  if (!session) {
    return <LoginPage onLogin={sess => setSession(sess)} />;
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0d1117", color: "#e6edf3", fontFamily: "'Sarabun',sans-serif" }}>
      <TopBar session={session} onLogout={() => setSession(null)} />
      <PrinterApp />
    </div>
  );
}
