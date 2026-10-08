/* 사전준비 탭: 내 출장 정보 + 가이드 + 준비물 체크리스트 */
"use strict";

/* 다녀온 사람들 후기 링크 */
const REINVENT_REVIEWS = [
  { title: "NDS 초보자 세션 공략집", desc: "세션 예약 순서·타입별 실전 후기", url: "https://tech.cloud.nongshim.co.kr/blog/aws/3537/" },
  { title: "SpoonLabs 현장 후기", desc: "핸즈온 주의사항·식사·꿀팁", url: "https://medium.com/spoontech/2025-aws-re-invent-ai-%EB%8C%80%EA%B2%A9%EB%8F%99-%EC%8B%9C%EB%8C%80-2496cd24ed0d" },
  { title: "re:Invent 2025 뽕뽑기 후기", desc: "호텔·물가·맛집 팁", url: "https://medium.com/@hjinblog/aws-reinvent-2025-%EC%9D%B4%EB%A0%87%EA%B9%8C%EC%A7%80-%EB%BD%95%EC%9D%84-%EB%BD%91%EC%9D%84-%EC%A4%84%EC%9D%80-d8da6519f153" },
  { title: "re:Invent 생존 가이드 (영문)", desc: "준비물 체크리스트·서바이벌 팁", url: "https://jimmydqv.com/how-to-reinvent-ep-4-packing-and-survival/" },
  { title: "re:Invent Queens 가이드 (영문)", desc: "다회 참석자들의 실전 팁 모음", url: "https://suzanamelo.com/articles/reinvent-queens-guide/" }
];

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
    const rs = e.reserved_seating || {}, bp = e.badge_pickup || {}, rp = e.replay || {}, ml = e.meals || {};
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
      <h4>식사</h4>
      <p>${esc(ml.note || "컨퍼런스 기간 베뉴별 식사 제공")}</p>
      <p class="muted">내 일정 → 동선에서 점심 시간대 빈 시간을 알려 줘요.</p>
      ${rp.date ? `<h4>re:Play</h4>
      <p>${esc(dayLabel(rp.date))} ${esc(rp.time || "")} · ${esc(rp.venue || "")}</p>
      <p>${esc(rp.note || "")}</p>
      <p class="muted">역대 re:Play는 각 베뉴에서 전용 셔틀을 운행했어요. 올해 노선·시간은 AWS Events 앱 공지를 확인하세요.</p>` : ""}`;
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
    return `<h4>행사장 식사</h4>
      <p>${esc(ml.note || "컨퍼런스 기간 베뉴별 식사 제공")}</p>
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
      </ul>
      <p class="muted">영업시간·운영 여부는 지도에서 확인하세요. 팁은 '💵 팁 계산기'로 계산할 수 있어요.</p>`;
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

Views.prep = function () {
  const el = $("#view-prep");
  const t = S().trip;
  const f = t.flights, h = t.hotel;
  const missing = (v) => !v ? `<span class="badge warn">미정</span>` : esc(v);
  const cl = Packing.list();
  const done = cl.filter((x) => x.done).length;
  const dd = dday();
  const dtasks = DepartTasks.all();
  const dDone = S().depart_done || {};
  const dtDoneCount = dtasks.filter((x) => dDone[x.id]).length;

  el.innerHTML = `
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
    </div>

    <div class="card"><h3>✈️ 내 출장 정보</h3>
      <h4 style="margin:8px 0 4px;font-size:14px;">가는 편 (ICN → LAS) ${missing(f.outbound.flight_no)}</h4>
      <div class="kv"><span>편명</span><b>${esc(f.outbound.flight_no) || "-"}</b></div>
      <div class="kv"><span>출발 → 도착</span><b>${f.outbound.dep_time ? esc(f.outbound.dep_time) + " → " + esc(f.outbound.arr_time) : "-"}</b></div>
      <h4 style="margin:8px 0 4px;font-size:14px;">오는 편 (LAS → ICN) ${missing(f.inbound.flight_no)}</h4>
      <div class="kv"><span>편명</span><b>${esc(f.inbound.flight_no) || "-"}</b></div>
      <div class="kv"><span>출발 → 도착</span><b>${f.inbound.dep_time ? esc(f.inbound.dep_time) + " → " + esc(f.inbound.arr_time) : "-"}</b></div>
      <h4 style="margin:8px 0 4px;font-size:14px;">호텔 ${missing(h.name)}</h4>
      <div class="kv"><span>호텔명</span><b>${esc(h.name) || "-"}</b></div>
      <div class="kv"><span>체크인 → 아웃</span><b>${h.check_in ? esc(h.check_in) + " → " + esc(h.check_out) : "-"}</b></div>
      <button class="btn ghost block" id="prep-edit-trip">출장 정보 입력/수정</button>
    </div>

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
    </div>

    <div class="card"><h3>📖 출장 가이드</h3>
      ${(window.APP_DATA.prep_sections || []).map((s, i) => `
        <button class="btn ghost block left info-btn" data-guide="${i}">📘 ${esc(s.title)}</button>`).join("")}
    </div>

    <div class="card"><h3>🧭 현지 생활 가이드</h3>
      <div class="route-info" style="margin:0;padding:0;border:0;">
        <button class="btn ghost small" data-lg="emergency">🆘 응급·안전</button>
        <button class="btn ghost small" data-lg="event">🎫 배지·예약석·식사</button>
        <button class="btn ghost small" data-lg="tips">💵 팁 계산기</button>
        <button class="btn ghost small" data-lg="stores">🛒 편의점·약국</button>
        <button class="btn ghost small" data-lg="meals">🍽️ 식사·맛집</button>
        <button class="btn ghost small" data-lg="return">✈️ 귀국 준비</button>
      </div>
    </div>

    <div class="card"><h3>✍️ 다녀온 사람들 후기</h3>
      <p class="muted" style="font-size:13px;">작년·재작년 참석자들의 실전 팁 모음이에요.</p>
      ${REINVENT_REVIEWS.map((r) => `
        <a class="btn ghost block left info-btn" href="${r.url}" target="_blank" rel="noopener">🔗 ${esc(r.title)}<br><span class="muted" style="font-size:12px;font-weight:400;">${esc(r.desc)}</span></a>`).join("")}
    </div>`;

  $$("#view-prep [data-dt]").forEach((c) => c.onchange = () => DepartTasks.toggle(c.dataset.dt));
  $$("#view-prep [data-guide]").forEach((b) => b.onclick = () => {
    const s = (window.APP_DATA.prep_sections || [])[Number(b.dataset.guide)];
    if (s) openDrawer(s.title, s.html);
  });
  $$("#view-prep [data-ck]").forEach((c) => c.onchange = () => {
    const item = Packing.list().find((x) => x.id === c.dataset.ck);
    if (item) { item.done = c.checked; Store.save(); Views.prep(); }
  });
  $$("#view-prep [data-ckedit]").forEach((b) => b.onclick = (e) => { e.stopPropagation(); Packing.editItem(b.dataset.ckedit); });
  $$("#view-prep [data-ckdel]").forEach((b) => b.onclick = (e) => { e.stopPropagation(); Packing.askDelete(b.dataset.ckdel); });
  const ckAdd = $("#ck-add");
  if (ckAdd) ckAdd.onclick = () => Packing.editItem(null);
  $("#prep-edit-trip").onclick = Prep.editTrip;
  $$("#view-prep [data-lg]").forEach((b) => b.onclick = () => {
    const k = b.dataset.lg;
    if (k === "tips") LocalGuide.openTips();
    else if (k === "emergency") openDrawer("🆘 응급·안전", LocalGuide.emergencyHTML());
    else if (k === "event") openDrawer("🎫 배지·예약석·식사", LocalGuide.eventHTML());
    else if (k === "meals") openDrawer("🍽️ 식사·맛집", LocalGuide.mealsHTML());
    else if (k === "return") openDrawer("✈️ 귀국 준비", LocalGuide.returnHTML());
    else openDrawer("🛒 편의점·약국", LocalGuide.storesHTML());
  });
};

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
      <div class="row"><div><label class="field">체크인</label>${inp("tr-ht-in", h.check_in, "2026-11-29", "date")}</div>
      <div><label class="field">체크아웃</label>${inp("tr-ht-out", h.check_out, "2026-12-05", "date")}</div></div>
      <label class="field">주소</label>${inp("tr-ht-addr", h.address, "선택")}
      <button class="btn block" id="tr-save">저장</button>
      <button class="btn ghost block" id="tr-cancel">취소</button>`);
    $("#tr-save").onclick = () => {
      const g = (id) => $("#" + id).value.trim();
      f.outbound = { airline: g("tr-ob-al"), flight_no: g("tr-ob-no"), dep_time: g("tr-ob-dep"), arr_time: g("tr-ob-arr"), terminal: "" };
      f.inbound = { airline: g("tr-ib-al"), flight_no: g("tr-ib-no"), dep_time: g("tr-ib-dep"), arr_time: g("tr-ib-arr"), terminal: "" };
      t.hotel = { name: g("tr-ht-name"), check_in: g("tr-ht-in"), check_out: g("tr-ht-out"), address: g("tr-ht-addr") };
      Store.save(); closeModal(); Views.prep(); toast("출장 정보를 저장했어요");
    };
    $("#tr-cancel").onclick = closeModal;
  },
  openSection(secId) {
    const s = (window.APP_DATA.prep_sections || []).find((x) => x.id === secId);
    if (s) openDrawer(s.title, s.html);
  }
};
