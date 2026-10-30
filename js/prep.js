/* 준비·정보 탭: 내 출장 정보 + 가이드 + 준비물 체크리스트 */
"use strict";

/* 다녀온 사람들 후기 링크 */
const REINVENT_REVIEWS = [
  { title: "NDS 초보자 세션 공략집", desc: "세션 예약 순서·타입별 실전 후기", url: "https://tech.cloud.nongshim.co.kr/blog/aws/3537/" },
  { title: "SpoonLabs 현장 후기", desc: "핸즈온 주의사항·식사·꿀팁", url: "https://medium.com/spoontech/2025-aws-re-invent-ai-%EB%8C%80%EA%B2%A9%EB%8F%99-%EC%8B%9C%EB%8C%80-2496cd24ed0d" },
  { title: "re:Invent 2025 뽕뽑기 후기", desc: "호텔·물가·맛집 팁", url: "https://medium.com/@hjinblog/aws-reinvent-2025-%EC%9D%B4%EB%A0%87%EA%B9%8C%EC%A7%80-%EB%BD%95%EC%9D%84-%EB%BD%91%EC%9D%84-%EC%A4%84%EC%9D%80-d8da6519f153" },
  { title: "re:Invent 생존 가이드 (영문)", desc: "준비물 체크리스트·서바이벌 팁", url: "https://jimmydqv.com/how-to-reinvent-ep-4-packing-and-survival/" },
  { title: "re:Invent Queens 가이드 (영문)", desc: "다회 참석자들의 실전 팁 모음", url: "https://suzanamelo.com/articles/reinvent-queens-guide/" }
];

