/* re:Invent 2026 출장 앱 — core: store, utils, router, onboarding, home, install guide */
"use strict";

/* ---------- utils ---------- */
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[c]));
const pad2 = (n) => String(n).padStart(2, "0");

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add("hidden"), 2200);
}

function openModal(html, opts) {
  const root = $("#modal-root");
  root.innerHTML = `<div class="overlay center" id="modal-overlay"><div class="sheet" role="dialog" aria-modal="true">${html}</div></div>`;
  const ov = $("#modal-overlay");
  ov._sticky = !!(opts && opts.sticky);
  ov.addEventListener("click", (e) => { if (e.target === ov && !ov._sticky) closeModal(); });
  document.body.classList.add("modal-open");
  return ov;
}
function closeModal() { $("#modal-root").innerHTML = ""; document.body.classList.remove("modal-open"); }

/* 하단 시트 (bottom sheet): 손잡이 + 제목/닫기 + 스크롤 본문 + 하단 고정 버튼
   opts: { title, body, actions, sticky } — 손잡이·제목줄을 아래로 끌면 닫힘 */
function openSheet(opts) {
  const root = $("#modal-root");
  root.innerHTML = `<div class="overlay" id="modal-overlay">
    <div class="sheet bs" role="dialog" aria-modal="true" aria-label="${esc(opts.title || "")}">
      <div class="bs-drag">
        <div class="bs-grab" aria-hidden="true"></div>
        <div class="bs-head"><h2>${esc(opts.title || "")}</h2>
          <button class="bs-close" type="button" aria-label="닫기">✕</button></div>
      </div>
      <div class="bs-body">${opts.body || ""}</div>
      ${opts.actions ? `<div class="bs-actions">${opts.actions}</div>` : ""}
    </div></div>`;
  const ov = $("#modal-overlay"), sheet = $(".bs", ov), drag = $(".bs-drag", ov);
  ov._sticky = !!opts.sticky;
  document.body.classList.add("modal-open");
  const dismiss = () => {
    if (!$("#modal-overlay")) return;
    sheet.style.transition = "transform .2s ease";
    sheet.style.transform = "translateY(100%)";
    ov.style.transition = "opacity .2s ease";
    ov.style.opacity = "0";
    setTimeout(() => { if ($("#modal-overlay") === ov) closeModal(); }, 200);
  };
  ov._dismiss = dismiss;
  ov.addEventListener("click", (e) => { if (e.target === ov && !ov._sticky) dismiss(); });
  $(".bs-close", ov).onclick = dismiss;
  // 아래로 스와이프해서 닫기
  let y0 = null, dy = 0;
  drag.addEventListener("touchstart", (e) => { y0 = e.touches[0].clientY; dy = 0; sheet.style.transition = "none"; }, { passive: true });
  drag.addEventListener("touchmove", (e) => {
    if (y0 == null) return;
    dy = Math.max(0, e.touches[0].clientY - y0);
    sheet.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  drag.addEventListener("touchend", () => {
    if (y0 == null) return;
    y0 = null;
    if (dy > 80) dismiss();
    else { sheet.style.transition = "transform .2s ease"; sheet.style.transform = ""; }
  });
  return ov;
}

/* Esc: 모달 → 드로어 → 보고서 순으로 닫기 (PC·키보드 사용 시) */
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const ov = $("#modal-overlay");
  if (ov) { if (!ov._sticky) (ov._dismiss || closeModal)(); return; }
  if ($("#drawer-overlay")) { closeDrawer(); return; }
  const rp = $("#report-screen.open");
  if (rp) rp.classList.remove("open");
});

/* 확대 막기: 뷰포트(user-scalable=no) + CSS touch-action으로 더블탭 확대 차단,
   iOS Safari는 뷰포트 설정을 무시하므로 핀치 제스처를 직접 막음 */
["gesturestart", "gesturechange", "gestureend"].forEach((t) =>
  document.addEventListener(t, (e) => e.preventDefault(), { passive: false }));
document.addEventListener("touchmove", (e) => {
  if (e.touches.length > 1 || (typeof e.scale === "number" && e.scale !== 1)) e.preventDefault();
}, { passive: false });

