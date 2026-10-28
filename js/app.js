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
  Nav.sync();
  return ov;
}
function closeModal() { closeLayer(); $("#modal-root").innerHTML = ""; document.body.classList.remove("modal-open"); Nav.sync(); }

/* 레이어 팝업: 시트 위에 겹쳐 뜨는 작은 창 (닫으면 아래 시트로 돌아감) */
function openLayer(o) {
  closeLayer();
  const el = document.createElement("div");
  el.id = "layer-overlay";
  el.className = "overlay center layer";
  el.innerHTML = `<div class="sheet layer-card" role="dialog" aria-modal="true" aria-label="${esc(o.title || "")}">
    <div class="layer-head"><h2>${esc(o.title || "")}</h2><button class="bs-close" type="button" aria-label="닫기">✕</button></div>
    <div class="layer-body">${o.body || ""}</div></div>`;
  document.body.appendChild(el);
  el.addEventListener("click", (e) => { if (e.target === el) closeLayer(); });
  $(".bs-close", el).onclick = closeLayer;
  Nav.sync();
}
function closeLayer() { const el = $("#layer-overlay"); if (el) { el.remove(); Nav.sync(); } }

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
    if (!$("#modal-overlay") || ov._closing) return;
    ov._closing = true; // 닫히는 중: 뒤로가기 깊이 계산에서 바로 빠짐 (Nav.overlayCount)
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
  Nav.sync();
  return ov;
}

/* Esc: 레이어 → 모달 → 드로어 → 보고서 → 설치 안내 순으로 닫기 (PC·키보드 사용 시) */
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") Nav.closeTop();
});