/* 출처 줄: 공식/비공식과 확인일을 함께 (가이드 본문 맨 아래) */
function srcLineHTML(urls, checked, label) {
  const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return u; } };
  return `<p class="muted src-line">${label ? esc(label) + " · " : ""}출처: ${(urls || []).map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(host(u))}</a>`).join(", ")}${checked ? ` · ${esc(checked)} 확인` : ""}</p>`;
}
/* 세션 데이터의 하루 운영 시간 (수유실·식사 등 날마다 열리는 항목) → [[날짜, "07:00–09:00"]] */
function dailyHours(codePrefix) {
  return allSessions().filter((s) => String(s.session_id).startsWith(codePrefix) && s.date)
    .sort((a, b) => (a.date > b.date ? 1 : -1)).map((s) => [s.date, `${s.start_time}–${s.end_time}`]);
}
/* [[날짜, 시간]] → "11.30(월)–12.3(목) 08:00–17:30 · 12.4(금) 08:00–12:30" (같은 시간이 이어지는 날을 묶음) */
function hoursText(rows) {
  const groups = [];
  rows.forEach(([d, t]) => { const g = groups[groups.length - 1]; if (g && g.t === t) g.to = d; else groups.push({ from: d, to: d, t }); });
  return groups.map((g) => `${dayLabel(g.from)}${g.to !== g.from ? "–" + dayLabel(g.to) : ""} ${g.t}`).join(" · ");
}

/* 준비 세그먼트의 직접 만든 안내: 세션 고르는 법 · 시차 적응 · AWS Events 앱 · 한국 참가자 */
const PrepGuide = {
  OFFICIAL: {
    learn: "https://aws.amazon.com/events/reinvent/sessions/how-youll-learn/",
    faq: "https://aws.amazon.com/events/reinvent/faqs/",
    know: "https://aws.amazon.com/events/reinvent/know-before-you-go/",
    app: "https://aws.amazon.com/events/reinvent/mobile-app/"
  },
  /* 유형 순서: 공식 '배우는 방법' 4묶음 (보기 · 전문가와 함께 · 직접 만들기 · 자격증) */
  GROUPS: [
    ["🎤 보고 배우기", ["breakout", "lightning-talk"]],
    ["🗣️ 전문가와 함께", ["chalk-talk", "code-talk", "builders-session"]],
    ["💻 직접 만들기", ["workshop", "hands-on-lab", "game-day"]],
    ["📝 자격증 준비", ["exam-prep", "bootcamp"]]
  ],
  chooseHTML() {
    const all = allSessions();
    const count = (k, v) => all.filter((s) => s[k] === v).length;
    const median = (t) => {
      const m = all.filter((s) => s.session_type === t).map((s) => Planner.toMin(s.end_time) - Planner.toMin(s.start_time)).filter((x) => x > 0).sort((a, b) => a - b);
      return m.length ? m[Math.floor(m.length / 2)] : 0;
    };
    const ONDEMAND = new Set(["keynote", "breakout"]); // 공식 FAQ: 키노트·브레이크아웃은 행사 후 다시 보기 제공
    const row = (t) => `<div class="cg-row">
        <div class="cg-main"><b>${esc(typeKo(t))}</b> <span class="muted">${count("session_type", t)}개 · 보통 ${median(t)}분</span>
          <span class="cg-tip">${esc(TYPE_TIP[t] || "")}</span>
          <span class="cg-tags"><span class="badge${needsReservation({ session_type: t }) ? " warn" : ""}">${needsReservation({ session_type: t }) ? "예약석" : "자유 입장"}</span>
          <span class="badge${ONDEMAND.has(t) ? " ok" : ""}">${ONDEMAND.has(t) ? "다시 보기 있음" : "현장에서만"}</span></span></div>
        <button class="btn ghost small" type="button" data-goto-type="${esc(t)}">보기</button>
      </div>`;
    const lv = (l, ko) => `<div class="kv"><span>${l} · ${ko}</span><b>${count("level", l)}개</b></div>`;
    return `<p>세션이 ${all.length.toLocaleString("ko-KR")}개예요. 다 볼 수 없으니 <b>현장에서만 얻을 수 있는 것</b>부터 고르세요.</p>
      <h4>원칙</h4>
      <ul>
        <li><b>키노트 → 관련 세션:</b> 키노트에서 새 서비스를 듣고, 같은 주제의 브레이크아웃·초크토크·워크숍으로 이어 가세요.</li>
        <li><b>브레이크아웃·키노트는 나중에 영상·발표 자료로</b> 볼 수 있어요. 시간이 겹치면 초크토크·워크숍·빌더 세션을 현장에서 들으세요.</li>
        <li><b>레벨은 직무가 아니라 그 주제의 경험</b>으로 고르세요.</li>
        <li><b>하루의 3/4만 채우세요.</b> 베뉴를 옮기면 30–45분이 들고, 복도·부스 대화 시간도 필요해요.</li>
        <li><b>팀으로 가면 나눠 들으세요.</b> 같은 시간대 세션을 나눠 듣고 노트를 모으면 더 많이 가져와요.</li>
      </ul>
      <h4>유형별 특징 <span class="muted" style="font-weight:400;">('보기'를 누르면 그 유형만 보여요)</span></h4>
      ${this.GROUPS.map(([g, types]) => `<div class="cg-group">${g}</div>${types.map(row).join("")}`).join("")}
      <h4>레벨</h4>
      ${lv("100", "입문")}${lv("200", "중급")}${lv("300", "고급")}${lv("400", "전문가")}${lv("500", "최고 전문가")}
      ${srcLineHTML([this.OFFICIAL.learn, this.OFFICIAL.faq, this.OFFICIAL.know], "2026-10-30", "공식")}`;
  },

  /* "2026-11-29 19:00" + 시간대(+9 한국, -8 라스베가스 PST) → UTC 밀리초 */
  utc(str, offsetH) {
    const m = String(str || "").match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})/);
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - offsetH, +m[5]) : null;
  },
  hm(ms, offsetH) { const d = new Date(ms + offsetH * 3600000); return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`; },
  /* 기내에서 라스베가스 밤(22–06시)에 해당하는 가장 긴 구간 */
  flightSleep(depMs, arrMs) {
    let best = null, cur = null;
    for (let t = depMs; t < arrMs; t += 15 * 60000) {
      const h = new Date(t - 8 * 3600000).getUTCHours();
      if (h >= 22 || h < 6) { cur = cur || { s: t }; cur.e = t + 15 * 60000; if (!best || cur.e - cur.s > best.e - best.s) best = { ...cur }; }
      else cur = null;
    }
    return best;
  },
  jetlagHTML() {
    const f = S().trip.flights.outbound;
    const dep = this.utc(f.dep_time, 9), arr = this.utc(f.arr_time, -8);
    const night = dep && arr && arr > dep ? this.flightSleep(dep, arr) : null;
    const kn = keynoteSessions().map((s) => {
      const k = this.utc(`${s.date} ${s.start_time}`, -8);
      const kh = k == null ? null : new Date(k + 9 * 3600000).getUTCHours();
      return kh != null && kh < 7 ? `<li><b>${esc(s.title)}</b> ${esc(dayLabel(s.date))} ${esc(s.start_time)} = 한국 새벽 ${kh}시 — 몸이 가장 졸린 시간이에요. 커피를 마시고 일찍 가서 앞자리에 앉으세요.</li>` : "";
    }).join("");
    return `<ul>
        <li>미국 서머타임은 <b>2026-11-01에 끝나요</b> → 12월 라스베가스는 PST (UTC-8)</li>
        <li>한국(UTC+9)보다 <b>17시간 늦어요</b>. 라스베가스 오전 9시 = 한국 다음 날 새벽 2시</li>
        <li>몸 시계를 <b>7시간 앞당기는</b> 것과 같아요 (동쪽으로 7시간대를 가는 셈)</li>
      </ul>
      <h4>출발 전 (3일)</h4>
      <ul><li>하루에 1시간씩 <b>일찍 자고 일찍 일어나기</b> — 3시간만 당겨도 첫날이 훨씬 편해요</li>
        <li>출발 전날은 밤을 새우지 말고 평소처럼 자기</li></ul>
      <h4>기내</h4>
      ${!f.dep_time || !f.arr_time ? `<p class="muted">가는 편 출발·도착 시각을 넣으면 기내에서 잘 시간을 계산해 드려요. <button class="link-btn" type="button" data-edit-trip>출장 정보 입력 ›</button></p>`
        : night ? `<p>라스베가스 밤에 해당하는 <b>한국 ${this.hm(night.s, 9)}–${this.hm(night.e, 9)}</b> (라스베가스 ${this.hm(night.s, -8)}–${this.hm(night.e, -8)})에 자고, 나머지는 깨어 있으세요.</p>`
        : `<p>비행 시간이 라스베가스 낮이에요. 기내에서는 짧게만 자고, 도착한 날 밤에 푹 자세요.</p>`}
      <ul><li>타자마자 시계를 라스베가스 시간으로 바꾸기 · 물 자주 마시기 · 술은 줄이기</li></ul>
      <h4>도착한 날</h4>
      <ul>${f.arr_time ? `<li>도착 ${esc(f.arr_time)} (현지)</li>` : ""}
        <li>현지 <b>밤 10시 전에는 자지 않기</b>. 낮잠은 20–30분만</li>
        <li>오전 늦게부터 낮까지 햇빛을 쬐고 걷기 — 몸 시계가 빨리 맞춰져요</li>
        <li>일요일에 배지를 받아 두면 월요일 아침이 여유로워요</li></ul>
      ${kn ? `<h4>키노트 주의</h4><ul>${kn}</ul>` : ""}
      <h4>귀국 후</h4>
      <ul><li>한국 아침 햇빛을 쬐고, 첫 2–3일은 낮잠을 짧게</li></ul>
      <p class="muted" style="font-size:12px;">일반적인 수면 습관 안내예요. 건강 상태에 따라 다를 수 있어요.</p>`;
  },
  appsHTML() {
    const rows = [["좌석 예약·취소", "✅", "코드 복사로 연결"], ["실내 지도·길 안내", "✅", "—"], ["셔틀 실시간 시간", "✅", "요일별 운행 시간"],
      ["일정 변경 알림", "✅", "—"], ["AI 어시스턴트 질문", "✅", "—"], ["한국어 요약·추천", "—", "✅"],
      ["베뉴 이동 시간·동선", "—", "✅"], ["동료 일정 겹쳐 보기", "—", "✅"], ["영수증·정산", "—", "✅"],
      ["노트·출장 보고서", "—", "✅"], ["인터넷 없이 보기", "일부", "✅"]];
    return `<p>공식 <b>AWS Events 앱</b>과 이 앱은 역할이 달라요. 둘 다 설치해 두세요.</p>
      <div class="kv app-cmp head"><span>할 일</span><b>AWS Events</b><b>이 앱</b></div>
      ${rows.map(([a, b, c]) => `<div class="kv app-cmp"><span>${a}</span><b>${b}</b><b>${c}</b></div>`).join("")}
      <h4>같이 쓰는 법</h4>
      <ul><li>이 앱에서 세션을 고르고 → 예약할 세션의 코드를 복사해 → AWS Events 앱 검색에 붙여넣어 예약</li>
        <li>예약하면 이 앱에서 '예약됨'으로 표시 (내 일정 › 🎟️ 예약)</li>
        <li>현장에서는 AWS Events 앱으로 방·셔틀을 찾고, 이 앱으로 다음 일정과 출발 시각을 확인</li></ul>
      ${srcLineHTML([this.OFFICIAL.app, this.OFFICIAL.faq], "2026-10-30", "공식")}`;
  },
  koreanHTML() {
    const ko = (window.APP_DATA.event_info || {}).korean || {}, k = keynoteInfo();
    return `<h4>키노트 한국어 통역</h4>
      <p>${esc(k.korean_interpretation_note || "키노트는 한국어 실시간 통역을 제공해요 (공식).")}</p>
      <h4>한국 고객 행사 <span class="badge warn">2026 미확인</span></h4>
      <p>${esc(ko.history || "")}</p>
      <p>${esc(ko.note || "")}</p>
      ${(ko.links || []).map((l) => `<a class="btn ghost block left info-btn" href="${esc(l.url)}" target="_blank" rel="noopener">🔗 ${esc(l.title)}</a>`).join("")}
      ${srcLineHTML([PrepGuide.OFFICIAL.faq], ko.checked, "통역: 공식 · 행사: 예년 참가 후기")}`;
  }
};

