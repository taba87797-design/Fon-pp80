
"use strict";
const $ = id => document.getElementById(id);
let items = [], editing = null, busy = false, ready = false, toastTimer;
let currentDay = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Bangkok" }).format(new Date());
const legacy = (() => { try { const data = JSON.parse(localStorage.getItem("myHomework") || "[]"); return Array.isArray(data) ? data : []; } catch { return []; } })();
$("legacyPanel").hidden = !legacy.length;
function notify(message) {
  clearTimeout(toastTimer); $("toast").textContent = message; $("toast").hidden = false;
  toastTimer = setTimeout(() => { $("toast").hidden = true; }, 6000);
}
let authMode = null, identity = null, identityFailed = false;
function identityError() {
  identityFailed = true; ready = false;
  items = []; render(); updateOverview();
  return new Error("ตัวตนสมุดหาย เปลี่ยน หรือพื้นที่จัดเก็บใช้ไม่ได้ หยุดใช้งานเพื่อไม่เปิดสมุดใหม่ทับ กรุณาตรวจการตั้งค่าเบราว์เซอร์");
}
function canonicalIdentity(initialize = false) {
  return new Promise((resolve, reject) => {
    if (identityFailed || !globalThis.indexedDB) return reject(identityError());
    let request;
    try { request = indexedDB.open("homework-p01-identity", 1); }
    catch { return reject(identityError()); }
    request.onupgradeneeded = () => request.result.createObjectStore("identity");
    request.onerror = request.onblocked = () => reject(identityError());
    request.onsuccess = () => {
      const db = request.result;
      if (identityFailed) { db.close(); reject(identityError()); return; }
      db.onversionchange = () => { db.close(); identityError(); };
      let transaction, value;
      try {
        // A readwrite transaction serializes first-open tabs, even on insecure HTTP.
        transaction = db.transaction("identity", initialize ? "readwrite" : "readonly");
        const store = transaction.objectStore("identity");
        const marker = store.get("initialized");
        marker.onsuccess = () => {
          const read = store.get("canonical");
          read.onsuccess = () => {
            const record = read.result;
            if (record === undefined && marker.result === undefined && initialize && identity === null) {
              const bytes = new Uint8Array(32);
              try { globalThis.crypto.getRandomValues(bytes); }
              catch { transaction.abort(); return; }
              value = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
              store.add({ version: 1, token: value }, "canonical");
              store.add(true, "initialized");
            } else if (marker.result === true && record && record.version === 1 && typeof record.token === "string" && /^[a-f0-9]{64}$/.test(record.token) && (identity === null || identity === record.token)) {
              value = record.token;
            } else { transaction.abort(); }
          };
        };
        transaction.oncomplete = () => { db.close(); resolve(value); };
        transaction.onabort = transaction.onerror = () => { db.close(); reject(identityError()); };
      } catch { db.close(); reject(identityError()); }
    };
  });
}
async function api(url, method = "GET", body, blob = false, modeOnly = false) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const headers = method === "GET" ? {} : { "Content-Type": "application/json" };
    if (modeOnly) headers["X-Session-Mode"] = "only";
    else if (authMode === "bearer") {
      if (!identity || identityFailed || await canonicalIdentity() !== identity) throw identityError();
      headers.Authorization = "Bearer " + identity;
    } else if (authMode !== "cookie") throw new Error("ยังไม่ได้ตรวจโหมดตัวตน");
    const response = await fetch(url, { method, signal: controller.signal, credentials: modeOnly || authMode === "bearer" ? "omit" : "same-origin", redirect: "error", headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    if (blob && response.ok) return response.blob();
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.message || "ไม่สามารถดำเนินการได้");
    return result;
  } catch (error) {
    if (error.name === "AbortError" || error instanceof TypeError) throw new Error("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาโหลดใหม่เพื่อตรวจผลก่อนลองซ้ำ");
    throw error;
  } finally { clearTimeout(timer); }
}
async function establishSession() {
  const session = await api("/api/session", "GET", undefined, false, true);
  if (!["cookie", "bearer"].includes(session.authMode) || authMode !== null && authMode !== session.authMode) throw identityError();
  authMode = session.authMode;
  if (authMode === "bearer") {
    const canonical = await canonicalIdentity(identity === null);
    if (identityFailed) throw identityError();
    identity = canonical;
  } else {
    if (!navigator.locks) throw new Error("โหมดคุกกี้ต้องใช้ Web Locks ผ่าน HTTPS หรือ localhost");
    await navigator.locks.request("homework-p01-session", async () => {
      const current = await api("/api/session");
      if (current.authMode !== "cookie") throw identityError();
    });
  }
  if (!globalThis.crypto?.subtle && legacy.length) {
    $("legacyNotice").textContent = "HTTP นี้ไม่รองรับการนำเข้างานเดิม (ต้องใช้ HTTPS หรือ localhost) แต่เพิ่ม อ่าน แก้ไข ลบ และดาวน์โหลด ICS ได้ตามปกติ ต้นฉบับยังอยู่ในเครื่อง";
  }
}
function setBusy(value) {
  busy = value; $("formFields").disabled = value || !ready;
  $("refreshButton").disabled = value;
  $("importButton").disabled = value || !ready || !globalThis.crypto?.subtle;
  $("homeworkList").querySelectorAll("button, input").forEach(control => { control.disabled = value || !ready; });
}
function resetForm() {
  editing = null; $("homeworkForm").reset(); $("formTitle").textContent = "เพิ่มการบ้านใหม่";
  $("submitButton").textContent = "+ เพิ่มการบ้าน"; $("cancelEdit").hidden = true; $("formError").textContent = "";
}
function formattedDate(value) {
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value + "T00:00:00Z"));
}
function node(tag, className, text) {
  const element = document.createElement(tag); element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
function googleLink(item) {
  const next = new Date(item.deadline + "T00:00:00Z"); next.setUTCDate(next.getUTCDate() + 1);
  const dates = item.deadline.replaceAll("-", "") + "/" + next.toISOString().slice(0, 10).replaceAll("-", "");
  return "https://calendar.google.com/calendar/render?" + new URLSearchParams({ action: "TEMPLATE", text: "การบ้าน: " + item.subject, details: item.detail, dates });
}
function render() {
  const query = $("search").value.trim().toLocaleLowerCase("th"), filter = $("filter").value;
  const shown = items.filter(item => (item.subject + " " + item.detail).toLocaleLowerCase("th").includes(query) && (filter === "all" || filter === "done" && item.done || filter === "pending" && !item.done || filter === "overdue" && !item.done && item.deadline < currentDay));
  $("resultCount").textContent = shown.length + " / " + items.length + " งาน";
  $("homeworkList").replaceChildren();
  if (!shown.length) $("homeworkList").append(node("p", "empty", items.length ? "ไม่พบงานที่ตรงกับการค้นหา" : "พื้นที่สำหรับความตั้งใจใหม่ เพิ่มงานแรกได้เลย"));
  for (const item of shown) {
    const overdue = !item.done && item.deadline < currentDay;
    const card = node("article", "homework-item" + (item.done ? " completed" : "") + (overdue ? " overdue-item" : ""));
    const top = node("div", "task-top"), checkbox = node("input", "task-check");
    checkbox.type = "checkbox"; checkbox.checked = item.done; checkbox.setAttribute("aria-label", "ทำเสร็จแล้ว: " + item.subject);
    checkbox.addEventListener("change", () => perform(async () => { await api("/api/homework/" + encodeURIComponent(item.id), "PATCH", { done: checkbox.checked }); }, "อัปเดตสถานะแล้ว"));
    const info = node("div", "homework-info"); info.append(node("h3", "", item.subject), node("p", "task-detail", item.detail));
    const status = item.done ? "เสร็จแล้ว" : overdue ? "เกินกำหนด" : item.deadline === currentDay ? "ส่งวันนี้" : "ยังไม่เสร็จ";
    info.append(node("span", "status-badge", status), node("small", "task-date", "กำหนดส่ง " + formattedDate(item.deadline))); top.append(checkbox, info);
    const actions = node("div", "task-actions"), edit = node("button", "secondary", "แก้ไข"); edit.type = "button";
    edit.addEventListener("click", () => {
      if (busy || !ready) return;
      editing = item.id; $("subject").value = item.subject; $("detail").value = item.detail; $("deadline").value = item.deadline;
      $("formTitle").textContent = "แก้ไขการบ้าน"; $("submitButton").textContent = "บันทึกการแก้ไข"; $("cancelEdit").hidden = false; $("formError").textContent = ""; $("subject").focus();
    });
    const google = node("a", "calendar-link", "Google Calendar"); google.href = googleLink(item); google.target = "_blank"; google.rel = "noopener noreferrer";
    const ics = node("button", "calendar-link", "ดาวน์โหลด ICS"); ics.type = "button";
    ics.addEventListener("click", async () => {
      if (busy || !ready) return;
      setBusy(true); let objectURL, link;
      try {
        const blob = await api("/api/homework/" + encodeURIComponent(item.id) + "/calendar.ics", "GET", undefined, true);
        objectURL = URL.createObjectURL(blob);
        link = document.createElement("a"); link.href = objectURL; link.download = "homework.ics";
        link.hidden = true; document.body.append(link); link.click();
      } catch (error) { notify(error.message); }
      finally {
        link?.remove();
        // Allow the browser to consume the download before releasing its blob URL.
        if (objectURL) setTimeout(() => URL.revokeObjectURL(objectURL), 1000);
        setBusy(false);
      }
    });
    const remove = node("button", "danger", "ลบ"); remove.type = "button";
    remove.addEventListener("click", () => {
      if (busy || !ready) return;
      $("deleteDescription").textContent = item.subject; $("deleteDialog").returnValue = "cancel";
      $("deleteDialog").onclose = () => {
        if ($("deleteDialog").returnValue === "delete") perform(async () => { await api("/api/homework/" + encodeURIComponent(item.id), "DELETE"); if (editing === item.id) resetForm(); }, "ลบการบ้านแล้ว");
      };
      $("deleteDialog").showModal();
    });
    actions.append(edit, google, ics, remove); card.append(top, actions); $("homeworkList").append(card);
  }
  setBusy(busy);
}
function updateOverview() {
  const done = items.filter(item => item.done).length;
  const stats = { total: items.length, done, pending: items.length - done, overdue: items.filter(item => !item.done && item.deadline < currentDay).length };
  const completion = items.length ? Math.round(done / items.length * 100) : 0;
  for (const key of ["total", "done", "pending", "overdue"]) $(key).textContent = stats[key];
  $("completion").value = completion; $("completion").textContent = completion + "%"; $("completionLabel").textContent = completion + "%";
  $("todayLabel").textContent = "วันนี้ " + formattedDate(currentDay) + " · เวลาไทย";
}
async function load() {
  $("homeworkList").setAttribute("aria-busy", "true"); $("listStatus").textContent = "กำลังโหลด…";
  try {
    await establishSession();
    // Verify the chosen identity before enabling mutations.
    const result = await api("/api/homework"); items = result.data; currentDay = result.today; ready = true;
    updateOverview(); $("listStatus").textContent = ""; render();
  } catch (error) { ready = false; $("listStatus").textContent = error.message + " — กดโหลดใหม่ (รายการเดิมอาจยังไม่อัปเดต)"; throw error; }
  finally { $("homeworkList").setAttribute("aria-busy", "false"); }
}
async function perform(operation, message) {
  if (busy || !ready) return; setBusy(true);
  try { await operation(); notify(message); await load(); }
  catch (error) { notify(error.message); render(); }
  finally { setBusy(false); }
}
$("homeworkForm").addEventListener("submit", async event => {
  event.preventDefault(); if (busy || !ready) return;
  if (!$("subject").value.trim()) { $("formError").textContent = "กรุณากรอกชื่อวิชา"; $("subject").focus(); return; }
  $("formError").textContent = ""; setBusy(true);
  try {
    await api(editing ? "/api/homework/" + encodeURIComponent(editing) : "/api/homework", editing ? "PATCH" : "POST", { subject: $("subject").value.trim(), detail: $("detail").value.trim(), deadline: $("deadline").value });
    resetForm(); notify("บันทึกการบ้านแล้ว"); await load();
  } catch (error) { $("formError").textContent = error.message; }
  finally { setBusy(false); }
});
$("cancelEdit").addEventListener("click", resetForm);
$("search").addEventListener("input", render); $("filter").addEventListener("change", render);
$("refreshButton").addEventListener("click", async () => {
  if (busy) return; setBusy(true);
  try { await load(); notify("โหลดข้อมูลล่าสุด"); }
  catch (error) { notify(error.message); }
  finally { setBusy(false); }
});
$("importButton").addEventListener("click", () => perform(async () => {
  if (!globalThis.crypto?.subtle) throw new Error("การนำเข้าต้องใช้ HTTPS หรือ localhost เพื่อป้องกันงานซ้ำ");
  let skipped = 0;
  for (let index = 0; index < legacy.length; index++) {
    const item = legacy[index];
    if (!item || typeof item.subject !== "string" || !item.subject.trim() || item.subject.length > 80 || typeof item.deadline !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(item.deadline) || item.deadline < "0100-01-01" || item.deadline > "9998-12-31" || !Number.isFinite(Date.parse(item.deadline + "T00:00:00Z")) || new Date(item.deadline + "T00:00:00Z").toISOString().slice(0, 10) !== item.deadline || (item.detail !== undefined && (typeof item.detail !== "string" || item.detail.length > 2000))) { skipped++; continue; }
    // Stable across retries; the original browser data remains untouched.
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(["p01", item.id ?? index, item.subject, item.detail ?? "", item.deadline])));
    const importKey = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
    await api("/api/homework", "POST", { subject: item.subject, detail: item.detail ?? "", deadline: item.deadline, done: item.done === true, importKey });
  }
  $("legacyPanel").hidden = true; $("listStatus").textContent = skipped ? "ข้ามข้อมูลไม่ถูกต้อง " + skipped + " รายการ ต้นฉบับยังอยู่ในเครื่อง" : "";
  if (skipped) window.setTimeout(() => notify("ข้ามข้อมูลไม่ถูกต้อง " + skipped + " รายการ ต้นฉบับยังอยู่ในเครื่อง"), 1000);
}, "นำเข้าข้อมูลแล้ว ต้นฉบับยังอยู่ในเบราว์เซอร์"));
function checkDay() {
  const day = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Bangkok" }).format(new Date());
  if (day !== currentDay && !busy) { currentDay = day; updateOverview(); render(); }
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) checkDay(); });
setInterval(checkDay, 60000);
// Block mutations until the first snapshot has settled, just like subsequent refreshes.
setBusy(true);
load().catch(() => {}).finally(() => setBusy(false));
