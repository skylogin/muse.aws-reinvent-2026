/* 정산 탭: 회사/개인 구분 지출 기록 · 영수증 사진 · 내보내기 */
"use strict";

const EXP_CATS = { flight: "항공", hotel: "호텔", meal: "식사", transport: "교통", etc: "기타" };
let expFilter = "all"; // all | company | personal

/* 영수증 사진: localStorage는 용량이 작아 IndexedDB에 따로 저장 (이 기기에만 보관) */
const Receipts = {
  _db: null,
  open() {
    if (!this._db) {
      this._db = new Promise((res, rej) => {
        const r = indexedDB.open("reinvent2026-receipts", 1);
        r.onupgradeneeded = () => r.result.createObjectStore("img");
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
    }
    return this._db;
  },
  async run(mode, fn) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const t = db.transaction("img", mode), req = fn(t.objectStore("img"));
      t.oncomplete = () => res(req && req.result);
      t.onerror = () => rej(t.error);
    });
  },
  put(id, blob) { return this.run("readwrite", (st) => st.put(blob, id)); },
  get(id) { return this.run("readonly", (st) => st.get(id)); },
  del(id) { return this.run("readwrite", (st) => st.delete(id)).catch(() => {}); },
  /* 긴 변 1600px JPEG로 줄여 저장 (사진 한 장 보통 200–400KB) */
  compress(file) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement("canvas");
        c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob((b) => (b ? res(b) : rej(new Error("encode"))), "image/jpeg", 0.75);
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("image")); };
      img.src = url;
    });
  },
  _urls: [],
  /* 화면의 [data-rcimg] 이미지에 사진을 채움 */
  async paint(root) {
    this._urls.forEach((u) => URL.revokeObjectURL(u));
    this._urls = [];
    for (const el of $$("[data-rcimg]", root)) {
      try {
        const blob = await this.get(el.dataset.rcimg);
        if (!blob) { el.closest(".rc-thumb").classList.add("missing"); continue; }
        const u = URL.createObjectURL(blob);
        this._urls.push(u);
        el.src = u;
      } catch (e) { /* IndexedDB 사용 불가 */ }
    }
  },
  async view(id, title) {
    const blob = await this.get(id).catch(() => null);
    if (!blob) { toast("사진을 찾을 수 없어요"); return; }
    const u = URL.createObjectURL(blob);
    openSheet({
      title: "🧾 영수증",
      body: `<div class="rc-full"><img src="${u}" alt="영수증 사진"></div><p class="muted" style="text-align:center;margin:8px 0 0;">${esc(title || "")}</p>`,
      actions: `<button class="btn ghost" id="rv-close">닫기</button><button class="btn" id="rv-save">${navigator.canShare ? "공유·저장" : "사진 저장"}</button>`
    });
    $("#rv-close").onclick = () => { URL.revokeObjectURL(u); $("#modal-overlay")._dismiss(); };
    $("#rv-save").onclick = () => Receipts.share([{ blob, name: `영수증-${id}.jpg` }]);
  },
  /* 휴대폰 공유 시트(사진 앱 저장·메신저·드라이브) → 안 되면 파일 다운로드 */
  async share(items) {
    const files = items.map((x) => new File([x.blob], x.name, { type: "image/jpeg" }));
    if (navigator.canShare && navigator.canShare({ files })) {
      try { await navigator.share({ files, title: "re:Invent 영수증" }); return; } catch (e) { if (e && e.name === "AbortError") return; }
    }
    items.forEach((x, i) => setTimeout(() => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(x.blob); a.download = x.name;
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    }, i * 300));
  }
};

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
      <div class="row" style="margin-top:8px;">
        <button class="btn accent" id="ex-add">+ 지출 추가</button>
        <button class="btn ghost" id="ex-export"${S().expenses.length ? "" : " disabled"}>📤 내보내기</button>
      </div>
    </div>
    ${ordered.length ? ordered.map((e) => `
      <div class="card ex-card">
        <div class="ex-main">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
            <strong>${esc(e.desc) || EXP_CATS[e.category] || "지출"}</strong>
            <span class="badge ${e.owner === "company" ? "info" : ""}">${e.owner === "company" ? "회사" : "개인"}</span>
          </div>
          <div class="muted" style="font-size:13px;">${esc(e.date)} · ${esc(EXP_CATS[e.category] || e.category)}${e.receipt ? " · 🧾 종이 보관" : ""}</div>
          <div style="font-size:17px;font-weight:700;margin-top:4px;">$${fmt(e.amount_usd)} <span class="muted" style="font-size:13px;font-weight:400;">(₩${fmt(e.amount_krw)})</span></div>
          <div style="display:flex;gap:6px;margin-top:6px;">
            <button class="btn ghost small" data-exedit="${e.id}">수정</button>
            <button class="btn ghost small" data-exdel="${e.id}">삭제</button>
          </div>
        </div>
        ${e.receipt_img ? `<button class="rc-thumb" data-rcview="${esc(e.receipt_img)}" data-rctitle="${esc(e.desc || EXP_CATS[e.category] || "")}" aria-label="영수증 사진 보기"><img data-rcimg="${esc(e.receipt_img)}" alt=""></button>` : ""}
      </div>`).join("")
      : `<div class="empty-state"><div class="big">🧾</div><p>${expFilter === "all" ? "기록된 지출이 없어요" : `${expFilter === "company" ? "회사" : "개인"} 지출이 없어요`}</p></div>`}`;

  $$("#view-expenses [data-ef]").forEach((b) => b.onclick = () => { expFilter = b.dataset.ef; Views.expenses(); });
  $("#ex-add").onclick = () => Expenses.openForm();
  $("#ex-export").onclick = () => Expenses.openExport();
  $$("#view-expenses [data-exedit]").forEach((b) => b.onclick = () => Expenses.openForm(b.dataset.exedit));
  $$("#view-expenses [data-rcview]").forEach((b) => b.onclick = () => Receipts.view(b.dataset.rcview, b.dataset.rctitle));
  Receipts.paint(el);
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
      <p>"${esc((target && (target.desc || EXP_CATS[target.category])) || "지출")}" 기록을 삭제합니다.${target && target.receipt_img ? "<br>영수증 사진도 함께 지워져요." : ""}</p>
      <button class="btn danger block" id="ex-del-yes">삭제</button>
      <button class="btn ghost block" id="ex-cancel">취소</button>`);
    $("#ex-del-yes").onclick = () => {
      if (target && target.receipt_img) Receipts.del(target.receipt_img);
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
    openSheet({
      title: cur ? "지출 수정" : "지출 추가",
      body: `
      <label class="field" for="ex-date">날짜</label><input type="date" id="ex-date" value="${esc(v.date)}">
      <label class="field">구분</label>
      <div class="seg" id="ex-owner">
        <button class="seg-btn${v.owner === "company" ? " on" : ""}" data-v="company">🏢 회사</button>
        <button class="seg-btn${v.owner === "personal" ? " on" : ""}" data-v="personal">👤 개인</button>
      </div>
      <label class="field" for="ex-cat" style="display:block;margin-top:10px;">카테고리</label>
      <select id="ex-cat">${Object.entries(EXP_CATS).map(([k, l]) => `<option value="${k}"${v.category === k ? " selected" : ""}>${l}</option>`).join("")}</select>
      <label class="field" for="ex-desc">내용</label><input type="text" id="ex-desc" placeholder="예: 호텔 조식" value="${esc(v.desc)}" maxlength="60">
      <div class="row">
        <div><label class="field" for="ex-usd">금액 (USD)</label><input type="number" id="ex-usd" placeholder="0" inputmode="decimal" min="0" step="0.01" value="${esc(v.amount_usd)}"></div>
        <div><label class="field" for="ex-krw">금액 (KRW)</label><input type="number" id="ex-krw" placeholder="자동 계산" inputmode="numeric" min="0" value="${esc(v.amount_krw)}"></div>
      </div>
      <div class="row">
        <div><label class="field" for="ex-rate">환율 ($1 = ₩)</label><input type="number" id="ex-rate" inputmode="decimal" min="1" value="${esc(rate)}"></div>
        <div class="muted" style="font-size:12px;justify-content:center;">KRW 칸을 비워 두면 USD × 환율로 자동 계산돼요</div>
      </div>
      <label class="field">영수증</label>
      <div class="rc-box">
        <div class="rc-thumb big" id="ex-photo-prev">${cur && cur.receipt_img ? `<img data-rcimg="${esc(cur.receipt_img)}" alt="">` : `<span>📷</span>`}</div>
        <div class="rc-side">
          <label class="btn ghost small" style="cursor:pointer;">${cur && cur.receipt_img ? "사진 바꾸기" : "사진 찍기·선택"}<input type="file" id="ex-photo" accept="image/*" style="display:none;"></label>
          <button class="link-btn danger" id="ex-photo-del"${cur && cur.receipt_img ? "" : " hidden"}>사진 삭제</button>
          <span class="muted" style="font-size:11.5px;">사진은 이 기기에만 저장돼요</span>
        </div>
      </div>
      <label class="check-item"><input type="checkbox" id="ex-receipt"${v.receipt ? " checked" : ""}><span>종이 영수증 보관함</span></label>`,
      actions: `<button class="btn ghost" id="ex-cancel">취소</button><button class="btn" id="ex-save">저장</button>`
    });
    let owner = v.owner;
    $$("#ex-owner .seg-btn").forEach((c) => c.onclick = () => {
      owner = c.dataset.v;
      $$("#ex-owner .seg-btn").forEach((x) => x.classList.toggle("on", x === c));
    });
    // 영수증 사진: 고른 즉시 줄여서 미리보기, 저장할 때 IndexedDB에 기록
    let photo = undefined; // undefined: 변경 없음, null: 삭제, Blob: 새 사진
    let previewUrl = null;
    if (cur && cur.receipt_img) Receipts.paint($("#ex-photo-prev"));
    $("#ex-photo").onchange = async (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      try {
        photo = await Receipts.compress(f);
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        previewUrl = URL.createObjectURL(photo);
        $("#ex-photo-prev").innerHTML = `<img src="${previewUrl}" alt="영수증 미리보기">`;
        $("#ex-photo-del").hidden = false;
      } catch (err) { toast("사진을 읽을 수 없어요"); }
    };
    $("#ex-photo-del").onclick = () => {
      photo = null;
      $("#ex-photo-prev").innerHTML = `<span>📷</span>`;
      $("#ex-photo-del").hidden = true;
    };
    // KRW는 사용자가 직접 고치기 전까지 USD × 환율로 계속 따라감
    const usdEl = $("#ex-usd"), krwEl = $("#ex-krw"), rateEl = $("#ex-rate");
    const calc = (usd, r) => Math.round((+usd || 0) * (+r || 0));
    let krwManual = !!(cur && cur.amount_krw && cur.amount_krw !== calc(cur.amount_usd, rate));
    const sync = () => { if (!krwManual) krwEl.value = usdEl.value ? calc(usdEl.value, rateEl.value) : ""; };
    usdEl.addEventListener("input", sync);
    rateEl.addEventListener("input", sync);
    krwEl.addEventListener("input", () => { krwManual = krwEl.value !== ""; if (!krwManual) sync(); });
    $("#ex-save").onclick = async () => {
      const usd = Math.max(0, +usdEl.value || 0);
      const r = +rateEl.value;
      if (r > 0) S().fx_rate = r;
      let krw = Math.max(0, Math.round(+krwEl.value || 0));
      if (!krw && usd) krw = calc(usd, S().fx_rate);
      if (!usd && !krw) { toast("금액을 입력해 주세요"); usdEl.focus(); return; }
      const recId = cur ? cur.id : "ex" + Date.now();
      let img = cur ? cur.receipt_img || "" : "";
      try {
        if (photo) { img = "rc-" + recId; await Receipts.put(img, photo); }
        else if (photo === null && img) { await Receipts.del(img); img = ""; }
      } catch (err) { toast("사진을 저장하지 못했어요 (저장 공간 확인)"); return; }
      const rec = {
        id: recId, date: $("#ex-date").value || today, owner,
        category: $("#ex-cat").value, desc: $("#ex-desc").value.trim(),
        amount_usd: usd, amount_krw: krw,
        receipt: $("#ex-receipt").checked, receipt_img: img
      };
      if (cur) Object.assign(cur, rec); else S().expenses.push(rec);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      Store.save(); closeModal(); Views.expenses(); toast(cur ? "수정했어요" : "지출을 기록했어요");
    };
    $("#ex-cancel").onclick = () => $("#modal-overlay")._dismiss();
  },

  /* 내보내기: 엑셀에서 바로 열리는 CSV + 영수증 사진 모아 공유 */
  rows() {
    return S().expenses.filter((e) => expFilter === "all" || e.owner === expFilter)
      .slice().sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  },
  csv() {
    const q = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
    const rows = this.rows();
    const lines = [["날짜", "구분", "카테고리", "내용", "금액(USD)", "금액(KRW)", "종이 영수증", "영수증 사진"].map(q).join(",")];
    rows.forEach((e) => lines.push([e.date, e.owner === "company" ? "회사" : "개인", EXP_CATS[e.category] || e.category, e.desc,
      (+e.amount_usd || 0).toFixed(2), Math.round(+e.amount_krw || 0), e.receipt ? "O" : "", e.receipt_img ? `영수증-${e.receipt_img}.jpg` : ""].map(q).join(",")));
    lines.push("");
    ["company", "personal"].forEach((own) => {
      const r = rows.filter((e) => e.owner === own);
      if (!r.length) return;
      lines.push(["", own === "company" ? "회사 합계" : "개인 합계", "", "", r.reduce((a, e) => a + (+e.amount_usd || 0), 0).toFixed(2),
        r.reduce((a, e) => a + Math.round(+e.amount_krw || 0), 0), "", ""].map(q).join(","));
    });
    return "﻿" + lines.join("\r\n"); // BOM: 엑셀에서 한글이 깨지지 않게
  },
  openExport() {
    const rows = this.rows(), photos = rows.filter((e) => e.receipt_img);
    const scope = { all: "전체", company: "회사", personal: "개인" }[expFilter];
    openSheet({
      title: "📤 정산 내보내기",
      body: `
        <div class="info-list">
          <span>🧾</span><span><b>${scope} 지출 ${rows.length}건</b> <span class="muted">· 위쪽 '전체/회사/개인' 선택 기준</span></span>
          <span>📷</span><span>영수증 사진 ${photos.length}장</span>
        </div>
        <button class="btn block left" id="xp-csv">📄 엑셀용 CSV 파일 저장<br><span class="muted" style="font-size:12px;font-weight:400;">날짜·구분·카테고리·금액(USD/KRW)·영수증 여부 + 합계</span></button>
        <button class="btn ghost block left" id="xp-photos"${photos.length ? "" : " disabled"}>📷 영수증 사진 모아 저장·공유<br><span class="muted" style="font-size:12px;font-weight:400;">파일 이름이 CSV의 '영수증 사진' 칸과 같아요</span></button>
        <p class="muted" style="font-size:12px;margin-top:10px;">영수증 사진은 이 기기에만 저장돼요. '다른 기기로 옮기기'·백업 파일에는 포함되지 않으니, 출장이 끝나면 여기서 한 번 저장해 두세요.</p>`,
      actions: `<button class="btn ghost" id="xp-close" style="flex:1;">닫기</button>`
    });
    $("#xp-close").onclick = () => $("#modal-overlay")._dismiss();
    $("#xp-csv").onclick = () => {
      download(`reinvent2026-정산-${scope}-${vegasDateStr()}.csv`, this.csv(), "text/csv;charset=utf-8");
      toast("CSV 파일을 저장했어요");
    };
    $("#xp-photos").onclick = async () => {
      const items = [];
      for (const e of photos) {
        const blob = await Receipts.get(e.receipt_img).catch(() => null);
        if (blob) items.push({ blob, name: `영수증-${e.receipt_img}.jpg` });
      }
      if (!items.length) { toast("저장된 사진이 없어요"); return; }
      Receipts.share(items);
    };
  }
};
