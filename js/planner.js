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
/* 좁은 자리에 쓰는 짧은 베뉴명 */
const VENUE_SHORT = { "Caesars Forum": "Forum", "Caesars Palace": "Caesars", "MGM Grand": "MGM", "The Venetian": "Venetian", "Venetian": "Venetian", "Wynn/Encore": "Wynn", "Wynn": "Wynn", "Encore": "Encore" };
const shortVenue = (v) => VENUE_SHORT[v] || v || "";

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
    allFixed().filter((f) => f.date === date && !S().fixed_off.includes(f.id))
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

  /* ---- 시간 helpers ---- */
  toMin(t) { if (!t) return null; const [h, m] = t.split(":").map(Number); return h * 60 + m; },
  hhmm(min) { return `${pad2(Math.floor(min / 60) % 24)}:${pad2(min % 60)}`; },
  dur(min) { // 95 → "1시간 35분"
    const h = Math.floor(min / 60), m = min % 60;
    return h ? `${h}시간${m ? ` ${m}분` : ""}` : `${m}분`;
  },
  itemId(it) { return it.session_id || it.id; },
  /* 시간 있는 일정만 [{it, s, e}] (시작 → 긴 일정 순) */
  timedFor(date) {
    const out = [];
    this.itemsFor(date).forEach((it) => {
      const s = this.toMin(it.start || it.start_time);
      if (s == null) return;
      let e = this.toMin(it.end || it.end_time);
      if (e == null || e <= s) e = Math.min(s + 60, 24 * 60);
      out.push({ it, s, e });
    });
    return out.sort((a, b) => a.s - b.s || b.e - a.e);
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
    if (pv === nv) return { minutes: 15, mode: "도보", icon: "🚶", same: true, label: "같은 베뉴 — 건물 내 이동 약 15분", maps: null };
    const a = this.venueCoords(pv), b = this.venueCoords(nv);
    if (!a || !b) return { minutes: 30, mode: "셔틀/택시", icon: "🚌", label: "베뉴 간 이동 — 여유 30분", maps: null };
    const km = this.havKm(a, b);
    let minutes, mode;
    if (km < 0.8) { minutes = Math.round(km / 3.5 * 60) + 10; mode = "도보"; }
    else if (km < 2) { minutes = Math.round(km / 18 * 60) + 15; mode = "셔틀/모노레일"; }
    else { minutes = Math.round(km / 22 * 60) + 15; mode = "셔틀/택시"; }
    const icon = mode === "도보" ? "🚶" : mode.includes("택시") ? "🚕" : "🚌";
    const label = `${pv} → ${nv} · 약 ${km.toFixed(1)}km · ${mode} ${minutes}분`;
    const maps = `https://www.google.com/maps/dir/?api=1&origin=${a.lat},${a.lng}&destination=${b.lat},${b.lng}&travelmode=${mode === "도보" ? "walking" : "driving"}`;
    return { minutes, mode, icon, label, maps, km };
  },
  /* 이 날의 이동 구간: 각 일정마다 '그 전에 끝나는 일정 중 가장 늦게 끝나는 것'에서 출발한다고 봄 */
  legsFor(date, list) {
    list = list || this.timedFor(date);
    const legs = [];
    list.forEach((b, i) => {
      let pred = null;
      list.forEach((a, j) => { if (j !== i && a.e <= b.s && a.s < b.s && (!pred || a.e > pred.e)) pred = a; });
      if (!pred) return;
      const tr = this.travelBetween(pred.it, b.it);
      if (!tr) return;
      const gap = b.s - pred.e, slack = gap - tr.minutes;
      const status = slack < 0 ? "bad" : slack < 15 ? "tight" : "ok";
      legs.push({ a: pred, b, tr, gap, slack, status, leaveBy: b.s - tr.minutes });
    });
    return legs;
  },
  legStatusText(l) {
    if (l.status === "bad") return `이동시간 ${l.tr.minutes - l.gap}분 부족`;
    if (l.status === "tight") return `빠듯 · 여유 ${l.slack}분`;
    return `여유 ${this.dur(l.slack)}`;
  },
  /* 같은 시각에 겹치는 세션 (둘 다 세션일 때만 — 고정 일정은 '운영 시간'이라 제외) */
  conflictsFor(date, list) {
    list = (list || this.timedFor(date)).filter((x) => x.it.kind === "session");
    const out = [];
    list.forEach((a, i) => list.slice(i + 1).forEach((b) => { if (b.s < a.e && a.s < b.e) out.push([a, b]); }));
    return out;
  },

  /* ---- timetable: 구글 캘린더식 배치 ----
     · 시작이 비슷한(NEST_MIN 이내) 겹치는 일정 → 나란히
     · 나중에 시작하는 겹치는 일정 → 앞 일정 위에 살짝 들여 겹쳐 그림
     · 앞 일정의 글자는 위에 겹친 일정이 시작되기 전 공간에만 그려서 가려지지 않게 함 */
  layoutBlocks(list) {
    const NEST_MIN = 45, INDENT = 18;
    const groups = [];
    const blocks = list.map((x) => ({ ...x }));
    blocks.forEach((b) => {
      // 1) 시작이 비슷하고 겹치면 같은 그룹(나란히)
      for (let g = groups.length - 1; g >= 0; g--) {
        const G = groups[g];
        if (b.s - G.start < NEST_MIN && b.s < G.maxEnd) { G.members.push(b); G.maxEnd = Math.max(G.maxEnd, b.e); b.group = G; return; }
      }
      // 2) 아니면 겹치는 일정 중 가장 오른쪽(가장 깊은) 것 위에 들여 겹침
      let parent = null;
      blocks.forEach((o) => {
        if (!o.group || o === b || !(o.e > b.s && o.s <= b.s)) return;
        if (!parent || o.order > parent.order) parent = o;
      });
      const G = { start: b.s, maxEnd: b.e, members: [b], parent };
      groups.push(G);
      b.group = G;
    });
    // 그룹 순서대로 위치 계산 (부모 그룹은 항상 먼저 확정됨)
    let order = 0;
    groups.forEach((G) => {
      const p = G.parent;
      const L = p ? { f: p.lf, px: p.lp + INDENT } : { f: 0, px: 0 };
      const R = p ? { f: p.lf + p.wf, px: p.lp + p.wp } : { f: 1, px: 0 };
      const n = G.members.length;
      G.members.forEach((b, i) => {
        b.wf = (R.f - L.f) / n; b.wp = (R.px - L.px) / n;
        b.lf = L.f + b.wf * i; b.lp = L.px + b.wp * i;
        b.depth = p ? p.depth + 1 : 0;
        b.parent = p;
        b.order = order++;
      });
    });
    // 위에 겹친 일정이 시작되기 전까지만 글자 영역으로 사용
    blocks.forEach((b) => {
      b.textEnd = b.e;
      for (let p = b.parent; p; p = p.parent) if (b.s < p.textEnd) p.textEnd = Math.min(p.textEnd, b.s);
    });
    return blocks;
  },
  measure(text, font) {
    const ctx = this._ctx || (this._ctx = document.createElement("canvas").getContext("2d"));
    ctx.font = font + ' -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
    return ctx.measureText(text).width;
  },

  renderTimetable(date) {
    const mine = this.timedFor(date);
    // 동료 일정: 내가 같은 세션을 담았으면 따로 그리지 않고 내 블록에 색 점으로 표시
    const myIds = new Set(mine.filter((x) => x.it.kind === "session").map((x) => x.it.session_id));
    const peerList = Share.sessionsFor(date).filter((x) => !myIds.has(x.s.session_id)).map((x) => {
      const s = this.toMin(x.s.start_time), e = this.toMin(x.s.end_time);
      return { it: { ...x.s, kind: "peer", peer: x.peer }, s, e: e && e > s ? e : s + 60 };
    }).filter((x) => x.s != null);
    const list = mine.concat(peerList).sort((a, b) => a.s - b.s || b.e - a.e);
    const PX = 1.4, PAD = 12, GUTTER = 46; // PX: 1분당 픽셀, PAD: 맨 위·아래 시간 라벨 여백
    if (!list.length) return `<div class="empty-state"><div class="big">🗓️</div><p>이 날의 일정이 비어 있어요.<br>세션 탭에서 관심 세션을 담아보세요.</p>
      <button class="btn ghost small" id="pl-go-sessions">세션 둘러보기</button></div>`;

    // 이른 아침·밤 일정도 잘리지 않게 표시 범위를 넓힘 (정시 단위)
    let START = 8 * 60, END = 20 * 60;
    list.forEach((b) => { START = Math.min(START, Math.floor(b.s / 60) * 60); END = Math.max(END, Math.ceil(b.e / 60) * 60); });
    END = Math.min(END, 24 * 60);
    const y = (min) => Math.round((min - START) * PX) + PAD;
    // 동료 일정이 있으면 오른쪽 30%를 동료 칸으로 따로 둠 → 내 일정 블록은 동료 때문에 좁아지지 않음
    const LANE = peerList.length ? 0.3 : 0;
    const clamp = (arr) => arr.map((b) => ({ ...b, s: Math.max(b.s, START), e: Math.min(b.e, END) }));
    const lane = (arr, off, k) => this.layoutBlocks(clamp(arr)).map((b) => ({ ...b, lf: off + b.lf * k, wf: b.wf * k }));
    const blocks = lane(mine, 0, 1 - LANE).concat(LANE ? lane(peerList, 1 - LANE, LANE) : []);
    const trackW = Math.min(window.innerWidth || 390, 520) - 28 - GUTTER - 6; // 글자 줄 수 추정용
    // 이동 구간 (내 일정만 · 빈 시간이 좁으면 칩을 앞 일정 아래쪽에 붙이므로 그만큼 글자 영역을 비워 둠)
    const legs = this.legsFor(date, mine);
    const reserve = {};
    legs.forEach((l) => {
      if (l.tr.same && l.status === "ok") return;
      if ((Math.min(l.b.s, END) - Math.max(l.a.e, START)) * PX < 28) reserve[this.itemId(l.a.it)] = 26;
    });

    let html = LANE ? `<div class="tt-lane" style="left:calc(${GUTTER}px + (100% - ${GUTTER + 6}px) * ${1 - LANE});height:calc(100% - ${PAD}px)"><span>👥 동료</span></div>` : "";
    for (let h = START / 60; h <= END / 60; h++) {
      html += `<div class="tt-hour" style="top:${y(h * 60)}px"><span>${h}:00</span></div>`;
    }

    const LT = 17, LM = 15.5; // 제목 줄 높이, 보조 줄 높이
    blocks.forEach((b) => {
      const it = b.it, isFixed = it.kind === "fixed", peer = it.kind === "peer" ? it.peer : null;
      const top = y(b.s);
      const hgt = Math.max(Math.round((b.e - b.s) * PX) - 2, 40);
      const left = `calc(${GUTTER}px + (100% - ${GUTTER + 6}px) * ${b.lf.toFixed(4)} + ${b.lp.toFixed(1)}px)`;
      const width = `calc((100% - ${GUTTER + 6}px) * ${b.wf.toFixed(4)} + ${(b.wp - 3).toFixed(1)}px)`;
      const boxW = trackW * b.wf + b.wp - 3 - 14; // 글자 폭 (좌우 여백 제외)
      const time = `${it.start || it.start_time || ""}${(it.end || it.end_time) ? "–" + (it.end || it.end_time) : ""}`;
      const kst = kstRange(date, it.start || it.start_time, it.end || it.end_time);
      const note = it.note || (S().session_notes[this.itemId(it)] || {}).memo;
      const room = it.kind === "session" ? roomLabel(it) : "";
      const place = [it.venue, room].filter(Boolean).join(" · ");
      // 글자를 그릴 수 있는 높이 (위에 겹친 일정 전까지) → 들어가는 만큼만 표시
      let rest = Math.min(hgt - (reserve[this.itemId(it)] || 0), Math.round((b.textEnd - b.s) * PX) - 2) - 10 - LT;
      const title = (isFixed ? "📌 " : "") + (peer ? `[${peer.name}] ` : "") + (it.title || "");
      const needLines = Math.max(1, Math.ceil(this.measure(title, "700 13px") / Math.max(boxW, 30) * 1.08));
      const kstInline = kst && this.measure(`${time} · 🇰🇷${kst}`, "600 11.5px") <= boxW;
      const show = { time: false, kst: false, place: false, note: false };
      let lines = 1;
      if (rest >= LM) { show.time = true; rest -= LM; }
      if (place && rest >= LM) { show.place = true; rest -= LM; }
      while (lines < Math.min(3, needLines) && rest >= LT) { lines++; rest -= LT; }
      if (kst && !kstInline && rest >= LM) { show.kst = true; rest -= LM; }
      if (note && rest >= LM) { show.note = true; rest -= LM; }
      const z = 2 + b.depth * 4 + (b.order % 4);
      const pc = peer ? Share.color(peer) : null;
      const style = peer ? `--pc:${pc.line};--pbg:${pc.bg};` : this.venueBlockStyle(it.venue, isFixed);
      const withP = it.kind === "session" ? Share.withPeers(it.session_id, date) : [];
      html += `<div class="tt-block${b.depth ? " nested" : ""}${isFixed ? " fixed" : ""}${peer ? " peer" : ""}" ${peer ? `data-peeritem="${esc(peer.id + "|" + it.session_id)}"` : `data-pitem="${esc(this.itemId(it))}"`}
        style="top:${top}px;height:${hgt}px;left:${left};width:${width};z-index:${z};${style}" role="button" tabindex="0">
        ${withP.length ? `<span class="tt-with" title="${esc(withP.map((p) => p.name).join(", "))}도 담음">${withP.map((p) => Share.dotHTML(p)).join("")}</span>` : ""}
        <div class="tt-title" style="-webkit-line-clamp:${lines}">${peer ? `<span class="peer-tag">${esc(peer.name)}</span>` : ""}${esc(peer ? it.title : title)}</div>
        ${show.time ? `<div class="tt-time">${esc(time)}${kstInline ? ` <span class="tt-kst">· 🇰🇷${kst}</span>` : ""}</div>` : ""}
        ${show.place ? `<div class="tt-venue">📍 ${esc(place)}</div>` : ""}
        ${show.kst ? `<div class="tt-kst">🇰🇷 ${kst}</div>` : ""}
        ${show.note ? `<div class="tt-venue">📝 ${esc(note)}</div>` : ""}
      </div>`;
    });

    // 이동 구간: 상태 색(여유/빠듯/부족) + 탭하면 상세
    legs.forEach((l, i) => {
      if (l.tr.same && l.status === "ok") return; // 같은 베뉴에 여유 충분 → 표시 생략
      const a = Math.max(l.a.e, START), bS = Math.min(l.b.s, END);
      const gapPx = (bS - a) * PX;
      const route = l.tr.same ? "건물 내 이동" : `${shortVenue(l.a.it.venue)} → ${shortVenue(l.b.it.venue)}`;
      const short = `${l.tr.icon} ${l.tr.minutes}분 → ${esc(l.tr.same ? "같은 베뉴" : shortVenue(l.b.it.venue))} · ${esc((l.status === "bad" ? "⚠️ " : "") + this.legStatusText(l))}`;
      if (gapPx >= 58) {
        // 빈 시간이 넉넉: 점선 + 두 줄 칩 (경로·소요 / 상태·출발 시각)
        html += `<div class="tt-leg-line st-${l.status}" style="top:${y(a)}px;height:${Math.round(gapPx)}px;left:${GUTTER + 12}px"></div>
          <button class="tt-travel st-${l.status} two" data-leg="${i}" style="top:${y(a) + 6}px;left:${GUTTER + 4}px">
          <span class="l1">${l.tr.icon} ${esc(route)} · ${l.tr.minutes}분</span>
          <span class="l2">${esc(this.legStatusText(l))}${l.status !== "bad" ? ` · ${this.hhmm(l.leaveBy)}까지 출발` : ""}</span>
        </button>`;
      } else if (gapPx >= 28) {
        // 빈 시간 안에 한 줄 칩
        html += `<button class="tt-travel st-${l.status}" data-leg="${i}" style="top:${Math.round(y(a) + gapPx / 2 - 12)}px;left:${GUTTER + 4}px"><span class="l1">${short}</span></button>`;
      } else {
        // 빈 시간이 거의 없음: 다음 일정 제목을 가리지 않게 앞 일정 아래쪽(비워 둔 자리)에 표시
        html += `<button class="tt-travel st-${l.status} tail" data-leg="${i}" style="top:${y(a) - 26}px;right:calc((100% - ${GUTTER}px) * ${LANE} + 8px)"><span class="l1">${short}</span></button>`;
      }
    });

    // 한국 업무시간(평일 09–18시 KST) 띠
    if (S().show_kr_hours !== false) {
      this.krBands(date).forEach((b) => {
        const s0 = Math.max(b.s, START), e0 = Math.min(b.e, END);
        if (e0 - s0 < 15) return;
        html += `<div class="tt-kr" style="top:${y(s0)}px;height:${Math.round((e0 - s0) * PX)}px"><span>🇰🇷 한국 업무시간 ${b.kstLabel} ${this.hhmm(s0 + 17 * 60)}–${this.hhmm(e0 + 17 * 60)}</span></div>`;
      });
    }

    // 지금 선
    if (date === vegasDateStr()) {
      const p = vegasParts();
      const nowMin = (+p.hour) * 60 + (+p.minute);
      if (nowMin >= START && nowMin <= END) {
        html += `<div class="tt-now" style="top:${y(nowMin)}px"><span>지금</span></div>`;
      }
    }

    return `<div class="tt-wrap"><div class="tt-grid" style="height:${y(END) + PAD}px">${html}</div>
      <div class="tt-note muted">일정을 탭하면 상세 · 이동 표시를 탭하면 길찾기 · 🇰🇷 한국 시간${S().show_kr_hours !== false ? "<br>푸른 띠는 한국 업무시간 (설정에서 끌 수 있어요)" : ""}</div></div>`;
  },

  /* 라스베가스 하루(PST) 중 한국 평일 업무시간(09–18시 KST)에 해당하는 구간 — PST + 17시간 = KST
     · 00:00–01:00 → 같은 날짜 KST 17–18시 · 16:00–24:00 → 다음 날짜 KST 09–17시 */
  krBands(date) {
    const next = new Date(date + "T12:00:00"); next.setDate(next.getDate() + 1);
    const nextStr = `${next.getFullYear()}-${pad2(next.getMonth() + 1)}-${pad2(next.getDate())}`;
    const weekday = (ds) => { const w = new Date(ds + "T12:00:00").getDay(); return w > 0 && w < 6; };
    const out = [];
    if (weekday(date)) out.push({ s: 0, e: 60, kstLabel: dayLabel(date) });
    if (weekday(nextStr)) out.push({ s: 16 * 60, e: 24 * 60, kstLabel: dayLabel(nextStr) });
    return out;
  },

  /* ---- 이 날의 동선 (정류장 목록) ---- */
  routeHTML(date) {
    const list = this.timedFor(date);
    if (!list.length) return "";
    const legs = this.legsFor(date, list);
    const conflicts = this.conflictsFor(date, list);
    const legInto = new Map(legs.map((l, i) => [l.b, i]));
    const dark = document.documentElement.dataset.theme === "dark";
    let html = "";
    list.forEach((x) => {
      const li = legInto.get(x);
      if (li != null) {
        const l = legs[li];
        // 이동하고도 1시간 이상 비면 '빈 시간' 행 (11–14시에 걸치면 점심)
        const free = l.slack;
        if (free >= 60) {
          const from = l.a.e, to = l.b.s - l.tr.minutes;
          const lunch = from < 14 * 60 && to > 11 * 60;
          const n = Suggest.gapCandidates(date, from, to, l.a.it.venue).length;
          html += `<button class="route-gap" data-gap="${from}|${to}|${esc(l.a.it.venue || "")}">
            <span class="rl-ico">${lunch ? "🍽️" : "☕"}</span>
            <span class="rl-txt"><b>${lunch ? "점심·" : ""}빈 시간 ${this.dur(free)}</b>
            <span class="rl-sub">${n ? `이 시간에 볼 만한 세션 ${n}개` : "Expo·라운지에서 쉬어 가기"}</span></span>
            <span class="chev">›</span></button>`;
        }
        const alts = l.status !== "ok" && x.it.kind === "session" ? this.routeFixes(l).length : 0;
        html += `<button class="route-leg st-${l.status}" data-leg="${li}">
          <span class="rl-ico">${l.tr.icon}</span>
          <span class="rl-txt"><b>${esc(l.tr.same ? "건물 내 이동" : `${shortVenue(l.a.it.venue)} → ${shortVenue(x.it.venue)}`)} · ${l.tr.minutes}분</b>
          <span class="rl-sub">${esc(l.tr.same ? "같은 베뉴" : l.tr.mode)}${l.tr.km ? ` · ${l.tr.km.toFixed(1)}km` : ""} · ${this.hhmm(l.a.e)} 종료 후</span>
          <span class="rl-st">${esc(this.legStatusText(l))}${l.status !== "bad" ? ` · ${this.hhmm(l.leaveBy)}까지 출발` : ""}</span>
          ${alts ? `<span class="rl-sub">💡 더 가까운 대체 세션 ${alts}개</span>` : ""}</span>
          <span class="chev">›</span></button>`;
      }
      const it = x.it, idx = this.venueColorIdx(it.venue);
      const c = it.kind === "fixed" ? FIXED_COLOR : idx >= 0 ? VENUE_COLORS[idx] : FIXED_COLOR;
      const clash = conflicts.some(([a, b]) => a === x || b === x);
      html += `<div class="route-stop" data-pitem="${esc(this.itemId(it))}" role="button" tabindex="0">
        <span class="rs-time">${this.hhmm(x.s)}<small>${this.hhmm(x.e)}</small></span>
        <span class="rs-dot" style="border-color:${dark ? c[3] : c[1]}"></span>
        <span class="rs-body"><b>${esc(it.venue || "장소 미정")}</b><span class="muted">${it.kind === "fixed" ? "📌 " : ""}${esc(it.title)}</span>
          ${clash ? `<span class="badge danger" style="margin-top:3px;">⚠️ 다른 세션과 시간 겹침</span>` : ""}</span>
      </div>`;
    });
    return `${this.lunchWarning(list) ? `<div class="warn-box">🍽️ 11–14시 사이에 30분 이상 빈 시간이 없어요. 점심을 거르기 쉬우니 스낵을 챙기거나 일정을 하나 조정해 보세요.</div>` : ""}
      <div class="route">${html}</div>`;
  },
  /* 점심 시간대(11–14시)에 30분 이상 빈 시간이 없으면 true */
  lunchWarning(list) {
    const W0 = 11 * 60, W1 = 14 * 60;
    const busy = list.filter((x) => x.s < W1 && x.e > W0).map((x) => [Math.max(x.s, W0), Math.min(x.e, W1)]).sort((a, b) => a[0] - b[0]);
    if (!busy.length) return false;
    let t = W0, maxFree = 0;
    busy.forEach(([s, e]) => { maxFree = Math.max(maxFree, s - t); t = Math.max(t, e); });
    maxFree = Math.max(maxFree, W1 - t);
    return maxFree < 30;
  },
  /* 동선 개선: 다음 세션 대신, 앞 일정 베뉴에서 제시간에 갈 수 있는 비슷한 세션 */
  routeFixes(l) {
    const from = l.a.it.venue;
    return Suggest.alternatives(this.itemId(l.b.it), {
      near: from, limit: 4,
      filter: (c) => {
        const tr = this.travelBetween({ venue: from }, { venue: c.venue });
        return !!tr && this.toMin(c.start_time) - l.a.e >= tr.minutes;
      }
    });
  },

  /* ---- 하단 시트: 이동 상세 ---- */
  openTravel(date, i) {
    const l = this.legsFor(date)[i];
    if (!l) return;
    const a = l.a.it, b = l.b.it;
    const stLabel = { ok: "여유 있음", tight: "빠듯함", bad: "시간 부족" }[l.status];
    const sh = (window.APP_DATA.event_info.shuttle || {}).note;
    const fixes = l.status !== "ok" && b.kind === "session" ? this.routeFixes(l) : [];
    const tips = l.tr.same
      ? "같은 베뉴라도 건물이 넓어 층·구역 이동에 10–15분 걸릴 수 있어요. 방 번호를 미리 확인하세요."
      : l.tr.mode === "도보"
        ? "가까운 베뉴라 걸어서 이동할 수 있어요. 카지노 층을 가로지르면 길을 잃기 쉬우니 'Walk to …' 안내판을 따라가세요."
        : `베뉴 간 셔틀은 배지 소지자만 탈 수 있어요.${sh ? " " + esc(sh) : ""} 급하면 택시·Uber(지정 승차장)를 이용하세요.`;
    openSheet({
      title: "이동 정보",
      body: `
        <div class="route-card">
          <div class="rc-stop"><span class="rc-dot"></span><div><b>${this.hhmm(l.a.e)} 종료</b><div class="rc-title">${esc(a.title)}</div><div class="muted">📍 ${esc(a.venue)}</div></div></div>
          <div class="rc-leg st-${l.status}">${l.tr.icon} ${esc(l.tr.same ? "건물 내 이동" : l.tr.mode)} 약 ${l.tr.minutes}분${l.tr.km ? ` · ${l.tr.km.toFixed(1)}km` : ""}</div>
          <div class="rc-stop"><span class="rc-dot end"></span><div><b>${this.hhmm(l.b.s)} 시작</b><div class="rc-title">${esc(b.title)}</div><div class="muted">📍 ${esc(b.venue)}</div></div></div>
        </div>
        <div class="kv"><span>사이 시간</span><b>${this.dur(l.gap)}</b></div>
        <div class="kv"><span>예상 이동 시간</span><b>${l.tr.minutes}분</b></div>
        <div class="kv"><span>늦어도 출발</span><b>${this.hhmm(l.leaveBy)}</b></div>
        <div class="kv"><span>상태</span><b class="st-text st-${l.status}">${stLabel} · ${esc(this.legStatusText(l))}</b></div>
        <div class="${l.status === "bad" ? "danger-box" : "notice"}">${l.status === "bad" ? "⚠️ 앞 일정을 일찍 나오거나 다음 세션 시작에 늦을 수 있어요. " : "💡 "}${tips}</div>
        <p class="muted" style="font-size:12px;margin:6px 0 0;">이동 시간은 베뉴 간 직선거리로 추정한 값이에요. 혼잡 시간엔 더 걸려요.${b.kind === "session" ? ` 예약석은 세션 시작 10분 전까지 도착해야 유지돼요.` : ""}</p>
        ${fixes.length ? `<h3 style="margin:16px 0 6px;">💡 동선 개선 제안</h3>
        <p class="muted" style="font-size:13px;margin:0 0 4px;">'${esc((b.title || "").slice(0, 40))}' 대신, ${esc(a.venue)}에서 제시간에 갈 수 있는 비슷한 세션이에요.</p>
        ${fixes.map((c) => Suggest.rowHTML(c, { near: a.venue, swap: true, baseId: this.itemId(b) })).join("")}` : ""}`,
      actions: l.tr.same ? `<button class="btn" id="tv-close">확인</button>`
        : `<button class="btn ghost" id="tv-close">닫기</button>
        ${l.tr.maps ? `<a class="btn accent" href="${l.tr.maps}" target="_blank" rel="noopener">🗺️ 구글 지도 길찾기</a>` : `<button class="btn" id="tv-shuttle">🚌 셔틀 정보</button>`}`
    });
    $("#tv-close").onclick = () => $("#modal-overlay")._dismiss();
    Suggest.bind($(".bs-body"), { baseId: this.itemId(b), swap: true, onDone: () => Views.planner() });
    const shBtn = $("#tv-shuttle");
    if (shBtn) shBtn.onclick = () => { closeModal(); openDrawer("베뉴 간 셔틀", RouteInfo.shuttleHTML()); };
  },

  /* ---- 하단 시트: 일정 상세 ---- */
  openItem(id, date) {
    const it = this.itemsFor(date).find((x) => this.itemId(x) === id);
    if (!it) return;
    const dismiss = () => { const ov = $("#modal-overlay"); if (ov) ov._dismiss(); };

    if (it.kind === "fixed") {
      const base = allFixed().find((f) => f.id === it.id) || it;
      const edited = !!(S().fixed_edits || {})[it.id];
      const kst = kstRange(date, it.start, it.end);
      openSheet({
        title: it.keynote ? "🎤 키노트" : "📌 고정 일정",
        body: `
          <div class="info-list">
            <span>🗓️</span><span>${esc(dayLabel(date))} · 현지 시간${kst ? ` <span class="muted">(🇰🇷 ${kst})</span>` : ""}</span>
          </div>
          <label class="field" for="pf-title">제목</label>
          <input type="text" id="pf-title" value="${esc(it.title || "")}">
          <div class="row">
            <div><label class="field" for="pf-start">시작</label><input type="time" id="pf-start" value="${esc(it.start || "")}"></div>
            <div><label class="field" for="pf-end">종료</label><input type="time" id="pf-end" value="${esc(it.end || "")}"></div>
          </div>
          <label class="field" for="pf-venue">장소</label>
          <input type="text" id="pf-venue" value="${esc(it.venue || "")}">
          <label class="field" for="pf-note">메모</label>
          <textarea id="pf-note" rows="2" placeholder="메모">${esc(it.note || "")}</textarea>
          <div class="sheet-links">
            ${edited ? `<button class="link-btn" id="pf-reset">↺ 기본값으로 되돌리기</button>` : ""}
            <button class="link-btn danger" id="pf-hide">이 날 시간표에서 숨기기</button>
          </div>`,
        actions: `<button class="btn ghost" id="pf-close">닫기</button><button class="btn" id="pf-save">저장</button>`
      });
      $("#pf-save").onclick = () => {
        S().fixed_edits = S().fixed_edits || {};
        S().fixed_edits[it.id] = {
          title: $("#pf-title").value.trim() || base.title,
          start: $("#pf-start").value || base.start,
          end: $("#pf-end").value || "",
          venue: $("#pf-venue").value.trim(),
          note: $("#pf-note").value.trim()
        };
        Store.save(); closeModal(); Views.planner(); toast("수정했어요");
      };
      const rs = $("#pf-reset");
      if (rs) rs.onclick = () => { delete S().fixed_edits[it.id]; Store.save(); closeModal(); Views.planner(); toast("기본값으로 되돌렸어요"); };
      $("#pf-hide").onclick = () => { closeModal(); this.toggleFixed(it.id); toast("숨겼어요 — 아래 '고정 이벤트 표시'에서 다시 켤 수 있어요"); };
      $("#pf-close").onclick = dismiss;
      return;
    }

    // session
    const n = S().session_notes[id] || { rating: 0, memo: "" };
    const res = (S().reservations[id] || {}).status || "none";
    const kst = kstRange(it.date, it.start_time, it.end_time);
    const room = roomLabel(it);
    const venueCo = this.venueCoords(it.venue);
    const withP = Share.withPeers(id, date);
    // 대체 세션: 백업으로 표시한 것 먼저, 이어서 추천
    const planned = Suggest.plannedIds(date);
    const pinned = (S().backups[id] || []).map((x) => this.sessionById(x)).filter((x) => x && !planned.has(x.session_id));
    const recs = Suggest.alternatives(id, { limit: 6 }).filter((x) => !pinned.includes(x));
    const alts = pinned.concat(recs).slice(0, 5);
    const reps = Suggest.repeats(id).filter((c) => c.date !== it.date || c.start_time !== it.start_time);
    const walkUp = res !== "reserved" ? `<div class="notice" style="margin-top:14px;">🚶 <b>예약 없이 들어가려면</b> 시작 20–30분 전 입구의 Walk-up 줄에 서세요. 예약자가 시작 10분 전까지 오지 않은 자리가 줄 순서대로 열려요.</div>` : "";
    const repHTML = reps.length ? `
        <h3 class="sg-head">📅 다른 회차 ${reps.length}개</h3>
        <p class="muted" style="font-size:12px;margin:0 0 4px;">같은 내용이 다른 날·장소에서도 열려요. '이 회차로'를 누르면 일정이 바뀌어요.</p>
        ${reps.map((c) => Suggest.repeatRowHTML(c, { swapFrom: id })).join("")}` : "";
    const altHTML = alts.length ? `
        <h3 class="sg-head">🔁 ${res === "reserved" ? "대체 세션" : "예약이 어렵다면? 대체 세션"}</h3>
        <p class="muted" style="font-size:12px;margin:0 0 4px;">같은 시간대(±30분)의 비슷한 세션이에요. ☆로 백업 표시, '바꾸기'로 일정 교체.</p>
        ${alts.map((c) => Suggest.rowHTML(c, { near: it.venue, swap: true, baseId: id })).join("")}` : "";
    openSheet({
      title: "내 일정",
      body: `
        <h3 class="bs-title">${esc(it.title || "세션")}</h3>
        <div class="info-list">
          <span>🕘</span><span><b>${it.date ? esc(dayLabel(it.date)) + " " : ""}${esc(it.start_time || "")}${it.end_time ? "–" + esc(it.end_time) : ""}</b> <span class="muted">현지</span></span>
          ${kst ? `<span>🇰🇷</span><span>${kst} <span class="muted">한국</span></span>` : ""}
          ${it.venue ? `<span>📍</span><span>${esc(it.venue)}${room ? `<span class="muted"> · ${esc(room)}</span>` : ""}</span>` : ""}
          <span>🏷️</span><span>${[it.code, it.session_type, it.level ? "Lv." + it.level : ""].filter(Boolean).map((t) => `<span class="badge">${esc(t)}</span>`).join("")}</span>
          ${withP.length ? `<span>👥</span><span>${withP.map((p) => `${Share.dotHTML(p)} ${esc(p.name)}`).join(", ")}님도 담았어요</span>` : ""}
        </div>
        <label class="field">예약 상태</label>
        <div class="seg" id="pi-res">
          ${["reserved", "waitlist", "none"].map((v) => `<button class="seg-btn res-${v}${res === v ? " on" : ""}" data-v="${v}">${RES_LABEL[v]}</button>`).join("")}
        </div>
        <label class="field" style="display:block;margin-top:12px;">별점</label>
        <div class="stars" id="pi-stars">${[1, 2, 3, 4, 5].map((i) => `<span data-s="${i}" class="${i <= n.rating ? "on" : ""}">★</span>`).join("")}</div>
        <label class="field" for="pi-memo">메모</label>
        <textarea id="pi-memo" rows="3" placeholder="배운 점, 후속 액션 등">${esc(n.memo)}</textarea>
        ${walkUp}${repHTML}${altHTML}
        <div class="sheet-links">
          <button class="link-btn" id="pi-detail">세션 소개 보기</button>
          ${venueCo ? `<a class="link-btn" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${venueCo.lat},${venueCo.lng}">지도에서 보기</a>` : ""}
          <button class="link-btn danger" id="pi-unfav">일정에서 빼기</button>
        </div>`,
      actions: `<button class="btn ghost" id="pi-close">닫기</button><button class="btn" id="pi-save">저장</button>`
    });
    let rating = n.rating;
    $$("#pi-res .seg-btn").forEach((c) => c.onclick = () => {
      S().reservations[id] = { status: c.dataset.v, updated_at: new Date().toISOString() };
      Store.save();
      $$("#pi-res .seg-btn").forEach((x) => x.classList.toggle("on", x === c));
      toast(c.dataset.v === "reserved" ? "예약됨으로 표시했어요" : c.dataset.v === "waitlist" ? "대기로 표시했어요" : "미예약으로 표시했어요");
    });
    const paintPiStars = () => {
      $$("#pi-stars span").forEach((x) => x.classList.toggle("on", Number(x.dataset.s) <= rating));
    };
    $$("#pi-stars span").forEach((sp) => {
      const setPi = (e) => { e.preventDefault(); rating = Number(sp.dataset.s) === rating ? 0 : Number(sp.dataset.s); paintPiStars(); };
      sp.addEventListener("click", setPi);
    });
    $("#pi-save").onclick = () => {
      S().session_notes[id] = { rating, memo: $("#pi-memo").value.trim(), updated_at: new Date().toISOString() };
      Store.save(); closeModal(); Views.planner(); toast("저장했어요");
    };
    $("#pi-detail").onclick = () => { closeModal(); Sessions.openDetail(id); };
    Suggest.bind($(".bs-body"), { baseId: id, swap: true, onDone: () => Views.planner() });
    $("#pi-unfav").onclick = () => {
      const st = S();
      Object.keys(st.daily_plan).forEach((d) => { st.daily_plan[d] = (st.daily_plan[d] || []).filter((x) => x.session_id !== id); });
      const fi = st.favorites.indexOf(id); if (fi >= 0) st.favorites.splice(fi, 1);
      Store.save(); closeModal(); Views.planner(); toast("일정에서 뺐어요");
    };
    $("#pi-close").onclick = dismiss;
  },

  /* ---- 홈: 다가오는 일정 ----
     행사 시작(11/30) 전: 오늘 이후 일정이 있는 가장 가까운 날 / 11/30부터: 오늘 일정 */
  upcomingDay() {
    const today = vegasDateStr();
    if (today > DAYS[DAYS.length - 1]) return null;
    if (today >= EVENT_START) return { day: today, today: true };
    const d = DAYS.find((x) => x > today && this.timedFor(x).length);
    return d ? { day: d, today: false } : null;
  },
  upcomingHTML() {
    const u = this.upcomingDay();
    if (!u) return "";
    let day = u.day, list = this.timedFor(day), head, sub = "";
    const p = vegasParts(), nowMin = (+p.hour) * 60 + (+p.minute);
    const daysTo = Math.round((new Date(day + "T00:00:00") - new Date(vegasDateStr() + "T00:00:00")) / 86400000);
    if (u.today) {
      const left = list.filter((x) => x.e > nowMin);
      if (!left.length) {
        // 오늘 일정이 모두 끝났으면 다음 일정 날을 미리 보여줌
        const nx = DAYS.find((x) => x > day && this.timedFor(x).length);
        if (!nx) return `<div class="card"><h3>📅 오늘 일정</h3><p class="muted">오늘 일정이 모두 끝났어요. 수고하셨어요 🙌</p></div>`;
        sub = `<p class="muted" style="margin:-2px 0 6px;">오늘 일정은 모두 끝났어요 🙌</p>`;
        day = nx; list = this.timedFor(nx);
        head = `📅 다음 일정 · ${dayLabel(nx)}`;
      } else {
        list = left;
        head = `📅 오늘 일정 · ${dayLabel(day)}`;
      }
    } else {
      head = `📅 다가오는 일정 · ${dayLabel(day)} <span class="badge info">${daysTo === 1 ? "내일" : `D-${daysTo}`}</span>`;
    }
    const isToday = day === vegasDateStr();
    const legInto = new Map(this.legsFor(day).map((l) => [this.itemId(l.b.it), l]));
    const shown = list.slice(0, 5);
    const rows = shown.map((x, i) => {
      const it = x.it, id = this.itemId(it);
      let tag = "";
      if (isToday) {
        if (x.s <= nowMin && nowMin < x.e) tag = `<span class="up-tag now">진행 중</span>`;
        else if (x.s > nowMin) tag = `<span class="up-tag${x.s - nowMin <= 30 ? " soon" : ""}">${x.s - nowMin < 60 ? `${x.s - nowMin}분 후` : `${this.dur(x.s - nowMin)} 후`}</span>`;
      }
      const r = it.kind === "session" ? (S().reservations[id] || {}).status : "";
      const resBadge = r === "reserved" ? `<span class="badge ok">예약됨</span>` : r === "waitlist" ? `<span class="badge warn">대기</span>` : it.kind === "session" ? `<span class="badge">미예약</span>` : `<span class="badge warn">고정</span>`;
      const l = legInto.get(id);
      const legRow = i > 0 && l && !(l.tr.same && l.status === "ok")
        ? `<div class="up-leg st-${l.status}">${l.tr.icon} ${esc(l.tr.same ? "건물 내 이동" : `${shortVenue(l.a.it.venue)} → ${shortVenue(it.venue)}`)} ${l.tr.minutes}분 · ${esc(this.legStatusText(l))}${l.status !== "bad" ? ` · ${this.hhmm(l.leaveBy)}까지 출발` : ""}</div>` : "";
      return `${legRow}<div class="up-item" data-pday="${day}" data-pitem="${esc(id)}" role="button" tabindex="0">
        <div class="up-time">${this.hhmm(x.s)}<small>${this.hhmm(x.e)}</small></div>
        <div class="up-body"><b>${esc(it.title)}</b><span class="muted">📍 ${esc(it.venue || "장소 미정")}${(() => { const w = it.kind === "session" ? Share.withPeers(id, day) : []; return w.length ? ` · 👥 ${esc(w.map((p) => p.name).join(", "))}` : ""; })()}</span><span>${resBadge}</span></div>
        ${tag}
      </div>`;
    }).join("");
    const more = list.length > shown.length ? ` (${list.length - shown.length}개 더)` : "";
    return `<div class="card"><h3>${head}</h3>${sub}${rows}
      <button class="btn ghost block small" data-pday-all="${day}">${dayLabel(day)} 전체 일정 보기${more}</button></div>`;
  },
  bindUpcoming() {
    $$("#home-upcoming [data-pitem]").forEach((el) => el.onclick = () => this.goto(el.dataset.pday, el.dataset.pitem));
    $$("#home-upcoming [data-pday-all]").forEach((el) => el.onclick = () => this.goto(el.dataset.pdayAll));
  },
  goto(day, id) {
    switchTab("planner");
    plannerManual = true; plannerDay = day; Views.planner();
    if (id) this.openItem(id, day);
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
      <p>시간표와 '동선'에서 베뉴가 바뀌는 구간마다 이동 시간·수단과 <strong>늦어도 출발할 시각</strong>을 계산해 줍니다.
      <span class="st-text st-ok">초록</span>은 여유, <span class="st-text st-tight">주황</span>은 빠듯, <span class="st-text st-bad">빨강</span>은 시간 부족이에요.</p>
      <p class="muted" style="font-size:13px;">다녀온 사람들 팁: 하루 일정은 <strong>베뉴 2곳(오전/오후)</strong>으로만 짜고, 이동에 1시간 여유를 두세요.</p>`;
  }
};

Views.planner = function () {
  if (!plannerManual) plannerDay = todayClamped(); // 탭을 열 때마다 현지 날짜로
  if (!DAYS.includes(plannerDay)) plannerDay = "2026-11-30";
  const el = $("#view-planner");
  const route = Planner.routeHTML(plannerDay);
  el.innerHTML = `
    <div class="day-tabs">${DAYS.map((d) => {
      const w = Weather.iconFor(d);
      const cls = [d === plannerDay ? "active" : "", d === vegasDateStr() ? "today" : ""].filter(Boolean).join(" ");
      return `<button data-day="${d}" class="${cls}"${d === plannerDay ? ' aria-current="date"' : ""}>${dayLabel(d)}${w ? " " + w : ""}</button>`;
    }).join("")}</div>
    <div class="peer-bar">
      ${Share.peers().map((p) => `<button class="peer-chip${p.visible !== false ? " on" : ""}" data-peer="${p.id}" aria-pressed="${p.visible !== false}">${Share.dotHTML(p)}${esc(p.name)}</button>`).join("")}
      <button class="peer-chip add" id="pl-share">👥 ${Share.peers().length ? "공유·받기" : "동료와 일정 공유"}</button>
      ${Share.peers().length ? `<button class="peer-chip add" id="pl-peers">관리</button>` : ""}
    </div>
    <div id="pl-timeline">${Planner.renderTimetable(plannerDay)}</div>
    <div class="card"><h3>🧭 ${dayLabel(plannerDay)} 동선</h3>
      ${route || `<p class="muted">이 날은 이동할 일정이 없어요.</p>`}
      <div class="route-info">
        <button class="btn ghost small" id="ri-venues">🗺️ 베뉴·지도</button>
        <button class="btn ghost small" id="ri-shuttle">🚌 셔틀</button>
        <button class="btn ghost small" id="ri-airport">✈️ 공항→호텔</button>
        <button class="btn ghost small" id="ri-strategy">📌 이동 전략</button>
      </div>
    </div>
    <div class="card"><h3>고정 이벤트 표시</h3>
      ${allFixed().filter((f) => f.date === plannerDay).map((f0) => {
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
  $$("#view-planner [data-pitem]").forEach((it) => {
    const open = () => { const id = it.dataset.pitem; if (id) Planner.openItem(id, plannerDay); };
    it.addEventListener("click", open);
    it.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
  });
  $$("#view-planner [data-leg]").forEach((b) => b.onclick = (e) => { e.stopPropagation(); Planner.openTravel(plannerDay, Number(b.dataset.leg)); });
  $$("#view-planner [data-peer]").forEach((b) => b.onclick = () => {
    const p = Share.peer(b.dataset.peer); p.visible = p.visible === false; Store.save(); Views.planner();
  });
  $("#pl-share").onclick = () => Share.open();
  const pm = $("#pl-peers");
  if (pm) pm.onclick = () => Share.openManage();
  $$("#pl-timeline [data-peeritem]").forEach((b) => b.onclick = () => {
    const [pid, sid] = b.dataset.peeritem.split("|");
    Share.openItem(pid, sid, plannerDay);
  });
  $$("#view-planner [data-gap]").forEach((b) => b.onclick = () => {
    const [from, to, near] = b.dataset.gap.split("|");
    Suggest.openGap(plannerDay, Number(from), Number(to), near);
  });
};
