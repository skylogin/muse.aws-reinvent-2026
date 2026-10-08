/* 세션 탭: 카탈로그 탐색, 관심 체크, 용어 검색 */
"use strict";

const SESSION_PAGE = 100; // 한 번에 그리는 카드 수 ('더 보기'로 늘림)
const RES_LABEL = { reserved: "예약됨", waitlist: "대기", none: "미예약" };

/* "Amazon Elastic Compute Cloud (Amazon EC2)" → "Amazon EC2" */
function shortService(name) {
  const m = String(name || "").match(/\(([^)]+)\)\s*$/);
  return m ? m[1] : String(name || "");
}
/* 카탈로그에 나온 AWS 서비스 [{name, n}] (세션 수 많은 순) */
let _serviceList = null;
function serviceList() {
  if (!_serviceList) {
    const m = {};
    allSessions().forEach((s) => (s.services || []).forEach((x) => { m[x] = (m[x] || 0) + 1; }));
    _serviceList = Object.entries(m).sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, n }));
  }
  return _serviceList;
}

/* "MGM Grand | Level 1 | Grand 122" → "Level 1 · Grand 122" (베뉴명 중복 제거) */
function roomLabel(s) {
  if (!s || !s.room) return "";
  const parts = String(s.room).split("|").map((x) => x.trim()).filter(Boolean);
  if (parts.length > 1 && s.venue && parts[0] === s.venue) parts.shift();
  return parts.join(" · ");
}

