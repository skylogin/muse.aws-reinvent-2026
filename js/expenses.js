/* 정산 탭: 회사/개인 구분 지출 기록 */
"use strict";

const EXP_CATS = { flight: "항공", hotel: "호텔", meal: "식사", transport: "교통", etc: "기타" };
let expFilter = "all"; // all | company | personal

Views.expenses = function () {
  const el = $("#view-expenses");
  const list = S().expenses.filter((e) => expFilter === "all" || e.owner === expFilter);
  const sum = (own) => S().expenses.filter((e) => e.owner === own)
    .reduce((a, e) => ({ usd: a.usd + (+e.amount_usd || 0), krw: a.krw + (+e.amount_krw || 0) }), { usd: 0, krw: 0 });
  const sc = sum("company"), sp = sum("personal");
  const fmt = (n) => Number(n || 0).toLocaleString("ko-KR");
  const budget = +S().budget_usd || 0;
  const totalUsd = sc.usd + sp.usd;
  const pct = budget > 0 ? Math.min(Math.round(totalUsd / budget * 100), 100) : 0;
  const barCls = budget > 0 && totalUsd >= budget ? " over" : "";
  // 최근 날짜가 위로 (같은 날짜는 나중에 입력한 것이 위)
  const ordered = list.map((e, i) => ({ e, i })).sort((a, b) => (b.e.date || "").localeCompare(a.e.date || "") || b.i - a.i).map((x) => x.e);
  const budgetMsg = budget > 0
    ? (totalUsd >= budget
        ? `<div class="danger-box">⚠️ 예산을 초과했어요! ($${fmt(totalUsd)} / $${fmt(budget)})</div>`
        : totalUsd >= budget * 0.8
          ? `<div class="warn-box">예산의 ${Math.round(totalUsd / budget * 100)}%를 사용했어요 ($${fmt(totalUsd)} / $${fmt(budget)})</div>`
          : `<div class="muted" style="font-size:13px;">$${fmt(totalUsd)} / $${fmt(budget)} (${Math.round(totalUsd / budget * 100)}% 사용)</div>`)
    : `<div class="muted" style="font-size:13px;">예산을 설정하면 지출을 관리할 수 있어요.</div>`;

  el.innerHTML = `
    <div class="card"><h3>💰 예산</h3>
      ${budget > 0 ? `<div class="progress${barCls}"><div style="width:${pct}%"></div></div>` : ""}
      ${budgetMsg}
      <button class="btn ghost small" id="ex-budget" style="margin-top:6px;">${budget > 0 ? "예산 변경" : "예산 설정"}</button>
    </div>
    <div class="card">
      <div class="chip-row">
        ${[["all", "전체"], ["company", "회사"], ["personal", "개인"]].map(([v, l]) =>
          `<button class="chip${expFilter === v ? " on" : ""}" data-ef="${v}">${l}</button>`).join("")}
      </div>
      <div class="kv"><span>🏢 회사 합계</span><b>$${fmt(sc.usd)} · ₩${fmt(sc.krw)}</b></div>
      <div class="kv"><span>👤 개인 합계</span><b>$${fmt(sp.usd)} · ₩${fmt(sp.krw)}</b></div>
      <button class="btn accent block" id="ex-add">+ 지출 추가</button>
    </div>
    ${ordered.length ? ordered.map((e) => `
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
          <strong>${esc(e.desc) || EXP_CATS[e.category] || "지출"}</strong>
          <span class="badge ${e.owner === "company" ? "info" : ""}">${e.owner === "company" ? "회사" : "개인"}</span>
        </div>
        <div class="muted" style="font-size:13px;">${esc(e.date)} · ${esc(EXP_CATS[e.category] || e.category)}${e.receipt ? " · 🧾 영수증 있음" : ""}</div>
        <div style="font-size:17px;font-weight:700;margin-top:4px;">$${fmt(e.amount_usd)} <span class="muted" style="font-size:13px;font-weight:400;">(₩${fmt(e.amount_krw)})</span></div>
        <div style="display:flex;gap:6px;margin-top:6px;">
          <button class="btn ghost small" data-exedit="${e.id}">수정</button>
          <button class="btn ghost small" data-exdel="${e.id}">삭제</button>
        </div>
      </div>`).join("")
      : `<div class="empty-state"><div class="big">🧾</div><p>${expFilter === "all" ? "기록된 지출이 없어요" : `${expFilter === "company" ? "회사" : "개인"} 지출이 없어요`}</p></div>`}`;

  $$("#view-expenses [data-ef]").forEach((b) => b.onclick = () => { expFilter = b.dataset.ef; Views.expenses(); });
  $("#ex-add").onclick = () => Expenses.openForm();
  $$("#view-expenses [data-exedit]").forEach((b) => b.onclick = () => Expenses.openForm(b.dataset.exedit));
  $("#ex-budget").onclick = () => {
    openModal(`
      <h2>예산 설정</h2>
      <label class="field">출장 전체 예산 (USD)</label>
      <input type="number" id="bg-usd" value="${S().budget_usd || ""}" placeholder="예: 2000 (0이면 해제)" inputmode="decimal" min="0">
      <button class="btn block" id="bg-save">저장</button>
      <button class="btn ghost block" id="bg-cancel">취소</button>`);
    $("#bg-save").onclick = () => {
      S().budget_usd = Math.max(0, +$("#bg-usd").value || 0);
      Store.save(); closeModal(); Views.expenses(); toast("예산을 저장했어요");
    };
    $("#bg-cancel").onclick = closeModal;
  };
  $$("#view-expenses [data-exdel]").forEach((b) => b.onclick = () => {
    const id = b.dataset.exdel;
    const target = S().expenses.find((e) => e.id === id);
    openModal(`
      <h2>삭제할까요?</h2>
      <p>"${esc((target && (target.desc || EXP_CATS[target.category])) || "지출")}" 기록을 삭제합니다.</p>
      <button class="btn danger block" id="ex-del-yes">삭제</button>
      <button class="btn ghost block" id="ex-cancel">취소</button>`);
    $("#ex-del-yes").onclick = () => {
      S().expenses = S().expenses.filter((e) => e.id !== id);
      Store.save(); closeModal(); Views.expenses(); toast("삭제했어요");
    };
    $("#ex-cancel").onclick = closeModal;
  });
};

