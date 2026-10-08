/* 내 일정 탭: 스마트 플래너 — 타임라인, 이동 계산, 고정 이벤트, 메모, ICS */
"use strict";

const DAYS = ["2026-11-29", "2026-11-30", "2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04", "2026-12-05"];
let plannerDay = null;
let plannerManual = false; // true면 사용자가 직접 고른 날짜 유지
function todayClamped() {
  const t = vegasDateStr();
  if (t < DAYS[0]) return DAYS[0];
  if (t > DAYS[DAYS.length - 1]) return DAYS[DAYS.length - 1];
  return t;
}

/* 공식 카탈로그 베뉴 표기 → event_info 베뉴명 매핑 (좌표 조회용) */
const VENUE_ALIASES = { "Wynn/Encore": "Wynn", "Venetian": "The Venetian" };

/* 베뉴별 블록 색상 [라이트 배경, 라이트 테두리, 다크 배경, 다크 테두리] */
const VENUE_COLORS = [
  ["#dbeafe", "#3b82f6", "#1e3a5f", "#60a5fa"], // Caesars Forum
  ["#ede9fe", "#8b5cf6", "#2e235f", "#a78bfa"], // Caesars Palace
  ["#fce4ec", "#f43f5e", "#5f1e2e", "#fb7185"], // Encore
  ["#dcfce7", "#22c55e", "#1e4d2e", "#4ade80"], // MGM Grand
  ["#ccfbf1", "#14b8a6", "#1e4d4a", "#2dd4bf"], // The Venetian
  ["#fef3c7", "#f59e0b", "#4d3a1e", "#fbbf24"]  // Wynn
];
const FIXED_COLOR = ["#f1f5f9", "#94a3b8", "#2a3444", "#64748b"];