const Sessions = {
  q: "", f: { date: "", venue: "", type: "", level: "", topic: "", service: "", format: "", delivery: "" },
  venueGroup: false, // 베뉴별 모아보기
  limit: SESSION_PAGE,

  all() { return allSessions(); },
  pending() { return sessionsPending(); },

  filtered() {
    const q = this.q.trim().toLowerCase(), f = this.f;
    return this.all().filter((s) => {
      if (f.date && s.date !== f.date) return false;
      if (f.venue && s.venue !== f.venue) return false;
      if (f.type && s.session_type !== f.type) return false;
      if (f.level && String(s.level) !== f.level) return false;
      if (f.topic && !(s.topics || []).includes(f.topic)) return false;
      if (f.service && !(s.services || []).includes(f.service)) return false;
      if (f.format && s.session_format !== f.format) return false;
      if (f.delivery && s.delivery !== f.delivery) return false;
      if (q) {
        const hay = `${s.title} ${(s.abstract || "")} ${(s.speakers || []).join(" ")} ${s.code} ${(s.services || []).join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  },

  toggleFav(id) {
    const st = S();
    const i = st.favorites.indexOf(id);
    if (i >= 0) {
      st.favorites.splice(i, 1);
      // remove from daily plan
      Object.keys(st.daily_plan).forEach((d) => {
        st.daily_plan[d] = (st.daily_plan[d] || []).filter((x) => x.session_id !== id);
      });
      toast("관심 해제했어요");
      Store.save();
      Sessions.refreshAfterFav();
    } else {
      const s = this.all().find((x) => x.session_id === id);
      const c = s ? this.findConflict(s) : null;
      if (c) {
        openModal(`
          <h2>⚠️ 시간이 겹쳐요</h2>
          <p><strong>${esc(s.title)}</strong><br>
          <span class="muted" style="font-size:13px;">${s.date ? esc(dayLabel(s.date)) + " " : ""}${esc(s.start_time || "")}${s.end_time ? "–" + esc(s.end_time) : ""} · ${esc(s.venue || "")}</span></p>
          <p style="font-size:14px;">이미 담은 일정과 겹칩니다:</p>
          <div class="card" style="margin:8px 0;"><strong>${esc(c.title)}</strong><br>
          <span class="muted" style="font-size:13px;">${esc(c.start_time || "")}${c.end_time ? "–" + esc(c.end_time) : ""} · ${esc(c.venue || "")}</span></div>
          <button class="btn block" id="cf-yes">그래도 담기</button>
          <button class="btn ghost block" id="cf-no">취소</button>`);
        $("#cf-yes").onclick = () => { this.doFavAdd(id); closeModal(); };
        $("#cf-no").onclick = closeModal;
        return;
      }
      this.doFavAdd(id);
    }
  },

  doFavAdd(id) {
    const st = S();
    if (!st.favorites.includes(id)) st.favorites.push(id);
    const s = this.all().find((x) => x.session_id === id);
    if (s && s.date) {
      st.daily_plan[s.date] = st.daily_plan[s.date] || [];
      if (!st.daily_plan[s.date].some((x) => x.session_id === id))
        st.daily_plan[s.date].push({ session_id: id, note: "" });
      toast("내 일정에 담았어요 📅");
    } else toast("관심 세션에 담았어요");
    Store.save();
    Sessions.refreshAfterFav();
  },

  findConflict(s) {
    if (!s || !s.date || !s.start_time) return null;
    const toMin = (t) => { if (!t) return null; const [h, m] = t.split(":").map(Number); return h * 60 + m; };
    const s0 = toMin(s.start_time);
    const s1 = toMin(s.end_time) || s0 + 60;
    for (const x of (S().daily_plan[s.date] || [])) {
      if (x.session_id === s.session_id) continue;
      const o = this.all().find((y) => y.session_id === x.session_id);
      if (!o || !o.start_time) continue;
      const o0 = toMin(o.start_time);
      const o1 = toMin(o.end_time) || o0 + 60;
      if (s0 < o1 && o0 < s1) return o;
    }
    return null;
  },

  cardHTML(s) {
    const fav = S().favorites.includes(s.session_id);
    const res = fav ? (S().reservations[s.session_id] || {}).status : "";
    const room = roomLabel(s);
    return `<div class="card session-card" data-id="${esc(s.session_id)}">
      <button class="fav-btn ${fav ? "on" : ""}" data-fav="${esc(s.session_id)}" aria-label="${fav ? "관심 해제" : "관심 세션에 담기"}" aria-pressed="${fav}">${fav ? "⭐" : "☆"}</button>
      <strong>${esc(s.title)}</strong>
      <div class="meta">${esc(s.code || "")} · ${s.date ? esc(dayLabel(s.date)) : ""} ${esc(s.start_time || "")}${s.end_time ? "–" + esc(s.end_time) : ""}${s.level ? ` · Lv.${esc(s.level)}` : ""}<br>📍 ${esc(s.venue || "")}${room ? " · " + esc(room) : ""}</div>
      ${res === "reserved" ? `<div style="margin-top:6px;"><span class="badge ok">예약됨</span></div>` : res === "waitlist" ? `<div style="margin-top:6px;"><span class="badge warn">대기</span></div>` : ""}
    </div>`;
  },

  groupedByVenueHTML(list) {
    if (!list.length) return `<div class="empty-state">조건에 맞는 세션이 없어요</div>`;
    const groups = {};
    list.forEach((s) => {
      const v = s.venue || "장소 미정";
      (groups[v] = groups[v] || []).push(s);
    });
    const ordered = [...VENUES.filter((v) => groups[v]), ...Object.keys(groups).filter((v) => !VENUES.includes(v)).sort()];
    return ordered.map((v) => `
      <h3 style="margin:14px 0 6px;">📍 ${esc(v)} <span class="muted" style="font-size:12px;font-weight:400;">${groups[v].length}개</span></h3>
      ${groups[v].slice(0, 100).map((s) => this.cardHTML(s)).join("")}
      ${groups[v].length > 100 ? `<p class="muted" style="text-align:center;">외 ${groups[v].length - 100}개 — 검색·필터로 좁혀 보세요</p>` : ""}
    `).join("");
  },

  setReservation(id, status) {
    S().reservations[id] = { status, updated_at: new Date().toISOString() };
    Store.save();
    toast(status === "reserved" ? "예약됨으로 표시했어요" : status === "waitlist" ? "대기로 표시했어요" : "미예약으로 표시했어요");
  },

  openDetail(id) {
    const s = this.all().find((x) => x.session_id === id);
    if (!s) return;
    const fav = S().favorites.includes(id);
    const res = (S().reservations[id] || {}).status || "none";
    const room = roomLabel(s);
    const reps = Suggest.repeats(id);
    const fmtMap = { lecture: "이론", "hands-on": "실습", lab: "랩", discussion: "토론형" };
    const delMap = { "in-person": "현장만", livestream: "라이브스트림", recorded: "다시보기" };
    openModal(`
      <button class="fav-btn ${fav ? "on" : ""}" id="d-fav" style="font-size:24px;" aria-label="${fav ? "관심 해제" : "관심 세션에 담기"}" aria-pressed="${fav}">${fav ? "⭐" : "☆"}</button>
      <h2 style="padding-right:40px;">${esc(s.title)}</h2>
      <div style="margin:6px 0;">
        <span class="badge">${esc(s.code || "")}</span>
        <span class="badge info">${esc(s.session_type || "")}</span>
        ${s.level ? `<span class="badge">Lv.${esc(s.level)}</span>` : ""}
        ${s.session_format ? `<span class="badge">${esc(fmtMap[s.session_format] || s.session_format)}</span>` : ""}
        ${s.delivery ? `<span class="badge">${esc(delMap[s.delivery] || s.delivery)}</span>` : ""}
      </div>
      <div class="muted" style="font-size:13px;margin-bottom:8px;">
        ${s.date ? esc(dayLabel(s.date)) + " " : ""}${esc(s.start_time || "")}${s.end_time ? "–" + esc(s.end_time) : ""} (현지)
        ${kstRange(s.date, s.start_time, s.end_time) ? `<br>🇰🇷 한국 ${kstRange(s.date, s.start_time, s.end_time)}` : ""}
        ${s.venue ? `<br>📍 ${esc(s.venue)}${room ? " · " + esc(room) : ""}` : ""}
        ${s.speakers && s.speakers.length ? `<br>🎙️ ${esc(s.speakers.join(", "))}` : ""}
      </div>
      ${s.abstract ? `<p style="font-size:14px;">${esc(s.abstract)}</p>` : ""}
      ${(s.topics || []).length || (s.services || []).length ? `<div class="chip-row" id="d-topics">${(s.topics || []).map((t) => `<button class="chip" data-topic="${esc(t)}" title="이 토픽으로 필터">#${esc(t)}</button>`).join("")}${(s.services || []).map((t) => `<button class="chip svc" data-service="${esc(t)}" title="이 서비스로 필터">${esc(shortService(t))}</button>`).join("")}</div>` : ""}
      ${reps.length ? `<h3 class="sg-head">🔁 다른 회차 ${reps.length}개</h3>
      <p class="muted" style="font-size:12px;margin:0 0 2px;">같은 내용의 세션이 다른 날·장소에서도 열려요. 만석이면 다른 회차를 노려 보세요.</p>
      <div id="d-reps">${reps.map((c) => Suggest.repeatRowHTML(c)).join("")}</div>` : ""}
      ${fav ? `<label class="field" style="display:block;margin-top:10px;">예약 상태</label>
      <div class="chip-row" id="d-res">${["reserved", "waitlist", "none"].map((v) => `<button class="chip${res === v ? " on" : ""}" data-v="${v}">${RES_LABEL[v]}</button>`).join("")}</div>` : ""}
      ${s.prerequisites ? `<div class="kv"><span>사전 준비물</span><b>${esc(s.prerequisites)}</b></div>` : ""}
      ${s.swag ? `<div class="kv"><span>🎁 기념품</span><b>${esc(s.swag)}</b></div>` : ""}
      ${s.language ? `<div class="kv"><span>언어</span><b>${esc(s.language)}${s.caption_translation ? " · " + esc(s.caption_translation) : ""}</b></div>` : ""}
      ${((s.catalog_url || APP_DATA.catalog_url)) ? `<a class="btn ghost block" href="${esc(s.catalog_url || APP_DATA.catalog_url)}" target="_blank" rel="noopener">공식 카탈로그에서 상세 보기</a>` : ""}
      <a class="btn accent block" href="https://registration.awsevents.com/" target="_blank" rel="noopener">AWS Events 앱에서 예약하기</a>
      <button class="btn ghost block" id="d-close">닫기</button>`);
    $("#d-fav").onclick = (e) => { e.stopPropagation(); closeModal(); this.toggleFav(id); };
    $("#d-close").onclick = closeModal;
    $$("#d-res .chip").forEach((c) => c.onclick = () => {
      $$("#d-res .chip").forEach((x) => x.classList.toggle("on", x === c));
      this.setReservation(id, c.dataset.v);
      this.renderResults();
    });
    $$("#d-topics [data-topic], #d-topics [data-service]").forEach((c) => c.onclick = () => {
      closeModal();
      const key = c.dataset.topic ? "topic" : "service", v = c.dataset.topic || c.dataset.service;
      Sessions.f[key] = v;
      Sessions.limit = SESSION_PAGE;
      if (currentTab !== "sessions") switchTab("sessions"); else Views.sessions();
      toast(`'${key === "service" ? shortService(v) : v}'(으)로 필터했어요`);
    });
    $$("#d-reps [data-sg-open]").forEach((el) => el.onclick = () => { closeModal(); this.openDetail(el.dataset.sgOpen); });
  },

};

Views.sessions = function () {
  const el = $("#view-sessions");
  el.innerHTML = `
    <input type="search" id="ss-q" enterkeyhint="search" autocomplete="off" autocapitalize="off" spellcheck="false"
      placeholder="세션 검색 (제목·코드·연사·AWS 서비스${allSessions().some((x) => x.abstract) ? "·소개" : ""})" value="${esc(Sessions.q)}">
    <div id="ss-results"></div>`;
  bindSessionChrome();
  Sessions.renderResults();
};

/* 검색어·필터가 바뀌면 결과 영역만 다시 그림 (입력창을 건드리지 않아 한글 입력이 끊기지 않음) */
Sessions.renderResults = function () {
  const view = $("#view-sessions"), box = $("#ss-results");
  if (!box) return;
  const filterIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5h18l-7 8.5V19l-4 2v-7.5z"/></svg>`;
  let html = "", fab = false;
  if (Sessions.pending()) {
    html = `
      <div class="empty-state"><div class="big">📡</div>
        <h3>세션 카탈로그 수집 대기 중</h3>
        <p>세션 목록을 가져오지 못했어요.<br>공식 카탈로그에서 다시 수집하면<br>여기에 2,000개+ 세션이 표시됩니다.</p>
      </div>`;
  } else {
    const list = Sessions.filtered();
    const activeFilterCount = Object.values(Sessions.f).filter((v) => v).length;
    const shown = Math.min(list.length, Sessions.limit);
    const cards = Sessions.venueGroup ? Sessions.groupedByVenueHTML(list)
      : list.slice(0, shown).map((s) => Sessions.cardHTML(s)).join("") || `<div class="empty-state"><div class="big">🔍</div><p>조건에 맞는 세션이 없어요</p>${activeFilterCount ? `<button class="btn ghost small" id="ss-clear-f">필터 초기화</button>` : ""}</div>`;
    const more = !Sessions.venueGroup && list.length > shown
      ? `<button class="btn ghost block load-more" id="ss-more">더 보기 (${(list.length - shown).toLocaleString("ko-KR")}개 남음)</button>` : "";
    html = `
      <div class="ss-bar">
        <span class="muted">${list.length.toLocaleString("ko-KR")}개 세션${activeFilterCount ? ` · 필터 ${activeFilterCount}개` : ""}</span>
        <span class="ss-bar-r">
          <button class="chip" id="ss-news">📣 발표 노트</button>
          <button class="chip${Sessions.venueGroup ? " on" : ""}" id="ss-venue-group" aria-pressed="${Sessions.venueGroup}">📍 베뉴별</button>
        </span>
      </div>
      ${cards}${more}
      <button id="ss-filter-fab" class="fab" aria-label="필터${activeFilterCount ? ` (${activeFilterCount}개 적용)` : ""}">${filterIcon}${activeFilterCount ? `<span class="fab-badge">${activeFilterCount}</span>` : ""}</button>`;
    fab = true;
  }
  box.innerHTML = html;
  view.classList.toggle("has-fab", fab);
  bindHitCards();
  const fabBtn = $("#ss-filter-fab");
  if (fabBtn) fabBtn.onclick = () => Sessions.openFilterSheet();
  const moreBtn = $("#ss-more");
  if (moreBtn) moreBtn.onclick = () => { Sessions.limit += SESSION_PAGE; Sessions.renderResults(); };
  const nw = $("#ss-news");
  if (nw) nw.onclick = () => News.open();
  const vg = $("#ss-venue-group");
  if (vg) vg.onclick = () => { Sessions.venueGroup = !Sessions.venueGroup; Sessions.renderResults(); };
  const clr = $("#ss-clear-f");
  if (clr) clr.onclick = () => { Sessions.resetFilters(); Sessions.renderResults(); };
};

/* 내 일정 화면에서 세션 소개를 열어 관심을 바꿨다면 그 화면도 갱신 */
Sessions.refreshAfterFav = function () {
  if (currentTab === "planner") Views.planner(); else Sessions.renderResults();
};

Sessions.resetFilters = function () {
  Sessions.f = { date: "", venue: "", type: "", level: "", topic: "", service: "", format: "", delivery: "" };
  Sessions.limit = SESSION_PAGE;
};

Sessions.openFilterSheet = function () {
  const venues = [...new Set(Sessions.all().map((s) => s.venue).filter(Boolean))].sort();
  const types = [...new Set(Sessions.all().map((s) => s.session_type).filter(Boolean))].sort();
  const topics = (window.APP_DATA.topics.topics || []);
  const dates = [...new Set(Sessions.all().map((s) => s.date).filter(Boolean))].sort();
  const chipGroup = (key, opts, val, labelFn) => `
    <label class="field">${{ date: "날짜", venue: "베뉴", type: "타입", level: "레벨", topic: "토픽", service: "AWS 서비스 (세션 많은 순)" }[key]}</label>
    <div class="chip-row" data-fkey="${key}" style="margin-bottom:12px;">
      <button class="chip${!val ? " on" : ""}" data-v="">전체</button>
      ${opts.map((o) => {
        const v = typeof o === "object" ? o.v : o;
        const t = typeof o === "object" ? o.t : (labelFn ? labelFn(o) : o);
        return `<button class="chip${String(v) === String(val) ? " on" : ""}" data-v="${esc(v)}">${esc(t)}</button>`;
      }).join("")}
    </div>`;

  openModal(`
    <h2>세션 필터 <span class="muted" style="font-size:13px;font-weight:400;" id="ff-count">${Sessions.filtered().length.toLocaleString("ko-KR")}개</span></h2>
    ${chipGroup("date", dates.map((d) => ({ v: d, t: dayLabel(d) })), Sessions.f.date)}
    ${chipGroup("venue", venues, Sessions.f.venue)}
    ${chipGroup("type", types, Sessions.f.type)}
    ${chipGroup("level", ["100", "200", "300", "400"], Sessions.f.level)}
    ${chipGroup("topic", topics, Sessions.f.topic)}
    ${chipGroup("service", serviceList().slice(0, 30).concat(Sessions.f.service && !serviceList().slice(0, 30).some((x) => x.name === Sessions.f.service) ? [{ name: Sessions.f.service, n: 0 }] : [])
      .map((x) => ({ v: x.name, t: shortService(x.name) + (x.n ? ` ${x.n}` : "") })), Sessions.f.service)}
    <div class="sheet-actions">
      <button class="btn ghost" id="ff-reset">초기화</button>
      <button class="btn" id="ff-close">결과 보기</button>
    </div>`);

  // Chip click: single-select per group, apply immediately
  $$("#modal-root [data-fkey]").forEach((group) => {
    const key = group.dataset.fkey;
    group.querySelectorAll(".chip").forEach((chip) => {
      chip.onclick = () => {
        Sessions.f[key] = chip.dataset.v;
        Sessions.limit = SESSION_PAGE;
        group.querySelectorAll(".chip").forEach((c) => c.classList.toggle("on", c === chip));
        Sessions.renderResults(); // 시트는 열어 둔 채 뒤 목록만 갱신
        const cnt = $("#ff-count");
        if (cnt) cnt.textContent = Sessions.filtered().length.toLocaleString("ko-KR") + "개";
      };
    });
  });
  $("#ff-reset").onclick = () => {
    Sessions.resetFilters();
    closeModal(); Sessions.renderResults();
  };
  $("#ff-close").onclick = closeModal;
};

function bindHitCards() {
  $$("#view-sessions .session-card[data-id]").forEach((c) => c.addEventListener("click", (e) => {
    if (e.target.dataset.fav) return;
    Sessions.openDetail(c.dataset.id);
  }));
  $$("#view-sessions [data-fav]").forEach((b) => b.addEventListener("click", (e) => {
    e.stopPropagation(); Sessions.toggleFav(b.dataset.fav);
  }));
}

function bindSessionChrome() {
  const q = $("#ss-q");
  let t;
  const run = () => { clearTimeout(t); Sessions.q = q.value; Sessions.limit = SESSION_PAGE; Sessions.renderResults(); };
  q.addEventListener("input", () => { clearTimeout(t); t = setTimeout(run, 250); });
  q.addEventListener("keydown", (e) => { if (e.key === "Enter") { run(); q.blur(); } });
}

/* 📣 신규 발표 노트: 키노트·발표 내용을 적어 두면 관련 세션을 찾아 줌
   데이터: event_info.announcements = [{ date, title, q }] (q: 검색어, 쉼표로 여러 개) + 내가 적은 메모 */
const News = {
  items() {
    const fromData = ((window.APP_DATA.event_info || {}).announcements || [])
      .filter((x) => x && x.title).map((x, i) => ({ id: "an-" + i, title: x.title, q: x.q || (x.services || []).join(",") || x.title, date: x.date, official: true }));
    return fromData.concat((S().news || []).map((x) => ({ ...x, official: false })));
  },
  terms(q) { return String(q || "").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean); },
  related(q) {
    const terms = this.terms(q);
    if (!terms.length) return [];
    return allSessions().filter((s) => {
      const hay = `${s.title} ${s.code} ${(s.services || []).join(" ")} ${s.abstract || ""}`.toLowerCase();
      return terms.some((t) => hay.includes(t));
    });
  },
  /* 관련 세션 보기: 세션 탭 검색으로 연결 (첫 검색어 기준) */
  show(q) {
    closeModal();
    Sessions.q = String(q || "").split(",").map((t) => t.trim()).filter(Boolean)[0] || ""; // 입력한 대소문자 그대로
    Sessions.resetFilters();
    if (currentTab !== "sessions") switchTab("sessions"); else Views.sessions();
  },
  rowsHTML(list) {
    return list.map((x) => {
      const n = this.related(x.q).length;
      return `<div class="sg-row">
        <div class="sg-main"><b>${x.official ? "📣 " : "📝 "}${esc(x.title)}</b>
          <span class="muted">검색어: ${esc(x.q)}${x.date ? ` · ${esc(dayLabel(x.date))}` : ""}</span></div>
        <div class="sg-act">
          ${x.official ? "" : `<button class="sg-btn" data-news-del="${esc(x.id)}" aria-label="삭제">✕</button>`}
          <button class="sg-btn primary" data-news-q="${esc(x.q)}"${n ? "" : " disabled"}>세션 ${n}</button>
        </div>
      </div>`;
    }).join("");
  },
  open() {
    const render = () => this.items().length ? this.rowsHTML(this.items())
      : `<p class="muted">아직 적은 발표가 없어요. 키노트에서 들은 새 서비스·기능을 적어 두면 관련 세션을 바로 찾아 줘요.</p>`;
    openSheet({
      title: "📣 신규 발표 노트",
      body: `<div id="nw-list">${render()}</div>
        <h3 class="sg-head">발표 메모 추가</h3>
        <label class="field" for="nw-title">무엇이 발표됐나요?</label>
        <input type="text" id="nw-title" maxlength="60" placeholder="예: Bedrock 에이전트 새 기능">
        <label class="field" for="nw-q">관련 세션을 찾을 검색어 (쉼표로 여러 개)</label>
        <input type="text" id="nw-q" maxlength="60" placeholder="예: Bedrock, agent">
        <button class="btn ghost block" id="nw-add" style="margin-top:0;">＋ 추가</button>
        <p class="muted" style="font-size:12px;">세션 제목·코드·AWS 서비스에서 검색어를 찾아요.</p>`,
      actions: `<button class="btn" id="nw-close">닫기</button>`
    });
    const bind = () => {
      $$("#nw-list [data-news-q]").forEach((b) => b.onclick = () => this.show(b.dataset.newsQ));
      $$("#nw-list [data-news-del]").forEach((b) => b.onclick = () => {
        S().news = (S().news || []).filter((x) => x.id !== b.dataset.newsDel); Store.save();
        $("#nw-list").innerHTML = render(); bind();
      });
    };
    bind();
    $("#nw-add").onclick = () => {
      const title = $("#nw-title").value.trim();
      const q = $("#nw-q").value.trim() || title;
      if (!title) { toast("발표 내용을 적어 주세요"); $("#nw-title").focus(); return; }
      S().news = S().news || [];
      S().news.unshift({ id: "nw" + Date.now().toString(36), title, q, date: vegasDateStr() });
      Store.save();
      $("#nw-title").value = ""; $("#nw-q").value = "";
      $("#nw-list").innerHTML = render(); bind();
      toast(`관련 세션 ${this.related(q).length}개를 찾았어요`);
    };
    $("#nw-close").onclick = () => $("#modal-overlay")._dismiss();
  }
};
