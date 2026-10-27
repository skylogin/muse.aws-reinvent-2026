/* 세션 탭: 카탈로그 탐색, 관심 체크, 용어 검색 */
"use strict";

const SESSION_PAGE = 100; // 한 번에 그리는 카드 수 ('더 보기'로 늘림)
const RES_LABEL = { reserved: "예약됨", waitlist: "대기", none: "미예약" };
const SORT_LABEL = { time: "시간순", recommended: "추천순", level: "레벨순" };

/* 세션 타입·난이도·형식 한국어 표기 */
const TYPE_KO = { breakout: "브레이크아웃", workshop: "워크숍", "chalk-talk": "초크토크", "builders-session": "빌더 세션",
  "code-talk": "코드토크", "lightning-talk": "라이트닝 토크", "hands-on-lab": "핸즈온 랩", "game-day": "게임데이",
  bootcamp: "부트캠프", "exam-prep": "시험 대비", keynote: "키노트", mainstage: "메인 스테이지" };
const TYPE_TIP = {
  workshop: "💻 노트북 지참 · 강사와 함께 직접 따라 하는 실습",
  bootcamp: "💻 노트북 지참 · 긴 시간 진행되는 심화 실습",
  "builders-session": "💻 노트북 지참 · 소규모 그룹 실습",
  "hands-on-lab": "💻 노트북 지참 · 실습 랩",
  "game-day": "💻 노트북 지참 · 팀을 이뤄 푸는 실전 게임",
  "chalk-talk": "🗣️ 화이트보드 중심 소규모 토론 · 질문 환영",
  "code-talk": "⌨️ 라이브 코딩을 보며 진행",
  breakout: "🎤 발표 세션",
  "lightning-talk": "⚡ 짧은 발표",
  "exam-prep": "📝 AWS 자격증 시험 대비"
};
const LEVEL_KO = { 100: "입문", 200: "중급", 300: "고급", 400: "전문가" };
const FORMAT_KO = { lecture: "강의", "hands-on": "실습", discussion: "토론", lab: "랩" };
const LANG_KO = { en: "영어", ko: "한국어", ja: "일본어", zh: "중국어", es: "스페인어", fr: "프랑스어", de: "독일어", pt: "포르투갈어" };
const typeKo = (t) => TYPE_KO[t] || t || "";