/* role="button"인 div·span을 Enter·Space로 열기 (키보드·스크린리더) */
document.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" && e.key !== " ") return;
  const el = e.target;
  if (!el || !el.getAttribute || el.getAttribute("role") !== "button") return;
  if (/^(BUTTON|A|INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return; // 기본 동작이 있는 요소
  e.preventDefault();
  el.click();
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
    trip: {
      flights: {
        outbound: { airline: "", flight_no: "", dep_time: "", arr_time: "", terminal: "" },
        inbound: { airline: "", flight_no: "", dep_time: "", arr_time: "", terminal: "" }
      },
      hotel: { name: "", check_in: "", check_out: "", address: "", near_venue: "" } // near_venue: 숙소에서 가까운 베뉴 (동선 계산용)
    },
    expenses: [],            // {id, date, owner, category, desc, amount_usd, amount_krw, receipt}
    checklist: null,         // null -> defaults from PREP
    fixed_off: [],           // fixed event ids turned off
    fixed_edits: {},         // fixed event overrides {id: {title,start,end,venue,note}}
    install_dismissed: false,
    fx_rate: 1450,
    theme: "system",         // system | light | dark
    text_scale: 1,           // 글자 크기 1 | 1.12 | 1.25 (핀치 확대를 막는 대신)
    recent_queries: [],      // 세션 최근 검색어 (최대 8개)
    notify: { on: false, minutes: 15 },  // 관심 세션 시작 알림 (앱이 켜져 있을 때만 동작)
    weather_cache: null,
    depart_done: {},   // 출발 전 할 일 완료 상태
    budget_usd: 0,     // 정산 예산 (USD)
    peers: [],         // 받은 동료 일정 [{id, name, days, visible, color, at}]
    show_kr_hours: true, // 시간표에 한국 업무시간 표시
    news: [],           // 신규 발표 메모 [{id, title, q, at}]
    expo_booths: [],    // Expo 부스 스탬프 [{id, name, note, visited, visited_at}]
    last_backup_at: null // 마지막 백업 시각 (파일 저장·코드 복사·공유)
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
  { id: "badge-air", date: "2026-11-29", start: "07:00", end: "23:59", title: "배지 수령", venue: "Harry Reid 공항 T1·T3", note: "공항 도착 시 수령 가능", src: "guide", allday: true },
  { id: "badge-venue", date: "2026-11-29", start: "10:00", end: "20:00", title: "배지 수령", venue: "MGM Grand · The Venetian", note: "", src: "guide", allday: true },
  { id: "kickoff", date: "2026-11-29", start: "10:00", end: "18:00", title: "킥오프 액티비티", venue: "Caesars Forum · The Venetian", note: "SWAG 수령·주간 계획", src: "guide", allday: true },
  { id: "expo-welcome", date: "2026-11-30", start: "16:00", end: "19:00", title: "Expo 웰컴 리셉션", venue: "The Venetian", note: "450+ 파트너·AWS 전문가 부스", src: "official" },
  { id: "expo-happy", date: "2026-12-02", start: "16:30", end: "18:00", title: "Expo 해피아워", venue: "The Venetian", note: "", src: "official" },
  { id: "replay", date: "2026-12-03", start: "18:30", end: "22:30", title: "re:Play 파티", venue: "Allegiant Stadium", note: "야외 — 방한·귀마개 필수 · re:Play 셔틀 18:15–23:00", src: "official" }
];

/* 키노트: 공식 카탈로그의 키노트 세션 (일반 세션처럼 '담기'로 내 일정에 추가)
   통역·중계·비고는 event_info.keynotes */
function keynoteInfo() { return (window.APP_DATA.event_info && window.APP_DATA.event_info.keynotes) || {}; }
function keynoteSessions() {
  return allSessions().filter((s) => s.session_type === "keynote")
    .sort((a, b) => (a.date + a.start_time).localeCompare(b.date + b.start_time));
}
/* 세션 데이터 기준일 (한국 날짜): "10/21 기준" — 데이터 생성 시각(meta.built_at) */
function dataAsOf() {
  const at = (window.APP_DATA.meta || {}).built_at;
  if (!at) return "";
  const p = tzParts("Asia/Seoul", new Date(at));
  return `${Number(p.month)}/${Number(p.day)} 기준`;
}

/* ---------- tab router ---------- */
const Views = {};
let currentTab = "home";
function switchTab(name) {
  if (!Nav.ROUTES.includes(name)) name = "home";
  const views = $("#views");
  if (name !== currentTab && Views[currentTab] && Views[currentTab].onLeave) Views[currentTab].onLeave();
  const scroller = (tab) => $("#view-" + tab + " .split-list") || views; // 2분할 화면은 목록 칸이 스크롤됨
  Nav.scroll[currentTab] = scroller(currentTab).scrollTop;
  currentTab = name;
  if (name === "planner" && typeof plannerManual !== "undefined") plannerManual = false; // 들어올 때마다 현지 날짜로
  $$("#tabbar button").forEach((b) => {
    const on = b.dataset.tab === name;
    b.classList.toggle("active", on);
    if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
  });
  $$("#views .view").forEach((v) => v.classList.toggle("active", v.id === "view-" + name));
  const gear = $("#hdr-settings");
  if (gear) gear.classList.toggle("hidden", name !== "home");
  if (Views[name]) Views[name]();
  scroller(name).scrollTop = Nav.scroll[name] || 0;
  Nav.sync();
}

/* ---------- 뒤로가기 (history) ----------
   앱은 기본 항목 위에 '함정(trap)' 항목을 최대 1개만 둔다. 상태는 메모리에 두고 기록 항목의 state 값으로 판단하지 않는다.
   홈이 아닌 탭이나 열린 레이어가 있으면(depth > 0) 함정을 하나 쌓고, 시스템 뒤로가기가 함정을 쓰면
   맨 위 레이어를 닫거나 홈으로 돌아간 뒤 필요하면 다시 쌓는다. depth가 0이 되면 함정을 조용히 걷는다.
   알려진 한계:
   (a) Android Chrome은 사용자 탭 없이 쌓인 항목을 뒤로가기에서 건너뛸 수 있다. 부팅 때 쌓이는 항목(설치 안내,
       공유 미리보기, #/expenses/add)은 첫 탭 전까지 뒤로가기로 앱을 나갈 수 있다. 탭을 한 번 하면 건너뛰지 않는다.
   (b) 바로가기·링크로 연 화면에서 '뒤로가기 = 앱 나가기'는 첫 레이어나 탭 이동 전까지만 맞다.
   (c) 실행 중인 앱에 외부 링크(#/…)가 들어와 홈으로 끝나면 뒤로가기를 한 번 더 눌러야 할 수 있다.
   (d) iOS 홈 화면 앱에는 시스템 뒤로가기가 없다. ✕·아래로 밀기·◀ 버튼으로 닫는다. */
const Nav = {
  TABS: ["home", "sessions", "planner", "guide", "expenses"],
  ROUTES: ["home", "sessions", "planner", "guide", "expenses", "settings"],
  trap: false, booting: true, silent: false, inPop: false, lastHash: null,
  scroll: {},
  overlayCount() {
    let n = 0;
    if ($("#layer-overlay")) n++;
    const m = $("#modal-overlay");
    if (m && !m._closing) n++;
    const d = $("#drawer-overlay");
    if (d && !d.dataset.closing) n++;
    if ($("#report-screen.open")) n++;
    const g = $("#install-guide");
    if (g && !g.classList.contains("hidden")) n++;
    return n;
  },
  depth() { return (currentTab !== "home" ? 1 : 0) + this.overlayCount(); },
  hash() { return "#/" + currentTab; },
  replace() { history.replaceState({ app: 1 }, "", this.hash()); this.lastHash = this.hash(); },
  push() { history.pushState({ app: 1 }, "", this.hash()); this.lastHash = this.hash(); this.trap = true; },
  sync() {
    if (!/share=/.test(location.hash)) this.replace(); // 공유 해시는 Share.checkLink가 직접 지운다
    if (this.inPop) return;
    const d = this.depth();
    if (d > 0 && !this.trap && !this.booting) this.push();
    else if (d === 0 && this.trap) {
      // 한 틱 미룸: closeModal(); openDetail() 같은 연쇄 호출이 함정을 그대로 쓰게
      setTimeout(() => {
        if (this.depth() === 0 && this.trap) { this.trap = false; this.silent = true; history.back(); }
      }, 0);
    }
  },
  /* 닫히는 중인 레이어는 건너뜀 (overlayCount와 같은 규칙) — 아니면 while(closeTop()) 이 애니메이션 동안 끝나지 않음 */
  closeTop() {
    if ($("#layer-overlay")) { closeLayer(); return true; }
    const m = $("#modal-overlay");
    if (m && !m._closing) {
      if (m._sticky) return false;
      (m._dismiss || closeModal)();
      return true;
    }
    const d = $("#drawer-overlay");
    if (d && !d.dataset.closing) { closeDrawer(); return true; }
    const r = $("#report-screen.open");
    if (r) { r.classList.remove("open"); this.sync(); return true; }
    const g = $("#install-guide");
    if (g && !g.classList.contains("hidden")) { hideInstallGuide(); return true; }
    return false;
  },
  parse() {
    const m = location.hash.match(/^#\/([a-z]+)(?:\/([a-z]+))?/);
    if (!m || !this.ROUTES.includes(m[1])) return ["home", null];
    return [m[1], m[2] || null];
  },
  openSub(route, sub) {
    if (route === "expenses" && sub === "add" && S().onboarded) Expenses.openForm();
  },
  init() {
    const [route, sub] = /share=/.test(location.hash) ? ["home", null] : this.parse();
    this.booting = true;
    switchTab(route);
    this.booting = false;
    this.openSub(route, sub);
  },
  onPop(e) {
    if (!Store.state) return;
    if (this.silent) {
      this.silent = false;
      if (!/share=/.test(location.hash)) this.replace();
      return;
    }
    // 실행 중인 앱으로 들어온 외부 링크·바로가기 (popstate의 e.state가 null) — e.state를 보는 유일한 곳
    if (e.state === null && location.hash !== this.lastHash) {
      if (/share=/.test(location.hash)) return; // share.js의 hashchange가 가져옴
      const [route, sub] = this.parse();
      this.inPop = true;
      while (this.closeTop());
      switchTab(route);
      this.openSub(route, sub);
      this.inPop = false;
      this.replace();
      this.trap = this.depth() > 0; // 이 항목이 함정 역할
      return;
    }
    this.trap = false;
    this.inPop = true;
    if (this.overlayCount() > 0) this.closeTop();
    else if (currentTab !== "home") switchTab("home");
    this.inPop = false;
    if (this.depth() > 0) this.push();
  }
};
window.addEventListener("popstate", (e) => Nav.onPop(e));

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
  if (mc) mc.content = t === "dark" ? "#16233f" : "#ffffff"; // 상단 헤더 색과 맞춤
  // 시간표 블록 색은 렌더 시점에 계산되므로 테마가 바뀌면 다시 그림
  if (changed && currentTab === "planner" && Views.planner) Views.planner();
}
if (darkMQ) {
  const onSys = () => { if (Store.state && S().theme === "system") applyTheme(); };
  if (darkMQ.addEventListener) darkMQ.addEventListener("change", onSys);
  else if (darkMQ.addListener) darkMQ.addListener(onSys);
}

/* ---------- text scale (보통/크게/아주 크게) ---------- */
const TEXT_SCALES = [1, 1.12, 1.25];
function textScale() { const v = +((Store.state || {}).text_scale) || 1; return TEXT_SCALES.includes(v) ? v : 1; }
function applyTextScale() { document.documentElement.style.setProperty("--text-scale", textScale()); }

/* ---------- online / offline ---------- */
function paintNet() { const b = $("#net-badge"); if (b) b.classList.toggle("hidden", navigator.onLine); }
window.addEventListener("offline", () => { paintNet(); toast("오프라인이에요 · 저장된 데이터로 계속 쓸 수 있어요"); });
window.addEventListener("online", () => { paintNet(); toast("다시 연결됐어요"); if (currentTab === "home") Weather.refresh(); });

/* ---------- 화면 크기 단계 (compact <600 · medium 600–839 · expanded ≥840) ----------
   단계가 바뀌면(폴드 펼침·회전) 지금 화면을 다시 그린다. 열린 레이어는 닫지 않는다. */
const Layout = {
  mqM: window.matchMedia("(min-width: 600px)"),
  mqE: window.matchMedia("(min-width: 840px)"),
  size() { return this.mqE.matches ? "expanded" : this.mqM.matches ? "medium" : "compact"; },
  wide() { return this.size() !== "compact"; },
  apply() { document.documentElement.dataset.size = this.size(); },
  onChange() { this.apply(); if (Store.state && Views[currentTab]) Views[currentTab](); }
};
[Layout.mqM, Layout.mqE].forEach((mq) => {
  const fn = () => Layout.onChange();
  if (mq.addEventListener) mq.addEventListener("change", fn); else if (mq.addListener) mq.addListener(fn);
});

/* ---------- drawer (side panel for tips/info) ---------- */
function openDrawer(title, html) {
  clearTimeout(closeDrawer._t); // 막 닫힌 드로어의 정리 타이머가 새 드로어를 지우지 않게
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
  Nav.sync();
}
function closeDrawer() {
  const ov = $("#drawer-overlay");
  if (!ov || ov.dataset.closing) return;
  ov.dataset.closing = "1";
  ov.classList.remove("open");
  closeDrawer._t = setTimeout(() => { const r = $("#drawer-root"); if (r) r.innerHTML = ""; }, 260);
  Nav.sync();
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
        el.innerHTML = `<div class="wx-ico">${this.icon(data.current.weathercode)}</div>
          <div class="wx-t">${t}°</div>
          <div class="wx-range">${mx}° / ${mn}°</div>`;
      }
    } catch (e) { if (el) el.style.display = "none"; }
  }
};