function download(filename, text, mime) {
  const blob = new Blob([text], { type: mime || "application/octet-stream" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

/* ---------- time ---------- */
const EVENT_START = "2026-11-30", EVENT_END = "2026-12-04";
const WD_KO = ["일", "월", "화", "수", "목", "금", "토"];
/* 베뉴 (표시 순서) */
const VENUES = ["Caesars Forum", "Caesars Palace", "Encore", "MGM Grand", "The Venetian", "Wynn"];
function tzParts(tz, d) {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false
  }).formatToParts(d || new Date());
  const o = {};
  p.forEach((x) => { o[x.type] = x.value; });
  return o; // {year, month, day, hour, minute}
}
function vegasParts(d) { return tzParts("America/Los_Angeles", d); }
function fmtDate(p) { // "10.8(목)"
  const wd = WD_KO[new Date(Date.UTC(+p.year, +p.month - 1, +p.day, 12)).getUTCDay()];
  return `${+p.month}.${+p.day}(${wd})`;
}
function fmtDateTime(p) { return `${fmtDate(p)} ${p.hour}:${p.minute}`; } // "10.8(목) 14:27"
function vegasDateStr(d) { const p = vegasParts(d); return `${p.year}-${p.month}-${p.day}`; }
function dayLabel(ds) { // "2026-11-30" -> "11.30(월)"
  const wd = WD_KO[new Date(ds + "T12:00:00").getDay()];
  const [, m, d] = ds.split("-");
  return `${Number(m)}.${Number(d)}(${wd})`;
}
/* Vegas 현지 시간을 한국 시간으로 (PST=UTC-8, KST=UTC+9 → +17시간. 11/30–12/4는 서머타임 종료 후) */
function kstOf(dateStr, timeStr) {
  if (!timeStr || !/^\d{1,2}:\d{2}$/.test(timeStr)) return "";
  const [h, m] = timeStr.split(":").map(Number);
  const t = (h * 60 + m + 17 * 60) % (24 * 60);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}
function kstRange(dateStr, s, e) {
  if (!s) return "";
  const a = kstOf(dateStr, s), b = e ? kstOf(dateStr, e) : "";
  return a + (b ? "–" + b : "");
}
function dday() {
  const today = vegasDateStr();
  const ms = (new Date(EVENT_START + "T00:00:00") - new Date(today + "T00:00:00")) / 86400000;
  return Math.round(ms);
}
function phase() {
  const t = vegasDateStr();
  if (t < "2026-11-29") return "before";
  if (t <= "2026-12-05") return "during";
  return "after";
}

/* ---------- store (localStorage, per-user) ---------- */
const LS_KEY = "reinvent2026.v1";
function defaultState() {
  return {
    onboarded: false,
    profile: { nickname: "", topics: [], services: [] },
    favorites: [],
    reservations: {},       // session_id -> {status, updated_at}
    backups: {},             // session_id -> [session_id]
    daily_plan: {},          // "YYYY-MM-DD" -> [{session_id, note}]
    session_notes: {},       // session_id -> {rating, memo, updated_at}
    search_history: [],      // {query, scope, at, result_count}
    trip: {
      flights: {
        outbound: { airline: "", flight_no: "", dep_time: "", arr_time: "", terminal: "" },
        inbound: { airline: "", flight_no: "", dep_time: "", arr_time: "", terminal: "" }
      },
      hotel: { name: "", check_in: "", check_out: "", address: "" }
    },
    expenses: [],            // {id, date, owner, category, desc, amount_usd, amount_krw, receipt}
    checklist: null,         // null -> defaults from PREP
    fixed_off: [],           // fixed event ids turned off
    fixed_edits: {},         // fixed event overrides {id: {title,start,end,venue,note}}
    install_dismissed: false,
    fx_rate: 1450,
    theme: "system",         // system | light | dark
    notify: { on: false, minutes: 15 },  // 관심 세션 시작 알림 (앱이 켜져 있을 때만 동작)
    weather_cache: null,
    depart_done: {},   // 출발 전 할 일 완료 상태
    budget_usd: 0,     // 정산 예산 (USD)
    peers: [],         // 받은 동료 일정 [{id, name, days, visible, color, at}]
    show_kr_hours: true, // 시간표에 한국 업무시간 표시
    news: []           // 신규 발표 메모 [{id, title, q, at}]
  };
}
const Store = {
  state: null,
  load() {
    try { this.state = JSON.parse(localStorage.getItem(LS_KEY)); } catch (e) { this.state = null; }
    if (!this.state || typeof this.state !== "object") this.state = defaultState();
    // forward-fill new keys
    const d = defaultState();
    for (const k of Object.keys(d)) if (!(k in this.state)) this.state[k] = d[k];
    return this.state;
  },
  save() { try { localStorage.setItem(LS_KEY, JSON.stringify(this.state)); } catch (e) { toast("저장 공간이 부족합니다"); } },
  reset() { this.state = defaultState(); this.save(); }
};
const S = () => Store.state;

/* ---------- fixed events (from collected agenda) ---------- */
const FIXED_EVENTS = [
  { id: "badge-air", date: "2026-11-29", start: "07:00", end: "23:59", title: "배지 수령", venue: "Harry Reid 공항 T1·T3", note: "공항 도착 시 수령 가능", src: "guide" },
  { id: "badge-venue", date: "2026-11-29", start: "10:00", end: "20:00", title: "배지 수령", venue: "MGM Grand · The Venetian", note: "", src: "guide" },
  { id: "kickoff", date: "2026-11-29", start: "10:00", end: "18:00", title: "킥오프 액티비티", venue: "Caesars Forum · The Venetian", note: "SWAG 수령·주간 계획", src: "guide" },
  { id: "expo-welcome", date: "2026-11-30", start: "16:00", end: "19:00", title: "Expo 웰컴 리셉션", venue: "The Venetian", note: "420+ 스폰서 부스", src: "guide" },
  { id: "expo-happy", date: "2026-12-02", start: "16:30", end: null, title: "Expo 해피아워", venue: "The Venetian", note: "", src: "guide" },
  { id: "replay", date: "2026-12-03", start: "19:30", end: "23:59", title: "re:Play 파티", venue: "Las Vegas Festival Grounds", note: "야외 — 방한·귀마개 필수", src: "guide" }
];

/* 키노트: 공식 일정이 데이터(event_info.keynotes.items)에 들어오면 자동으로 고정 일정에 추가
   형식: [{ date: "2026-12-01", start: "08:00", end: "10:30", title: "...", speaker: "...", venue: "The Venetian" }] */
function keynoteInfo() { return (window.APP_DATA.event_info && window.APP_DATA.event_info.keynotes) || {}; }
function keynoteEvents() {
  const k = keynoteInfo(), items = Array.isArray(k.items) ? k.items : [];
  return items.filter((x) => x && x.date && x.start).map((x, i) => ({
    id: "keynote-" + (x.id || i), date: x.date, start: x.start, end: x.end || null,
    title: "🎤 " + (x.title || "키노트") + (x.speaker ? ` — ${x.speaker}` : ""),
    venue: x.venue || "", keynote: true, src: "official",
    note: [k.korean_interpretation ? "한국어 동시통역(헤드셋)" : "", k.livestream ? "라이브스트림" : ""].filter(Boolean).join(" · ")
  }));
}
/* 고정 이벤트 + 공개된 키노트 */
function allFixed() { return FIXED_EVENTS.concat(keynoteEvents()); }

/* ---------- tab router ---------- */
const Views = {};
let currentTab = "home";
function switchTab(name) {
  currentTab = name;
  if (name === "planner" && typeof plannerManual !== "undefined") plannerManual = false; // 들어올 때마다 현지 날짜로
  $$("#tabbar button").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  $$("#views .view").forEach((v) => v.classList.toggle("active", v.id === "view-" + name));
  if (Views[name]) Views[name]();
  window.scrollTo(0, 0);
}

/* ---------- header clock ---------- */
let lastTickMin = "";
function tickClock() {
  const p = vegasParts();
  const m = p.hour + ":" + p.minute;
  if (m !== lastTickMin) {
    lastTickMin = m;
    if (currentTab === "home" && $("#home-upcoming") && Store.state) { $("#home-upcoming").innerHTML = Planner.upcomingHTML(); Planner.bindUpcoming(); }
  }
  const v = $("#clock-vegas"), k = $("#clock-kst");
  if (v) v.textContent = `라스베가스 ${fmtDateTime(vegasParts())}`;
  if (k) k.textContent = `한국 ${fmtDateTime(tzParts("Asia/Seoul"))}`;
}

/* ---------- theme (system / light / dark) ---------- */
const darkMQ = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
function resolvedTheme() {
  const t = S().theme;
  if (t === "light" || t === "dark") return t;
  return darkMQ && darkMQ.matches ? "dark" : "light"; // "system"
}
function applyTheme() {
  const t = resolvedTheme();
  const changed = document.documentElement.dataset.theme !== t;
  document.documentElement.dataset.theme = t;
  const mc = document.querySelector('meta[name="theme-color"]');
  if (mc) mc.content = t === "dark" ? "#16233f" : "#0f1f3d"; // 상단 헤더 색과 맞춤
  // 시간표 블록 색은 렌더 시점에 계산되므로 테마가 바뀌면 다시 그림
  if (changed && currentTab === "planner" && Views.planner) Views.planner();
}
if (darkMQ) {
  const onSys = () => { if (Store.state && S().theme === "system") applyTheme(); };
  if (darkMQ.addEventListener) darkMQ.addEventListener("change", onSys);
  else if (darkMQ.addListener) darkMQ.addListener(onSys);
}

/* ---------- drawer (side panel for tips/info) ---------- */
function openDrawer(title, html) {
  let root = $("#drawer-root");
  if (!root) { root = document.createElement("div"); root.id = "drawer-root"; document.body.appendChild(root); }
  root.innerHTML = `<div class="drawer-overlay" id="drawer-overlay">
    <aside class="drawer" role="dialog" aria-label="${esc(title)}">
      <div class="drawer-head"><strong>${esc(title)}</strong><button class="drawer-close" id="drawer-close" aria-label="닫기">✕</button></div>
      <div class="drawer-body">${html}</div>
    </aside></div>`;
  requestAnimationFrame(() => requestAnimationFrame(() => { const ov = $("#drawer-overlay"); if (ov) ov.classList.add("open"); }));
  $("#drawer-close").onclick = closeDrawer;
  $("#drawer-overlay").addEventListener("click", (e) => { if (e.target.id === "drawer-overlay") closeDrawer(); });
  // 가이드 본문의 링크는 새 창으로 (앱(PWA) 화면을 벗어나지 않게)
  $$("#drawer-root .drawer-body a[href^='http']").forEach((a) => { a.target = "_blank"; a.rel = "noopener"; });
}
function closeDrawer() {
  const ov = $("#drawer-overlay");
  if (!ov) return;
  ov.classList.remove("open");
  setTimeout(() => { const r = $("#drawer-root"); if (r) r.innerHTML = ""; }, 260);
}

/* ---------- sessions accessor ---------- */
function allSessions() {
  return (window.APP_DATA && window.APP_DATA.sessions) || [];
}
function sessionsPending() {
  return !!(window.APP_DATA.meta && window.APP_DATA.meta.sessions_pending);
}

/* ---------- session start notifications (while app is open) ---------- */
const Notify = {
  timer: null,
  fired: new Set(),
  supported() { return ("Notification" in window); },
  async enable(minutes) {
    if (!this.supported()) { toast("이 브라우저에서는 알림을 지원하지 않아요"); return false; }
    let perm = Notification.permission;
    if (perm === "default") { try { perm = await Notification.requestPermission(); } catch (e) { perm = "denied"; } }
    if (perm !== "granted") { toast("알림 권한을 허용해 주세요"); return false; }
    S().notify = { on: true, minutes: minutes || 15 };
    Store.save();
    this.start();
    toast("세션 시작 알림을 켰어요 🔔");
    return true;
  },
  disable() {
    S().notify.on = false;
    Store.save();
    this.stop();
    toast("세션 시작 알림을 껐어요");
  },
  start() {
    this.stop();
    if (!(S().notify && S().notify.on)) return;
    if (!this.supported() || Notification.permission !== "granted") return;
    this.timer = setInterval(() => this.check(), 60000);
    this.check();
  },
  stop() { if (this.timer) { clearInterval(this.timer); this.timer = null; } },
  show(title, opts) {
    // Android Chrome은 new Notification()을 막으므로 서비스워커 알림을 우선 사용
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then((reg) => reg.showNotification(title, opts))
        .catch(() => { try { new Notification(title, opts); } catch (e) {} });
    } else {
      try { new Notification(title, opts); } catch (e) {}
    }
  },
  check() {
    try {
      const nt = S().notify;
      if (!(nt && nt.on)) return;
      if (!this.supported() || Notification.permission !== "granted") return;
      const today = vegasDateStr();
      const p = vegasParts();
      const nowMin = (+p.hour) * 60 + (+p.minute);
      const lead = nt.minutes || 15;
      Planner.itemsFor(today).forEach((it) => {
        const start = it.start || it.start_time;
        if (!start) return;
        const id = it.session_id || it.id || it.title;
        const key = today + "|" + id;
        if (this.fired.has(key)) return;
        const diff = Planner.toMin(start) - nowMin;
        if (diff > 0 && diff <= lead) {
          this.fired.add(key);
          this.show("곧 시작해요 ⏰", {
            body: `${it.title} · ${start} (${it.venue || "장소 미정"})`,
            icon: "icons/icon-192.png",
            tag: key
          });
        }
      });
    } catch (e) { /* 알림 실패는 조용히 무시 */ }
  }
};