/* 현지 생활 가이드 (응급·행사 규칙·편의점) — 행사 데이터(event_info)가 있으면 그 값을 사용 */
const LocalGuide = {
  emergencyHTML() {
    return `<h4>긴급 전화</h4>
      <ul>
        <li><a href="tel:911"><strong>911</strong></a> — 경찰·소방·구급 (무료, 잠금 화면에서도 걸 수 있어요)</li>
        <li><a href="tel:+82232100404"><strong>영사콜센터 +82-2-3210-0404</strong></a> — 24시간 (여권 분실·사건사고 상담)</li>
        <li><strong>주로스앤젤레스 총영사관</strong> — 라스베가스(네바다주) 관할. 대표 <a href="tel:+12133859300">+1-213-385-9300</a> (근무시간) · <a href="https://overseas.mofa.go.kr/us-losangeles-ko/index.do" target="_blank" rel="noopener">공식 홈페이지</a></li>
      </ul>
      <p class="muted">전화번호는 출발 전 공식 홈페이지에서 한 번 더 확인하세요.</p>
      <h4>여권을 잃어버렸다면</h4>
      <ul>
        <li>가까운 경찰서에서 분실 신고(Police Report)를 받아 두기</li>
        <li>총영사관에 연락해 여행증명서·긴급여권 발급 절차 문의</li>
        <li>여권 사진면·ESTA 승인 화면을 휴대폰에 미리 저장해 두면 훨씬 빨라요</li>
      </ul>
      <h4>아프거나 다쳤다면</h4>
      <ul>
        <li>미국 응급실(ER)은 매우 비싸요 — 가벼운 증상은 <strong>Urgent Care</strong>(동네 진료소)</li>
        <li>여행자 보험 증서·보험사 긴급 연락처를 휴대폰에 저장</li>
        <li>사막 기후라 아주 건조해요 — 물 자주 마시기, 립밤·인공눈물·보습제</li>
      </ul>
      <h4>안전 팁</h4>
      <ul>
        <li>스트립은 밤에도 붐비지만, 늦은 시간 인적 드문 길·외곽은 피하기</li>
        <li>노트북 가방은 몸에서 떼지 않기 (의자 뒤에 걸어 두지 않기)</li>
        <li>카지노 게임 테이블 주변 촬영은 제지될 수 있어요</li>
      </ul>`;
  },
  eventHTML() {
    const e = window.APP_DATA.event_info || {};
    const rs = e.reserved_seating || {}, bp = e.badge_pickup || {}, rp = e.replay || {};
    const li = (a) => (a || []).map((x) => `<li>${esc(x)}</li>`).join("");
    return `<h4>배지</h4>
      <ul>
        <li>배지가 있어야 세션·셔틀·식사·Expo에 들어갈 수 있어요 — 항상 목에 걸고 다니기</li>
        ${bp.weekdays ? `<li>평일 배지 수령: ${esc(bp.weekdays)}</li>` : ""}
        <li>잃어버렸다면 신분증을 들고 등록 데스크(Registration)에 재발급 문의</li>
      </ul>
      <h4>예약석 규칙</h4>
      <ul>${li(rs.rules)}</ul>
      ${rs.eligible_types ? `<p class="muted">예약 대상: ${esc(rs.eligible_types.join(", "))}${rs.no_reservation_needed ? `<br>예약 없이 입장: ${esc(rs.no_reservation_needed.join(", "))}` : ""}</p>` : ""}
      <h4>예약 없이 들어가기 (Walk-up)</h4>
      <ul>
        <li>인기 세션은 시작 20–30분 전 입구의 Walk-up 줄에 서세요</li>
        <li>예약자가 시작 10분 전까지 오지 않으면 그 자리가 줄 순서대로 열려요</li>
        <li>만석이면 같은 세션의 다른 회차(코드 끝 -R1, -R2…)를 찾아보세요 — 세션 상세에 '다른 회차'로 나와요</li>
        <li>키노트와 강의식 브레이크아웃은 예약 없이 들어갈 수 있어요</li>
      </ul>
      ${rp.date ? `<h4>re:Play</h4>
      <p>${esc(dayLabel(rp.date))} ${esc(rp.time || "")} · ${esc(rp.venue || "")}</p>
      <p>${esc(rp.note || "")}</p>
      ${(e.shuttle || {}).replay_shuttle ? `<p>🚌 re:Play 전용 셔틀: ${esc(e.shuttle.replay_shuttle)} · 타는 곳은 AWS Events 앱 확인</p>` : ""}` : ""}`;
  },
  storesHTML() {
    return `<h4>편의점·약국</h4>
      <ul>
        <li><strong>CVS · Walgreens</strong> — 약국 겸 편의점. 스트립 곳곳에 있고 24시간 매장도 많아요</li>
        <li><strong>ABC Stores</strong> — 생수·간식·기념품</li>
        <li>생수·음료는 호텔 로비 상점·미니바보다 편의점이 훨씬 저렴해요</li>
        <li>객실 미니바·냉장고 위 물건은 들기만 해도 요금이 붙는 센서식인 곳이 있어요</li>
      </ul>
      <h4>약국에서 살 수 있는 상비약 (처방전 없이)</h4>
      <ul>
        <li>해열·진통: Tylenol (acetaminophen)</li>
        <li>소염·진통: Advil (ibuprofen)</li>
        <li>소화·속쓰림: Pepto-Bismol, Tums</li>
        <li>감기: DayQuil(낮) / NyQuil(밤, 졸림)</li>
        <li>알레르기·비염: Claritin, Zyrtec</li>
      </ul>
      <p class="muted">복용 중인 처방약은 현지에서 살 수 없으니 한국에서 넉넉히 챙겨 가세요. 약은 포장 성분을 꼭 확인하세요.</p>`;
  },
  mapsQuery(q) { return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q); },
  returnHTML() {
    return `<h4>호텔 체크아웃</h4>
      <ul>
        <li>체크아웃은 보통 오전 11시 — 짐은 벨 데스크(Bell Desk)에 맡기고 마지막 날 세션에 가세요 (짐표는 사진으로)</li>
        <li>청구서의 리조트피·미니바·추가 요금 확인 → 영수증은 정산 탭에 사진으로 남기기</li>
        <li>금요일(12/4) 세션은 낮 12:30 무렵 끝나요 — 항공편 시간과 맞춰 보세요</li>
      </ul>
      <h4>공항 (Harry Reid, LAS)</h4>
      <ul>
        <li>국제선은 출발 <b>3시간 전</b> 도착 권장 — 스트립에서 차로 15–20분이지만 체크아웃 시간대엔 더 걸려요</li>
        <li>한국행 직항은 보통 Terminal 3 — 항공권의 터미널을 확인하세요</li>
        <li>보조배터리는 위탁 수하물에 넣을 수 없고 기내 반입만 돼요. 국내 항공사는 기내 사용 금지·단자 절연(테이프·비닐) 규정이 있으니 항공사 안내를 확인하세요</li>
        <li>노트북·태블릿은 기내 반입 — 보안 검색에서 꺼내 달라고 할 수 있어요</li>
      </ul>
      <h4>한국 입국·면세</h4>
      <ul>
        <li>여행자 휴대품 면세 한도는 1인 <b>미화 800달러</b> (술·담배·향수는 별도)</li>
        <li>별도 면세: 술 2병(합계 2L·미화 400달러 이하), 담배 200개비, 향수 100ml</li>
        <li>한도를 넘으면 자진신고하세요 — 신고하면 세금이 감면되고, 안 하면 가산세가 붙어요</li>
        <li>미국은 여행자 부가세 환급(Tax Refund)이 없어요</li>
      </ul>
      <p class="muted">면세 기준은 바뀔 수 있어요 — 출발 전 관세청 '여행자 휴대품 통관' 안내에서 최신 기준을 확인하세요.</p>`;
  },
  mealsHTML() {
    const ml = (window.APP_DATA.event_info || {}).meals || {};
    const venues = (window.APP_DATA.event_info.venues || []);
    const bf = new Map(dailyHours("SVC001")), lu = new Map(dailyHours("SVC002"));
    const days = [...new Set([...bf.keys(), ...lu.keys()])].sort();
    return `<h4>행사장 식사</h4>
      <p>${esc(ml.note || "컨퍼런스 기간 베뉴별 식사 제공")}</p>
      ${days.length ? `<div class="kv meal-row head"><span>날짜</span><b>🥐 조식</b><b>🍱 중식</b></div>
      ${days.map((d) => `<div class="kv meal-row"><span>${esc(dayLabel(d))}</span><b>${esc(bf.get(d) || "없음")}</b><b>${esc(lu.get(d) || "없음")}</b></div>`).join("")}
      <p class="muted" style="font-size:12px;">여러 베뉴에서 제공돼요. 식사 장소는 AWS Events 앱 지도에서 확인하세요.</p>` : ""}
      <ul>
        ${ml.allergen_labels ? `<li>🏷️ ${esc(ml.allergen_labels)}</li>` : ""}
        ${ml.halal_kosher ? `<li>🥩 ${esc(ml.halal_kosher)} <a href="mailto:awsreinvent-support@amazon.com?subject=Halal%2FKosher%20meal%20request">메일 쓰기</a></li>` : ""}
        ${ml.evening_food ? `<li>🌙 ${esc(ml.evening_food)}</li>` : ""}
        <li>⏰ 붐비는 시간을 피해 문 열자마자 먹고, 가방에 간식을 넣어 두세요</li>
      </ul>
      <p class="muted">내 일정 → 동선에서 점심 시간대 빈 시간과 근처 식당을 알려 줘요.</p>
      <h4>베뉴 주변 식당 (지도에서 바로)</h4>
      <div class="route-info" style="margin:6px 0 0;padding:0;border:0;">
        ${venues.map((v) => `<a class="btn ghost small" target="_blank" rel="noopener" href="${this.mapsQuery("restaurants near " + v.name + " Las Vegas")}">🍽️ ${esc(shortVenue(v.name))}</a>`).join("")}
      </div>
      <h4>한식이 그리울 때</h4>
      <ul>
        <li>스트립 서쪽 <b>차이나타운(Spring Mountain Rd)</b>에 한식당·아시안 마트가 모여 있어요 — 스트립에서 택시·Uber 10–15분.
          <a href="${this.mapsQuery("Korean restaurant Spring Mountain Rd Las Vegas")}" target="_blank" rel="noopener">지도에서 보기</a></li>
      </ul>
      <h4>빨리 먹기·늦은 시간</h4>
      <ul>
        <li>호텔 쇼핑몰(Grand Canal Shoppes, Forum Shops 등)의 푸드코트·카페</li>
        <li>Caesars Forum 근처 The LINQ Promenade에 캐주얼 식당이 많아요</li>
        <li>카지노 호텔마다 24시간 카페·델리가 있어 이른 아침·늦은 밤에 유용해요</li>
        <li>거래처 저녁은 일찍 예약하세요 — 행사 주에는 베뉴 근처 식당이 빨리 차요</li>
      </ul>
      <p class="muted">영업시간·운영 여부는 지도에서 확인하세요. 팁은 '💵 팁 계산기'로 계산할 수 있어요.</p>
      ${srcLineHTML(ml.source_urls, ml.checked, "공식")}`;
  },
  /* 행사장 편의시설: 공식 FAQ·접근성·아젠다 + 세션 데이터의 날짜별 운영 시간 */
  onsiteHTML() {
    const o = (window.APP_DATA.event_info || {}).onsite || {};
    const li = (a) => (a || []).map((x) => `<li>${esc(x)}</li>`).join("");
    const hrs = (code) => { const r = dailyHours(code); return r.length ? hoursText(r) : ""; };
    const desk = allSessions().filter((s) => /^ACT012/.test(s.session_id) && s.date).sort((a, b) => (a.date > b.date ? 1 : -1));
    return `<h4>헬프 데스크</h4>
      <ul>${li(o.help_desk)}
        ${desk.length ? `<li>참석자 경험 데스크: ${esc(roomLabel(desk[0]) || desk[0].venue)} — ${esc(hoursText(desk.map((s) => [s.date, `${s.start_time}–${s.end_time}`])))}</li>` : ""}</ul>
      <h4>쉬는 곳</h4>
      <ul>${(o.rooms || []).map((r) => `<li><b>${esc(r.name)}</b> — ${esc(r.desc)}</li>`).join("")}
        ${hrs("SVC004") ? `<li>수유실·리플렉션 룸 운영: ${esc(hrs("SVC004"))} · 위치는 AWS Events 앱 지도</li>` : ""}
        ${o.content_hub ? `<li><b>Content Hub</b> — ${esc(o.content_hub)}</li>` : ""}
        ${o.certification ? `<li><b>자격증 라운지</b> — ${esc(o.certification)}</li>` : ""}</ul>
      <h4>접근성·통역</h4>
      <ul>${li(o.accessibility)}</ul>
      ${o.sensory ? `<p class="muted">🔊 ${esc(o.sensory)}</p>` : ""}
      ${(o.not_announced || []).length ? `<div class="notice">아직 공식 안내가 없어요: ${esc(o.not_announced.join(", "))}. 현장 헬프 데스크나 AWS Events 앱의 AI 어시스턴트에 물어보세요.</div>` : ""}
      ${srcLineHTML(o.source_urls, o.checked, "공식")}`;
  },
  /* 베뉴 안 길찾기: 세션 방 이름에서 층을 모아 보여 줌 + 공식·참가자 팁 */
  wayfindHTML() {
    const floors = {};
    allSessions().forEach((s) => {
      const f = floorKo(s.room) || (/Emperors Level/i.test(s.room || "") ? "Emperors Level" : "");
      if (!s.venue || !f) return;
      const v = shortVenue(s.venue);
      floors[v] = floors[v] || {};
      floors[v][f] = (floors[v][f] || 0) + 1;
    });
    return `<ul>
        <li>베뉴를 옮길 때는 <b>30–45분</b>을 잡으세요. 같은 호텔 안에서도 10–15분 걸려요 (공식 안내)</li>
        <li>방 찾기는 AWS Events 앱의 <b>실내 지도·길 안내</b>와 현장 표지판을 따르세요</li>
        <li>세션 상세에 <span class="badge info">2층</span>처럼 층이 먼저 나와요. 엘리베이터·에스컬레이터부터 찾으세요</li>
      </ul>
      <h4>베뉴별 세션 층 <span class="muted" style="font-weight:400;">(세션 수)</span></h4>
      ${Object.keys(floors).sort().map((v) => `<div class="kv"><span>${esc(v)}</span><b>${Object.entries(floors[v]).sort((a, b) => b[1] - a[1]).map(([f, n]) => `${esc(f)} ${n}`).join(" · ")}</b></div>`).join("")}
      <h4>참가자 팁 <span class="badge">비공식</span></h4>
      <ul>
        <li>윈과 앙코르는 건물 안으로 이어져 있어요</li>
        <li>호텔 안 길은 카지노를 지나는 경우가 많아요. 네바다는 카지노 안 흡연이 허용돼요 — 연기가 싫으면 쇼핑몰 쪽 길로 돌아가세요</li>
        <li>Uber·Lyft 타는 곳은 주차장 안쪽에 있어요 (MGM 그랜드: 셀프 주차장 1층, 베니션: 주차장 2층). 못 찾으면 직원에게 "rideshare pickup"을 물어보세요</li>
        <li>세션이 끝나는 시각엔 셔틀 줄이 길어요. 15–20분 일찍 가세요</li>
      </ul>
      ${srcLineHTML([PrepGuide.OFFICIAL.know, "https://www.fractivo.com/reinvent"], "2026-10-30", "공식 + 참가자 가이드")}`;
  },
  healthHTML() {
    return `<h4>매일</h4>
      <ul>
        <li><b>물병을 들고 다니며 자주 채우기</b> — 사막이라 아주 건조해요. 립밤·로션·인공눈물도 (공식 준비물)</li>
        <li><b>길든 신발 두 켤레</b>를 번갈아 신기. 새 신발은 두고 오세요 (공식 준비물)</li>
        <li>회의실은 추워요 — 얇은 겉옷을 가방에</li>
        <li>간식 챙기기 — 세션·이동이 식사 시간을 넘기기 쉬워요 (공식 준비물)</li>
        <li>점심은 문 열자마자 — 붐비는 시간엔 줄이 길어요</li>
      </ul>
      <h4>지치지 않게</h4>
      <ul>
        <li>오후에 한 번은 쉬기. 쉬는 곳은 '🧩 행사장 편의시설'에</li>
        <li>Expo·키노트는 시끄러워요 — 귀마개는 리플렉션 룸에서 받을 수 있어요</li>
        <li>손 소독제 — 사람이 많은 행사라 감기가 잘 돌아요</li>
        <li>대화가 많은 날은 목캔디·진통제를 가방에</li>
      </ul>
      <p class="muted" style="font-size:12px;">아플 때는 '🆘 응급·안전'을 보세요.</p>
      ${srcLineHTML([PrepGuide.OFFICIAL.know, "https://jimmydqv.com/how-to-reinvent-ep-4-packing-and-survival/"], "2026-10-30", "공식 + 참가자 후기")}`;
  },
  /* 저녁 시간: 세션 데이터의 공식 저녁 행사(16시 이후 체험·리셉션) + re:Play + 스트립 볼거리 */
  eveningHTML() {
    const rp = (window.APP_DATA.event_info || {}).replay || {};
    const evs = allSessions().filter((s) => s.date && s.start_time >= "16:00" && ["featured-experience", "expo"].includes(s.session_type))
      .sort((a, b) => (a.date + a.start_time > b.date + b.start_time ? 1 : -1));
    return `<h4>공식 저녁 행사</h4>
      ${evs.map((s) => `<div class="sg-row" data-open-session="${esc(s.session_id)}" role="button" tabindex="0"><div class="sg-main"><b>${esc(s.title)}</b>
        <span class="muted">${esc(dayLabel(s.date))} ${esc(s.start_time)}–${esc(s.end_time)} · ${esc(roomLabel(s) || s.room || s.venue)}</span></div></div>`).join("")}
      ${rp.date ? `<div class="sg-row"><div class="sg-main"><b>🎉 re:Play</b><span class="muted">${esc(dayLabel(rp.date))} ${esc(rp.time || "")} · ${esc(rp.venue || "")}</span></div></div>` : ""}
      <p class="muted" style="font-size:12px;">누르면 세션 상세가 열려요. 담으면 내 일정에 들어가요. 한국 고객 행사는 '준비 › 🇰🇷 한국 참가자 지원'을 보세요.</p>
      <h4>스트립 무료 볼거리</h4>
      <ul>
        <li><b>벨라지오 분수 쇼</b> — 저녁마다 15–30분 간격. <a href="${this.mapsQuery("Fountains of Bellagio")}" target="_blank" rel="noopener">지도</a></li>
        <li><b>벨라지오 식물원</b> — 계절 장식. 24시간 <a href="${this.mapsQuery("Bellagio Conservatory")}" target="_blank" rel="noopener">지도</a></li>
        <li><b>베니션 운하 산책</b> — 행사장 안이라 세션 사이에 들르기 좋아요</li>
        <li><b>프리몬트 스트리트</b> — 다운타운 천장 빛 쇼. 택시 15–20분 <a href="${this.mapsQuery("Fremont Street Experience")}" target="_blank" rel="noopener">지도</a></li>
      </ul>
      <p class="muted" style="font-size:12px;">운영 시간은 지도에서 확인하세요. 다음 날 아침 세션을 생각해 늦지 않게 돌아오세요.</p>`;
  },
  /* 팁 계산기 (영수증 금액 → 18/20/22%) */
  openTips() {
    openSheet({
      title: "💵 팁 계산기",
      body: `
        <label class="field" for="tip-amt">계산서 금액 (USD, 세금 포함)</label>
        <input type="number" id="tip-amt" inputmode="decimal" min="0" step="0.01" placeholder="예: 64.50">
        <div class="row" style="align-items:center;">
          <div><label class="field" for="tip-n">나눌 인원</label><input type="number" id="tip-n" inputmode="numeric" min="1" value="1"></div>
          <div class="muted" style="font-size:12px;justify-content:center;">계산서에 <b>Gratuity / Service charge</b>가 이미 있으면 팁을 더 내지 않아도 돼요</div>
        </div>
        <div id="tip-out" class="tip-out"></div>
        <h3 style="margin:16px 0 6px;">상황별 팁 기준</h3>
        <div class="kv"><span>식당 (테이블 서비스)</span><b>18–22%</b></div>
        <div class="kv"><span>바·음료</span><b>$1–2 / 잔</b></div>
        <div class="kv"><span>택시·Uber·Lyft</span><b>15–20%</b></div>
        <div class="kv"><span>호텔 벨맨 (짐)</span><b>$2–5 / 개</b></div>
        <div class="kv"><span>하우스키핑</span><b>$3–5 / 1박</b></div>
        <div class="kv"><span>발렛 파킹</span><b>$3–5</b></div>
        <p class="muted" style="font-size:12px;">일반적인 미국 기준이에요. 카운터에서 주문하는 곳의 팁은 선택이에요.</p>`,
      actions: `<button class="btn" id="tip-close">닫기</button>`
    });
    const out = $("#tip-out"), amt = $("#tip-amt"), n = $("#tip-n");
    const fx = S().fx_rate || 0;
    const paint = () => {
      const a = +amt.value || 0, k = Math.max(1, Math.round(+n.value || 1));
      out.innerHTML = [18, 20, 22].map((p) => {
        const tip = a * p / 100, total = a + tip;
        return `<div class="tip-row"><span class="tip-p">${p}%</span>
          <span>팁 <b>$${tip.toFixed(2)}</b></span>
          <span>합계 <b>$${total.toFixed(2)}</b>${k > 1 ? `<br><small>1인 $${(total / k).toFixed(2)}</small>` : ""}${fx ? `<br><small>₩${Math.round(total / k * fx).toLocaleString("ko-KR")}${k > 1 ? "/인" : ""}</small>` : ""}</span></div>`;
      }).join("");
    };
    amt.addEventListener("input", paint); n.addEventListener("input", paint); paint();
    $("#tip-close").onclick = () => $("#modal-overlay")._dismiss();
  }
};

