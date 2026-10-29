/* 다른 기기와 이어하기: 상태를 항목 단위로 쪼개 변경·삭제 시각을 기록하고, 항목별로 나중에 고친 쪽을 남겨 합친다.
   순수 함수만 둔다 (DOM·localStorage·IndexedDB 없음) — scripts/test-sync.js가 Node에서 그대로 읽어 검사한다.
   설계: docs/superpowers/specs/2026-10-28-device-sync-design.md */
"use strict";

const Sync = (() => {
  /* 기기마다 따로 두는 키: 합치지 않고 파일에도 넣지 않음 */
  const LOCAL_KEYS = ["onboarded", "install_dismissed", "theme", "text_scale", "show_kr_hours", "notify",
    "recent_queries", "weather_cache", "last_backup_at", "sync_local"];
  const META = "sync";
  const skip = (k) => k === META || LOCAL_KEYS.includes(k);
  const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
  const J = (v) => JSON.stringify(v === undefined ? null : v);

  /* 단위 키 → [컬렉션, 나머지] */
  const splitKey = (k) => { const i = k.indexOf("|"); return i < 0 ? [k, null] : [k.slice(0, i), k.slice(i + 1)]; };

  /* 순서 유지: 로컬에 있던 것은 그 순서, 새로 들어온 것은 가져온 쪽 순서로 뒤에 */
  const ordered = (localIds, remoteIds, pickedIds) => {
    const out = [], seen = new Set();
    const add = (id) => { if (!seen.has(id) && pickedIds.has(id)) { seen.add(id); out.push(id); } };
    localIds.forEach(add); remoteIds.forEach(add); pickedIds.forEach(add);
    return out;
  };

  /* 컬렉션별 쪼개기·되살리기. toUnits → [[subKey, 값]], fromUnits(local, remote, picked: Map subKey→값) → 값 */
  const set = {
    toUnits: (v) => (Array.isArray(v) ? v : []).map((x) => [String(x), true]),
    fromUnits: (l, r, picked) => ordered((l || []).map(String), (r || []).map(String), new Set(picked.keys()))
  };
  const map = {
    toUnits: (v) => (isObj(v) ? Object.keys(v).map((k) => [k, v[k]]) : []),
    fromUnits: (l, r, picked) => {
      const out = {};
      ordered(Object.keys(l || {}), Object.keys(r || {}), new Set(picked.keys())).forEach((k) => { out[k] = picked.get(k); });
      return out;
    }
  };
  const idList = {
    toUnits: (v) => (Array.isArray(v) ? v : []).filter((x) => x && x.id != null).map((x) => [String(x.id), x]),
    fromUnits: (l, r, picked) => {
      const ids = (a) => (Array.isArray(a) ? a : []).filter((x) => x && x.id != null).map((x) => String(x.id));
      return ordered(ids(l), ids(r), new Set(picked.keys())).map((id) => picked.get(id));
    }
  };
  const checklist = {
    toUnits: (v, cfg) => idList.toUnits(v == null ? cfg.checklistDefaults() : v),
    fromUnits: (l, r, picked, cfg) => {
      if (l == null && r == null) return null; // 양쪽 다 아직 기본 항목 그대로
      return idList.fromUnits(l == null ? cfg.checklistDefaults() : l, r == null ? cfg.checklistDefaults() : r, picked);
    }
  };
  const dailyPlan = {
    toUnits: (v) => {
      const out = [];
      if (isObj(v)) Object.keys(v).forEach((day) => (Array.isArray(v[day]) ? v[day] : [])
        .filter((p) => p && p.session_id != null).forEach((p) => out.push([day + "|" + p.session_id, p])));
      return out;
    },
    fromUnits: (l, r, picked) => {
      const byDay = new Map();
      picked.forEach((val, sub) => { const [day, sid] = splitKey(sub); if (!byDay.has(day)) byDay.set(day, new Map()); byDay.get(day).set(sid, val); });
      const sids = (o, day) => ((o && Array.isArray(o[day])) ? o[day] : []).map((p) => String(p.session_id));
      const out = {};
      ordered(Object.keys(l || {}), Object.keys(r || {}), new Set(byDay.keys())).forEach((day) => {
        const m = byDay.get(day);
        const list = ordered(sids(l, day), sids(r, day), new Set(m.keys())).map((sid) => m.get(sid));
        if (list.length) out[day] = list; // 빈 날짜는 뺌
      });
      return out;
    }
  };
  /* 출장 정보: 객체를 끝까지 펼쳐 칸 하나씩 */
  const fields = {
    toUnits: (v) => {
      const out = [];
      const walk = (o, p) => Object.keys(o).forEach((k) => {
        const path = p ? p + "." + k : k;
        if (isObj(o[k])) walk(o[k], path); else out.push([path, o[k]]);
      });
      if (isObj(v)) walk(v, "");
      return out;
    },
    fromUnits: (l, r, picked) => {
      const out = {};
      picked.forEach((val, path) => {
        const parts = path.split(".");
        let o = out;
        parts.slice(0, -1).forEach((p) => { if (!isObj(o[p])) o[p] = {}; o = o[p]; });
        o[parts[parts.length - 1]] = val;
      });
      return out;
    }
  };
  /* 프로필: 한 단계만 (관심 토픽·서비스 목록은 통째로) */
  const shallow = {
    toUnits: (v) => (isObj(v) ? Object.keys(v).map((k) => [k, v[k]]) : []),
    fromUnits: (l, r, picked) => map.fromUnits(l, r, picked)
  };
  const KINDS = {
    favorites: set, fixed_off: set,
    reservations: map, backups: map, session_notes: map, depart_done: map, fixed_edits: map,
    expenses: idList, peers: idList, news: idList, expo_booths: idList,
    checklist, daily_plan: dailyPlan, trip: fields, profile: shallow
  };

  /* 상태 → { 단위 키: JSON 문자열 } */
  function units(state, cfg) {
    const out = {};
    Object.keys(state || {}).forEach((key) => {
      if (skip(key)) return;
      const kind = KINDS[key];
      if (!kind) { out[key] = J(state[key]); return; } // 그 밖의 키는 통째로
      kind.toUnits(state[key], cfg).forEach(([sub, val]) => { out[key + "|" + sub] = J(val); });
    });
    return out;
  }

  /* 직전 저장본(prev)과 지금(cur)을 비교해 meta.stamps / meta.tombs를 고침 */
  function track(prev, cur, meta, now) {
    meta.stamps = meta.stamps || {};
    meta.tombs = meta.tombs || {};
    Object.keys(cur).forEach((k) => {
      if (prev[k] !== cur[k]) { meta.stamps[k] = now; delete meta.tombs[k]; }
    });
    Object.keys(prev).forEach((k) => {
      if (!(k in cur)) { meta.tombs[k] = now; delete meta.stamps[k]; }
    });
  }

  /* 고른 단위들(chosen: 단위 키 → 값)로 합치는 키를 되살림. sync·기기별 키는 넣지 않음 */
  function rebuild(local, remote, chosen, cfg) {
    local = local || {}; remote = remote || {};
    const byCol = new Map();
    Object.keys(chosen).forEach((k) => {
      const [col, sub] = splitKey(k);
      if (!byCol.has(col)) byCol.set(col, new Map());
      byCol.get(col).set(sub, chosen[k]);
    });
    const cols = new Set([...Object.keys(local), ...Object.keys(remote), ...byCol.keys()].filter((k) => !skip(k)));
    const out = {};
    cols.forEach((col) => {
      const picked = byCol.get(col) || new Map();
      const kind = KINDS[col];
      if (!kind) { if (picked.has(null)) out[col] = picked.get(null); return; } // 통째: 지워졌으면 뺌
      out[col] = kind.fromUnits(local[col], remote[col], picked, cfg);
    });
    return out;
  }

  /* 기기별 키를 뺀 얕은 복사본 (sync 포함) — 보내기·되돌리기 사본용 */
  function synced(state) {
    const out = {};
    Object.keys(state || {}).forEach((k) => { if (!LOCAL_KEYS.includes(k)) out[k] = state[k]; });
    return out;
  }

  /* 한 단위의 양쪽 기록 중 남길 쪽 (스펙 4.3 표). side = { del, t, v } 또는 null(모름), d = 그 단위의 기본값(JSON) */
  function pick(l, r, d) {
    if (!l) return r;
    if (!r) return l;
    if (l.t !== r.t) return r.t > l.t ? r : l;
    if (l.del && r.del) return l;
    if (l.del !== r.del) return l.t === 0 ? r : (l.del ? l : r); // 같은 시각: 삭제 쪽 (기록 없으면 가져온 쪽)
    if (l.v === r.v) return l;
    if (l.t === 0) { // 기록 없는 예전 항목끼리: 기본값 그대로인 쪽보다 실제로 입력한 쪽, 둘 다 입력값이면 가져온 쪽
      if (d !== undefined && r.v === d) return l;
      return r;
    }
    return r.v > l.v ? r : l; // 같은 시각: 어느 기기에서 합쳐도 같은 결과
  }

  /* 항목별로 나중에 고친 쪽을 남겨 합침. remote = 합치는 키 + sync(없을 수 있음) */
  function merge(local, remote, opts) {
    opts = opts || {};
    const cfg = opts.cfg;
    local = local || {}; remote = remote || {};
    const lm = local[META] || {}, rm = remote[META] || {};
    const lu = units(local, cfg), ru = units(remote, cfg);
    const dflt = cfg && cfg.defaultUnits ? cfg.defaultUnits() : {};
    const side = (u, m, k) => (k in u ? { del: false, t: (m.stamps || {})[k] || 0, v: u[k] }
      : (m.tombs && k in m.tombs) ? { del: true, t: m.tombs[k] } : null);
    const keys = new Set([...Object.keys(lu), ...Object.keys(ru), ...Object.keys(lm.tombs || {}), ...Object.keys(rm.tombs || {})]);
    const chosen = {}, stamps = {}, tombs = {}, rows = {};
    let total = 0, overwritten = 0, legacyOverwritten = 0, unrecorded = false;
    // 마지막으로 주고받은 때 (보냄·받음 중 늦은 쪽). 그 뒤의 수정만 '덮어써지는 수정'으로 셈
    const since = (opts.lastSyncAt != null ? opts.lastSyncAt : opts.lastReceivedAt) || 0;
    const count = (k, f) => { const c = splitKey(k)[0]; (rows[c] = rows[c] || { add: 0, change: 0, del: 0 })[f]++; total++; };
    keys.forEach((k) => {
      const l = side(lu, lm, k), r = side(ru, rm, k);
      if ((l && !l.del && !l.t) || (r && !r.del && !r.t)) unrecorded = true;
      const p = pick(l, r, dflt[k]);
      if (!p) return;
      if (p.del) tombs[k] = p.t;
      else { chosen[k] = JSON.parse(p.v); if (p.t) stamps[k] = p.t; }
      const had = !!l && !l.del, has = !p.del;
      if (!had && has) count(k, "add");
      else if (had && !has) count(k, "del");
      else if (had && has && l.v !== p.v) count(k, "change");
      // 지난번에 받은 뒤 이 기기에서 고친(지운) 것이 다른 기기의 더 나중 수정에 덮이는 경우
      if (p === r && l && (l.del !== r.del || l.v !== r.v) && l.t > since) overwritten++;
      // 기록 없는 이 기기 값이 기록 없는 다른 값으로 바뀜 (어느 쪽이 나중인지 모름 → 미리보기에서 경고)
      if (p === r && l && !l.del && !r.del && l.t === 0 && r.t === 0 && l.v !== r.v) legacyOverwritten++;
    });
    const state = {};
    LOCAL_KEYS.forEach((k) => { if (k in local) state[k] = local[k]; });
    Object.assign(state, rebuild(local, remote, chosen, cfg));
    state[META] = { stamps, tombs };
    const stale = opts.remoteExportedAt != null && opts.lastReceivedExportedAt != null && opts.remoteExportedAt < opts.lastReceivedExportedAt;
    // 예전 데이터 안내: 이 기기에서 처음 합칠 때만 (기록 없는 항목이 있으면)
    const legacy = opts.lastReceivedAt == null && unrecorded;
    return { state, summary: { rows, total, overwritten, legacyOverwritten, legacy, stale } };
  }

  /* 덮어쓰기·되돌리기: 합치는 키와 기록은 data 것으로, 기기별 키는 이 기기 것으로 */
  function replaceSynced(local, data) {
    data = JSON.parse(J(data || {}));
    const state = {};
    Object.keys(data).forEach((k) => { if (!LOCAL_KEYS.includes(k)) state[k] = data[k]; });
    LOCAL_KEYS.forEach((k) => { if (local && k in local) state[k] = local[k]; });
    const m = isObj(data[META]) ? data[META] : {};
    state[META] = { stamps: m.stamps || {}, tombs: m.tombs || {} };
    return state;
  }

  /* 덮어쓰면 사라지는 것: 이 기기에만 있는 단위 수 (컬렉션별) */
  function lost(local, data, cfg) {
    const lu = units(local, cfg), du = units(data, cfg), out = {};
    Object.keys(lu).forEach((k) => { if (!(k in du)) { const c = splitKey(k)[0]; out[c] = (out[c] || 0) + 1; } });
    return out;
  }

  /* ---------- 파일·코드 형식 (스펙 7) ---------- */
  const APP = "reinvent2026";
  function envelope(o) {
    return { app: APP, kind: "sync", v: 2, exported_at: o.exported_at, from: o.from || "", data: o.data, receipts: o.receipts || {} };
  }
  /* 파일·코드에서 읽은 객체 → { data, receipts, exported_at, from, legacy }. 앱 파일이 아니면 "not-app" */
  function parse(obj) {
    if (isObj(obj) && obj.app === APP && isObj(obj.data)) {
      return { data: synced(obj.data), receipts: isObj(obj.receipts) ? obj.receipts : {},
        exported_at: typeof obj.exported_at === "number" ? obj.exported_at : null, from: String(obj.from || ""), legacy: false };
    }
    if (isObj(obj) && isObj(obj.profile)) return { data: synced(obj), receipts: {}, exported_at: null, from: "", legacy: true }; // 예전 백업·코드
    throw new Error("not-app");
  }
  const toB64url = (bytes) => {
    let bin = "";
    for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };
  const fromB64url = (s) => {
    let b64 = s.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const bin = atob(b64), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  };
  const pipe = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
  /* 텍스트 코드 (사진 제외): z1. = gzip, j1. = 압축 없음 */
  async function encodeCode(env) {
    const o = Object.assign({}, env);
    delete o.receipts;
    const bytes = new TextEncoder().encode(JSON.stringify(o));
    if (typeof CompressionStream === "function") return "z1." + toB64url(await pipe(bytes, new CompressionStream("gzip")));
    return "j1." + toB64url(bytes);
  }
  /* 코드 → 객체 (Sync.parse에 넘김). 메신저가 넣은 줄바꿈·공백은 무시. 접두사 없으면 예전 코드 */
  async function decodeCode(text) {
    const s = String(text || "").replace(/\s+/g, "");
    let bytes;
    if (s.startsWith("z1.")) {
      if (typeof DecompressionStream !== "function") throw new Error("no-gzip");
      bytes = await pipe(fromB64url(s.slice(3)), new DecompressionStream("gzip"));
    } else bytes = fromB64url(s.startsWith("j1.") ? s.slice(3) : s);
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  return { LOCAL_KEYS, units, track, rebuild, synced, merge, replaceSynced, lost, envelope, parse, encodeCode, decodeCode };
})();