/* ---------- weather (Open-Meteo, no key) ---------- */
const Weather = {
  icon(code) {
    if (code === 0) return "☀️";
    if (code <= 2) return "⛅";
    if (code === 3) return "☁️";
    if (code === 45 || code === 48) return "🌫️";
    if (code >= 51 && code <= 57) return "🌦️";
    if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "🌧️";
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "🌨️";
    if (code >= 95) return "⛈️";
    return "⛅";
  },
  data() {
    const c = S().weather_cache;
    return (c && c.data) || null;
  },
  iconFor(dateStr) { // "2026-12-01" -> "☀️" (예보 범위 내일 때만)
    const d = this.data();
    if (!d || !d.daily || !d.daily.time) return "";
    const i = d.daily.time.indexOf(dateStr);
    return i >= 0 ? this.icon(d.daily.weathercode[i]) : "";
  },
  async fetch() {
    const url = "https://api.open-meteo.com/v1/forecast?latitude=36.1699&longitude=-115.1398" +
      "&current=temperature_2m,weathercode&daily=temperature_2m_max,temperature_2m_min,weathercode" +
      "&timezone=America%2FLos_Angeles&forecast_days=16";
    const res = await fetch(url);
    if (!res.ok) throw new Error("weather " + res.status);
    return res.json();
  },
  async refresh() {
    const el = $("#home-weather");
    try {
      const c = S().weather_cache;
      const fresh = c && c.data && (Date.now() - c.at < 30 * 60 * 1000);
      const data = fresh ? c.data : await this.fetch();
      if (!fresh && data) { S().weather_cache = { at: Date.now(), data }; Store.save(); }
      if (data && el) {
        const t = Math.round(data.current.temperature_2m);
        const mx = Math.round(data.daily.temperature_2m_max[0]);
        const mn = Math.round(data.daily.temperature_2m_min[0]);
        el.innerHTML = `<div style="font-size:30px;line-height:1;">${this.icon(data.current.weathercode)}</div>
          <div style="font-size:20px;font-weight:800;">${t}°</div>
          <div style="font-size:11px;opacity:.8;">${mx}° / ${mn}°</div>`;
      }
    } catch (e) { if (el) el.style.display = "none"; }
  }
};