/* 가이드 탭: 준비 · 현지 · 귀국 세그먼트 (기본은 날짜 기준, 다른 화면에서 Guide.next로 한 번만 지정) */
const Guide = {
  seg: null,
  next: null,
  sel: {},          // 넓은 화면: 세그먼트마다 오른쪽 칸에 보이는 항목
  SEGS: [["prep", "준비"], ["local", "현지"], ["return", "귀국"]],
  defaultSeg() {
    const t = vegasDateStr();
    return t < "2026-11-29" ? "prep" : t <= "2026-12-03" ? "local" : "return";
  },
  resolve() {
    if (this.next) { this.seg = this.next; this.next = null; }
    else if (!this.seg) this.seg = this.defaultSeg();
    return this.seg;
  },
  /* 세그먼트의 안내 항목: html()은 드로어(넓은 화면에선 오른쪽 칸), run()은 시트 */
  items(seg) {
    if (seg === "prep") {
      return [
        { key: "choose", label: "🎯 세션 고르는 법", title: "🎯 세션 고르는 법", html: () => PrepGuide.chooseHTML() },
        { key: "jetlag", label: "🌙 시차 적응 계획", title: "🌙 시차 적응 계획", html: () => PrepGuide.jetlagHTML() },
        { key: "apps", label: "📱 AWS Events 앱과 같이 쓰기", title: "📱 AWS Events 앱과 같이 쓰기", html: () => PrepGuide.appsHTML() },
        { key: "korean", label: "🇰🇷 한국 참가자 지원", title: "🇰🇷 한국 참가자 지원", html: () => PrepGuide.koreanHTML() }
      ].concat((window.APP_DATA.prep_sections || []).filter((x) => !String(x.id).includes("공항"))
        .map((x) => ({ key: "sec:" + x.id, label: "📘 " + x.title, title: x.title, html: () => x.html })));
    }
    if (seg === "local") {
      return [
        { key: "venues", label: "🗺️ 베뉴·지도", title: "베뉴 6곳", html: () => RouteInfo.venuesHTML() },
        { key: "wayfind", label: "🧭 베뉴 안 길찾기", title: "🧭 베뉴 안 길찾기", html: () => LocalGuide.wayfindHTML() },
        { key: "shuttle", label: "🚌 셔틀", title: "베뉴 간 셔틀", html: () => RouteInfo.shuttleHTML() },
        { key: "strategy", label: "📌 이동 전략", title: "베뉴 이동 전략", html: () => RouteInfo.strategyHTML() },
        { key: "airport", label: "✈️ 공항 → 호텔", title: "공항 → 호텔 이동", html: () => RouteInfo.airportHTML() },
        { key: "event", label: "🎫 배지·예약석", title: "🎫 배지·예약석", html: () => LocalGuide.eventHTML() },
        { key: "onsite", label: "🧩 행사장 편의시설", title: "🧩 행사장 편의시설", html: () => LocalGuide.onsiteHTML() },
        { key: "meals", label: "🍽️ 식사·맛집", title: "🍽️ 식사·맛집", html: () => LocalGuide.mealsHTML() },
        { key: "tips", label: "💵 팁 계산기", title: "💵 팁 계산기", run: () => LocalGuide.openTips() },
        { key: "health", label: "💧 컨디션 관리", title: "💧 컨디션 관리", html: () => LocalGuide.healthHTML() },
        { key: "evening", label: "🌃 저녁 시간", title: "🌃 저녁 시간", html: () => LocalGuide.eveningHTML() },
        { key: "stores", label: "🛒 편의점·약국", title: "🛒 편의점·약국", html: () => LocalGuide.storesHTML() },
        { key: "emergency", label: "🆘 응급·안전", title: "🆘 응급·안전", html: () => LocalGuide.emergencyHTML() }
      ];
    }
    return [];
  },
  find(key) { for (const [v] of this.SEGS) { const it = this.items(v).find((x) => x.key === key); if (it) return it; } return null; },
  open(key) {
    const it = this.find(key);
    if (!it) return;
    if (it.run) { it.run(); return; }
    const pane = currentTab === "guide" && $("#gd-pane");
    if (pane) { this.sel[this.seg] = key; this.paintPane(); return; }
    openDrawer(it.title, it.html());
  },
  paneHTML(seg) {
    if (seg === "return") return `<h3>✈️ 귀국 준비</h3>${LocalGuide.returnHTML()}`;
    const list = this.items(seg).filter((x) => x.html);
    const it = list.find((x) => x.key === this.sel[seg]) || list[0];
    if (!it) return `<p class="split-empty">항목을 고르면 여기에 보여요</p>`;
    this.sel[seg] = it.key;
    return `<h3>${esc(it.title)}</h3>${it.html()}`;
  },
  paintPane() {
    const pane = $("#gd-pane");
    if (!pane) return;
    pane.innerHTML = `<div class="guide-article">${this.paneHTML(this.seg)}</div>`;
    pane.scrollTop = 0;
    // 가이드 본문의 링크는 새 창으로 (앱 화면을 벗어나지 않게)
    $$("#gd-pane a[href^='http']").forEach((a) => { a.target = "_blank"; a.rel = "noopener"; });
    $$("#view-guide [data-gi]").forEach((b) => b.classList.toggle("on", b.dataset.gi === this.sel[this.seg]));
  },
  itemsHTML(seg) {
    return this.items(seg).map((it) =>
      `<button class="btn ghost block left info-btn guide-item" data-gi="${esc(it.key)}">${esc(it.label)}</button>`).join("");
  }
};

