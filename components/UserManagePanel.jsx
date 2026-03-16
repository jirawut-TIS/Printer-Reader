"use client";
import { useState } from "react";
import { getUsers, addUser, updateUser, deleteUser } from "../lib/auth";

const inp = {
  width:"100%", padding:"8px 11px", borderRadius:7, fontSize:13,
  background:"#0d1117", border:"1px solid #30363d", color:"#e6edf3",
  outline:"none", fontFamily:"'Sarabun',sans-serif", boxSizing:"border-box",
};

export default function UserManagePanel({ currentUser, onClose }) {
  const [users,      setUsers]      = useState(getUsers());
  const [editUser,   setEditUser]   = useState(null);
  const [showAdd,    setShowAdd]    = useState(false);
  const [newUser,    setNewUser]    = useState({ username:"", name:"", role:"operator", password:"" });
  const [errMsg,     setErrMsg]     = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  function refresh() { setUsers(getUsers()); }

  function flash(msg, isErr=false) {
    if (isErr) { setErrMsg(msg); setTimeout(()=>setErrMsg(""),3000); }
    else { setSuccessMsg(msg); setTimeout(()=>setSuccessMsg(""),3000); }
  }

  function handleAdd() {
    if (!newUser.username.trim()||!newUser.password.trim()||!newUser.name.trim())
      return flash("กรุณากรอกข้อมูลให้ครบ", true);
    const r = addUser({...newUser, username:newUser.username.trim()});
    if (!r.ok) return flash(r.error, true);
    flash("เพิ่มผู้ใช้สำเร็จ");
    setNewUser({username:"",name:"",role:"operator",password:""});
    setShowAdd(false); refresh();
  }

  function handleSaveEdit() {
    if (!editUser.name.trim()||!editUser.password.trim())
      return flash("กรุณากรอกข้อมูลให้ครบ", true);
    updateUser(editUser.username, {name:editUser.name, role:editUser.role, password:editUser.password});
    flash("บันทึกสำเร็จ"); setEditUser(null); refresh();
  }

  function handleDelete(username) {
    if (username === currentUser?.username) return flash("ไม่สามารถลบบัญชีตัวเองได้", true);
    if (!confirm(`ลบผู้ใช้ "${username}" หรือไม่?`)) return;
    deleteUser(username); flash("ลบผู้ใช้สำเร็จ"); refresh();
  }

  const sel = {...inp, cursor:"pointer"};

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1001, fontFamily:"'Sarabun',sans-serif" }}>
      <div style={{ background:"#161b22", border:"1px solid #30363d", borderRadius:16, width:"100%", maxWidth:660, maxHeight:"88vh", display:"flex", flexDirection:"column", boxShadow:"0 16px 48px rgba(0,0,0,0.6)", margin:"0 16px" }}>

        {/* Header */}
        <div style={{ padding:"16px 24px", borderBottom:"1px solid #30363d", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div>
            <div style={{ fontSize:16, fontWeight:700, color:"#e6edf3" }}>👤 จัดการผู้ใช้งาน</div>
            <div style={{ fontSize:12, color:"#8b949e", marginTop:2 }}>เพิ่ม / แก้ไข / ลบ บัญชีผู้ใช้</div>
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:20, cursor:"pointer", color:"#8b949e" }}>✕</button>
        </div>

        {/* Flash messages */}
        {errMsg     && <div style={{ margin:"10px 24px 0", padding:"9px 14px", borderRadius:8, fontSize:13, background:"rgba(248,81,73,.1)", border:"1px solid #f85149", color:"#fca5a5" }}>⚠️ {errMsg}</div>}
        {successMsg && <div style={{ margin:"10px 24px 0", padding:"9px 14px", borderRadius:8, fontSize:13, background:"rgba(63,185,80,.1)", border:"1px solid #3fb950", color:"#7ee787" }}>✓ {successMsg}</div>}

        {/* Table */}
        <div style={{ overflowY:"auto", flex:1, padding:"12px 24px" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
            <thead>
              <tr style={{ background:"#0d1117" }}>
                {["ชื่อผู้ใช้","ชื่อ-นามสกุล","บทบาท","จัดการ"].map(h=>(
                  <th key={h} style={{ padding:"9px 12px", textAlign:"left", fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:".5px", color:"#8b949e", borderBottom:"1px solid #30363d" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map(u=>(
                <tr key={u.username} style={{ borderBottom:"1px solid #1c2128" }}>
                  {editUser?.username===u.username ? (
                    <>
                      <td style={{ padding:"8px 12px", color:"#7dd3fc", fontWeight:600 }}>{u.username}</td>
                      <td style={{ padding:"6px 8px" }}><input value={editUser.name} onChange={e=>setEditUser({...editUser,name:e.target.value})} style={inp} /></td>
                      <td style={{ padding:"6px 8px" }}>
                        <select value={editUser.role} onChange={e=>setEditUser({...editUser,role:e.target.value})} style={sel}>
                          <option value="admin">แอดมิน</option>
                          <option value="operator">เจ้าหน้าที่</option>
                        </select>
                      </td>
                      <td style={{ padding:"6px 8px" }}>
                        <input type="password" value={editUser.password} onChange={e=>setEditUser({...editUser,password:e.target.value})} placeholder="รหัสผ่านใหม่" style={{...inp,marginBottom:6}} />
                        <div style={{ display:"flex", gap:6 }}>
                          <button onClick={handleSaveEdit} style={{ flex:1, padding:"6px 0", borderRadius:7, border:"none", background:"#38bdf8", color:"#0d1117", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"'Sarabun',sans-serif" }}>บันทึก</button>
                          <button onClick={()=>setEditUser(null)} style={{ flex:1, padding:"6px 0", borderRadius:7, border:"1px solid #30363d", background:"transparent", color:"#8b949e", fontSize:12, cursor:"pointer", fontFamily:"'Sarabun',sans-serif" }}>ยกเลิก</button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td style={{ padding:"10px 12px", color:"#7dd3fc", fontWeight:600 }}>{u.username}</td>
                      <td style={{ padding:"10px 12px", color:"#e6edf3" }}>{u.name}</td>
                      <td style={{ padding:"10px 12px" }}>
                        <span style={{ fontSize:11, padding:"2px 9px", borderRadius:20, fontWeight:600, background:u.role==="admin"?"rgba(56,189,248,.15)":"rgba(99,102,241,.15)", color:u.role==="admin"?"#38bdf8":"#a5b4fc", border:`1px solid ${u.role==="admin"?"#38bdf833":"#6366f133"}` }}>
                          {u.role==="admin"?"แอดมิน":"เจ้าหน้าที่"}
                        </span>
                      </td>
                      <td style={{ padding:"10px 12px" }}>
                        <div style={{ display:"flex", gap:6 }}>
                          <button onClick={()=>{setEditUser({...u});setShowAdd(false);}} style={{ padding:"5px 12px", borderRadius:7, border:"1px solid #30363d", background:"#0d1117", color:"#8b949e", fontSize:12, cursor:"pointer", fontFamily:"'Sarabun',sans-serif" }}>✏️ แก้ไข</button>
                          {u.username!==currentUser?.username && (
                            <button onClick={()=>handleDelete(u.username)} style={{ padding:"5px 12px", borderRadius:7, border:"1px solid rgba(248,81,73,.4)", background:"rgba(248,81,73,.08)", color:"#f85149", fontSize:12, cursor:"pointer", fontFamily:"'Sarabun',sans-serif" }}>🗑</button>
                          )}
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          {/* Add form */}
          {showAdd && (
            <div style={{ marginTop:16, padding:16, background:"#0d1117", borderRadius:10, border:"1px solid #30363d" }}>
              <div style={{ fontSize:13, fontWeight:600, color:"#e6edf3", marginBottom:12 }}>➕ เพิ่มผู้ใช้ใหม่</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12 }}>
                <div>
                  <label style={{ fontSize:11, color:"#8b949e", display:"block", marginBottom:4 }}>ชื่อผู้ใช้ (username)</label>
                  <input value={newUser.username} onChange={e=>setNewUser({...newUser,username:e.target.value})} placeholder="เช่น somchai" style={inp} />
                </div>
                <div>
                  <label style={{ fontSize:11, color:"#8b949e", display:"block", marginBottom:4 }}>ชื่อ-นามสกุล</label>
                  <input value={newUser.name} onChange={e=>setNewUser({...newUser,name:e.target.value})} placeholder="เช่น สมชาย ใจดี" style={inp} />
                </div>
                <div>
                  <label style={{ fontSize:11, color:"#8b949e", display:"block", marginBottom:4 }}>รหัสผ่าน</label>
                  <input type="password" value={newUser.password} onChange={e=>setNewUser({...newUser,password:e.target.value})} placeholder="ตั้งรหัสผ่าน" style={inp} />
                </div>
                <div>
                  <label style={{ fontSize:11, color:"#8b949e", display:"block", marginBottom:4 }}>บทบาท</label>
                  <select value={newUser.role} onChange={e=>setNewUser({...newUser,role:e.target.value})} style={sel}>
                    <option value="operator">เจ้าหน้าที่</option>
                    <option value="admin">แอดมิน</option>
                  </select>
                </div>
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <button onClick={handleAdd} style={{ padding:"8px 20px", borderRadius:8, border:"none", background:"linear-gradient(135deg,#38bdf8,#6366f1)", color:"#0d1117", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"'Sarabun',sans-serif" }}>เพิ่มผู้ใช้</button>
                <button onClick={()=>{setShowAdd(false);setNewUser({username:"",name:"",role:"operator",password:""}); }} style={{ padding:"8px 20px", borderRadius:8, border:"1px solid #30363d", background:"transparent", color:"#8b949e", fontSize:13, cursor:"pointer", fontFamily:"'Sarabun',sans-serif" }}>ยกเลิก</button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding:"12px 24px", borderTop:"1px solid #30363d" }}>
          {!showAdd && !editUser && (
            <button onClick={()=>{setShowAdd(true);setEditUser(null);}} style={{ padding:"8px 20px", borderRadius:8, border:"none", background:"linear-gradient(135deg,#38bdf8,#6366f1)", color:"#0d1117", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"'Sarabun',sans-serif" }}>
              ➕ เพิ่มผู้ใช้ใหม่
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
