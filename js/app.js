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
  root.innerHTML = `<div class="overlay center" id="modal-overlay"><div class="sheet">${html}</div></div>`;
  const ov = $("#modal-overlay");
  ov.addEventListener("click", (e) => { if (e.target === ov && !(opts && opts.sticky)) closeModal(); });
  return ov;
}
function closeModal() { $("#modal-root").innerHTML = ""; }

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
    profile: { nickname: "", topics: [] },
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
    install_dismissed: false,
    fx_rate: 1450,
    theme: (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light",
    mock_sessions: false   // true -> 2025 샘플 세션으로 체험 (테스트용)
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
function tickClock() {
  const v = $("#clock-vegas"), k = $("#clock-kst");
  if (v) v.textContent = `라스베가스 ${fmtDateTime(vegasParts())}`;
  if (k) k.textContent = `한국 ${fmtDateTime(tzParts("Asia/Seoul"))}`;
}

/* ---------- theme (dark mode) ---------- */
function applyTheme() {
  const t = S().theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = t;
  const mc = document.querySelector('meta[name="theme-color"]');
  if (mc) mc.content = t === "dark" ? "#0e1420" : "#0f1f3d";
  const btn = $("#set-theme");
  if (btn) btn.textContent = t === "dark" ? "☀️ 라이트모드" : "🌙 다크모드";
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
  requestAnimationFrame(() => requestAnimationFrame(() => $("#drawer-overlay").classList.add("open")));
  const close = () => {
    const ov = $("#drawer-overlay");
    if (!ov) return;
    ov.classList.remove("open");
    setTimeout(() => { const r = $("#drawer-root"); if (r) r.innerHTML = ""; }, 260);
  };
  $("#drawer-close").onclick = close;
  $("#drawer-overlay").addEventListener("click", (e) => { if (e.target.id === "drawer-overlay") close(); });
}
function closeDrawer() { const r = $("#drawer-root"); if (r) r.innerHTML = ""; }

/* ---------- sessions accessor (supports 2025 mock mode) ---------- */
function allSessions() {
  if (S() && S().mock_sessions && window.MOCK_SESSIONS_2025) return window.MOCK_SESSIONS_2025;
  return (window.APP_DATA && window.APP_DATA.sessions) || [];
}
function sessionsPending() {
  if (S() && S().mock_sessions) return false;
  return !!(window.APP_DATA.meta && window.APP_DATA.meta.sessions_pending);
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
function maybeShowInstallGuide() {
  if (isStandalone() || S().install_dismissed) return;
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
    <button class="btn block" id="install-ok">확인</button>
    <button class="btn ghost block" id="install-never">다시 보지 않기</button>
  </div>`;
  $("#install-ok").onclick = () => el.classList.add("hidden");
  $("#install-never").onclick = () => { S().install_dismissed = true; Store.save(); el.classList.add("hidden"); };
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
      다른 기기(PC → 모바일 등)에서도 보려면<br><strong>설정 → '모바일로 옮기기'에서 코드로 옮겨</strong>주세요.<br><br>
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
  $("#ob-import").onclick = () => { TransferUI.showImport(() => { S().onboarded = true; Store.save(); finishOnboarding(); }); };
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
}

/* ---------- home view ---------- */
Views.home = function () {
  const st = S();
  const nick = st.profile.nickname ? esc(st.profile.nickname) + "님" : "게스트님";
  const dd = dday();
  const ddText = dd > 0 ? `D-${dd}` : dd === 0 ? "D-Day" : `D+${-dd}`;
  const ph = phase();

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

  const pending = sessionsPending();
  const mockOn = !!(S().mock_sessions && window.MOCK_SESSIONS_2025);
  const upcoming = ph === "during" ? Planner.todayItems() : [];

  $("#view-home").innerHTML = `
    <div class="card" style="background:linear-gradient(135deg,var(--navy),var(--navy2));color:#fff;">
      <div style="font-size:13px;opacity:.85">안녕하세요, ${nick} 👋</div>
      <div style="font-size:30px;font-weight:800;margin:4px 0;">${ddText}</div>
      <div style="font-size:13px;opacity:.85">11/30–12/4 · 라스베가스 (현지 ${fmtDate(vegasParts())})</div>
    </div>
    ${pending ? `<div class="notice">📡 세션 카탈로그 수집 대기 중 — 공식 카탈로그에서 수집하면 세션 탭이 활성화됩니다.</div>` : ""}
    ${mockOn ? `<div class="notice">🧪 <strong>2025 샘플 세션</strong>으로 체험 중이에요. 실제 데이터가 아닙니다 — 설정에서 끌 수 있어요.</div>` : ""}
    ${ph === "during" && upcoming.length ? `<div class="card"><h3>오늘의 일정</h3>${upcoming.slice(0, 4).map(Planner.itemHTML).join("")}<button class="btn ghost block small" data-go="planner">전체 일정 보기</button></div>` : ""}
    <div class="card"><h3>할 일</h3>
      ${todos.length ? todos.map((t) => `<div class="check-item" data-go="${t.tab}"><span>▫️ ${esc(t.text)}</span></div>`).join("") : `<p class="muted">할 일이 없어요. 완벽해요 ✨</p>`}
    </div>
    <div class="card"><h3>추후 확인</h3>
      <div class="muted" style="font-size:13px;">키노트 일정 · 셔틀 세부 노선 · Expo 공식 시간 — 공식 발표 시 앱에 반영됩니다.</div>
    </div>
    <div class="card"><h3>설정</h3>
      <div class="kv"><span>닉네임</span><b>${esc(st.profile.nickname) || "게스트"}</b></div>
      <div class="kv"><span>관심 토픽</span><b>${st.profile.topics.length ? esc(st.profile.topics.slice(0, 3).join(", ")) + (st.profile.topics.length > 3 ? "…" : "") : "미설정"}</b></div>
      <div class="row" style="margin-top:10px;">
        <button class="btn ghost small" id="set-profile">프로필 수정</button>
        <button class="btn ghost small" id="set-transfer">모바일로 옮기기</button>
      </div>
      <div class="row" style="margin-top:8px;">
        <button class="btn ghost small" id="set-backup">백업 내보내기</button>
        <button class="btn ghost small" id="set-install">설치 안내 다시 보기</button>
      </div>
      <div class="row" style="margin-top:8px;">
        <button class="btn ghost small" id="set-theme">🌙 다크모드</button>
        <button class="btn ghost small" id="set-mock">🧪 2025 샘플 세션</button>
      </div>
    </div>`;
  $$("#view-home [data-go]").forEach((el) => el.onclick = () => switchTab(el.dataset.go));
  $("#set-profile").onclick = Settings.editProfile;
  $("#set-transfer").onclick = () => TransferUI.showExport();
  $("#set-backup").onclick = () => TransferUI.exportFile();
  $("#set-install").onclick = () => { S().install_dismissed = false; maybeShowInstallGuide(); };
  $("#set-theme").onclick = () => {
    S().theme = S().theme === "dark" ? "light" : "dark";
    Store.save(); applyTheme();
    toast(S().theme === "dark" ? "다크모드로 바꿨어요 🌙" : "라이트모드로 바꿨어요 ☀️");
  };
  $("#set-mock").onclick = () => Settings.toggleMock();
  applyTheme();
};

const Settings = {
  editProfile() {
    const topics = (window.APP_DATA.topics && window.APP_DATA.topics.topics) || [];
    const picked = new Set(S().profile.topics);
    openModal(`
      <h2>프로필 수정</h2>
      <label class="field">닉네임</label>
      <input type="text" id="pf-nick" value="${esc(S().profile.nickname)}" maxlength="20">
      <label class="field">관심 토픽 (최대 10개)</label>
      <div class="chip-row" id="pf-topics">${topics.map((t) => `<button class="chip${picked.has(t) ? " on" : ""}" data-t="${esc(t)}">${esc(t)}</button>`).join("")}</div>
      <button class="btn block" id="pf-save">저장</button>
      <button class="btn ghost block" id="pf-cancel">취소</button>`);
    $$("#pf-topics .chip").forEach((c) => c.onclick = () => {
      const t = c.dataset.t;
      if (picked.has(t)) { picked.delete(t); c.classList.remove("on"); }
      else if (picked.size < 10) { picked.add(t); c.classList.add("on"); }
      else toast("최대 10개까지 선택할 수 있어요");
    });
    $("#pf-save").onclick = () => {
      S().profile.nickname = $("#pf-nick").value.trim();
      S().profile.topics = Array.from(picked);
      Store.save(); closeModal(); Views.home(); toast("저장했어요");
    };
    $("#pf-cancel").onclick = closeModal;
  },

  toggleMock() {
    if (!window.MOCK_SESSIONS_2025) { toast("샘플 데이터 파일이 없어요"); return; }
    S().mock_sessions = !S().mock_sessions;
    Store.save();
    toast(S().mock_sessions ? "🧪 2025 샘플 세션으로 체험해요" : "샘플 세션을 껐어요");
    Views.home();
  }
};

/* packing checklist defaults */
const Packing = {
  defaults() {
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
  Store.load();
  applyTheme();
  tickClock();
  setInterval(tickClock, 30000);
  $$("#tabbar button").forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.tab)));
  if (!S().onboarded) startOnboarding();
  else { switchTab("home"); maybeShowInstallGuide(); }
});