Views.guide = function () {
  const el = $("#view-guide");
  const seg = Guide.resolve();
  const t = S().trip;
  const f = t.flights, h = t.hotel;
  const missing = (v) => !v ? `<span class="badge warn">미정</span>` : esc(v);
  const cl = Packing.list();
  const done = cl.filter((x) => x.done).length;
  const dd = dday();
  const dtasks = DepartTasks.all();
  const dDone = S().depart_done || {};
  const dtDoneCount = dtasks.filter((x) => dDone[x.id]).length;

  const inboundRows = `
      <h4 style="margin:8px 0 4px;font-size:14px;">오는 편 (LAS → ICN) ${missing(f.inbound.flight_no)}</h4>
      <div class="kv"><span>편명</span><b>${esc(f.inbound.flight_no) || "-"}</b></div>
      <div class="kv"><span>출발 → 도착</span><b>${f.inbound.dep_time ? esc(f.inbound.dep_time) + " → " + esc(f.inbound.arr_time) : "-"}</b></div>`;

  const tripCard = `
    <div class="card"><h3>✈️ 내 출장 정보</h3>
      <h4 style="margin:8px 0 4px;font-size:14px;">가는 편 (ICN → LAS) ${missing(f.outbound.flight_no)}</h4>
      <div class="kv"><span>편명</span><b>${esc(f.outbound.flight_no) || "-"}</b></div>
      <div class="kv"><span>출발 → 도착</span><b>${f.outbound.dep_time ? esc(f.outbound.dep_time) + " → " + esc(f.outbound.arr_time) : "-"}</b></div>
      ${inboundRows}
      <h4 style="margin:8px 0 4px;font-size:14px;">호텔 ${missing(h.name)}</h4>
      <div class="kv"><span>호텔명</span><b>${esc(h.name) || "-"}</b></div>
      <div class="kv"><span>체크인 → 아웃</span><b>${h.check_in ? esc(h.check_in) + " → " + esc(h.check_out) : "-"}</b></div>
      <div class="kv"><span>가까운 베뉴</span><b>${esc(h.near_venue) || "-"}</b></div>
      <button class="btn ghost block" id="prep-edit-trip">출장 정보 입력/수정</button>
    </div>`;

  const departCard = `
    <div class="card"><h3>🗓️ 출발 전 할 일 <span class="badge ${dd <= 7 ? "warn" : "info"}">${dd > 0 ? `D-${dd}` : dd === 0 ? "D-Day" : `D+${-dd}`}</span></h3>
      <div class="progress${dtDoneCount === dtasks.length ? " done" : ""}"><div style="width:${Math.round(dtDoneCount / dtasks.length * 100)}%"></div></div>
      <div class="muted" style="font-size:12px;margin-bottom:6px;">${dtDoneCount}/${dtasks.length} 완료</div>
      ${dtasks.map((x) => {
        const urgent = dd <= x.d;
        const isDone = !!dDone[x.id];
        return `<label class="check-item${isDone ? " done" : ""}">
          <input type="checkbox" data-dt="${x.id}" ${isDone ? "checked" : ""}>
          <span><span class="badge ${urgent && !isDone ? "warn" : ""}">D-${x.d}</span> ${esc(x.text)}</span>
        </label>`;
      }).join("")}
    </div>`;

  const packCard = `
    <div class="card"><h3>🎒 준비물 체크리스트</h3>
      <div class="progress${cl.length && done === cl.length ? " done" : ""}"><div style="width:${cl.length ? Math.round(done / cl.length * 100) : 0}%"></div></div>
      <div class="muted" style="font-size:12px;margin-bottom:6px;">${done}/${cl.length} 완료</div>
      ${cl.map((c) => `<div class="check-item${c.done ? " done" : ""}">
        <label class="grow"><input type="checkbox" data-ck="${c.id}" ${c.done ? "checked" : ""}><span>${esc(c.item)}</span></label>
        <span class="row-actions">
          <button class="icon-btn" data-ckedit="${c.id}" title="수정" aria-label="수정">✏️</button>
          <button class="icon-btn" data-ckdel="${c.id}" title="삭제" aria-label="삭제">🗑️</button>
        </span>
      </div>`).join("")}
      <button class="btn ghost block small" id="ck-add" style="margin-top:8px;">＋ 항목 추가</button>
    </div>`;

  const reviewCard = `
    <div class="card"><h3>✍️ 다녀온 사람들 후기</h3>
      <p class="muted" style="font-size:13px;">작년·재작년 참석자들의 실전 팁 모음이에요.</p>
      ${REINVENT_REVIEWS.map((r) => `
        <a class="btn ghost block left info-btn" href="${r.url}" target="_blank" rel="noopener">🔗 ${esc(r.title)}<br><span class="muted" style="font-size:12px;font-weight:400;">${esc(r.desc)}</span></a>`).join("")}
    </div>`;

  const segBar = `<div class="seg" id="gd-seg">${Guide.SEGS.map(([v, l]) =>
    `<button class="seg-btn${v === seg ? " on" : ""}" data-gseg="${v}">${l}</button>`).join("")}</div>`;

  const wide = Layout.wide();
  let body;
  if (seg === "prep") {
    body = (wide ? `<div class="card"><h3>📖 출장 가이드</h3>${Guide.itemsHTML("prep")}</div>` + tripCard + departCard + packCard
      : tripCard + departCard + packCard + `<div class="card"><h3>📖 출장 가이드</h3>${Guide.itemsHTML("prep")}</div>`) + reviewCard;
  } else if (seg === "local") {
    body = `<div class="card"><h3>🧭 현지 생활·이동</h3>${Guide.itemsHTML("local")}</div>`;
  } else {
    body = `<div class="card"><h3>✈️ 귀국편</h3>${inboundRows}
        <button class="btn ghost block" id="prep-edit-trip">출장 정보 입력/수정</button></div>` +
      (wide ? "" : `<div class="card guide-article"><h3>✈️ 귀국 준비</h3>${LocalGuide.returnHTML()}</div>`);
  }
  // 넓은 화면: 왼쪽 목록 · 오른쪽 안내 본문
  el.classList.toggle("is-split", wide);
  el.innerHTML = wide
    ? `<div class="split"><div class="split-list">${segBar + body}</div><aside class="split-detail" id="gd-pane" aria-label="안내"></aside></div>`
    : segBar + body;
  if (wide) Guide.paintPane();

  $$("#gd-seg [data-gseg]").forEach((b) => b.onclick = () => { Guide.seg = b.dataset.gseg; Views.guide(); });
  $$("#view-guide [data-gi]").forEach((b) => b.onclick = () => Guide.open(b.dataset.gi));
  $$("#view-guide [data-dt]").forEach((c) => c.onchange = () => DepartTasks.toggle(c.dataset.dt));
  $$("#view-guide [data-ck]").forEach((c) => c.onchange = () => {
    const item = Packing.list().find((x) => x.id === c.dataset.ck);
    if (item) { item.done = c.checked; Store.save(); Views.guide(); }
  });
  $$("#view-guide [data-ckedit]").forEach((b) => b.onclick = (e) => { e.stopPropagation(); Packing.editItem(b.dataset.ckedit); });
  $$("#view-guide [data-ckdel]").forEach((b) => b.onclick = (e) => { e.stopPropagation(); Packing.askDelete(b.dataset.ckdel); });
  const ckAdd = $("#ck-add");
  if (ckAdd) ckAdd.onclick = () => Packing.editItem(null);
  const et = $("#prep-edit-trip");
  if (et) et.onclick = Prep.editTrip;
};
/* 탭을 떠나면 다음 방문 때 날짜 기준 세그먼트로 */
Views.guide.onLeave = () => { Guide.seg = null; };