const Expenses = {
  openForm(id) {
    const cur = id ? S().expenses.find((e) => e.id === id) : null;
    const today = vegasDateStr();
    const rate = S().fx_rate;
    const v = cur || { date: today, owner: "company", category: "meal", desc: "", amount_usd: "", amount_krw: "", receipt: false };
    openModal(`
      <h2>${cur ? "지출 수정" : "지출 추가"}</h2>
      <label class="field">날짜</label><input type="date" id="ex-date" value="${esc(v.date)}">
      <label class="field">구분</label>
      <div class="chip-row" id="ex-owner">
        <button class="chip${v.owner === "company" ? " on" : ""}" data-v="company">🏢 회사</button>
        <button class="chip${v.owner === "personal" ? " on" : ""}" data-v="personal">👤 개인</button>
      </div>
      <label class="field">카테고리</label>
      <select id="ex-cat">${Object.entries(EXP_CATS).map(([k, l]) => `<option value="${k}"${v.category === k ? " selected" : ""}>${l}</option>`).join("")}</select>
      <label class="field">내용</label><input type="text" id="ex-desc" placeholder="예: 호텔 조식" value="${esc(v.desc)}" maxlength="60">
      <div class="row">
        <div><label class="field">금액 (USD)</label><input type="number" id="ex-usd" placeholder="0" inputmode="decimal" min="0" step="0.01" value="${esc(v.amount_usd)}"></div>
        <div><label class="field">금액 (KRW)</label><input type="number" id="ex-krw" placeholder="자동 계산" inputmode="numeric" min="0" value="${esc(v.amount_krw)}"></div>
      </div>
      <div class="row">
        <div><label class="field">환율 ($1 = ₩)</label><input type="number" id="ex-rate" inputmode="decimal" min="1" value="${esc(rate)}"></div>
        <div class="muted" style="font-size:12px;justify-content:center;">KRW 칸을 비워 두면 USD × 환율로 자동 계산돼요</div>
      </div>
      <label class="check-item"><input type="checkbox" id="ex-receipt"${v.receipt ? " checked" : ""}><span>영수증 보관함</span></label>
      <button class="btn block" id="ex-save">저장</button>
      <button class="btn ghost block" id="ex-cancel">취소</button>`);
    let owner = v.owner;
    $$("#ex-owner .chip").forEach((c) => c.onclick = () => {
      owner = c.dataset.v;
      $$("#ex-owner .chip").forEach((x) => x.classList.toggle("on", x === c));
    });
    // KRW는 사용자가 직접 고치기 전까지 USD × 환율로 계속 따라감
    const usdEl = $("#ex-usd"), krwEl = $("#ex-krw"), rateEl = $("#ex-rate");
    const calc = (usd, r) => Math.round((+usd || 0) * (+r || 0));
    let krwManual = !!(cur && cur.amount_krw && cur.amount_krw !== calc(cur.amount_usd, rate));
    const sync = () => { if (!krwManual) krwEl.value = usdEl.value ? calc(usdEl.value, rateEl.value) : ""; };
    usdEl.addEventListener("input", sync);
    rateEl.addEventListener("input", sync);
    krwEl.addEventListener("input", () => { krwManual = krwEl.value !== ""; if (!krwManual) sync(); });
    $("#ex-save").onclick = () => {
      const usd = Math.max(0, +usdEl.value || 0);
      const r = +rateEl.value;
      if (r > 0) S().fx_rate = r;
      let krw = Math.max(0, Math.round(+krwEl.value || 0));
      if (!krw && usd) krw = calc(usd, S().fx_rate);
      if (!usd && !krw) { toast("금액을 입력해 주세요"); usdEl.focus(); return; }
      const rec = {
        id: cur ? cur.id : "ex" + Date.now(), date: $("#ex-date").value || today, owner,
        category: $("#ex-cat").value, desc: $("#ex-desc").value.trim(),
        amount_usd: usd, amount_krw: krw,
        receipt: $("#ex-receipt").checked
      };
      if (cur) Object.assign(cur, rec); else S().expenses.push(rec);
      Store.save(); closeModal(); Views.expenses(); toast(cur ? "수정했어요" : "지출을 기록했어요");
    };
    $("#ex-cancel").onclick = closeModal;
  }
};