/* ---------- install prompt (Android/Chrome) ---------- */
let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const b = $("#install-now");
  if (b) b.classList.remove("hidden");
});
async function doInstallPrompt() {
  if (!deferredPrompt) { toast("이 기기에서는 자동 설치를 지원하지 않아요"); return; }
  deferredPrompt.prompt();
  try {
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      S().install_dismissed = true; Store.save();
      $("#install-guide").classList.add("hidden");
      toast("설치가 시작됐어요 📲");
    }
  } catch (e) {}
  deferredPrompt = null;
  const b = $("#install-now");
  if (b) b.classList.add("hidden");
}

/* ---------- install guide (PWA) ---------- */
function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}
function platform() {
  const ua = navigator.userAgent || "";
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  if (/android/i.test(ua)) return "android";
  return "other";
}
function maybeShowInstallGuide(force) {
  if (isStandalone()) { if (force) toast("이미 앱으로 실행 중이에요 👍"); return; }
  if (S().install_dismissed && !force) return;
  const pf = platform();
  let how = "";
  if (pf === "ios") how = `<li>Safari 하단 <strong>공유 버튼(⎙)</strong>을 누르세요</li><li><strong>"홈 화면에 추가"</strong>를 선택하세요</li><li>홈 화면의 아이콘으로 실행하면 앱처럼 켜집니다</li>`;
  else if (pf === "android") how = `<li>Chrome 메뉴(⋮)에서 <strong>"앱 설치"</strong> 또는 <strong>"홈 화면에 추가"</strong>를 선택하세요</li><li>홈 화면의 아이콘으로 실행하면 앱처럼 켜집니다</li>`;
  else how = `<li>브라우저 메뉴에서 "홈 화면에 추가"/"바로가기 만들기"를 선택하세요</li>`;
  const el = $("#install-guide");
  el.classList.remove("hidden");
  el.innerHTML = `<div class="sheet">
    <h2>📲 홈 화면에 추가하기</h2>
    <p class="muted">이 앱을 홈 화면에 추가하면 주소창 없이 앱처럼 실행됩니다.</p>
    <ol style="padding-left:20px;font-size:14px;">${how}</ol>
    <div class="notice">설치 후에는 <strong>홈 화면 아이콘</strong>으로 실행해 주세요. (브라우저로 열면 저장된 데이터가 다르게 보일 수 있습니다)</div>
    <button class="btn accent block hidden" id="install-now">⬇️ 바로 설치하기</button>
    <button class="btn block" id="install-ok">확인</button>
    <button class="btn ghost block" id="install-never">다시 보지 않기</button>
  </div>`;
  $("#install-ok").onclick = () => el.classList.add("hidden");
  $("#install-never").onclick = () => { S().install_dismissed = true; Store.save(); el.classList.add("hidden"); };
  const inBtn = $("#install-now");
  if (inBtn) {
    if (deferredPrompt) inBtn.classList.remove("hidden");
    inBtn.onclick = doInstallPrompt;
  }
}