/* ---------- install prompt (Android/Chrome) ---------- */
let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const b = $("#inst-now");
  if (b) b.classList.remove("hidden");
});
window.addEventListener("appinstalled", installDone); // 브라우저 메뉴로 설치한 경우도
async function doInstallPrompt() {
  if (!deferredPrompt) { toast("이 기기에서는 자동 설치를 지원하지 않아요"); return; }
  deferredPrompt.prompt();
  try {
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") installDone();
  } catch (e) {}
  deferredPrompt = null;
  const b = $("#inst-now");
  if (b) b.classList.add("hidden");
}
/* 설치됨: 설정의 설치 안내는 닫고, 온보딩 첫 화면은 '홈 화면 아이콘으로 여세요'로 바꿈 */
function installDone() {
  S().install_dismissed = true; Store.save();
  const g = $("#install-guide");
  if (g && !g.classList.contains("hidden")) { hideInstallGuide(); toast("설치가 시작됐어요 📲"); }
  const box = $("#onboarding #inst-box");
  if (box) box.innerHTML = `<div class="notice">✅ 설치했어요! 홈 화면의 <strong>re:invent 2026</strong> 아이콘으로 열어서 시작해 주세요.</div>`;
}

/* ---------- install guide (PWA) ---------- */
function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}
/* 접속 환경: os(ios|android|desktop) · browser · inapp(kakao|line|other — 앱 안 브라우저라 설치 불가) */
function browserEnv() {
  const ua = navigator.userAgent || "";
  const os = /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? "ios" // iPadOS는 Mac으로 보임
    : /android/i.test(ua) ? "android" : "desktop";
  const inapp = /KAKAOTALK/i.test(ua) ? "kakao" : /\bLine\//.test(ua) ? "line"
    : /NAVER\(inapp|Instagram|FBAN|FBAV|FB_IAB|DaumApps|BAND\/|everytimeApp|; wv\)/i.test(ua) ? "other"
    : os === "ios" && !/Safari\//.test(ua) ? "other" : null; // iOS 앱 안 웹뷰는 'Safari/'가 없음
  const browser = /SamsungBrowser/.test(ua) ? "samsung" : /EdgA|EdgiOS|Edg\//.test(ua) ? "edge"
    : /Whale/.test(ua) ? "whale" : /FxiOS|Firefox/.test(ua) ? "firefox"
    : /CriOS|Chrome/.test(ua) ? "chrome" : /Safari/.test(ua) ? "safari" : "other";
  return { os, browser, inapp };
}
/* 설치할 주소: 이 페이지 + 공유 링크로 들어왔다면 그 코드 (Share.checkLink가 주소에서 지우고 보관해 둠) */
function installURL() {
  const code = Share.peekPending();
  return location.origin + location.pathname + location.search + (code ? "#share=" + code : "");
}
/* 앱 안 브라우저 → 기본 브라우저로 여는 주소. iOS의 다른 앱은 방법이 없어 null (메뉴 안내)
   Android intent는 주소의 #을 넘기지 못해 공유 코드가 빠짐 (Chrome이 없으면 fallback 주소로 엶) */