/* "Amazon Elastic Compute Cloud (Amazon EC2)" → "Amazon EC2" */
function shortService(name) {
  const m = String(name || "").match(/\(([^)]+)\)\s*$/);
  return m ? m[1] : String(name || "");
}
/* 세션 검색 인덱스 (제목·코드·서비스·소개를 소문자로 미리 만들어 둠 — 발표 노트 등에서 반복 스캔 비용 절감) */
let _searchIndex = null;
function sessionIndex() {
  if (!_searchIndex) {
    _searchIndex = allSessions().map((s) => ({
      s, hay: `${s.title} ${s.code} ${(s.services || []).join(" ")} ${s.abstract || ""}`.toLowerCase()
    }));
  }
  return _searchIndex;
}
/* 세션 소개(abstract-*-chunk)는 첫 화면 뒤에 async로 붙음 → 다 붙으면(load) 인덱스를 다시 만듦 */
window.addEventListener("load", () => { _searchIndex = null; });

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
  q: "", f: { date: "", venue: "", type: "", level: "", topic: "", service: "", format: "" },
  venueGroup: false, // 베뉴별 모아보기
  sort: "time",      // time | recommended | level
  limit: SESSION_PAGE,
  soon: false,       // ⏰ 곧 시작 (오늘, 60분 안에 시작) — 행사 날에만 보임
  selected: null,    // 넓은 화면 오른쪽 칸에 보이는 세션

  all() { return allSessions(); },
  pending() { return sessionsPending(); },

  isEventDay() { const t = vegasDateStr(); return this.all().some((s) => s.date === t); },
  soonActive() { return this.soon && this.isEventDay(); },
  activeCount() { return Object.values(this.f).filter((v) => v).length + (this.soonActive() ? 1 : 0); },

  filtered() {
    const q = this.q.trim().toLowerCase(), f = this.f;
    const soon = this.soonActive();
    const today = vegasDateStr(), vp = vegasParts(), nowMin = (+vp.hour) * 60 + (+vp.minute);
    return this.all().filter((s) => {
      if (soon) {
        if (s.date !== today) return false;
        const d = Planner.toMin(s.start_time) - nowMin;
        if (!(d >= 0 && d <= 60)) return false;
      }
      if (f.date && s.date !== f.date) return false;
      if (f.venue && s.venue !== f.venue) return false;
      if (f.type && s.session_type !== f.type) return false;
      if (f.level && String(s.level) !== f.level) return false;
      if (f.topic && !(s.topics || []).includes(f.topic)) return false;
      if (f.service && !(s.services || []).includes(f.service)) return false;
      if (f.format && s.session_format !== f.format) return false;
      if (q) {
        const hay = `${s.title} ${s.abstract_ko || ""} ${s.abstract || ""} ${(s.speakers || []).join(" ")} ${s.code} ${(s.services || []).join(" ")} ${typeKo(s.session_type)}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  },

  /* 정렬: 시간순(기본) · 추천순(관심 토픽·서비스 점수) · 레벨순 */
  sortList(list) {
    const by = this.soonActive() ? "time" : (this.sort || "time");
    const key = (s) => String((s.date || "") + (s.start_time || ""));
    const arr = list.slice();
    if (by === "recommended") {
      const cache = new Map();
      const sc = (s) => { if (!cache.has(s.session_id)) cache.set(s.session_id, Suggest.score(s, {})); return cache.get(s.session_id); };
      arr.sort((a, b) => sc(b) - sc(a) || key(a).localeCompare(key(b)));
    } else if (by === "level") {
      arr.sort((a, b) => (Number(a.level) || 999) - (Number(b.level) || 999) || key(a).localeCompare(key(b)));
    } else {
      arr.sort((a, b) => key(a).localeCompare(key(b)));
    }
    return arr;
  },

  /* 홈 '추천 세션' 한 줄 (날짜 포함) */
  recRowHTML(s) {
    return `<div class="sg-row">
      <div class="sg-main" data-rec-open="${esc(s.session_id)}" role="button" tabindex="0">
        <b>${esc(s.title)}</b>
        <span class="muted">${s.date ? esc(dayLabel(s.date)) + " " : ""}${esc(s.start_time || "")}${s.end_time ? "–" + esc(s.end_time) : ""} · 📍 ${esc(shortVenue(s.venue))} · ${esc(typeKo(s.session_type))}</span>
      </div>
      <div class="sg-act"><button class="sg-btn primary" data-rec-add="${esc(s.session_id)}">담기</button></div>
    </div>`;
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

  /* 관심·내 일정에 넣기 (상태만 바꿈 — 저장·알림은 호출한 쪽에서) */
  addToPlan(id) {
    const st = S();
    if (!st.favorites.includes(id)) st.favorites.push(id);
    const s = this.all().find((x) => x.session_id === id);
    if (s && s.date) {
      st.daily_plan[s.date] = st.daily_plan[s.date] || [];
      if (!st.daily_plan[s.date].some((x) => x.session_id === id))
        st.daily_plan[s.date].push({ session_id: id, note: "" });
    }
    return s;
  },
  doFavAdd(id) {
    const s = this.addToPlan(id);
    toast(s && s.date ? "내 일정에 담았어요 📅" : "관심 세션에 담았어요");
    Store.save();
    Sessions.refreshAfterFav();
  },
  /* 여러 세션 한 번에 담기 — 이미 담은 일정과 시간이 겹치는 세션은 건너뜀 */
  addMany(ids) {
    let added = 0, skipped = 0;
    ids.forEach((id) => {
      if (S().favorites.includes(id)) return;
      const s = this.all().find((x) => x.session_id === id);
      if (!s) return;
      if (this.findConflict(s)) { skipped++; return; }
      this.addToPlan(id);
      added++;
    });
    if (added) { Store.save(); Sessions.refreshAfterFav(); }
    return { added, skipped };
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
      ${s.abstract_ko ? `<div class="sum">${esc(s.abstract_ko)}</div>` : ""}
      <div class="meta"><span class="t-type">${esc(typeKo(s.session_type))}</span>${s.date ? esc(dayLabel(s.date)) : ""} ${esc(s.start_time || "")}${s.end_time ? "–" + esc(s.end_time) : ""}${s.level ? ` · Lv.${esc(s.level)}` : ""} · ${esc(s.code || "")}<br>📍 ${esc(s.venue || "")}${room ? " · " + esc(room) : ""}</div>
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

  /* 요약(한국어) 블록 — 영어 원문은 버튼으로 따로 */
  summaryHTML(s, compact) {
    if (!s.abstract_ko && !s.abstract) return "";
    const ko = s.abstract_ko;
    return `<div class="sd-summary${compact ? " compact" : ""}">
      <div class="sd-sum-head"><span>📝 ${compact ? "요약" : "이런 세션이에요"}</span>
        ${s.abstract ? `<button class="link-btn" data-orig="${esc(s.session_id)}">영어 원문 ›</button>` : ""}</div>
      <p class="${[ko ? "" : "en-clamp", compact ? "clamp3" : ""].filter(Boolean).join(" ")}"${ko ? "" : ` lang="en"`}>${esc(ko || s.abstract)}</p>
    </div>`;
  },
  /* 영어 원문: 시트 위에 겹쳐 뜨는 레이어 */
  openOriginal(id) {
    const s = this.all().find((x) => x.session_id === id);
    if (!s || !s.abstract) return;
    const gt = "https://translate.google.com/?sl=en&tl=ko&op=translate&text=" + encodeURIComponent(s.abstract);
    openLayer({
      title: "🌐 영어 원문",
      body: `<p class="sd-en-title" lang="en">${esc(s.title)}</p>
        <p class="sd-en" lang="en">${esc(s.abstract)}</p>
        ${s.abstract_ko ? `<p class="muted" style="font-size:12px;">앱의 한국어 요약은 원문의 앞부분을 옮긴 거예요.</p>` : ""}
        <a class="btn ghost block" href="${gt}" target="_blank" rel="noopener">구글 번역으로 전체 보기</a>`
    });
  },
  bindSummary(root) {
    $$("[data-orig]", root).forEach((b) => b.onclick = () => this.openOriginal(b.dataset.orig));
    // 짧게 접힌 요약은 눌러서 펼치기
    $$(".sd-summary p.clamp3", root).forEach((p) => p.onclick = () => p.classList.toggle("open"));
  },

  /* 세션 상세 — 좁은 화면: 하단 시트 / 넓은 화면의 세션 탭: 오른쪽 칸 (#sd-pane)
     핵심 정보 카드 → 한국어 요약 → 연사·태그·다른 회차 → 내 노트 */
  detailBodyHTML(s) {
    const room = roomLabel(s);
    const reps = Suggest.repeats(s.session_id);
    const kst = kstRange(s.date, s.start_time, s.end_time);
    const s0 = Planner.toMin(s.start_time), e0 = Planner.toMin(s.end_time);
    const len = s0 != null && e0 > s0 ? Planner.dur(e0 - s0) : "";
    const lvl = s.level ? `Lv.${s.level}${LEVEL_KO[s.level] ? " " + LEVEL_KO[s.level] : ""}` : "";
    const fmt = FORMAT_KO[s.session_format] || "";
    const lang = s.language ? (LANG_KO[s.language] || s.language) + " 진행" : "";
    const spk = (s.speakers || []).map((x) => { const p = String(x).split(" · "); return { name: p[0], role: p.slice(1).join(" · ") }; });
    const initials = (n) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
    const catalog = s.catalog_url || APP_DATA.catalog_url;
    return `
        <div class="sd-badges">
          <span class="badge info">${esc(typeKo(s.session_type))}</span>
          ${lvl ? `<span class="badge">${esc(lvl)}</span>` : ""}
          <span class="badge">${esc(s.code || "")}</span>
        </div>
        <h3 class="bs-title sd-title">${esc(s.title)}</h3>
        <div class="sd-facts">
          <div class="sd-fact"><span class="k">🗓️ ${s.date ? esc(dayLabel(s.date)) : "일시"}</span><b>${esc(s.start_time || "")}${s.end_time ? "–" + esc(s.end_time) : ""}</b>${kst ? `<small>🇰🇷 한국 ${kst}</small>` : ""}</div>
          <div class="sd-fact"><span class="k">📍 장소</span><b>${esc(s.venue || "미정")}</b>${room ? `<small>${esc(room)}</small>` : ""}</div>
          <div class="sd-fact"><span class="k">🎯 형식</span><b>${esc([typeKo(s.session_type), fmt].filter(Boolean).join(" · "))}</b>${lvl ? `<small>${esc(lvl)}</small>` : ""}</div>
          <div class="sd-fact"><span class="k">⏱️ 길이</span><b>${esc(len || "—")}</b>${lang ? `<small>${esc(lang)}</small>` : ""}</div>
        </div>
        ${TYPE_TIP[s.session_type] ? `<div class="sd-tip">${esc(TYPE_TIP[s.session_type])}</div>` : ""}
        ${this.summaryHTML(s)}
        <div id="d-res-wrap"></div>
        ${spk.length ? `<h3 class="sg-head">🎙️ 연사 ${spk.length}명</h3>
        <div class="sd-spks">${spk.slice(0, 4).map((p) => `<div class="sd-spk"><span class="av">${esc(initials(p.name))}</span>
          <div><b>${esc(p.name)}</b>${p.role ? `<span class="muted">${esc(p.role)}</span>` : ""}</div></div>`).join("")}
          ${spk.length > 4 ? `<p class="muted" style="font-size:12px;margin:2px 0 0;">외 ${spk.length - 4}명</p>` : ""}</div>` : ""}
        ${(s.topics || []).length || (s.services || []).length ? `<h3 class="sg-head">🏷️ 토픽·서비스 <span class="muted" style="font-size:12px;font-weight:400;">눌러서 필터</span></h3>
        <div class="chip-row" id="d-topics">${(s.topics || []).map((t) => `<button class="chip" data-topic="${esc(t)}">#${esc(t)}</button>`).join("")}${(s.services || []).map((t) => `<button class="chip svc" data-service="${esc(t)}">${esc(shortService(t))}</button>`).join("")}</div>` : ""}
        ${reps.length ? `<h3 class="sg-head">📅 다른 회차 ${reps.length}개</h3>
        <p class="muted" style="font-size:12px;margin:0 0 2px;">같은 내용이 다른 날·장소에서도 열려요. 만석이면 다른 회차를 노려 보세요.</p>
        <div id="d-reps">${reps.map((c) => Suggest.repeatRowHTML(c)).join("")}</div>` : ""}
        <h3 class="sg-head">📝 내 노트</h3>
        <div class="stars" id="d-stars">${[1, 2, 3, 4, 5].map((i) => `<span data-s="${i}">★</span>`).join("")}</div>
        <textarea id="d-memo" rows="3" placeholder="배운 점, 후속 액션 등"></textarea>
        <div class="sheet-links" style="margin-top:12px;">
          ${catalog ? `<a class="link-btn" href="${esc(catalog)}" target="_blank" rel="noopener">공식 카탈로그 ›</a>` : ""}
          <a class="link-btn" href="https://registration.awsevents.com/" target="_blank" rel="noopener">AWS Events에서 예약 ›</a>
        </div>`;
  },
  detailActionsHTML(mode) {
    return mode === "pane" ? `<button class="btn" id="d-fav"></button>`
      : `<button class="btn ghost" id="d-close">닫기</button><button class="btn" id="d-fav"></button>`;
  },
  /* root: 시트 또는 오른쪽 칸. 노트는 별점을 누를 때·메모를 쓰는 동안(0.4초 뒤) 바로 저장 — 어떻게 닫아도 잃지 않음 */
  bindDetail(root, s, mode) {
    const id = s.session_id;
    const q = (sel) => $(sel, root);
    // 담기 버튼과 예약 상태는 관심 여부에 따라 그 자리에서 바뀜
    const paint = () => {
      const fav = S().favorites.includes(id);
      const b = q("#d-fav");
      if (!b) return;
      b.textContent = fav ? "⭐ 내 일정에 담김" : "☆ 내 일정에 담기";
      b.classList.toggle("ghost-on", fav);
      b.setAttribute("aria-pressed", fav);
      const res = (S().reservations[id] || {}).status || "none";
      q("#d-res-wrap").innerHTML = fav ? `<label class="field" style="display:block;margin-top:12px;">예약 상태</label>
        <div class="seg" id="d-res">${["reserved", "waitlist", "none"].map((v) => `<button class="seg-btn res-${v}${res === v ? " on" : ""}" data-v="${v}">${RES_LABEL[v]}</button>`).join("")}</div>` : "";
      $$("#d-res .seg-btn", root).forEach((c) => c.onclick = () => {
        $$("#d-res .seg-btn", root).forEach((x) => x.classList.toggle("on", x === c));
        this.setReservation(id, c.dataset.v);
        this.renderResults();
      });
    };
    paint();
    q("#d-fav").onclick = () => {
      const fav = S().favorites.includes(id);
      if (!fav && this.findConflict(s)) { if (mode === "sheet") closeModal(); this.toggleFav(id); return; } // 시간 겹침 확인 창으로
      this.toggleFav(id);
      paint();
    };
    // 내 노트 (별점+메모) — planner와 같은 session_notes 저장소
    const sn = S().session_notes[id] || { rating: 0, memo: "" };
    let rating = sn.rating || 0, t = null;
    const memoEl = q("#d-memo");
    const save = () => {
      clearTimeout(t);
      const memo = memoEl.value.trim();
      if (rating || memo) S().session_notes[id] = { rating, memo, updated_at: new Date().toISOString() };
      else delete S().session_notes[id];
      Store.save();
    };
    const paintStars = () => $$("#d-stars span", root).forEach((x) => x.classList.toggle("on", Number(x.dataset.s) <= rating));
    paintStars();
    $$("#d-stars span", root).forEach((sp) => sp.addEventListener("click", (e) => {
      e.preventDefault(); rating = Number(sp.dataset.s) === rating ? 0 : Number(sp.dataset.s); paintStars(); save();
    }));
    memoEl.value = sn.memo || "";
    memoEl.addEventListener("input", () => { clearTimeout(t); t = setTimeout(save, 400); });
    memoEl.addEventListener("change", save);
    this.bindSummary(root);
    $$("#d-topics [data-topic], #d-topics [data-service]", root).forEach((c) => c.onclick = () => {
      const key = c.dataset.topic ? "topic" : "service", v = c.dataset.topic || c.dataset.service;
      if (mode === "sheet") closeModal();
      Sessions.f[key] = v;
      Sessions.limit = SESSION_PAGE;
      if (currentTab !== "sessions") switchTab("sessions"); else Sessions.renderResults();
      toast(`'${key === "service" ? shortService(v) : v}'(으)로 필터했어요`);
    });
    $$("#d-reps [data-sg-open]", root).forEach((el) => el.onclick = () => { if (mode === "sheet") closeModal(); this.openDetail(el.dataset.sgOpen); });
    return save;
  },
  openDetail(id) {
    const s = this.all().find((x) => x.session_id === id);
    if (!s) return;
    const pane = currentTab === "sessions" && Layout.wide() && $("#sd-pane");
    if (pane) {
      Sessions.selected = id;
      pane.innerHTML = `<div class="pane-body">${this.detailBodyHTML(s)}</div><div class="pane-actions">${this.detailActionsHTML("pane")}</div>`;
      pane.scrollTop = 0;
      this.bindDetail(pane, s, "pane");
      $$("#view-sessions .session-card").forEach((c) => c.classList.toggle("selected", c.dataset.id === id));
      return;
    }
    const sheetOv = openSheet({ title: "세션 소개", body: this.detailBodyHTML(s), actions: this.detailActionsHTML("sheet") });
    const save = this.bindDetail(sheetOv, s, "sheet");
    $("#d-close").onclick = () => { save(); $("#modal-overlay")._dismiss(); };
    // 배경 탭·스와이프·뒤로가기로 닫을 때도 노트 저장 (메모 입력 대기분 포함)
    const _d = sheetOv._dismiss;
    sheetOv._dismiss = () => { save(); _d(); };
  }

};

Views.sessions = function () {
  const el = $("#view-sessions");
  const search = `
    <input type="search" id="ss-q" enterkeyhint="search" autocomplete="off" autocapitalize="off" spellcheck="false"
      placeholder="세션 검색 (제목·코드·연사·AWS 서비스${allSessions().some((x) => x.abstract) ? "·소개" : ""})" value="${esc(Sessions.q)}">
    <div id="ss-recent" class="rq-row hidden"></div>
    <div id="ss-results"></div>`;
  const split = Layout.wide();
  el.classList.toggle("is-split", split);
  el.innerHTML = split
    ? `<div class="split"><div class="split-list">${search}</div>
        <aside class="split-detail" id="sd-pane" aria-label="세션 소개"><p class="split-empty">세션을 고르면 여기에 소개가 보여요</p></aside></div>`
    : search;
  bindSessionChrome();
  Sessions.renderResults();
  if (split && Sessions.selected) Sessions.openDetail(Sessions.selected);
};

const FILTER_LABEL = {
  date: (v) => dayLabel(v), service: (v) => shortService(v), level: (v) => `Lv.${v}`,
  type: (v) => typeKo(v), format: (v) => FORMAT_KO[v] || v
};

/* 검색어·필터가 바뀌면 결과 영역만 다시 그림 (입력창을 건드리지 않아 한글 입력이 끊기지 않음) */
Sessions.renderResults = function () {
  const view = $("#view-sessions"), box = $("#ss-results");
  if (!box) return;
  const split = view.classList.contains("is-split");
  const filterIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5h18l-7 8.5V19l-4 2v-7.5z"/></svg>`;
  let html = "", fab = false;
  if (Sessions.pending()) {
    html = `
      <div class="empty-state"><div class="big">📡</div>
        <h3>세션 카탈로그 수집 대기 중</h3>
        <p>세션 목록을 가져오지 못했어요.<br>공식 카탈로그에서 다시 수집하면<br>여기에 2,000개+ 세션이 표시됩니다.</p>
      </div>`;
  } else {
    const list = Sessions.sortList(Sessions.filtered());
    const activeFilterCount = Sessions.activeCount();
    const shown = Math.min(list.length, Sessions.limit);
    const cards = Sessions.venueGroup ? Sessions.groupedByVenueHTML(list)
      : list.slice(0, shown).map((s) => Sessions.cardHTML(s)).join("") || `<div class="empty-state"><div class="big">🔍</div><p>조건에 맞는 세션이 없어요</p>${activeFilterCount ? `<button class="btn ghost small" id="ss-clear-f">필터 초기화</button>` : ""}</div>`;
    const more = !Sessions.venueGroup && list.length > shown
      ? `<button class="btn ghost block load-more" id="ss-more">더 보기 (${(list.length - shown).toLocaleString("ko-KR")}개 남음)</button>` : "";
    const chips = Object.keys(Sessions.f).filter((k) => Sessions.f[k]).map((k) =>
      `<button class="chip on af-chip" data-af="${k}" aria-label="필터 해제">${esc((FILTER_LABEL[k] || ((v) => v))(Sessions.f[k]))} ✕</button>`);
    if (Sessions.soonActive()) chips.unshift(`<button class="chip on af-chip" data-af="soon" aria-label="필터 해제">⏰ 곧 시작 ✕</button>`);
    html = `
      <div class="ss-bar">
        <span class="ss-bar-l">
          <span class="muted">${list.length.toLocaleString("ko-KR")}개 세션${activeFilterCount ? ` · 필터 ${activeFilterCount}개` : ""}${dataAsOf() ? ` · ${dataAsOf()}` : ""}</span>
          <button class="chip" id="ss-sort">↕️ ${SORT_LABEL[Sessions.soonActive() ? "time" : Sessions.sort] || "시간순"}</button>
          ${split ? `<button class="chip" id="ss-filter">필터${activeFilterCount ? ` (${activeFilterCount})` : ""}</button>` : ""}
        </span>
        <span class="ss-bar-r">
          ${Sessions.isEventDay() ? `<button class="chip${Sessions.soon ? " on" : ""}" id="ss-soon" aria-pressed="${Sessions.soon}">⏰ 곧 시작</button>` : ""}
          <button class="chip" id="ss-notes">📝 노트</button>
          <button class="chip${Sessions.venueGroup ? " on" : ""}" id="ss-venue-group" aria-pressed="${Sessions.venueGroup}">📍 베뉴별</button>
        </span>
      </div>
      ${chips.length ? `<div class="af-row">${chips.join("")}</div>` : ""}
      ${cards}${more}
      ${split ? "" : `<button id="ss-filter-fab" class="fab" aria-label="필터${activeFilterCount ? ` (${activeFilterCount}개 적용)` : ""}">${filterIcon}${activeFilterCount ? `<span class="fab-badge">${activeFilterCount}</span>` : ""}</button>`}`;
    fab = !split;
  }
  box.innerHTML = html;
  view.classList.toggle("has-fab", fab);
  bindHitCards();
  if (Sessions.selected) $$("#view-sessions .session-card").forEach((c) => c.classList.toggle("selected", split && c.dataset.id === Sessions.selected));
  const fabBtn = $("#ss-filter-fab") || $("#ss-filter");
  if (fabBtn) fabBtn.onclick = () => Sessions.openFilterSheet();
  const moreBtn = $("#ss-more");
  if (moreBtn) moreBtn.onclick = () => { Sessions.limit += SESSION_PAGE; Sessions.renderResults(); };
  const snt = $("#ss-notes");
  if (snt) snt.onclick = () => Notes.open("sessions");
  const vg = $("#ss-venue-group");
  if (vg) vg.onclick = () => { Sessions.venueGroup = !Sessions.venueGroup; Sessions.renderResults(); };
  const srt = $("#ss-sort");
  if (srt) srt.onclick = () => Sessions.openSortMenu();
  const soon = $("#ss-soon");
  if (soon) soon.onclick = () => { Sessions.soon = !Sessions.soon; Sessions.limit = SESSION_PAGE; Sessions.renderResults(); };
  $$("#ss-results [data-af]").forEach((b) => b.onclick = () => {
    if (b.dataset.af === "soon") Sessions.soon = false; else Sessions.f[b.dataset.af] = "";
    Sessions.limit = SESSION_PAGE;
    Sessions.renderResults();
  });
  const clr = $("#ss-clear-f");
  if (clr) clr.onclick = () => { Sessions.resetFilters(); Sessions.renderResults(); };
};

/* 내 일정 화면에서 세션 소개를 열어 관심을 바꿨다면 그 화면도 갱신 */
Sessions.refreshAfterFav = function () {
  if (currentTab === "planner") Views.planner(); else Sessions.renderResults();
};

Sessions.resetFilters = function () {
  Sessions.f = { date: "", venue: "", type: "", level: "", topic: "", service: "", format: "" };
  Sessions.soon = false;
  Sessions.limit = SESSION_PAGE;
};

Sessions.openSortMenu = function () {
  const cur = Sessions.sort || "time";
  const opts = [
    ["time", "🕘 시간순", "이른 시간 순서"],
    ["recommended", "✨ 추천순", "관심 토픽·서비스가 맞을수록 위로"],
    ["level", "📊 레벨순", "입문(100) → 전문가(400)"]
  ];
  openModal(`
    <h2>정렬</h2>
    ${opts.map(([v, l, d]) => `
      <button class="btn ${v === cur ? "" : "ghost"} block left" data-sort="${v}">${l}${v === cur ? " ✓" : ""}<br>
        <span class="muted" style="font-size:12px;font-weight:400;">${d}</span></button>`).join("")}
    <button class="btn ghost block" id="sort-cancel">취소</button>`);
  $$("#modal-root [data-sort]").forEach((b) => b.onclick = () => {
    Sessions.sort = b.dataset.sort;
    Sessions.limit = SESSION_PAGE;
    closeModal();
    Sessions.renderResults();
  });
  $("#sort-cancel").onclick = closeModal;
};

Sessions.openFilterSheet = function () {
  const venues = [...new Set(Sessions.all().map((s) => s.venue).filter(Boolean))].sort();
  const types = [...new Set(Sessions.all().map((s) => s.session_type).filter(Boolean))].sort();
  const topics = (window.APP_DATA.topics.topics || []);
  const dates = [...new Set(Sessions.all().map((s) => s.date).filter(Boolean))].sort();
  const FORMAT_ORDER = ["lecture", "discussion", "hands-on", "lab"];
  const formatSet = new Set(Sessions.all().map((s) => s.session_format).filter(Boolean));
  const formats = FORMAT_ORDER.filter((f) => formatSet.has(f))
    .concat([...formatSet].filter((f) => !FORMAT_ORDER.includes(f)))
    .map((f) => ({ v: f, t: FORMAT_KO[f] || f }));
  const chipGroup = (key, opts, val, labelFn) => `
    <label class="field">${{ date: "날짜", venue: "베뉴", type: "타입", format: "형식 (강의·실습 등)", level: "레벨", topic: "토픽", service: "AWS 서비스 (세션 많은 순)" }[key]}</label>
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
    ${chipGroup("format", formats, Sessions.f.format)}
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

/* 최근 검색어 (최대 8개, 새 것이 앞) */
const RecentQueries = {
  list() { return Array.isArray(S().recent_queries) ? S().recent_queries : []; },
  add(q) {
    const v = String(q || "").trim();
    if (v.length < 2) return;
    S().recent_queries = [v].concat(this.list().filter((x) => x.toLowerCase() !== v.toLowerCase())).slice(0, 8);
    Store.save();
  },
  clear() { S().recent_queries = []; Store.save(); }
};

function bindSessionChrome() {
  const q = $("#ss-q"), rq = $("#ss-recent");
  let t;
  const run = () => { clearTimeout(t); Sessions.q = q.value; Sessions.limit = SESSION_PAGE; Sessions.renderResults(); };
  const paintRecent = () => {
    const list = RecentQueries.list();
    const show = document.activeElement === q && !q.value && list.length;
    rq.classList.toggle("hidden", !show);
    rq.innerHTML = show ? `<span class="muted">최근</span>${list.map((x) => `<button class="chip" data-rq="${esc(x)}">${esc(x)}</button>`).join("")}<button class="link-btn" id="rq-clear">지우기</button>` : "";
    $$("[data-rq]", rq).forEach((b) => b.onclick = () => { q.value = b.dataset.rq; RecentQueries.add(q.value); run(); paintRecent(); q.blur(); });
    const c = $("#rq-clear", rq);
    if (c) c.onclick = () => { RecentQueries.clear(); paintRecent(); };
  };
  rq.addEventListener("pointerdown", (e) => e.preventDefault()); // 칩을 누르는 동안 입력창 포커스 유지
  q.addEventListener("focus", paintRecent);
  q.addEventListener("blur", () => { RecentQueries.add(q.value); setTimeout(paintRecent, 0); });
  q.addEventListener("input", () => { paintRecent(); clearTimeout(t); t = setTimeout(run, 250); });
  q.addEventListener("keydown", (e) => { if (e.key === "Enter") { RecentQueries.add(q.value); run(); q.blur(); } });
}