/* ---------- onboarding ---------- */
function startOnboarding() {
  const el = $("#onboarding");
  el.classList.remove("hidden");
  stepNotice();
}
function obShell(inner) {
  $("#onboarding").innerHTML = `<div class="sheet" style="margin:auto;max-width:480px;">
    <div style="text-align:center;margin-bottom:6px;font-size:13px;color:var(--muted)">re:Invent 2026 출장 앱</div>${inner}</div>`;
}
function stepNotice() {
  obShell(`
    <h2>시작하기 전에</h2>
    <div class="notice">
      이 앱은 <strong>서버 없이 동작</strong>합니다. 입력한 정보는 이 브라우저(앱)에만 저장됩니다.<br><br>
      다른 기기(PC → 모바일 등)에서도 보려면<br><strong>설정 → '다른 기기로 옮기기'에서 코드로 옮겨</strong>주세요.<br><br>
      브라우저 캐시를 지우면 데이터가 사라지니,<br>백업 파일로 보관해 두세요.
    </div>
    <button class="btn block" id="ob-next">확인했어요</button>`);
  $("#ob-next").onclick = stepBranch;
}
function stepBranch() {
  obShell(`
    <h2>어떻게 시작할까요?</h2>
    <button class="btn block" id="ob-new">새로 시작하기</button>
    <button class="btn ghost block" id="ob-import">다른 기기에서 가져오기</button>`);
  $("#ob-new").onclick = stepProfile;
  $("#ob-import").onclick = () => {
    TransferUI.showImport(() => { S().onboarded = true; Store.save(); finishOnboarding(); }, () => {});
  };
}
function stepProfile() {
  const topics = (window.APP_DATA.topics && window.APP_DATA.topics.topics) || [];
  obShell(`
    <h2>프로필</h2>
    <label class="field">닉네임 (선택)</label>
    <input type="text" id="ob-nick" placeholder="예: 클라우드김" maxlength="20">
    <label class="field">관심 토픽 (최대 10개)</label>
    <div class="chip-row" id="ob-topics">${topics.map((t) => `<button class="chip" data-t="${esc(t)}">${esc(t)}</button>`).join("")}</div>
    <button class="btn block" id="ob-done">시작하기</button>`);
  const picked = new Set();
  $$("#ob-topics .chip").forEach((c) => c.onclick = () => {
    const t = c.dataset.t;
    if (picked.has(t)) { picked.delete(t); c.classList.remove("on"); }
    else if (picked.size < 10) { picked.add(t); c.classList.add("on"); }
    else toast("최대 10개까지 선택할 수 있어요");
  });
  $("#ob-done").onclick = () => {
    S().profile.nickname = $("#ob-nick").value.trim();
    S().profile.topics = Array.from(picked);
    S().onboarded = true;
    Store.save();
    finishOnboarding();
  };
}
function finishOnboarding() {
  $("#onboarding").classList.add("hidden");
  $("#onboarding").innerHTML = "";
  switchTab("home");
  maybeShowInstallGuide();
  Share.checkLink(); // 공유 링크로 처음 들어온 경우
}