const Planner = {
  venueColorIdx(venue) {
    if (!venue) return -1;
    const v = venue.toLowerCase();
    if (v.includes("caesars forum")) return 0;
    if (v.includes("caesars palace")) return 1;
    if (v.includes("mgm")) return 3;
    if (v.includes("venetian")) return 4;
    if (v.includes("wynn")) return 5;
    if (v.includes("encore")) return 2;
    return -1;
  },
  venueBlockStyle(venue, isFixed) {
    const dark = document.documentElement.dataset.theme === "dark";
    let c = FIXED_COLOR;
    if (!isFixed) {
      const idx = this.venueColorIdx(venue);
      if (idx >= 0) c = VENUE_COLORS[idx];
    }
    const bg = dark ? c[2] : c[0], border = dark ? c[3] : c[1];
    return `background:${bg};border-left:4px solid ${border};`;
  },
  sessionById(id) { return allSessions().find((s) => s.session_id === id); },

  itemsFor(date) {
    const items = [];
    FIXED_EVENTS.filter((f) => f.date === date && !S().fixed_off.includes(f.id))
      .forEach((f) => {
        const edit = (S().fixed_edits || {})[f.id];
        items.push({ kind: "fixed", ...f, ...(edit || {}) });
      });
    (S().daily_plan[date] || []).forEach((p) => {
      const s = this.sessionById(p.session_id);
      if (s) items.push({ kind: "session", ...s, note: p.note });
      else items.push({ kind: "session-missing", session_id: p.session_id, date, note: p.note });
    });
    items.sort((a, b) => (a.start || a.start_time || "").localeCompare(b.start || b.start_time || ""));
    return items;
  },

  todayItems() {
    const t = vegasDateStr();
    return DAYS.includes(t) ? this.itemsFor(t) : [];
  },

  itemHTML(it) {
    const time = it.kind === "fixed"
      ? `${it.start}${it.end ? "–" + it.end : "부터"}`
      : `${it.start_time || ""}${it.end_time ? "–" + it.end_time : ""}`;
    const venue = it.venue || "";
    const badge = it.kind === "fixed" ? `<span class="badge warn">고정</span>` : `<span class="badge info">${esc(it.session_type || "세션")}</span>`;
    const note = S().session_notes[it.session_id || it.id];
    return `<div class="timeline-item" data-pitem="${esc(it.session_id || it.id)}">
      <div class="t">${esc(time)} ${venue ? "· " + esc(venue) : ""}</div>
      <div>${badge} <strong>${esc(it.title)}</strong></div>
      ${it.note || (note && note.memo) ? `<div class="muted">📝 ${esc(it.note || note.memo)}</div>` : ""}
      ${note && note.rating ? `<div class="muted">⭐ ${"★".repeat(note.rating)}</div>` : ""}
    </div>`;
  },

  /* ---- travel ---- */
  venueCoords(name) {
    const key = VENUE_ALIASES[name] || name;
    const v = (window.APP_DATA.event_info.venues || []).find((x) => x.name === key);
    return v ? { lat: v.lat, lng: v.lng } : null;
  },
  havKm(a, b) {
    const R = 6371, r = (d) => d * Math.PI / 180;
    const dLa = r(b.lat - a.lat), dLo = r(b.lng - a.lng);
    const h = Math.sin(dLa / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLo / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  },
  travelBetween(prev, next) {
    const pv = prev.venue, nv = next.venue;
    if (!pv || !nv) return null;
    if (pv === nv) return { minutes: 15, mode: "도보", label: "같은 베뉴 — 건물 내 이동 15분", maps: null };
    const a = this.venueCoords(pv), b = this.venueCoords(nv);
    if (!a || !b) return { minutes: 30, mode: "셔틀/택시", label: "베뉴 간 이동 — 여유 30분", maps: null };
    const km = this.havKm(a, b);
    let minutes, mode, label;
    if (km < 0.8) { minutes = Math.round(km / 3.5 * 60) + 10; mode = "도보"; }
    else if (km < 2) { minutes = Math.round(km / 18 * 60) + 15; mode = "셔틀/모노레일"; }
    else { minutes = Math.round(km / 22 * 60) + 15; mode = "셔틀/택시"; }
    label = `${pv} → ${nv} · 약 ${km.toFixed(1)}km · ${mode} ${minutes}분`;
    const maps = `https://www.google.com/maps/dir/?api=1&origin=${a.lat},${a.lng}&destination=${b.lat},${b.lng}&travelmode=${mode === "도보" ? "walking" : "driving"}`;
    return { minutes, mode, label, maps, km };
  },
  toMin(t) { if (!t) return null; const [h, m] = t.split(":").map(Number); return h * 60 + m; },

  /* ---- timetable (기본 8:00–20:00, 일정에 맞춰 자동 확장) ---- */
  renderTimetable(date) {
    const items = this.itemsFor(date);
    const PX = 1.4, PAD = 12, GUTTER = 46; // PX: 1분당 픽셀, PAD: 맨 위·아래 시간 라벨 여백
    if (!items.length) return `<div class="empty-state"><div class="big">🗓️</div><p>이 날의 일정이 비어 있어요.<br>세션 탭에서 관심 세션을 담아보세요.</p>
      <button class="btn ghost small" id="pl-go-sessions">세션 둘러보기</button></div>`;

    const raw = [];
    items.forEach((it) => {
      const s = this.toMin(it.start || it.start_time);
      let e = this.toMin(it.end || it.end_time);
      if (s == null) return;
      if (e == null || e <= s) e = Math.min(s + 60, 24 * 60);
      raw.push({ it, s, e });
    });
    // 이른 아침·밤 일정도 잘리지 않게 표시 범위를 넓힘 (정시 단위)
    let START = 8 * 60, END = 20 * 60;
    raw.forEach((b) => { START = Math.min(START, Math.floor(b.s / 60) * 60); END = Math.max(END, Math.ceil(b.e / 60) * 60); });
    END = Math.min(END, 24 * 60);
    const y = (min) => Math.round((min - START) * PX) + PAD;
    const blocks = raw.map((b) => ({ ...b, s: Math.max(b.s, START), e: Math.min(b.e, END) }));

    // 겹치는 블록은 가로로 나눔
    const sorted = [...blocks].sort((a, b) => a.s - b.s || a.e - b.e);
    const colEnd = [];
    sorted.forEach((b) => {
      let c = 0;
      while (c < colEnd.length && colEnd[c] > b.s) c++;
      b.col = c; colEnd[c] = b.e;
    });
    blocks.forEach((b) => {
      let mx = b.col + 1;
      blocks.forEach((o) => { if (o !== b && o.s < b.e && b.s < o.e) mx = Math.max(mx, o.col + 1); });
      b.cols = mx;
    });

    let html = "";
    for (let h = START / 60; h <= END / 60; h++) {
      html += `<div class="tt-hour" style="top:${y(h * 60)}px"><span>${h === 24 ? "24" : h}:00</span></div>`;
    }

    blocks.forEach((b) => {
      const top = y(b.s);
      const hgt = Math.max(Math.round((b.e - b.s) * PX) - 2, 46);
      // 겹치는 블록은 가로로 나란히 배치 (시간표식)
      const colW = `(100% - ${GUTTER}px - 4px) / ${b.cols}`;
      const left = `calc(${GUTTER}px + ${colW} * ${b.col})`;
      const width = `calc(${colW} - 4px)`;
      const z = 1 + b.col;
      const isFixed = b.it.kind === "fixed";
      const vStyle = this.venueBlockStyle(b.it.venue, isFixed);
      const time = `${b.it.start || b.it.start_time || ""}${(b.it.end || b.it.end_time) ? "–" + (b.it.end || b.it.end_time) : ""}`;
      const kst = kstRange(date, b.it.start || b.it.start_time, b.it.end || b.it.end_time);
      const note = b.it.note || (S().session_notes[b.it.session_id || b.it.id] || {}).memo;
      // 블록 높이에 맞춰 보여줄 줄 수를 정함 (글자가 반쯤 잘려 보이지 않게)
      const LINE = 17.6, VLINE = 18;
      let avail = hgt - 14 - 19 - (kst ? 17 : 0);
      const showVenue = !!b.it.venue && avail - VLINE >= LINE;
      if (showVenue) avail -= VLINE;
      const titleLines = Math.max(1, Math.min(3, Math.floor(avail / LINE)));
      const showNote = !!note && avail - titleLines * LINE >= VLINE;
      html += `<div class="tt-block" data-pitem="${esc(b.it.session_id || b.it.id)}"
        style="top:${top}px;height:${hgt}px;left:${left};width:${width};z-index:${z};${vStyle}" role="button" tabindex="0">
        <div class="tt-time">${esc(time)}</div>
        ${kst ? `<div class="tt-kst">🇰🇷${kst}</div>` : ""}
        <div class="tt-title" style="-webkit-line-clamp:${titleLines}">${isFixed ? `<span class="badge warn">고정</span> ` : ""}<strong>${esc(b.it.title)}</strong></div>
        ${showVenue ? `<div class="tt-venue">📍 ${esc(b.it.venue)}</div>` : ""}
        ${showNote ? `<div class="tt-venue">📝 ${esc(note)}</div>` : ""}
      </div>`;
    });

    // 이동 레이어: 일정 사이 빈 시간에 표시 (겹치면 생략)
    const ordered = [...blocks].sort((a, b) => a.s - b.s || a.e - b.e);
    ordered.forEach((b, i) => {
      const nxt = ordered[i + 1];
      if (!nxt) return;
      const gap = nxt.s - b.e;
      if (gap <= 0) return;
      const tr = this.travelBetween(b.it, nxt.it);
      if (!tr) return;
      const bad = gap < tr.minutes;
      const icon = tr.mode === "도보" ? "🚶" : tr.mode.includes("택시") ? "🚕" : "🚌";
      // 빈 시간이 넉넉하면 앞 일정 바로 아래, 좁으면 빈 시간 한가운데에 표시
      const gapPx = gap * PX;
      const top = gapPx >= 44 ? y(b.e) + 8 : y(b.e) + gapPx / 2 - 11;
      const dest = b.it.venue !== nxt.it.venue && nxt.it.venue ? ` → ${nxt.it.venue}` : "";
      html += `<div class="tt-travel${bad ? " bad" : ""}" style="top:${Math.round(top)}px;left:${GUTTER + 6}px" title="${esc(tr.label)}">${icon} ${tr.minutes}분 · ${esc(tr.mode)}${esc(dest)}${bad ? ` ⚠️ 여유 ${gap}분` : ""}</div>`;
    });

    // 지금 선
    if (date === vegasDateStr()) {
      const p = vegasParts();
      const nowMin = (+p.hour) * 60 + (+p.minute);
      if (nowMin >= START && nowMin <= END) {
        html += `<div class="tt-now" style="top:${y(nowMin)}px"><span>지금</span></div>`;
      }
    }

    return `<div class="tt-wrap"><div class="tt-grid" style="height:${y(END) + PAD}px">${html}</div>
      <div class="tt-note muted">탭하면 상세 보기 · 🇰🇷는 한국 시간</div></div>`;
  },

  openItem(id, date) {
    const it = this.itemsFor(date).find((x) => (x.session_id || x.id) === id);
    if (!it) return;

    if (it.kind === "fixed") {
      const edit = (S().fixed_edits || {})[it.id] || {};
      openModal(`
        <h2>고정 일정</h2>
        <label class="field">제목</label>
        <input type="text" id="pf-title" value="${esc(edit.title || it.title || "")}">
        <div class="row">
          <div><label class="field">시작</label><input type="time" id="pf-start" value="${esc(edit.start || it.start || "")}"></div>
          <div><label class="field">종료</label><input type="time" id="pf-end" value="${esc(edit.end || it.end || "")}"></div>
        </div>
        <label class="field">장소</label>
        <input type="text" id="pf-venue" value="${esc(edit.venue || it.venue || "")}">
        <label class="field">메모</label>
        <textarea id="pf-note" rows="2" placeholder="메모">${esc(edit.note || it.note || "")}</textarea>
        <button class="btn block" id="pf-save">저장</button>
        <button class="btn ghost block" id="pf-close">닫기</button>`);
      $("#pf-save").onclick = () => {
        S().fixed_edits = S().fixed_edits || {};
        S().fixed_edits[it.id] = {
          title: $("#pf-title").value.trim() || it.title,
          start: $("#pf-start").value || it.start,
          end: $("#pf-end").value || "",
          venue: $("#pf-venue").value.trim(),
          note: $("#pf-note").value.trim()
        };
        Store.save(); closeModal(); Views.planner(); toast("수정했어요");
      };
      $("#pf-close").onclick = closeModal;
      return;
    }

    // session
    const n = S().session_notes[id] || { rating: 0, memo: "" };
    const res = (S().reservations[id] || {}).status || "none";
    const kst = kstRange(it.date, it.start_time, it.end_time);
    openModal(`
      <h2 style="padding-right:8px;">${esc(it.title || "세션")}</h2>
      <div class="muted" style="font-size:13px;margin-bottom:10px;">
        ${it.date ? esc(dayLabel(it.date)) + " " : ""}${esc(it.start_time || "")}${it.end_time ? "–" + esc(it.end_time) : ""} (현지)
        ${kst ? `<br>🇰🇷 ${kst}` : ""}
        ${it.venue ? `<br>📍 ${esc(it.venue)}${roomLabel(it) ? " · " + esc(roomLabel(it)) : ""}` : ""}
        ${it.code ? `<br><span class="badge">${esc(it.code)}</span>` : ""}
      </div>
      <label class="field">예약 상태</label>
      <div class="chip-row" id="pi-res">
        ${["reserved", "waitlist", "none"].map((v) => `<button class="chip${res === v ? " on" : ""}" data-v="${v}">${RES_LABEL[v]}</button>`).join("")}
      </div>
      <label class="field" style="display:block;margin-top:12px;">별점</label>
      <div class="stars" id="pi-stars">${[1, 2, 3, 4, 5].map((i) => `<span data-s="${i}" class="${i <= n.rating ? "on" : ""}">★</span>`).join("")}</div>
      <label class="field">메모</label>
      <textarea id="pi-memo" rows="3" placeholder="배운 점, 후속 액션 등">${esc(n.memo)}</textarea>
      <button class="btn block" id="pi-save">저장</button>
      <button class="btn ghost block" id="pi-unfav">일정에서 빼기</button>
      <button class="btn ghost block" id="pi-close">닫기</button>`);
    let rating = n.rating;
    $$("#pi-res .chip").forEach((c) => c.onclick = () => {
      S().reservations[id] = { status: c.dataset.v, updated_at: new Date().toISOString() };
      Store.save();
      $$("#pi-res .chip").forEach((x) => x.classList.toggle("on", x === c));
      toast(c.dataset.v === "reserved" ? "예약됨으로 표시했어요" : c.dataset.v === "waitlist" ? "대기로 표시했어요" : "미예약으로 표시했어요");
    });
    const paintPiStars = () => {
      $$("#pi-stars span").forEach((x) => x.classList.toggle("on", Number(x.dataset.s) <= rating));
    };
    $$("#pi-stars span").forEach((sp) => {
      const setPi = (e) => { e.preventDefault(); rating = Number(sp.dataset.s); paintPiStars(); };
      sp.addEventListener("click", setPi);
      sp.addEventListener("touchstart", setPi, { passive: false });
    });
    $("#pi-save").onclick = () => {
      S().session_notes[id] = { rating, memo: $("#pi-memo").value.trim(), updated_at: new Date().toISOString() };
      Store.save(); closeModal(); Views.planner(); toast("저장했어요");
    };
    $("#pi-unfav").onclick = () => {
      const st = S();
      Object.keys(st.daily_plan).forEach((d) => { st.daily_plan[d] = (st.daily_plan[d] || []).filter((x) => x.session_id !== id); });
      const fi = st.favorites.indexOf(id); if (fi >= 0) st.favorites.splice(fi, 1);
      Store.save(); closeModal(); Views.planner(); toast("일정에서 뺐어요");
    };
    $("#pi-close").onclick = closeModal;
  },

  openNote(id) {
    const n = S().session_notes[id] || { rating: 0, memo: "" };
    openModal(`
      <h2>세션 메모</h2>
      <label class="field">별점</label>
      <div class="stars" id="nt-stars">${[1, 2, 3, 4, 5].map((i) => `<span data-s="${i}" class="${i <= n.rating ? "on" : ""}">★</span>`).join("")}</div>
      <label class="field">후기 / 감상평</label>
      <textarea id="nt-memo" rows="4" placeholder="배운 점, 후속 액션 등">${esc(n.memo)}</textarea>
      <button class="btn block" id="nt-save">저장</button>
      <button class="btn ghost block" id="nt-cancel">닫기</button>`);
    let rating = n.rating;
    const paintNtStars = () => {
      $$("#nt-stars span").forEach((x) => x.classList.toggle("on", Number(x.dataset.s) <= rating));
    };
    $$("#nt-stars span").forEach((sp) => {
      const setNt = (e) => { e.preventDefault(); rating = Number(sp.dataset.s); paintNtStars(); };
      sp.addEventListener("click", setNt);
      sp.addEventListener("touchstart", setNt, { passive: false });
    });
    $("#nt-save").onclick = () => {
      S().session_notes[id] = { rating, memo: $("#nt-memo").value.trim(), updated_at: new Date().toISOString() };
      Store.save(); closeModal(); Views.planner(); toast("메모 저장했어요");
    };
    $("#nt-cancel").onclick = closeModal;
  },

  toggleFixed(id) {
    const off = S().fixed_off;
    const i = off.indexOf(id);
    if (i >= 0) off.splice(i, 1); else off.push(id);
    Store.save(); Views.planner();
  },

  exportICS() {
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//reinvent2026//trip//KO", "CALSCALE:GREGORIAN",
      "X-WR-CALNAME:re:Invent 2026"];
    // 행사 기간(11/29–12/5)은 PST(UTC-8) — UTC로 바꿔 넣어야 한국 폰 캘린더에서도 시각이 맞음
    const utc = (date, t) => {
      const [y, mo, da] = date.split("-").map(Number), [h, mi] = t.split(":").map(Number);
      return new Date(Date.UTC(y, mo - 1, da, h + 8, mi)).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    };
    const txt = (v) => String(v || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    let count = 0;
    DAYS.forEach((d) => {
      this.itemsFor(d).forEach((it) => {
        const start = it.start || it.start_time, end = it.end || it.end_time;
        if (!start) return;
        const room = it.kind === "session" ? roomLabel(it) : "";
        const desc = [it.code, it.note || (S().session_notes[it.session_id || it.id] || {}).memo].filter(Boolean).join("\n");
        lines.push("BEGIN:VEVENT", `UID:${(it.session_id || it.id)}-${d}@reinvent2026`, `DTSTAMP:${stamp}`,
          `DTSTART:${utc(d, start)}`, (end && end > start ? `DTEND:${utc(d, end)}` : "DURATION:PT1H"),
          `SUMMARY:${txt(it.title)}`,
          `LOCATION:${txt([it.venue, room].filter(Boolean).join(" · "))}`,
          ...(desc ? [`DESCRIPTION:${txt(desc)}`] : []), "END:VEVENT");
        count++;
      });
    });
    if (!count) { toast("내보낼 일정이 없어요"); return; }
    lines.push("END:VCALENDAR");
    download("reinvent2026-schedule.ics", lines.join("\r\n"), "text/calendar");
    toast("ICS 파일을 저장했어요");
  },

  reportView() {
    let idx = Math.max(0, DAYS.indexOf(plannerDay));
    let root = $("#report-screen");
    if (!root) {
      root = document.createElement("div");
      root.id = "report-screen";
      document.body.appendChild(root);
    }
    const render = () => {
      const d = DAYS[idx];
      const items = this.itemsFor(d);
      root.innerHTML = `
        <div class="report-screen-head">
          <button class="btn ghost small" id="rp-back">◀ 뒤로</button>
          <strong>📋 일정 보고서</strong>
          <span style="width:64px;"></span>
        </div>
        <div class="report-screen-body">
          <div class="report">
            <div class="report-head">
              <button class="btn ghost small" id="rp-prev"${idx === 0 ? " disabled" : ""}>◀</button>
              <div style="text-align:center;"><h2 style="margin:0;">${dayLabel(d)}</h2>
              <div class="muted" style="font-size:12px;">re:Invent 2026 출장 일정 · 현지 시간</div></div>
              <button class="btn ghost small" id="rp-next"${idx === DAYS.length - 1 ? " disabled" : ""}>▶</button>
            </div>
            ${items.length ? items.map((it) => {
              const time = `${it.start || it.start_time || ""}${(it.end || it.end_time) ? "–" + (it.end || it.end_time) : ""}`;
              const kst = kstRange(d, it.start || it.start_time, it.end || it.end_time);
              return `<div class="report-item">
                <div class="report-time">${esc(time)}</div>
                <div class="report-title">${it.kind === "fixed" ? `<span class="badge warn">고정</span> ` : ""}${esc(it.title)}</div>
                ${it.venue ? `<div class="report-venue">📍 ${esc(it.venue)}</div>` : ""}
                ${kst ? `<div class="report-venue">🇰🇷 ${kst}</div>` : ""}
              </div>`;
            }).join("") : `<div class="empty-state"><p>등록된 일정이 없어요</p></div>`}
            <div class="report-page muted">${idx + 1} / ${DAYS.length}</div>
          </div>
        </div>`;
      root.classList.add("open");
      $("#rp-back").onclick = () => root.classList.remove("open");
      const prev = $("#rp-prev"), next = $("#rp-next");
      if (prev) prev.onclick = () => { if (idx > 0) { idx--; render(); } };
      if (next) next.onclick = () => { if (idx < DAYS.length - 1) { idx++; render(); } };
    };
    render();
  }
};

/* ---- route info (drawers) ---- */
const RouteInfo = {
  taxiZone: { "MGM Grand": "Zone 1 · $21.25", "Caesars Palace": "Zone 2 · $25.25", "Wynn": "Zone 3 · $29.25" },
  venuesHTML() {
    const venues = (window.APP_DATA.event_info.venues || []);
    return `<p class="muted" style="font-size:13px;">베뉴 6곳 — 탭하면 Google Maps가 열립니다.</p>` + venues.map((v) => `
      <div class="kv"><span><strong>${esc(v.name)}</strong><br>
        <span class="muted" style="font-size:12px;">${esc(v.address || "")}${this.taxiZone[v.name] ? `<br>택시 ${esc(this.taxiZone[v.name])}` : ""}</span></span>
        <a class="btn ghost small map-btn" target="_blank" rel="noopener"
           href="https://www.google.com/maps/search/?api=1&query=${v.lat},${v.lng}">📍 지도</a>
      </div>`).join("");
  },
  shuttleHTML() {
    const sh = window.APP_DATA.event_info.shuttle || {};
    return `<p style="font-size:14px;">${esc(sh.note || "베뉴 간 셔틀 운행 (배지 필수)")}</p>
      <p><span class="badge warn">시간표 미공개</span></p>
      <p class="muted" style="font-size:13px;">세부 노선·시간표는 가을 중 공개 예정 — 출발 직전 AWS Events 앱에서 확인하세요.</p>
      <div class="notice">💡 배지 제시로 <strong>라스베가스 모노레일 무료</strong> (SAHARA ↔ MGM Grand, 공항 미연결)</div>`;
  },
  airportHTML() {
    const sec = (window.APP_DATA.prep_sections || []).find((s) => s.id.includes("공항"));
    return sec ? sec.html : `<p class="muted">가이드 준비 중</p>`;
  },
  strategyHTML() {
    return `<p>세션을 <strong>베뉴 블록 단위</strong>로 묶고, 세션 사이 <strong>최소 40분</strong> 여유를 두세요.</p>
      <p>위 타임라인에서 베뉴가 바뀌면 이동 시간·수단을 자동으로 계산해 줍니다.</p>
      <p class="muted" style="font-size:13px;">다녀온 사람들 팁: 하루 일정은 <strong>베뉴 2곳(오전/오후)</strong>으로만 짜고, 이동에 1시간 여유를 두세요.</p>`;
  }
};

Views.planner = function () {
  if (!plannerManual) plannerDay = todayClamped(); // 탭을 열 때마다 현지 날짜로
  if (!DAYS.includes(plannerDay)) plannerDay = "2026-11-30";
  const el = $("#view-planner");
  el.innerHTML = `
    <div class="day-tabs">${DAYS.map((d) => {
      const w = Weather.iconFor(d);
      const cls = [d === plannerDay ? "active" : "", d === vegasDateStr() ? "today" : ""].filter(Boolean).join(" ");
      return `<button data-day="${d}" class="${cls}"${d === plannerDay ? ' aria-current="date"' : ""}>${dayLabel(d)}${w ? " " + w : ""}</button>`;
    }).join("")}</div>
    <div id="pl-timeline">${Planner.renderTimetable(plannerDay)}</div>
    <div class="card"><h3>🗺️ 동선 정보</h3>
      <button class="btn ghost block left info-btn" id="ri-venues">🗺️ 베뉴 6곳·지도</button>
      <button class="btn ghost block left info-btn" id="ri-shuttle">🚌 베뉴 간 셔틀</button>
      <button class="btn ghost block left info-btn" id="ri-airport">✈️ 공항 → 호텔 이동</button>
      <button class="btn ghost block left info-btn" id="ri-strategy">📌 베뉴 이동 전략</button>
    </div>
    <div class="card"><h3>고정 이벤트 표시</h3>
      ${FIXED_EVENTS.filter((f) => f.date === plannerDay).map((f0) => {
        const f = { ...f0, ...((S().fixed_edits || {})[f0.id] || {}) };
        return `<label class="check-item"><input type="checkbox" data-fx="${f.id}" ${S().fixed_off.includes(f.id) ? "" : "checked"}>
        <span>${esc(f.start)} ${esc(f.title)}${f.venue ? ` <span class="muted">· ${esc(f.venue)}</span>` : ""}</span></label>`;
      }).join("") || `<p class="muted">이 날의 고정 이벤트가 없어요</p>`}
    </div>
    <div class="row">
      <button class="btn ghost small" id="pl-ics">📅 ICS 내보내기</button>
      <button class="btn ghost small" id="pl-report">📋 일정 보고서</button>
    </div>`;
  $$("#view-planner [data-day]").forEach((b) => b.onclick = () => { plannerManual = true; plannerDay = b.dataset.day; Views.planner(); });
  const act = $("#view-planner .day-tabs .active");
  if (act) act.scrollIntoView({ block: "nearest", inline: "center" });
  const goS = $("#pl-go-sessions");
  if (goS) goS.onclick = () => switchTab("sessions");
  $("#ri-venues").onclick = () => openDrawer("베뉴 6곳", RouteInfo.venuesHTML());
  $("#ri-shuttle").onclick = () => openDrawer("베뉴 간 셔틀", RouteInfo.shuttleHTML());
  $("#ri-airport").onclick = () => openDrawer("공항 → 호텔 이동", RouteInfo.airportHTML());
  $("#ri-strategy").onclick = () => openDrawer("베뉴 이동 전략", RouteInfo.strategyHTML());
  $$("#view-planner [data-fx]").forEach((c) => c.onchange = () => Planner.toggleFixed(c.dataset.fx));
  $("#pl-ics").onclick = () => Planner.exportICS();
  $("#pl-report").onclick = () => Planner.reportView();
  $$("#pl-timeline [data-pitem]").forEach((it) => {
    const open = () => { const id = it.dataset.pitem; if (id) Planner.openItem(id, plannerDay); };
    it.addEventListener("click", open);
    it.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
  });
};