function externalURL(env) {
  const url = installURL();
  if (env.inapp === "kakao") return "kakaotalk://web/openExternal?url=" + encodeURIComponent(url);
  if (env.inapp === "line") { const u = new URL(url); u.searchParams.set("openExternalBrowser", "1"); return u.href; }
  if (env.os !== "android") return null;
  const u = new URL(url);
  return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=${u.protocol.replace(":", "")};package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url)};end`;
}
/* 환경별 설치 방법 (온보딩 첫 화면 · 설정 → 설치 안내 공용). bindInstallBlock()으로 버튼 연결 */
function installBlock(env) {
  const add = `<strong>"홈 화면에 추가"</strong>`;
  const run = `<li>홈 화면의 <strong>re:invent 2026</strong> 아이콘으로 실행하세요</li>`;
  const now = `<button class="btn accent block${deferredPrompt ? "" : " hidden"}" id="inst-now">📲 바로 설치하기</button>`;
  const copy = `<button class="btn ghost block" id="inst-copy">🔗 주소 복사</button>`;
  let html;
  if (env.inapp) {
    const name = { kakao: "카카오톡", line: "LINE" }[env.inapp] || "이 앱";
    const target = env.os === "ios" ? "Safari" : "Chrome";
    const ext = externalURL(env);
    html = `<div class="warn-box">${name} 안의 브라우저에서는 홈 화면에 추가할 수 없어요. <strong>${target}</strong>에서 연 다음 설치해 주세요.</div>
      ${ext ? `<a class="btn accent block" id="inst-ext" href="${esc(ext)}">${target}에서 열기</a>`
        : `<ol class="inst-steps"><li>화면 위나 아래의 <strong>···</strong> 메뉴를 누르세요</li><li><strong>"Safari로 열기"</strong>(또는 "브라우저로 열기")를 누르세요</li></ol>`}
      ${copy}`;
  } else if (env.os === "ios") {
    html = env.browser === "safari"
      ? `<ol class="inst-steps"><li>주소창의 <strong>공유 버튼(⎙)</strong>을 누르세요<br><span class="muted">안 보이면 <strong>···</strong> → 공유</span></li><li>목록을 올려 ${add}를 누르세요</li><li>오른쪽 위 <strong>추가</strong>를 누르세요</li>${run}</ol>`
      : `<ol class="inst-steps"><li>주소창 오른쪽의 <strong>공유 버튼(⎙)</strong>을 누르세요</li><li>${add}를 누르세요</li>${run}</ol>
        <p class="muted inst-note">메뉴에 없으면 주소를 복사해 Safari에서 열어 주세요.</p>${copy}`;
  } else if (env.os === "android") {
    const menu = env.browser === "samsung" ? `아래 <strong>≡ 메뉴</strong> → <strong>"현재 페이지 추가"</strong> → <strong>"홈 화면"</strong>을 누르세요`
      : env.browser === "chrome" ? `오른쪽 위 <strong>⋮ 메뉴</strong> → <strong>"앱 설치"</strong> 또는 ${add}를 누르세요`
      : `브라우저 메뉴에서 <strong>"앱 설치"</strong> 또는 ${add}를 누르세요`;
    html = `${now}<ol class="inst-steps"><li>${menu}</li>${run}</ol>`;
  } else {
    const menu = env.browser === "safari" ? `메뉴 막대의 <strong>파일 → "Dock에 추가"</strong>를 누르세요`
      : env.browser === "firefox" ? `Firefox는 앱 설치를 지원하지 않아요. Chrome이나 Edge에서 열어 주세요`
      : `주소창 오른쪽의 <strong>설치 아이콘</strong> 또는 메뉴 → <strong>"앱 설치"</strong>를 누르세요`;
    html = `${now}<ol class="inst-steps"><li>${menu}</li></ol>`;
  }
  return `<div id="inst-box">${html}</div>`;
}
function bindInstallBlock() {
  const now = $("#inst-now");
  if (now) now.onclick = doInstallPrompt;
  const cp = $("#inst-copy");
  if (cp) cp.onclick = async () => {
    const url = installURL();
    try { await navigator.clipboard.writeText(url); toast("주소를 복사했어요"); } catch (e) { prompt("아래 주소를 복사하세요", url); }
  };
}
function maybeShowInstallGuide(force) {
  if (isStandalone()) { if (force) toast("이미 앱으로 실행 중이에요 👍"); return; }
  if (S().install_dismissed && !force) return;
  const el = $("#install-guide");
  el.classList.remove("hidden");
  el.innerHTML = `<div class="sheet">
    <h2>📲 홈 화면에 추가하기</h2>
    <p class="muted">이 앱을 홈 화면에 추가하면 주소창 없이 앱처럼 실행됩니다.</p>
    ${installBlock(browserEnv())}
    <div class="notice">설치 후에는 <strong>홈 화면 아이콘</strong>으로 실행해 주세요. (브라우저로 열면 저장된 데이터가 다르게 보일 수 있습니다)</div>
    <button class="btn block" id="install-ok">확인</button>
    <button class="btn ghost block" id="install-never">다시 보지 않기</button>
  </div>`;
  bindInstallBlock();
  $("#install-ok").onclick = hideInstallGuide;
  $("#install-never").onclick = () => { S().install_dismissed = true; Store.save(); hideInstallGuide(); };
  Nav.sync();
}
function hideInstallGuide() { $("#install-guide").classList.add("hidden"); Nav.sync(); }

/* ---------- onboarding ---------- */
/* 모바일 브라우저는 설치부터: iOS는 브라우저와 홈 화면 앱의 저장 공간이 따로라 여기서 입력한 프로필이 앱에 없음 */
function startOnboarding() {
  const el = $("#onboarding");
  el.classList.remove("hidden");
  if (!isStandalone() && browserEnv().os !== "desktop" && !S().install_dismissed) stepInstall();
  else stepNotice();
}
function stepInstall() {
  const env = browserEnv();
  obShell(`
    <h2>📲 먼저 앱으로 설치해 주세요</h2>
    <p class="muted inst-note">홈 화면에 추가한 앱에서 시작하면 프로필 입력을 한 번만 하면 돼요.${env.os === "ios" && !env.inapp ? " iPhone·iPad는 브라우저와 앱의 저장 공간이 따로라서, 여기서 입력하면 앱에서 다시 입력해야 해요." : ""}</p>
    ${installBlock(env)}
    ${Share.peekPending() ? `<p class="muted inst-note">이미 앱을 설치했다면 '브라우저에서 그냥 쓸게요'로 동료 일정을 연 뒤, <strong>코드 복사</strong>해서 앱에 붙여넣으세요.</p>` : ""}
    <button class="link-btn ob-skip" id="ob-skip">브라우저에서 그냥 쓸게요</button>`);
  bindInstallBlock();
  $("#ob-skip").onclick = () => {
    Store.load(); // Android는 설치한 앱과 저장 공간이 같음 — 그새 앱에서 온보딩을 마쳤다면 덮어쓰지 않게
    S().install_dismissed = true; Store.save();
    if (S().onboarded) finishOnboarding(); else stepNotice();
  };
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
  const svcs = serviceList().slice(0, 20);
  obShell(`
    <h2>프로필</h2>
    <label class="field">닉네임 (선택)</label>
    <input type="text" id="ob-nick" placeholder="예: ch.9" maxlength="20">
    <label class="field">관심 토픽 (최대 10개)</label>
    <div class="chip-row" id="ob-topics">${topics.map((t) => `<button class="chip" data-t="${esc(t)}">${esc(t)}</button>`).join("")}</div>
    <label class="field" style="display:block;margin-top:10px;">관심 AWS 서비스 (최대 5개 · 선택)</label>
    <div class="chip-row" id="ob-svcs">${svcs.map((x) => `<button class="chip" data-s="${esc(x.name)}">${esc(shortService(x.name))}</button>`).join("")}</div>
    <p class="muted" style="font-size:12px;margin:2px 0 0;">관심사는 홈의 맞춤 세션 추천에 반영돼요. 나중에 설정에서 바꿀 수 있어요.</p>
    <button class="btn block" id="ob-done">시작하기</button>`);
  const picked = new Set();
  const svcPicked = new Set();
  $$("#ob-topics .chip").forEach((c) => c.onclick = () => {
    const t = c.dataset.t;
    if (picked.has(t)) { picked.delete(t); c.classList.remove("on"); }
    else if (picked.size < 10) { picked.add(t); c.classList.add("on"); }
    else toast("최대 10개까지 선택할 수 있어요");
  });
  $$("#ob-svcs .chip").forEach((c) => c.onclick = () => {
    const s = c.dataset.s;
    if (svcPicked.has(s)) { svcPicked.delete(s); c.classList.remove("on"); }
    else if (svcPicked.size < 5) { svcPicked.add(s); c.classList.add("on"); }
    else toast("최대 5개까지 선택할 수 있어요");
  });
  $("#ob-done").onclick = () => {
    S().profile.nickname = $("#ob-nick").value.trim();
    S().profile.topics = Array.from(picked);
    S().profile.services = Array.from(svcPicked);
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
/* 홈 빠른 실행: 단계(출발 전·행사 중·귀국 후)마다 다른 도구 */
const HomeActions = {
  pack: ["🎒", "준비물", () => { Guide.next = "prep"; switchTab("guide"); }],
  trip: ["✈️", "출장 정보", () => Prep.editTrip()],
  rec: ["✨", "추천 세션", () => { Sessions.sort = "recommended"; Sessions.resetFilters(); switchTab("sessions"); }],
  notes: ["📝", "노트", () => Notes.open()],
  receipt: ["🧾", "영수증", () => Expenses.openForm(null, { photoFirst: true })],
  tip: ["💵", "팁", () => LocalGuide.openTips()],
  expo: ["🎪", "스탬프", () => Notes.open("expo")],
  sos: ["🆘", "응급", () => openDrawer("🆘 응급·안전", LocalGuide.emergencyHTML())],
  csv: ["🧾", "정산 내보내기", () => { switchTab("expenses"); Expenses.openExport(); }],
  "notes-txt": ["📝", "노트 내보내기", () => SessionNotes.exportTxt()],
  backup: ["💾", "백업", () => TransferUI.exportFile()],
  BY_PHASE: { before: ["pack", "trip", "rec", "notes"], during: ["receipt", "tip", "notes", "expo", "sos"], after: ["csv", "notes-txt", "backup"] },
  rowHTML(ph) {
    return `<div class="qa-row span-2">${this.BY_PHASE[ph].map((k) => {
      const [ico, label] = this[k];
      return `<button class="qa" data-qa="${k}"><span class="qa-ico">${ico}</span><span>${label}</span></button>`;
    }).join("")}</div>`;
  },
  bind(root) { $$("[data-qa]", root).forEach((b) => b.onclick = () => this[b.dataset.qa][2]()); }
};

Views.home = function () {
  const st = S();
  const ph = phase();
  const nick = st.profile.nickname ? esc(st.profile.nickname) + "님" : "게스트님";
  const dd = dday();
  // 행사 기간(11/30–12/4)에는 'DAY n'으로
  const ddText = dd > 0 ? `D-${dd}` : -dd <= 4 ? `DAY ${1 - dd}` : `D+${-dd}`;
  const today = vegasDateStr();
  const vp = vegasParts(), nowHM = `${vp.hour}:${vp.minute}`;

  const tripTodos = [];
  const f = st.trip.flights;
  if (!f.outbound.flight_no) tripTodos.push("가는 편 항공편 미정");
  if (!f.inbound.flight_no) tripTodos.push("오는 편 항공편 미정");
  if (!st.trip.hotel.name) tripTodos.push("호텔 미정");
  const unres = st.favorites.filter((id) => !(st.reservations[id] && st.reservations[id].status === "reserved"));
  const todos = [];
  const bAt = st.last_backup_at, bDays = bAt ? Math.floor((Date.now() - bAt) / 86400000) : null;
  if ((bAt == null && (st.favorites.length || st.expenses.length)) || bDays >= 3) {
    todos.push({ text: bAt == null ? "💾 아직 백업하지 않았어요" : `💾 백업한 지 ${bDays}일 지났어요`, act: () => { TransferUI.exportFile(); Views.home(); } });
  }
  if (ph !== "after") tripTodos.forEach((t) => todos.push({ text: t, tab: "guide" }));
  if (ph !== "after" && unres.length) todos.push({ text: `예약 안 된 관심 세션 ${unres.length}개`, tab: "sessions" });
  const cl = Packing.list();
  const clDone = cl.filter((x) => x.done).length;
  if (ph === "before" && clDone < cl.length) todos.push({ text: `준비물 ${clDone}/${cl.length} 완료`, tab: "guide", seg: "prep" });
  if (today >= "2026-12-03" && today <= "2026-12-05") todos.push({ text: "✈️ 귀국 준비 확인 (체크아웃·공항·면세)", tab: "guide", seg: "return" });

  const pending = sessionsPending();

  const hero = ph === "during"
    ? `<div class="card hero compact span-2">
        <div class="hero-row"><div><div class="hero-dd">${ddText}</div>
          <div class="hero-sub">${nick} · 현지 ${fmtDate(vegasParts())}</div></div>
          <div id="home-weather" class="hero-wx">⛅</div></div></div>`
    : `<div class="card hero span-2">
        <div class="hero-row">
          <div>
            <div class="hero-sub">${ph === "after" ? `수고하셨어요, ${nick} 🙌` : `안녕하세요, ${nick} 👋`}</div>
            <div class="hero-dd big">${ddText}</div>
            <div class="hero-sub">11/30–12/4 · 라스베가스 (현지 ${fmtDate(vegasParts())})</div>
          </div>
          <div id="home-weather" class="hero-wx">⛅</div>
        </div>
      </div>`;

  const upcoming = `<div id="home-upcoming" class="span-2">${Planner.upcomingHTML()}</div>`;

  const recCard = (() => {
    if (ph === "after" || pending) return "";
    const prof = st.profile || {};
    const hasInterests = (prof.topics || []).length || (prof.services || []).length;
    if (!hasInterests) {
      return `<div class="card"><h3>✨ 맞춤 세션 추천</h3>
        <p class="muted" style="margin:0 0 8px;">관심 토픽·AWS 서비스를 설정하면 2,200여 개 세션 중 나에게 맞는 걸 골라 드려요.</p>
        <button class="btn ghost block small" id="home-rec-profile">관심사 설정하기</button></div>`;
    }
    const recs = ph === "during"
      ? Suggest.recommended(3, (s) => s.date > today || (s.date === today && s.start_time > nowHM))
      : Suggest.recommended(4);
    if (!recs.length) return "";
    return `<div class="card"><h3>✨ 나를 위한 추천 세션</h3>
      <p class="muted" style="font-size:12px;margin:0 0 6px;">관심 토픽·서비스 기준 · 아직 안 담은 세션이에요.</p>
      <div id="home-rec-list">${recs.map((s) => Sessions.recRowHTML(s)).join("")}</div>
      <button class="btn ghost block small" id="home-rec-more">추천 세션 더 보기</button></div>`;
  })();

  const newsCard = (() => {
    const items = News.items();
    if (!items.length && today < EVENT_START) return "";
    return `<div class="card"><h3>📣 신규 발표 노트</h3>
      ${items.length ? News.rowsHTML(items.slice(0, 3)) : `<p class="muted" style="margin:0;">키노트에서 들은 새 서비스·기능을 적어 두면 관련 세션을 바로 찾아 줘요.</p>`}
      <button class="btn ghost block small" id="home-news">${items.length > 3 ? `전체 ${items.length}개 · ` : ""}발표 노트 열기</button></div>`;
  })();

  const todoCard = `<div class="card"><h3>할 일</h3>
    ${todos.length ? todos.map((t, i) => `<div class="todo-item" data-todo-i="${i}" role="button" tabindex="0">
      <span class="dot"></span><span class="txt">${esc(t.text)}</span><span class="chev">›</span></div>`).join("") : `<p class="muted">할 일이 없어요. 완벽해요 ✨</p>`}
  </div>`;

  const keynoteCard = (() => {
    const k = keynoteInfo(), kn = keynoteSessions();
    if (ph === "after" || (ph === "during" && !kn.some((s) => s.date >= today))) return "";
    const who = (s) => {
      const n = (s.speakers || []).map((x) => String(x).split(" · ")[0]);
      return n.length > 2 ? `${n.slice(0, 2).join(", ")} 외 ${n.length - 2}명` : n.join(", ");
    };
    const places = [...new Set(kn.map((s) => shortVenue(s.venue)))].join(", ");
    return `<div class="card"><h3>🎤 키노트</h3>
      ${kn.length ? kn.map((s) => {
        const on = st.favorites.includes(s.session_id);
        return `<div class="sg-row">
          <div class="sg-main" data-kn-open="${esc(s.session_id)}" role="button" tabindex="0">
            <b>${esc(s.title)}</b>
            <span class="muted">${esc(dayLabel(s.date))} ${esc(s.start_time)}–${esc(s.end_time)}${who(s) ? " · " + esc(who(s)) : ""}</span>
          </div>
          <div class="sg-act"><button class="sg-btn${on ? " on" : " primary"}" data-kn-fav="${esc(s.session_id)}">${on ? "담김 ✓" : "담기"}</button></div>
        </div>`;
      }).join("") +
        (() => {
          const left = kn.filter((s) => !st.favorites.includes(s.session_id)).length;
          return left > 1 ? `<button class="btn ghost block small" id="kn-all">키노트 ${left}개 모두 담기</button>` : "";
        })() +
        `<p class="muted" style="font-size:12px;margin:6px 0 0;">📍 ${esc(places)} · 담으면 내 일정 시간표에 들어가요.${k.note ? " " + esc(k.note) : ""}</p>`
      : `<p class="muted" style="font-size:13px;margin:0;">공식 일정·연사는 아직 공개 전이에요.</p>`}
      ${k.korean_interpretation ? `<div class="notice" style="margin-bottom:0;">🇰🇷 ${esc(k.korean_interpretation_note || "키노트 한국어 실시간 통역 제공")}${k.livestream ? ` · ${esc(k.livestream)}` : ""}</div>` : ""}
    </div>`;
  })();

  const recapCard = (() => {
    if (ph !== "after") return "";
    const planned = Object.values(st.daily_plan || {}).reduce((a, d) => a + (d || []).length, 0);
    const notes = SessionNotes.items().length;
    const sum = (own) => st.expenses.filter((e) => e.owner === own).reduce((a, e) => a + (+e.amount_usd || 0), 0);
    const fmt = (n) => Number(n || 0).toLocaleString("ko-KR");
    return `<div class="card span-2" id="home-recap"><h3>🧳 출장 정리</h3>
      <div class="kv"><span>담은 세션</span><b>${planned}개</b></div>
      <div class="kv"><span>세션 노트</span><b>${notes}개</b></div>
      <div class="kv"><span>🏢 회사 지출</span><b>$${fmt(sum("company"))}</b></div>
      <div class="kv"><span>👤 개인 지출</span><b>$${fmt(sum("personal"))}</b></div>
      <button class="btn ghost block small" id="home-recap-notes">📝 노트 열기</button>
    </div>`;
  })();

  const qa = HomeActions.rowHTML(ph);
  const notice = pending ? `<div class="notice span-2">📡 세션 카탈로그 수집 대기 중 — 공식 카탈로그에서 수집하면 세션 탭이 활성화됩니다.</div>` : "";
  const order = ph === "during" ? [hero, notice, upcoming, qa, todoCard, recCard, keynoteCard, newsCard, Expo.cardHTML()]
    : ph === "after" ? [hero, recapCard, qa, todoCard]
    : [hero, notice, qa, upcoming, todoCard, recCard, keynoteCard, newsCard, Expo.cardHTML()];
  const el = $("#view-home");
  el.classList.toggle("home-grid", Layout.wide()); // 넓은 화면: 카드 2열
  el.innerHTML = order.join("");

  HomeActions.bind(el);
  $$("#view-home [data-todo-i]").forEach((row) => row.onclick = () => {
    const t = todos[+row.dataset.todoI];
    if (t.act) t.act();
    else { if (t.seg) Guide.next = t.seg; switchTab(t.tab); }
  });
  const rn = $("#home-recap-notes");
  if (rn) rn.onclick = () => Notes.open();
  Planner.bindUpcoming();
  Expo.bindCard();
  const hn = $("#home-news");
  if (hn) hn.onclick = () => Notes.open("news");
  $$("#view-home [data-news-q]").forEach((b) => b.onclick = () => News.show(b.dataset.newsQ));
  const rpf = $("#home-rec-profile");
  if (rpf) rpf.onclick = () => Settings.editProfile();
  const rmo = $("#home-rec-more");
  if (rmo) rmo.onclick = HomeActions.rec[2];
  $$("#home-rec-list [data-rec-open]").forEach((row) => row.onclick = () => Sessions.openDetail(row.dataset.recOpen));
  $$("#home-rec-list [data-rec-add]").forEach((b) => b.onclick = (e) => { e.stopPropagation(); Sessions.toggleFav(b.dataset.recAdd); Views.home(); });
  $$("#view-home [data-kn-open]").forEach((row) => row.onclick = () => Sessions.openDetail(row.dataset.knOpen));
  $$("#view-home [data-kn-fav]").forEach((b) => b.onclick = (e) => { e.stopPropagation(); Sessions.toggleFav(b.dataset.knFav); Views.home(); });
  const knAll = $("#kn-all");
  if (knAll) knAll.onclick = () => {
    const r = Sessions.addMany(keynoteSessions().map((s) => s.session_id));
    toast(`키노트 ${r.added}개를 담았어요${r.skipped ? ` · ${r.skipped}개는 시간이 겹쳐 건너뛰었어요` : ""}`);
    Views.home();
  };
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
    Store.save(); Views.guide();
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
      Store.save(); closeModal(); Views.guide(); toast("저장했어요");
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
      Store.save(); closeModal(); Views.guide(); toast("삭제했어요");
    };
    $("#ck-cancel").onclick = closeModal;
  }
};

/* ---------- service worker: 오프라인 캐시 + 새 버전 알림 ---------- */
function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  const hadController = !!navigator.serviceWorker.controller; // 첫 설치 때는 알리지 않음
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (hadController) showUpdateBar(); });
  navigator.serviceWorker.register("sw.js").then((reg) => {
    // 홈 화면 앱은 오래 켜 두므로, 다시 볼 때마다 새 버전 확인
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") reg.update().catch(() => {});
    });
  }).catch(() => {});
}
function showUpdateBar() {
  if ($("#update-bar")) return;
  const bar = document.createElement("div");
  bar.id = "update-bar";
  bar.setAttribute("role", "status");
  bar.innerHTML = `<span>새 버전이 있어요</span><button class="btn small" id="update-reload">새로고침</button>`;
  document.body.appendChild(bar);
  $("#update-reload").onclick = () => location.reload();
}

/* ---------- boot ---------- */
window.addEventListener("load", registerSW);
document.addEventListener("DOMContentLoaded", () => {
  // 스플래시: 하루 첫 실행에만 (index.html 첫 페인트 스크립트가 data-splash="skip"으로 표시)
  const splash = $("#splash");
  if (splash && document.documentElement.dataset.splash === "skip") splash.remove();
  else if (splash) {
    setTimeout(() => splash.classList.add("zoom"), 1700);
    setTimeout(() => splash.classList.add("hide"), 2100);
    setTimeout(() => splash.remove(), 2600);
  }
  // 저장소 보존 요청: 브라우저가 공간을 정리할 때 일정·정산 데이터를 지우지 않게
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persisted().then((p) => p || navigator.storage.persist()).catch(() => {});
  }
  Store.load();
  applyTheme();
  applyTextScale();
  Layout.apply();
  paintNet();
  Notify.start();
  tickClock();
  setInterval(tickClock, 10000);
  $$("#tabbar button").forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.tab)));
  $("#hdr-settings").onclick = () => switchTab("settings");
  Nav.init(); // 첫 화면은 주소(#/…)에 따라 — 부팅 중에는 뒤로가기 함정을 쌓지 않음
  if (!S().onboarded) { Share.checkLink(); startOnboarding(); } // 공유 코드를 먼저 보관 (설치 화면이 외부 브라우저로 넘길 때 씀)
  else {
    Share.checkLink(); // 공유 해시를 먼저 소비 (설치 안내가 주소를 바꾸기 전에)
    maybeShowInstallGuide();
  }
});