/* ---------- home view ---------- */
Views.home = function () {
  const st = S();
  const nick = st.profile.nickname ? esc(st.profile.nickname) + "님" : "게스트님";
  const dd = dday();
  // 행사 기간(11/30–12/4)에는 'DAY n'으로
  const ddText = dd > 0 ? `D-${dd}` : -dd <= 4 ? `DAY ${1 - dd}` : `D+${-dd}`;

  // todo: trip unset?
  const tripTodos = [];
  const f = st.trip.flights;
  if (!f.outbound.flight_no) tripTodos.push("가는 편 항공편 미정");
  if (!f.inbound.flight_no) tripTodos.push("오는 편 항공편 미정");
  if (!st.trip.hotel.name) tripTodos.push("호텔 미정");
  const unres = st.favorites.filter((id) => !(st.reservations[id] && st.reservations[id].status === "reserved"));
  const todos = [];
  tripTodos.forEach((t) => todos.push({ text: t, tab: "prep" }));
  if (unres.length) todos.push({ text: `예약 안 된 관심 세션 ${unres.length}개`, tab: "sessions" });
  const cl = Packing.list();
  const clDone = cl.filter((x) => x.done).length;
  if (clDone < cl.length) todos.push({ text: `준비물 ${clDone}/${cl.length} 완료`, tab: "prep" });
  const today = vegasDateStr();
  if (today >= "2026-12-03" && today <= "2026-12-05") todos.push({ text: "✈️ 귀국 준비 확인 (체크아웃·공항·면세)", tab: "prep" });

  const pending = sessionsPending();

  $("#view-home").innerHTML = `
    <div class="card" style="background:linear-gradient(135deg,var(--navy),var(--navy2));color:#fff;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
        <div>
          <div style="font-size:13px;opacity:.85">안녕하세요, ${nick} 👋</div>
          <div style="font-size:30px;font-weight:800;margin:4px 0;">${ddText}</div>
          <div style="font-size:13px;opacity:.85">11/30–12/4 · 라스베가스 (현지 ${fmtDate(vegasParts())})</div>
        </div>
        <div id="home-weather" style="text-align:center;flex-shrink:0;min-width:64px;">⛅</div>
      </div>
    </div>
    ${pending ? `<div class="notice">📡 세션 카탈로그 수집 대기 중 — 공식 카탈로그에서 수집하면 세션 탭이 활성화됩니다.</div>` : ""}

    <div id="home-upcoming">${Planner.upcomingHTML()}</div>
    ${(() => {
      const items = News.items();
      if (!items.length && vegasDateStr() < EVENT_START) return "";
      return `<div class="card"><h3>📣 신규 발표 노트</h3>
        ${items.length ? News.rowsHTML(items.slice(0, 3)) : `<p class="muted" style="margin:0;">키노트에서 들은 새 서비스·기능을 적어 두면 관련 세션을 바로 찾아 줘요.</p>`}
        <button class="btn ghost block small" id="home-news">${items.length > 3 ? `전체 ${items.length}개 · ` : ""}발표 노트 열기</button></div>`;
    })()}
    <div class="card"><h3>할 일</h3>
      ${todos.length ? todos.map((t) => `<div class="todo-item" data-go="${t.tab}" role="button" tabindex="0">
        <span class="dot"></span><span class="txt">${esc(t.text)}</span><span class="chev">›</span></div>`).join("") : `<p class="muted">할 일이 없어요. 완벽해요 ✨</p>`}
    </div>
    ${(() => {
      const k = keynoteInfo(), kn = keynoteEvents();
      return `<div class="card"><h3>🎤 키노트</h3>
        ${kn.length ? kn.map((x) => `<div class="kv"><span>${esc(dayLabel(x.date))} ${esc(x.start)}</span><b>${esc(x.title.replace(/^🎤 /, ""))}</b></div>`).join("") +
          `<p class="muted" style="font-size:12px;margin:6px 0 0;">내 일정 시간표에 자동으로 들어가 있어요.</p>`
        : `<p class="muted" style="font-size:13px;margin:0;">공식 일정·연사는 아직 공개 전이에요. 공개되면 내 일정에 자동으로 추가돼요.</p>`}
        ${k.korean_interpretation ? `<div class="notice" style="margin-bottom:0;">🇰🇷 ${esc(k.korean_interpretation_note || "키노트 한국어 실시간 통역 제공")}${k.livestream ? ` · ${esc(k.livestream)}` : ""}</div>` : ""}
      </div>
      <div class="card"><h3>추후 확인</h3>
        <div class="muted" style="font-size:13px;">셔틀 세부 노선 · Expo 공식 시간 — 공식 발표 시 앱에 반영됩니다.</div>
      </div>`;
    })()}`;
  $$("#view-home [data-go]").forEach((el) => el.onclick = () => switchTab(el.dataset.go));
  Planner.bindUpcoming();
  const hn = $("#home-news");
  if (hn) hn.onclick = () => News.open();
  $$("#view-home [data-news-q]").forEach((b) => b.onclick = () => News.show(b.dataset.newsQ));
  Weather.refresh();
};