const Prep = {
  editTrip() {
    const t = S().trip, f = t.flights, h = t.hotel;
    const inp = (id, val, ph, type) => `<input type="${type || "text"}" id="${id}" value="${esc(val)}" placeholder="${ph}">`;
    openModal(`
      <h2>출장 정보 입력</h2>
      <h3>가는 편 (ICN → LAS)</h3>
      <div class="row"><div><label class="field">항공사</label>${inp("tr-ob-al", f.outbound.airline, "예: 대한항공")}</div>
      <div><label class="field">편명</label>${inp("tr-ob-no", f.outbound.flight_no, "예: KE005")}</div></div>
      <div class="row"><div><label class="field">출발 (현지시간)</label>${inp("tr-ob-dep", f.outbound.dep_time, "2026-11-29 19:00", "text")}</div>
      <div><label class="field">도착 (현지시간)</label>${inp("tr-ob-arr", f.outbound.arr_time, "2026-11-29 13:00", "text")}</div></div>
      <h3>오는 편 (LAS → ICN)</h3>
      <div class="row"><div><label class="field">항공사</label>${inp("tr-ib-al", f.inbound.airline, "예: 대한항공")}</div>
      <div><label class="field">편명</label>${inp("tr-ib-no", f.inbound.flight_no, "예: KE006")}</div></div>
      <div class="row"><div><label class="field">출발 (현지시간)</label>${inp("tr-ib-dep", f.inbound.dep_time, "2026-12-05 11:00", "text")}</div>
      <div><label class="field">도착 (현지시간)</label>${inp("tr-ib-arr", f.inbound.arr_time, "2026-12-06 16:00", "text")}</div></div>
      <h3>호텔</h3>
      <label class="field">호텔명</label>${inp("tr-ht-name", h.name, "예: The Venetian")}
      <label class="field" for="tr-ht-near">숙소에서 가까운 베뉴 <span class="muted">(아침·저녁 이동 계산용)</span></label>
      <select id="tr-ht-near">${[""].concat([...new Set(allSessions().map((s) => s.venue).filter(Boolean))].sort())
        .map((v) => `<option value="${esc(v)}"${(h.near_venue || "") === v ? " selected" : ""}>${v ? esc(v) : "선택 안 함"}</option>`).join("")}</select>
      <div class="row"><div><label class="field">체크인</label>${inp("tr-ht-in", h.check_in, "2026-11-29", "date")}</div>
      <div><label class="field">체크아웃</label>${inp("tr-ht-out", h.check_out, "2026-12-05", "date")}</div></div>
      <label class="field">주소</label>${inp("tr-ht-addr", h.address, "선택")}
      <button class="btn block" id="tr-save">저장</button>
      <button class="btn ghost block" id="tr-cancel">취소</button>`);
    $("#tr-save").onclick = () => {
      const g = (id) => $("#" + id).value.trim();
      f.outbound = { airline: g("tr-ob-al"), flight_no: g("tr-ob-no"), dep_time: g("tr-ob-dep"), arr_time: g("tr-ob-arr"), terminal: "" };
      f.inbound = { airline: g("tr-ib-al"), flight_no: g("tr-ib-no"), dep_time: g("tr-ib-dep"), arr_time: g("tr-ib-arr"), terminal: "" };
      t.hotel = { name: g("tr-ht-name"), check_in: g("tr-ht-in"), check_out: g("tr-ht-out"), address: g("tr-ht-addr"), near_venue: g("tr-ht-near") };
      Store.save(); closeModal(); Views.guide(); toast("출장 정보를 저장했어요");
    };
    $("#tr-cancel").onclick = closeModal;
  }
};

