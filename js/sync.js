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

  return { LOCAL_KEYS, units, track, rebuild, synced };
})();