const Settings = {
  editProfile() {
    const topics = (window.APP_DATA.topics && window.APP_DATA.topics.topics) || [];
    const picked = new Set(S().profile.topics);
    const svcPicked = new Set(S().profile.services || []);
    const svcs = serviceList().slice(0, 20);
    openModal(`
      <h2>프로필 수정</h2>
      <label class="field">닉네임</label>
      <input type="text" id="pf-nick" value="${esc(S().profile.nickname)}" maxlength="20">
      <label class="field">관심 토픽 (최대 10개)</label>
      <div class="chip-row" id="pf-topics">${topics.map((t) => `<button class="chip${picked.has(t) ? " on" : ""}" data-t="${esc(t)}">${esc(t)}</button>`).join("")}</div>
      <label class="field" style="display:block;margin-top:10px;">관심 AWS 서비스 (최대 5개 · 추천에 반영)</label>
      <div class="chip-row" id="pf-svcs">${svcs.map((x) => `<button class="chip${svcPicked.has(x.name) ? " on" : ""}" data-s="${esc(x.name)}">${esc(shortService(x.name))}</button>`).join("")}</div>
      <button class="btn block" id="pf-save">저장</button>
      <button class="btn ghost block" id="pf-cancel">취소</button>`);
    $$("#pf-topics .chip").forEach((c) => c.onclick = () => {
      const t = c.dataset.t;
      if (picked.has(t)) { picked.delete(t); c.classList.remove("on"); }
      else if (picked.size < 10) { picked.add(t); c.classList.add("on"); }
      else toast("최대 10개까지 선택할 수 있어요");
    });
    $$("#pf-svcs .chip").forEach((c) => c.onclick = () => {
      const t = c.dataset.s;
      if (svcPicked.has(t)) { svcPicked.delete(t); c.classList.remove("on"); }
      else if (svcPicked.size < 5) { svcPicked.add(t); c.classList.add("on"); }
      else toast("최대 5개까지 선택할 수 있어요");
    });
    $("#pf-save").onclick = () => {
      S().profile.nickname = $("#pf-nick").value.trim();
      S().profile.topics = Array.from(picked);
      S().profile.services = Array.from(svcPicked);
      Store.save(); closeModal(); Views.home(); toast("저장했어요");
    };
    $("#pf-cancel").onclick = closeModal;
  },

};