/* ---- route info (drawers) ---- */
const RouteInfo = {
  taxiZone: { "MGM Grand": "Zone 1 · $21.25", "Caesars Palace": "Zone 2 · $25.25", "Wynn": "Zone 3 · $29.25" },
  venuesHTML() {
    const venues = (window.APP_DATA.event_info.venues || []);
    return this.parisMapHTML() + `<p class="muted" style="font-size:13px;">베뉴 6곳 — 탭하면 Google Maps가 열립니다.</p>` + venues.map((v) => `
      <div class="kv"><span><strong>${esc(v.name)}</strong><br>
        <span class="muted" style="font-size:12px;">${esc(v.address || "")}${this.taxiZone[v.name] ? `<br>택시 ${esc(this.taxiZone[v.name])}` : ""}</span></span>
        <a class="btn ghost small map-btn" target="_blank" rel="noopener"
           href="https://www.google.com/maps/search/?api=1&query=${v.lat},${v.lng}">📍 지도</a>
      </div>`).join("") + this.walkTableHTML(venues);
  },
  /* 패리스 호텔 기준 베뉴 지도: 위치 관계만 나타낸 개략도. 시간은 앱 공식(Planner.travelBetween)에서 가져와 다른 화면과 같음 */
  parisMapHTML() {
    return `<div class="vmap-card"><h3>🏨 패리스 호텔 기준 베뉴 지도</h3>${this.parisMapSVG()}
      <p class="muted" style="font-size:12px;margin:4px 0 0;">위치 관계만 나타낸 개략도예요. 시간은 앱의 다른 화면과 같은 기준(직선거리 + 도보는 건물 출입 10분, 차량은 승차장까지 15분)이라 넉넉하게 잡혀 있어요. 모노레일은 배지가 있으면 무료예요.</p>
      <button class="btn ghost small" type="button" data-vmap-zoom style="margin-top:6px;">🔍 크게 보기</button></div>`;
  },
  parisMapSVG() {
    const t = (v) => Planner.travelBetween({ venue: "Paris Las Vegas" }, { venue: v }) || {};
    const walk = (tr) => `🚶 ${tr.walkMin}분`, both = (tr) => `${walk(tr)}${tr.mode !== "도보" ? ` · 🚕 ${tr.minutes}분` : ""}`;
    const wy = t("Wynn"), ve = t("The Venetian"), fo = t("Caesars Forum"), cp = t("Caesars Palace"), mg = t("MGM Grand");
    const road = (y, name, sub) => `<rect class="vm-road" x="8" y="${y - 6}" width="330" height="12" rx="2"/>
      <text class="vm-road-t" x="14" y="${y + 3.5}">${name}${sub ? ` <tspan class="vm-sub">${sub}</tspan>` : ""}</text>`;
    const block = (x, y, w, h, cls, ko, en, lines) => `<g>
      <rect class="vm-blk${cls ? " " + cls : ""}" x="${x}" y="${y}" width="${w}" height="${h}" rx="8"/>
      <text class="vm-name" x="${x + 8}" y="${y + 17}">${ko}</text><text class="vm-en" x="${x + 8}" y="${y + 30}">${en}</text>
      ${lines.map((l, i) => `<text class="vm-time" x="${x + 8}" y="${y + 46 + i * 14}">${l}</text>`).join("")}</g>`;
    const st = (y, name) => `<circle class="vm-st" cx="356" cy="${y}" r="6"/><text class="vm-st-t" x="366" y="${y + 4}">${name}</text>`;
    return `<svg class="vmap" viewBox="0 0 420 614" role="img" aria-label="패리스 호텔 기준 베뉴 위치와 이동 시간">
      <rect class="vm-strip" x="140" y="10" width="16" height="572" rx="3"/>
      <text class="vm-strip-t" transform="translate(152 446) rotate(-90)">스트립 Las Vegas Blvd</text>
      <text class="vm-north" x="16" y="24">▲ 북</text>
      ${road(118, "Sands Ave", "· Spring Mountain Rd")}${road(322, "Flamingo Rd")}${road(452, "Harmon Ave")}${road(562, "Tropicana Ave")}
      <path class="vm-mono" d="M356 205 L356 575"/><text class="vm-mono-t" x="364" y="210">🚝 모노레일</text>
      ${st(230, "LINQ역")}${st(318, "플라밍고역")}${st(400, "패리스역")}${st(545, "MGM역")}
      ${block(164, 20, 176, 86, "", "윈 · 앙코르", "Wynn · Encore", [both(wy), "멀어서 차량 추천"])}
      ${block(164, 130, 176, 80, "", "베니션 · 팔라조", "The Venetian (메인 허브)", [both(ve)])}
      ${block(164, 222, 176, 88, "", "시저스 포럼", "Caesars Forum", [both(fo), "🚝 2정거장 (LINQ역)"])}
      ${block(10, 222, 124, 88, "", "시저스 팰리스", "Caesars Palace", [both(cp), "길 건너 대각선"])}
      ${block(164, 340, 176, 98, "vm-home", "🏨 나의 숙소", "Paris Las Vegas", ["패리스역에서 모노레일", "(배지 있으면 무료)"])}
      ${block(164, 466, 176, 86, "", "MGM 그랜드", "MGM Grand", [both(mg), "🚝 1정거장 (추천)"])}
      <text class="vm-legend" x="10" y="604">🚶 도보 · 🚕 차량(택시·Uber) · 🚝 모노레일 (배지로 무료)</text>
    </svg>`;
  },
  /* 베뉴 간 도보 거리 (가까운 순) */
  walkTableHTML(venues) {
    const pairs = [];
    venues.forEach((a, i) => venues.slice(i + 1).forEach((b) => pairs.push([a, b, Planner.havKm(a, b)])));
    pairs.sort((x, y) => x[2] - y[2]);
    return `<h3>🚶 베뉴 간 도보 거리</h3>
      <p class="muted" style="font-size:12px;margin:0 0 4px;">직선거리에 건물 출입 ${Planner.WALK_BUFFER}분을 더한 넉넉한 값이에요. 구글 지도보다 길게 나와요.</p>` +
      pairs.map(([a, b, km]) => `<div class="kv"><span>${esc(shortVenue(a.name))} ↔ ${esc(shortVenue(b.name))}</span><b>약 ${Planner.walkMinutes(km)}분 · ${km.toFixed(1)}km</b></div>`).join("");
  },
  shuttleHTML() {
    const sh = window.APP_DATA.event_info.shuttle || {};
    const DAYS_KO = [["sunday", "일"], ["monday", "월"], ["tuesday", "화"], ["wednesday", "수"], ["thursday", "목"], ["friday", "금"]];
    return `<p style="font-size:14px;">${esc(sh.note || "베뉴 간 셔틀 운행 (배지 필수)")}</p>
      <h4>요일별 운행 시간</h4>
      ${DAYS_KO.filter(([k]) => sh[k]).map(([k, ko]) => `<div class="kv"><span>${ko}</span><b>${esc(sh[k])}</b></div>`).join("")}
      ${sh.replay_shuttle ? `<div class="kv"><span>re:Play</span><b>${esc(sh.replay_shuttle)}</b></div>` : ""}
      <p class="muted" style="font-size:13px;">정류장과 실시간 시간은 AWS Events 앱과 현장 표지판에서 확인하세요.</p>
      <div class="notice">💡 배지 제시로 <strong>라스베가스 모노레일 무료</strong>${sh.monorail_stations ? ` — ${esc(sh.monorail_stations)}` : ""} (공항 미연결)</div>`;
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

/* 지도 크게 보기: 넓게 펼쳐 옆으로 밀어 봄 (앱이 핀치 확대를 막고 있어서) */
document.addEventListener("click", (e) => {
  if (!e.target.closest || !e.target.closest("[data-vmap-zoom]")) return;
  openLayer({ title: "🏨 패리스 호텔 기준 베뉴 지도", body: `<div class="vmap-zoom">${RouteInfo.parisMapSVG()}</div>` });
});

/* 가이드 본문 안의 버튼: 유형별 세션 보기 · 출장 정보 입력 · 세션 상세 (드로어와 넓은 화면 오른쪽 칸 모두) */
document.addEventListener("click", (e) => {
  const el = e.target.closest && e.target.closest("[data-goto-type], [data-edit-trip], [data-open-session]");
  if (!el || !el.closest(".drawer-body, #gd-pane")) return;
  closeDrawer();
  if (el.dataset.editTrip !== undefined) { Prep.editTrip(); return; }
  if (el.dataset.openSession) { Sessions.openDetail(el.dataset.openSession); return; }
  Sessions.resetFilters();
  Sessions.f.type = el.dataset.gotoType;
  Sessions.limit = SESSION_PAGE;
  if (currentTab !== "sessions") switchTab("sessions"); else Views.sessions();
  toast(`'${typeKo(el.dataset.gotoType)}'만 보여요`);
});
