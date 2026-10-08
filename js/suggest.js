/* 세션 추천: 대체 세션(백업) · 동선 개선 · 빈 시간 채우기 */
"use strict";

const Suggest = {
  /* 같은 날 내 일정에 이미 담긴 세션 id */
  plannedIds(date) { return new Set((S().daily_plan[date] || []).map((p) => p.session_id)); },
  km(v1, v2) {
    if (!v1 || !v2) return null;
    if (v1 === v2) return 0;
    const a = Planner.venueCoords(v1), b = Planner.venueCoords(v2);
    return a && b ? Planner.havKm(a, b) : null;
  },
  /* 점수: 토픽이 겹칠수록·가까울수록·관심 토픽일수록 높음 */
  score(c, o) {
    let sc = 0;
    const topics = c.topics || [];
    const svcs = c.services || [];
    if (o.base) {
      sc += 3 * topics.filter((t) => (o.base.topics || []).includes(t)).length;
      sc += Math.min(2, svcs.filter((x) => (o.base.services || []).includes(x)).length);
      if (c.session_type === o.base.session_type) sc += 1.5;
      if (c.level && o.base.level) sc -= Math.abs(+c.level - +o.base.level) / 200;
      sc -= Math.abs(Planner.toMin(c.start_time) - Planner.toMin(o.base.start_time)) / 30;
    }
    sc += 2 * Math.min(2, topics.filter((t) => S().profile.topics.includes(t)).length);
    sc += 1.5 * Math.min(2, svcs.filter((x) => (S().profile.services || []).includes(x)).length); // 관심 AWS 서비스
    if (/sponsored by/i.test(c.title || "")) sc -= 1.5; // 스폰서 발표는 살짝 뒤로
    const d = this.km(o.near, c.venue);
    if (d != null) sc += d === 0 ? 4 : -1.5 * d;
    if (S().favorites.includes(c.session_id)) sc += 1;
    return sc;
  },

  /* 같은 세션의 다른 회차 (코드 끝 -R, -R1… 만 다른 것) — 만석·대기일 때 다른 날 같은 내용을 들을 수 있음 */
  baseCode(code) { return String(code || "").replace(/-R\d*$/, ""); },
  repeats(id) {
    const s = Planner.sessionById(id);
    if (!s || !s.code) return [];
    const b = this.baseCode(s.code);
    return allSessions().filter((c) => c.session_id !== id && c.code && this.baseCode(c.code) === b)
      .sort((x, y) => (x.date + x.start_time).localeCompare(y.date + y.start_time));
  },
  repeatRowHTML(c, o) {
    o = o || {};
    const planned = (S().daily_plan[c.date] || []).some((x) => x.session_id === c.session_id);
    return `<div class="sg-row">
      <div class="sg-main" data-sg-open="${esc(c.session_id)}" role="button" tabindex="0">
        <b>${esc(dayLabel(c.date))} ${esc(c.start_time)}–${esc(c.end_time || "")}</b>
        <span class="muted">📍 ${esc(c.venue || "")}${roomLabel(c) ? " · " + esc(roomLabel(c)) : ""} · ${esc(c.code)}</span>
      </div>
      <div class="sg-act">${planned ? `<span class="badge ok">담김</span>` : o.swapFrom ? `<button class="sg-btn primary" data-sg-do="${esc(c.session_id)}">이 회차로</button>` : ""}</div>
    </div>`;
  },

  /* 대체 세션: 같은 날, 시작 시각이 ±30분 이내 (o.near가 있으면 그 베뉴에서 가까운 순으로 가산) */
  alternatives(id, o) {
    o = o || {};
    const base = Planner.sessionById(id);
    if (!base || !base.date || !base.start_time) return [];
    const planned = this.plannedIds(base.date), s0 = Planner.toMin(base.start_time);
    return allSessions()
      .filter((c) => c.date === base.date && c.session_id !== id && !planned.has(c.session_id) && c.start_time &&
        Math.abs(Planner.toMin(c.start_time) - s0) <= 30 && (!o.filter || o.filter(c)))
      .map((c) => ({ s: c, score: this.score(c, { base, near: o.near || base.venue }) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, o.limit || 5)
      .map((x) => x.s);
  },

  /* 빈 시간(from~to, 분)에 들어가는 세션: 앞 일정 베뉴에서 이동 시간을 빼고도 시작 전에 도착할 수 있는 것 */
  gapCandidates(date, from, to, near) {
    const planned = this.plannedIds(date);
    return allSessions().filter((c) => {
      if (c.date !== date || planned.has(c.session_id) || !c.start_time) return false;
      const s = Planner.toMin(c.start_time), e = Planner.toMin(c.end_time) || s + 60;
      if (s < from || e > to) return false;
      const tr = near ? Planner.travelBetween({ venue: near }, { venue: c.venue }) : null;
      return !tr || s - from >= tr.minutes;
    });
  },
  gapFill(date, from, to, near, limit) {
    const ranked = this.gapCandidates(date, from, to, near)
      .map((c) => ({ s: c, score: this.score(c, { near }) }))
      .sort((a, b) => b.score - a.score);
    return this.diverse(ranked, limit || 6).map((x) => x.s);
  },
  /* 같은 시작 시각만 잔뜩 나오지 않게: 이미 고른 시각과 같으면 점수를 깎아 가며 하나씩 고름 */
  diverse(ranked, limit) {
    const pool = ranked.slice(), out = [];
    while (out.length < limit && pool.length) {
      pool.forEach((x) => { x.adj = x.score - 2 * out.filter((o) => o.s.start_time === x.s.start_time).length; });
      pool.sort((a, b) => b.adj - a.adj);
      out.push(pool.shift());
    }
    return out;
  },

  /* 추천 한 줄 (시트 안에서 사용) */
  rowHTML(c, o) {
    o = o || {};
    const d = this.km(o.near, c.venue);
    const room = roomLabel(c);
    const backup = o.baseId && (S().backups[o.baseId] || []).includes(c.session_id);
    const topicHit = (c.topics || []).filter((t) => S().profile.topics.includes(t)).length;
    return `<div class="sg-row" data-sg="${esc(c.session_id)}">
      <div class="sg-main" data-sg-open="${esc(c.session_id)}" role="button" tabindex="0">
        <b>${esc(c.title)}</b>
        <span class="muted">${esc(c.start_time)}–${esc(c.end_time || "")} · 📍 ${esc(shortVenue(c.venue))}${room ? " · " + esc(room) : ""}</span>
        <span class="sg-tags">${d === 0 ? `<span class="badge ok">같은 베뉴</span>` : d != null ? `<span class="badge">${d.toFixed(1)}km</span>` : ""}${topicHit ? `<span class="badge info">관심 토픽</span>` : ""}${c.level ? `<span class="badge">Lv.${esc(c.level)}</span>` : ""}</span>
      </div>
      <div class="sg-act">
        ${o.baseId ? `<button class="sg-btn${backup ? " on" : ""}" data-sg-backup="${esc(c.session_id)}" aria-pressed="${!!backup}" title="백업으로 표시">${backup ? "★" : "☆"}</button>` : ""}
        <button class="sg-btn primary" data-sg-do="${esc(c.session_id)}">${o.swap ? "바꾸기" : "담기"}</button>
      </div>
    </div>`;
  },

  /* 추천 목록 이벤트 연결 — onDone(): 바꾸기/담기 후 화면 갱신 */
  bind(root, o) {
    $$("[data-sg-open]", root).forEach((el) => el.onclick = () => { closeModal(); Sessions.openDetail(el.dataset.sgOpen); });
    $$("[data-sg-backup]", root).forEach((el) => el.onclick = () => {
      const list = S().backups[o.baseId] = S().backups[o.baseId] || [];
      const id = el.dataset.sgBackup, i = list.indexOf(id);
      if (i >= 0) list.splice(i, 1); else list.push(id);
      Store.save();
      el.classList.toggle("on", i < 0); el.textContent = i < 0 ? "★" : "☆";
      toast(i < 0 ? "백업 세션으로 표시했어요" : "백업 표시를 뺐어요");
    });
    $$("[data-sg-do]", root).forEach((el) => el.onclick = () => {
      const id = el.dataset.sgDo;
      if (o.swap) this.swap(o.baseId, id); else this.add(id);
      closeModal();
      if (o.onDone) o.onDone();
    });
  },

  add(id) {
    const s = Planner.sessionById(id), st = S();
    if (!s) return;
    if (!st.favorites.includes(id)) st.favorites.push(id);
    const day = st.daily_plan[s.date] = st.daily_plan[s.date] || [];
    if (!day.some((x) => x.session_id === id)) day.push({ session_id: id, note: "" });
    Store.save();
    toast("내 일정에 담았어요 📅");
  },
  /* 바꾸기: 원래 세션을 빼고 새 세션을 담음 — 원래 세션은 새 세션의 백업으로 남겨 되돌리기 쉽게 */
  swap(fromId, toId) {
    const st = S(), to = Planner.sessionById(toId);
    if (!to) return;
    Object.keys(st.daily_plan).forEach((d) => { st.daily_plan[d] = (st.daily_plan[d] || []).filter((x) => x.session_id !== fromId); });
    const fi = st.favorites.indexOf(fromId); if (fi >= 0) st.favorites.splice(fi, 1);
    this.add(toId);
    const merged = [fromId, ...(st.backups[fromId] || []), ...(st.backups[toId] || [])];
    st.backups[toId] = merged.filter((x, i) => x !== toId && merged.indexOf(x) === i).slice(0, 8);
    delete st.backups[fromId];
    Store.save();
    toast("세션을 바꿨어요 — 원래 세션은 백업에 남겨 뒀어요");
  },

  /* 빈 시간 시트 (#6: 점심·휴식 + 볼 만한 세션) */
  openGap(date, from, to, near) {
    const len = to - from;
    const lunch = from < 14 * 60 && to > 11 * 60;
    const meals = (window.APP_DATA.event_info.meals || {}).note;
    const list = this.gapFill(date, from, to, near, 6);
    openSheet({
      title: lunch ? "🍽️ 점심·빈 시간" : "☕ 빈 시간",
      body: `
        <div class="info-list">
          <span>🕘</span><span><b>${Planner.hhmm(from)}–${Planner.hhmm(to)}</b> <span class="muted">· ${Planner.dur(len)} 비어 있어요</span></span>
          ${near ? `<span>📍</span><span>${esc(near)}에서 출발</span>` : ""}
        </div>
        ${lunch ? `<div class="notice">🍽️ ${esc(meals || "컨퍼런스 기간에는 베뉴마다 식사 공간이 운영돼요.")} 지금 있는 베뉴의 식사 공간을 이용하면 이동 없이 해결돼요.
          ${near ? `<br><a href="${LocalGuide.mapsQuery("restaurants near " + (VENUE_ALIASES[near] || near) + " Las Vegas")}" target="_blank" rel="noopener">📍 ${esc(near)} 근처 식당 지도</a>` : ""}</div>` : ""}
        ${(() => {
          const kr = Planner.krBands(date).filter((b) => b.s < to && b.e > from);
          // hhmm은 24시간을 넘기면 다음 날 시각으로 접어 줌 (PST + 17시간 = KST)
          return kr.length ? `<div class="notice">🇰🇷 이 시간은 한국 업무시간이에요 (한국 ${Planner.hhmm(Math.max(from, kr[0].s) + 17 * 60)}부터). 본사 연락·메일 처리하기 좋아요.</div>` : "";
        })()}
        <h3 style="margin:14px 0 6px;">이 시간에 볼 만한 세션</h3>
        ${list.length ? list.map((c) => this.rowHTML(c, { near })).join("") : `<p class="muted">이 시간 안에 끝나는 세션이 없어요. Expo나 라운지에서 쉬어 가세요.</p>`}
        <p class="muted" style="font-size:12px;">관심 토픽·가까운 베뉴 순으로 골랐어요. 이동 시간을 빼고도 시작 전에 도착할 수 있는 세션만 보여줘요.</p>`,
      actions: `<button class="btn" id="gp-close">확인</button>`
    });
    $("#gp-close").onclick = () => $("#modal-overlay")._dismiss();
    this.bind($(".bs-body"), { onDone: () => Views.planner() });
  }
};