/* ---------- depart tasks (D-day based) ---------- */
const DepartTasks = {
  all() {
    return [
      { id: "dt-esta", d: 14, text: "ESTA 승인 상태 확인" },
      { id: "dt-insurance", d: 14, text: "여행자 보험 · 회사 출장 규정 확인" },
      { id: "dt-fx", d: 7, text: "환전 (달러)" },
      { id: "dt-app", d: 7, text: "AWS Events 앱 설치·로그인" },
      { id: "dt-esim", d: 3, text: "eSIM 구매·설치" },
      { id: "dt-pack", d: 3, text: "짐싸기 시작" },
      { id: "dt-sess", d: 3, text: "세션 예약 최종 확인" },
      { id: "dt-passport", d: 1, text: "여권·보조배터리·충전기 챙기기" },
      { id: "dt-checkin", d: 1, text: "항공편 온라인 체크인" }
    ];
  },
  toggle(id) {
    const done = S().depart_done || (S().depart_done = {});
    if (done[id]) delete done[id]; else done[id] = true;
    Store.save(); Views.prep();
  }
};

/* packing checklist defaults */
const Packing = {  defaults() {
    return [
      "여권 (유효기간 확인)", "ESTA 승인 확인", "편한 운동화",
      "레이어드 복장 (얇은 긴팔 + 겨울 외투)", "보조배터리",
      "노트북 (핸즈온랩용)", "귀마개 (re:Play 야외 파티용)",
      "달러 소액권 ($50–100)", "명함 (선택)", "eSIM 설치"
    ].map((item, i) => ({ id: "pk" + i, item, done: false }));
  },
  list() {
    if (!S().checklist) { S().checklist = Packing.defaults(); Store.save(); }
    return S().checklist;
  },
  editItem(id) {
    const list = Packing.list();
    const it = id ? list.find((x) => x.id === id) : null;
    openModal(`
      <h2>${it ? "준비물 수정" : "준비물 추가"}</h2>
      <label class="field">항목</label>
      <input type="text" id="ck-text" value="${esc(it ? it.item : "")}" placeholder="예: 선글라스" maxlength="60">
      <button class="btn block" id="ck-save">저장</button>
      <button class="btn ghost block" id="ck-cancel">취소</button>`);
    const input = $("#ck-text");
    if (input) input.focus();
    const save = () => {
      const v = input.value.trim();
      if (!v) { toast("내용을 입력해 주세요"); return; }
      if (it) it.item = v;
      else list.push({ id: "pk" + Date.now().toString(36), item: v, done: false });
      Store.save(); closeModal(); Views.prep(); toast("저장했어요");
    };
    $("#ck-save").onclick = save;
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") save(); });
    $("#ck-cancel").onclick = closeModal;
  },
  askDelete(id) {
    const list = Packing.list();
    const it = list.find((x) => x.id === id);
    if (!it) return;
    openModal(`
      <h2>삭제할까요?</h2>
      <p>"${esc(it.item)}" 항목을 삭제합니다.</p>
      <button class="btn danger block" id="ck-del-yes">삭제</button>
      <button class="btn ghost block" id="ck-cancel">취소</button>`);
    $("#ck-del-yes").onclick = () => {
      S().checklist = list.filter((x) => x.id !== id);
      Store.save(); closeModal(); Views.prep(); toast("삭제했어요");
    };
    $("#ck-cancel").onclick = closeModal;
  }
};

/* ---------- boot ---------- */
document.addEventListener("DOMContentLoaded", () => {
  // Splash screen animation
  const splash = $("#splash");
  if (splash) {
    setTimeout(() => splash.classList.add("zoom"), 1700);
    setTimeout(() => splash.classList.add("hide"), 2100);
    setTimeout(() => splash.remove(), 2600);
  }
  Store.load();
  applyTheme();
  Notify.start();
  tickClock();
  setInterval(tickClock, 10000);
  $$("#tabbar button").forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.tab)));
  if (!S().onboarded) startOnboarding();
  else { switchTab("home"); maybeShowInstallGuide(); }
  Share.checkLink();
});
