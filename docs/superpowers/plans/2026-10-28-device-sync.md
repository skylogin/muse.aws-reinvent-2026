# 다른 기기와 이어하기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 폰과 PC를 번갈아 쓸 때 가져오기가 덮어쓰지 않고 항목별로 합쳐지게 한다. 영수증 사진도 함께 옮기고, 공유 창(AirDrop·카카오톡)·끌어다 놓기로 쉽게 주고받게 한다.

**Architecture:**
- 순수 함수 모듈 `js/sync.js`가 담당하는 일:
  - 상태를 항목 단위로 쪼개기 (`units`)
  - 변경·삭제 시각 기록 (`track`)
  - 항목별 최근 수정 우선 합치기 (`merge`)
  - 파일·코드 형식 처리
- `Store.save()`가 저장할 때마다 `track`을 부른다. 각 기능의 저장 코드는 건드리지 않는다.
- `js/transfer.js`는 보내기·받기·미리보기·되돌리기 화면만 맡는다.

**Tech Stack:** 바닐라 JS (빌드 없음, `<script>` 전역), localStorage, IndexedDB(영수증 사진), Web Share API, `CompressionStream`, Node 20 `vm` 단위 테스트, Playwright 브라우저 테스트(작업 중에만).

**Spec:** `docs/superpowers/specs/2026-10-28-device-sync-design.md`

## Global Constraints

**UI 문구·형식**

- 모든 UI 문구는 한국어로 쓴다. 기존 톤("~해요")을 따른다.
- 단위 키 구분자는 `|`이다 (예: `daily_plan|2026-12-01|AIM104-S`, `trip|hotel.name`).
- 파일 형식: `{ app: "reinvent2026", kind: "sync", v: 2, exported_at, from, data, receipts }`
- 코드 접두사: `z1.`(gzip) / `j1.`(압축 없음) / 접두사 없음(예전 코드)
- 파일 이름: `reinvent2026-이어하기-YYYYMMDD-HHMM.json` (기기 현지 시각)

**저장소 키**

- 되돌리기 사본: localStorage `reinvent2026.undo`
- 상태 키 `sync: { stamps: {}, tombs: {} }`
- 상태 키 `sync_local: { last_sent_at: null, last_received_at: null, last_received_exported_at: null, last_from: "" }`

**기기별 키** (합치지 않고 내보내지 않음)

`onboarded, install_dismissed, theme, text_scale, show_kr_hours, notify, recent_queries, weather_cache, last_backup_at, sync_local`

**배포 규칙**

- README 규칙: `sw.js`의 `CACHE` 버전을 올린다 (현재 v42 → v43).
- 새 스크립트는 `index.html`과 `sw.js` ASSETS 양쪽에 넣는다. `node scripts/check-data.js`가 둘을 대조한다.
- `.github/workflows/pages.yml` check 작업에 `node scripts/test-sync.js`를 추가한다.
- 기존 코드 스타일: 2칸 들여쓰기, `"use strict";`, 한국어 주석은 필요한 곳에만 짧게 쓴다.

## Review Focus

1. **방금 보낸 내 파일을 같은 기기에서 다시 받기** → 미리보기가 "이미 같은 상태예요"이고, 반영해도 `stamps`가 바뀌지 않아야 한다. (Task 2 `idempotent`, Task 7 브라우저 테스트)
2. **앱 파일이 아닌 것을 끌어다 놓기** (CSV·사진·깨진 JSON) → "re:Invent 앱 파일이 아니에요"가 뜨고 상태·사진은 그대로여야 한다. (Task 3 `parse rejects`, Task 7 브라우저 테스트)
3. **업데이트 전에 만든 예전 백업 파일·코드** → 합집합으로 합쳐지고 예전 데이터 안내가 한 번만 떠야 한다. 두 번째 합치기부터는 안내가 없어야 한다. (Task 2 `legacy baseline`, Task 7)
4. **iPhone에서 [공유하기로 보내기]** → 클릭 직후 바로 `navigator.share`가 불려야 한다(iOS가 늦은 호출을 거부). 파일이 준비되기 전에는 버튼이 막혀 있어야 한다. (Task 6 브라우저 테스트)
5. **PC 첫 실행 온보딩에서 받기** → 반영 뒤 `onboarded = true`로 홈에 가야 한다. 테마·글자 크기는 이 기기 기본값을 유지하고, 폰의 값이 넘어오면 안 된다. (Task 7 브라우저 테스트)

---

## File Structure

| 파일 | 책임 |
|---|---|
| `js/sync.js` (새 파일) | 순수 로직: 단위 쪼개기·되살리기, 기록, 합치기·집계, 덮어쓰기, 파일·코드 형식. DOM·localStorage·IndexedDB를 쓰지 않는다 |
| `scripts/test-sync.js` (새 파일) | Node 단위 테스트 (`vm`으로 `js/sync.js` 로드) |
| `js/app.js` | `defaultState()` 키 추가, `Store`에 기록·`replace()`, 온보딩 받기 연결 |
| `js/transfer.js` | 보내기·받기·미리보기·반영·되돌리기 UI, 사진 넣기·꺼내기 |
| `js/expenses.js` | 사진 번호 규칙, `Receipts.keys()`, 안내 문구 |
| `js/settings.js` | "🔄 다른 기기와 이어하기" 카드 |
| `css/style.css` | 끌어다 놓기 영역, 미리보기 줄, 되돌리기 막대 |
| `index.html`, `sw.js`, `.github/workflows/pages.yml`, `README.md` | 로드·캐시·배포 점검·사용법 |

브라우저 테스트(Playwright)는 지금까지처럼 작업용 임시 폴더에 두고 저장소에는 넣지 않는다. 저장소에는 Node·Playwright 설정이 없다.

---

### Task 1: `js/sync.js` 단위 쪼개기·되살리기·기록 + 테스트 틀 + 배포 점검

**Files:**
- Create: `js/sync.js`, `scripts/test-sync.js`
- Modify: `.github/workflows/pages.yml` (check 작업 마지막 run 다음 줄)

**Interfaces:**
- Produces:
  - `Sync.LOCAL_KEYS: string[]` (Global Constraints의 기기별 키)
  - `Sync.units(state, cfg) → { [unitKey]: string }`. 값은 `JSON.stringify(단위 값)`. `cfg = { checklistDefaults: () => Array }`
  - `Sync.track(prev, cur, meta, now) → void`. `meta = state.sync`. 바뀌거나 생긴 키 → `stamps[k] = now`, `delete tombs[k]`. 사라진 키 → `tombs[k] = now`, `delete stamps[k]`
  - `Sync.rebuild(local, remote, chosen) → object`. `chosen = { [unitKey]: 값(파싱된) }`. 합치는 키만 되살린 객체를 돌려준다. `sync`와 기기별 키는 넣지 않는다.
  - `Sync.synced(state) → object`. 기기별 키를 뺀 얕은 복사본(`sync` 포함). 내보내기·되돌리기 사본용

- [ ] **Step 1: 테스트 틀과 실패하는 테스트 작성** (`scripts/test-sync.js`)

```js
/* 기기 간 합치기 로직 단위 테스트 — node scripts/test-sync.js (배포 점검에서도 실행) */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const ctx = vm.createContext({ CompressionStream, DecompressionStream, Response, Blob, TextEncoder, TextDecoder, btoa, atob });
vm.runInContext(fs.readFileSync(path.join(__dirname, "../js/sync.js"), "utf8") + "\n;this.Sync = Sync;", ctx);
const Sync = ctx.Sync;
const CFG = { checklistDefaults: () => [{ id: "pk0", item: "여권", done: false }, { id: "pk1", item: "ESTA", done: false }] };
const J = (x) => JSON.stringify(x);
const eq = (a, b, m) => { if (J(a) !== J(b)) throw new Error(`${m}: ${J(a)} ≠ ${J(b)}`); };
const base = () => ({ profile: { nickname: "", topics: [], services: [] }, favorites: [], daily_plan: {}, reservations: {}, session_notes: {},
  expenses: [], checklist: null, trip: { hotel: { name: "", check_in: "" } }, fx_rate: 1450, theme: "system", text_scale: 1,
  sync: { stamps: {}, tombs: {} }, sync_local: { last_sent_at: null, last_received_at: null, last_received_exported_at: null, last_from: "" } });
/* Store.save()를 흉내 내는 기기: edit(fn, t)로 고치고 t 시각에 저장 */
function device(over) {
  const d = { s: Object.assign(base(), over || {}) };
  let prev = Sync.units(d.s, CFG);
  d.edit = (fn, t) => { fn(d.s); const cur = Sync.units(d.s, CFG); Sync.track(prev, cur, d.s.sync, t); prev = cur; return d; };
  d.take = (state) => { d.s = state; prev = Sync.units(d.s, CFG); return d; };
  return d;
}
const tests = [];
const test = (n, fn) => tests.push([n, fn]);
/* … 테스트들 … */
(async () => {
  let fails = 0;
  for (const [n, fn] of tests) {
    try { await fn(); console.log("  ✓", n); } catch (e) { fails++; console.log("  ✗", n, "—", e.message); }
  }
  console.log(fails ? `❌ 합치기 테스트 실패 ${fails}건` : `✅ 합치기 테스트 통과 — ${tests.length}개`);
  process.exit(fails ? 1 : 0);
})();
```

Task 1에서 넣을 테스트:
- `units: unit keys per collection`
  - `favorites: ["A"]`, `daily_plan: { "2026-12-01": [{ session_id: "A", note: "" }] }`, `expenses: [{ id: "ex1", amount_usd: 5 }]`, `trip.hotel.name: "X"`, `profile.topics: ["AI"]`인 상태에서
  - 키에 다음이 모두 있어야 한다: `favorites|A`, `daily_plan|2026-12-01|A`, `expenses|ex1`, `trip|hotel.name`, `trip|hotel.check_in`, `profile|topics`, `profile|nickname`, `fx_rate`
- `units: local keys and sync excluded`: `theme`, `text_scale`, `sync_local`, `sync`로 시작하는 키가 없어야 한다.
- `units: checklist null equals defaults`: `units({..., checklist: null})`와 `units({..., checklist: CFG.checklistDefaults()})`가 같아야 한다.
- `track: only changed unit stamped`
  - `device()`에서 `edit(s => s.favorites.push("A"), 100)` 다음 `edit(s => s.fx_rate = 1400, 200)`
  - `stamps["favorites|A"] === 100`, `stamps.fx_rate === 200`
- `track: delete leaves tomb, re-add clears it`
  - `favorites`에서 `"A"`를 지움(t=300) → `tombs["favorites|A"] === 300`이고 `stamps`에 없음
  - 다시 넣음(t=400) → `stamps["favorites|A"] === 400`이고 `tombs`에 없음
- `track: materialising default checklist stamps nothing`: `edit(s => s.checklist = CFG.checklistDefaults(), 500)` 뒤 `stamps`에 `checklist|`로 시작하는 키가 없어야 한다.
- `rebuild: keeps local order, appends remote-only`
  - local `expenses: [{id:"b"},{id:"a"}]`, remote `[{id:"c"},{id:"a"}]`, `chosen`에 a·b·c 모두
  - 결과 `expenses`의 id 순서가 `["b","a","c"]`
  - `daily_plan`도 날짜 안에서 같은 규칙: local `[x, y]`, remote `[z, x]` → `[x, y, z]`

- [ ] **Step 2: 실행해서 실패 확인**

Run: `node scripts/test-sync.js`
Expected: `js/sync.js`가 없어서 ENOENT로 종료.

- [ ] **Step 3: `js/sync.js` 구현**

- 전역 `const Sync = { … }` 하나로 만든다 (`"use strict";`).
- 컬렉션별 어댑터 표 `KINDS`를 둔다. 각 항목은 `{ toUnits(value, cfg) → [[subKey, value]], fromUnits(localValue, remoteValue, picked) → value }` 모양이다.

| 상태 키 | 종류 | subKey | 되살릴 때 |
|---|---|---|---|
| `favorites`, `fixed_off` | 집합 | 원소 | 배열 (로컬 순서 + 원격 순서) |
| `reservations`, `backups`, `session_notes`, `depart_done`, `fixed_edits` | 맵 | 키 | 객체 |
| `expenses`, `checklist`, `peers`, `news`, `expo_booths` | id 목록 | `id` | 배열 (로컬 순서 + 원격 순서) |
| `daily_plan` | 날짜별 목록 | `날짜\|session_id` | 날짜별 배열 (날짜 안에서 로컬 순서 + 원격 순서) |
| `trip` | 칸 | 점 경로 (객체를 끝까지 펼침) | 같은 모양의 객체 |
| `profile` | 칸 (한 단계만) | `nickname`·`topics`·`services` | 객체 |
| 그 밖의 키 (`sync`와 기기별 키 제외) | 통째 | 키 자체 (`fx_rate`처럼 `\|` 없음) | 값 |

- `checklist`는 `null`이면 `cfg.checklistDefaults()`로 보고 쪼갠다.
- 단위가 하나도 안 남았을 때:
  - 양쪽 다 `null`이었으면 `null`
  - 아니면 `[]`
- 빈 목록·빈 날짜는 되살릴 때 뺀다 (`daily_plan`의 빈 날짜 배열 포함).

- [ ] **Step 4: 실행해서 통과 확인**

Run: `node scripts/test-sync.js`
Expected: `✅ 합치기 테스트 통과 — 7개`

- [ ] **Step 5: 배포 점검에 추가**

`.github/workflows/pages.yml`의 `- run: node scripts/check-data.js` 다음 줄에 `- run: node scripts/test-sync.js`를 넣는다.

- [ ] **Step 6: 커밋**

```bash
git add js/sync.js scripts/test-sync.js .github/workflows/pages.yml
git commit -m "feat(sync): split state into mergeable units and record change times"
```

---

### Task 2: `Sync.merge` 합치기·집계·덮어쓰기

**Files:**
- Modify: `js/sync.js`, `scripts/test-sync.js`, `docs/superpowers/specs/2026-10-28-device-sync-design.md` (4.3·4.4 `legacy` 정의)

**Interfaces:**
- Consumes: Task 1의 `units`, `rebuild`, `LOCAL_KEYS`
- Produces:
  - `Sync.merge(local, remote, opts)`
    - `local`: 이 기기 전체 상태
    - `remote`: 합치는 키 + `sync`(없을 수 있음)
    - `opts = { cfg, lastReceivedAt, lastReceivedExportedAt, remoteExportedAt }`
    - 반환 `{ state, summary }`
      - `state`: 새 전체 상태 (기기별 키는 local 값)
      - `summary = { rows: { [컬렉션]: { add, change, del } }, total, overwritten, legacy, stale }`
      - 컬렉션 = 단위 키의 첫 `|` 앞부분
  - `Sync.replaceSynced(local, data) → state`: 합치는 키는 `data` 것으로 바꾸고 기기별 키는 `local` 것을 유지한다. `sync`는 `data.sync || { stamps: {}, tombs: {} }`. 덮어쓰기와 되돌리기에 쓴다.
  - `Sync.lost(local, data, cfg) → { [컬렉션]: n }`: local에만 있고 data에는 없는 단위 수. 덮어쓰기 확인 문구용

- [ ] **Step 1: 실패하는 테스트 추가**

- `merge: disjoint additions are both kept`
  - A가 `favorites` "A"를 추가(t=100), B가 `expenses` `{id:"ex1"}`를 추가(t=200)
  - `merge(A.s, Sync.synced(B.s), {cfg})`의 결과에 둘 다 있다.
  - `summary.rows.expenses.add === 1`, `summary.total === 1`
- `merge: later edit wins and counts overwritten`
  - 두 기기 모두 `expenses: [{id:"ex1", amount_usd: 10}]`를 t=100에 기록
  - A는 t=300에 25로, B는 t=400에 30으로 수정
  - A 기준 `merge(..., {cfg, lastReceivedAt: 200})` → `amount_usd === 30`, `rows.expenses.change === 1`, `overwritten === 1`
  - `lastReceivedAt: 350`이면 `overwritten === 0`
- `merge: delete after edit deletes, edit after delete keeps`
  - A가 t=500에 `ex1` 삭제, B가 t=400에 수정 → 결과에 `ex1` 없음, `rows.expenses.del === 1`
  - 시각을 바꿔 B가 t=600에 수정 → `ex1` 남음
- `merge: trip merges per field`: A가 `trip.hotel.name="Wynn"`(t=100), B가 `trip.hotel.check_in="2026-11-29"`(t=200) → 결과에 두 칸 모두 반영
- `merge: local-only keys keep local values`: A `theme:"dark"`, B `theme:"light"` → 결과 `theme === "dark"`, `text_scale`·`sync_local`도 A 값
- `merge: commutative for recorded units`
  - 기록이 있는 단위들(같은 시각 t=100에 값이 다른 `fx_rate` 포함)로 A·B를 만든다.
  - `merge(A,B).state`와 `merge(B,A).state`의 합치는 키 + `sync`가 같다.
- `merge: idempotent`: `M = merge(A,B).state`, `merge(M, Sync.synced(M))`의 `summary.total === 0`이고 `sync`가 같다.
- `merge: older file never removes newer data`
  - B가 t=100에 보낸 사본 R0을 저장해 둔다. B가 t=300에 `ex2`를 추가해 R1을 만든다.
  - A에 R1을 합친 뒤 R0을 합쳐도 `ex2`가 남는다.
  - `opts.remoteExportedAt`이 `lastReceivedExportedAt`보다 작으면 `summary.stale === true`
- `merge: legacy baseline`
  - 기록 없는 두 상태: A `fx_rate:1400`, B `fx_rate:1500`, 둘 다 `sync` 비어 있음
  - 결과 `fx_rate === 1500` (가져온 쪽), `summary.legacy === true`
  - 결과 `state.sync.stamps.fx_rate === 1` (기준선)
  - 결과 상태를 다시 같은 B와 합치면 `legacy === false`
- `merge: merged state re-saved stamps nothing`: `device().take(merge(A,B).state)` 뒤 `edit(() => {}, 999)` → `stamps`가 합친 결과 그대로
- `merge: default checklist on late device does not undo a check`
  - A: `checklist = defaults`에서 `pk0.done = true`(t=100)
  - B: t=500에 `checklist = defaults`를 만든다 (기록 없음)
  - `merge(B.s, synced(A.s))` 결과 `pk0.done === true`
- `replaceSynced: keeps local keys, takes remote data and sync`
- `lost: counts local-only units`: A만 `favorites ["A","B"]`, data `favorites ["A"]` → `{ favorites: 1 }`

- [ ] **Step 2: 실행해서 실패 확인**

Run: `node scripts/test-sync.js`
Expected: 새 테스트들이 `Sync.merge is not a function`으로 ✗, Task 1 테스트는 ✓.

- [ ] **Step 3: `Sync.merge`, `Sync.replaceSynced`, `Sync.lost` 구현**

단위마다 고르는 규칙 (스펙 4.3 표 그대로):

```js
// side = { has: bool, del: bool, t: number, v: string(JSON) } 또는 null(모름)
function pick(l, r) {
  if (!l) return r; if (!r) return l;
  if (l.t !== r.t) return r.t > l.t ? r : l;
  if (l.del && r.del) return l;
  if (l.del !== r.del) return l.t === 0 ? r : (l.del ? l : r); // 같은 시각: 삭제 쪽 (시각 0이면 가져온 쪽)
  if (l.v === r.v) return l;
  return l.t === 0 ? r : (r.v > l.v ? r : l);                    // 시각 0 → 가져온 쪽, 아니면 JSON 큰 쪽
}
```

- **기록 읽기:** `t`는 `stamps[k] || 0`, 삭제는 `tombs[k]`이다.
- **결과 `sync`:** 고른 쪽의 기록을 쓴다.
- **기준선:** 결과에 남는 단위 중 기록이 없는 것은 `stamps[k] = 1`로 둔다.
- **집계:**
  - `legacy`: 양쪽 어느 쪽이든 기록 없는 단위가 하나라도 있으면 true
  - `stale`: `remoteExportedAt != null && lastReceivedExportedAt != null && remoteExportedAt < lastReceivedExportedAt`
  - `overwritten`: 가져온 쪽이 이겨 바뀌는 단위 중 local 기록 시각이 `lastReceivedAt || 0`보다 큰 것의 수
- **스펙 반영:** 스펙 4.4의 `legacy` 문장을 "양쪽 어느 쪽이든 기록 없는 항목이 있으면 true. 합친 결과의 기록 없는 항목은 수정 시각 1(기준선)로 둬서 안내가 기기마다 한 번만 뜨게 한다"로 고치고, 4.3 첫 합치기 단락에 기준선 한 줄을 넣는다.

- [ ] **Step 4: 실행해서 통과 확인**

Run: `node scripts/test-sync.js`
Expected: `✅ 합치기 테스트 통과 — 20개`

- [ ] **Step 5: 커밋**

```bash
git add js/sync.js scripts/test-sync.js docs/superpowers/specs/2026-10-28-device-sync-design.md
git commit -m "feat(sync): merge item by item with latest change winning"
```

---

### Task 3: 파일·코드 형식 (`Sync.parse`, `Sync.encodeCode`, `Sync.decodeCode`)

**Files:**
- Modify: `js/sync.js`, `scripts/test-sync.js`

**Interfaces:**
- Produces:
  - `Sync.envelope({ data, exported_at, from, receipts }) → object`: `{ app: "reinvent2026", kind: "sync", v: 2, exported_at, from, data, receipts: receipts || {} }`
  - `Sync.parse(obj) → { data, receipts, exported_at, from, legacy }`
    - v2: `app === "reinvent2026"`
    - 예전 백업: `profile`이 있는 객체 → `data = synced(obj)`, `legacy: true`, `exported_at: null`, `from: ""`
    - 그 밖: `throw new Error("not-app")`
  - `Sync.encodeCode(env) → Promise<string>`
    - `receipts`를 뺀 봉투를 JSON으로 만든다.
    - `CompressionStream`이 있으면 `"z1." + base64url(gzip)`, 없으면 `"j1." + base64url`
  - `Sync.decodeCode(text) → Promise<object>`
    - 공백과 줄바꿈을 지우고 접두사로 판단한다.
    - 접두사가 없으면 예전 코드: base64url → JSON (지금 `Transfer.decode`와 같은 방식)
    - `z1.`인데 `DecompressionStream`이 없으면 `throw new Error("no-gzip")`
    - 반환 값은 `Sync.parse`에 넘긴다.

- [ ] **Step 1: 실패하는 테스트 추가**

- `code: z1 round trip`: `decodeCode(await encodeCode(env))`를 `parse`한 결과의 `data`·`exported_at`·`from`이 같고, 코드가 `"z1."`로 시작한다.
- `code: z1 is shorter than legacy code`: `daily_plan` 40개·`expenses` 30개 상태에서 z1 코드 길이 < 예전 방식 길이 × 0.6
- `code: j1 and legacy codes decode`
  - `"j1." + base64url(JSON(env))`를 읽는다.
  - 예전 방식(`btoa(unescape(encodeURIComponent(JSON.stringify(state))))` 후 base64url)을 읽으면 `legacy === true`
- `code: tolerates line breaks`: 코드 중간에 `\n`과 공백을 넣어도 읽는다 (메신저 줄바꿈 대비).
- `parse: legacy backup drops local keys`: `{profile, favorites, theme:"dark"}` → `data.theme === undefined`, `legacy === true`
- `parse rejects non-app input`: `[]`, `{a:1}`, `null`은 `not-app` 에러를 낸다.

- [ ] **Step 2: 실행해서 실패 확인**

Run: `node scripts/test-sync.js`
Expected: 새 테스트 6개 ✗.

- [ ] **Step 3: 구현**

- base64url 인코딩은 `Uint8Array` → `btoa(String.fromCharCode(...chunk))`로 한다. 8KB씩 끊어 처리해 큰 배열에서 호출 스택이 넘치지 않게 한다.
- 압축·해제에는 `new Response(new Blob([...]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer()`를 쓴다.

- [ ] **Step 4: 실행해서 통과 확인**

Run: `node scripts/test-sync.js`
Expected: `✅ 합치기 테스트 통과 — 26개`

- [ ] **Step 5: 커밋**

```bash
git add js/sync.js scripts/test-sync.js
git commit -m "feat(sync): file envelope and compressed transfer code"
```

---

### Task 4: `Store`에 기록 연결 + 로드·캐시

**Files:**
- Modify: `js/app.js` (`defaultState()` ~181, `Store` ~210–225)
- Modify: `index.html` (`<script src="js/sync.js">`를 `js/app.js` 바로 앞에)
- Modify: `sw.js` (ASSETS에 `"./js/sync.js"`, `CACHE` v42 → v43)

**Interfaces:**
- Consumes: `Sync.units`, `Sync.track`
- Produces:
  - `SYNC_CFG = { checklistDefaults: () => Packing.defaults() }` (`js/app.js` 전역)
  - `Store.prev`
  - `Store.replace(state) → void`: 상태를 바꾸고, `prev`를 새 상태로 맞춘 뒤 저장한다. 기록은 새로 찍지 않는다.
  - `defaultState()`에 `sync: { stamps: {}, tombs: {} }`와 `sync_local: { … }` 추가 (Global Constraints 값 그대로)

- [ ] **Step 1: 실패하는 브라우저 테스트 작성** (작업용 임시 폴더 `store-sync.test.js`, 기존 테스트와 같은 서버·컨텍스트 틀)
  - 온보딩을 마친 상태로 열고 `Sessions.toggleFav(<첫 세션 id>)`를 부른다.
    - `S().sync.stamps["favorites|<id>"] > 0`
    - `S().sync_local.last_received_at === null`
  - 새로고침 후 `S().sync.stamps`가 새로고침 전과 같다 (불러오기만으로는 기록하지 않음).
  - `Store.replace(JSON.parse(JSON.stringify(S())))` 뒤 `stamps`가 그대로다.
  - 기존 상태(키에 `sync` 없음)를 localStorage에 넣고 열면 `S().sync`가 `{stamps:{}, tombs:{}}`이다.

- [ ] **Step 2: 실행해서 실패 확인** — `S().sync`가 없어서 실패한다.

- [ ] **Step 3: 구현**
  - `Store.load()` 끝에서 `this.prev = Sync.units(this.state, SYNC_CFG)`를 채운다.
  - `Store.save()`는 `localStorage.setItem` 전에 다음을 한다.

    ```js
    const cur = Sync.units(this.state, SYNC_CFG);
    Sync.track(this.prev, cur, this.state.sync, Date.now());
    this.prev = cur;
    ```

  - `Store.replace(state)`: `this.state = state; this.prev = Sync.units(state, SYNC_CFG); this.save();`

- [ ] **Step 4: 실행해서 통과 확인**
  - 브라우저 테스트가 모두 PASS
  - `node scripts/check-data.js` 통과 (캐시 파일 수 +1)
  - 기존 브라우저 테스트(설치 화면·넓은 화면·이동 시간·re:Play)도 통과

- [ ] **Step 5: 커밋**

```bash
git add js/app.js index.html sw.js
git commit -m "feat(sync): record change times on every save"
```

---

### Task 5: 영수증 사진 번호 규칙 + `Receipts.keys()`

**Files:**
- Modify: `js/expenses.js` (`Receipts` 객체, 저장 핸들러 ~276–279, 정산 내보내기 안내 문구 ~326)

**Interfaces:**
- Produces:
  - `Receipts.keys() → Promise<string[]>` (IndexedDB `getAllKeys`)
  - 새 사진 번호는 `"rc-" + recId + "-" + Date.now().toString(36)`

- [ ] **Step 1: 실패하는 브라우저 테스트 작성** (작업용 임시 폴더 `receipt-id.test.js`)
  - 지출 폼에서 작은 PNG를 `#ex-photo`에 넣고 저장한다.
    - `receipt_img`가 `/^rc-ex\d+-[0-9a-z]+$/`와 맞는다.
  - 같은 지출을 열어 다른 PNG로 바꾸고 저장한다.
    - `receipt_img`가 달라졌다.
    - `Receipts.get(예전 번호)`가 `undefined`
    - `Receipts.keys()`에 새 번호만 있다.
  - 정산 내보내기 시트 문구에 "다른 기기로 보내기 파일에 함께 들어가요"가 있다.

- [ ] **Step 2: 실행해서 실패 확인** — 지금은 번호가 `rc-ex…`로 고정이라 실패한다.

- [ ] **Step 3: 구현**
  - 새 사진은 새 번호로 `put`하고, 성공하면 예전 번호(있고 다르면)를 `del`한다.
  - 안내 문구를 다음으로 바꾼다: "영수증 사진은 이 기기에 저장되고, '다른 기기로 보내기' 파일에 함께 들어가요. 출장이 끝나면 여기서 한 번 모아 저장해 두세요."

- [ ] **Step 4: 실행해서 통과 확인** — PASS

- [ ] **Step 5: 커밋**

```bash
git add js/expenses.js
git commit -m "feat(expenses): new receipt id on photo change so merges see it"
```

---

### Task 6: 보내기 시트 + 설정 카드

**Files:**
- Modify: `js/transfer.js`
  - `portableState`, `Transfer.encode`, `TransferUI.showExport`를 지운다.
  - `exportFile`은 새 형식으로 바꾼다.
- Modify: `js/settings.js` (기기·백업 카드 → 이어하기 카드, 맨 위로)
- Modify: `css/style.css`

**Interfaces:**
- Consumes: `Sync.synced`, `Sync.envelope`, `Sync.encodeCode`, `Receipts.get`, `browserEnv()`, `isStandalone()`, `download()`
- Produces:
  - `deviceLabel() → string`. 형식은 `"<기기> · <브라우저|앱>"`
    - 기기: `iPhone` / `iPad` / `Galaxy`(UA에 `SamsungBrowser` 또는 `SM-`) / `Android` / `Mac` / `Windows PC` / `PC`
    - 홈 화면 앱이면 뒤가 `앱`
  - `Transfer.prepare(withPhotos) → Promise<{ file: File, code: string, photos: number, bytes: number }>`
  - `Transfer.photoStats() → Promise<{ count, bytes }>`
  - `Transfer.fileName(now) → "reinvent2026-이어하기-YYYYMMDD-HHMM.json"`
  - `TransferUI.showSend()`
  - `TransferUI.exportFile() → Promise<void>` (사진 포함 파일 다운로드)
  - DOM id
    - 보내기 시트: `#sd-photos`(체크박스), `#sd-share`, `#sd-save`, `#sd-code`, `#sd-hint`
    - 설정 카드: `#set-send`, `#set-recv`, `#set-backup`, `#set-undo`, `#set-sync-status`

- [ ] **Step 1: 실패하는 브라우저 테스트 작성** (작업용 임시 폴더 `send.test.js`)
  - iPhone UA로 연다. `addInitScript`로 `navigator.canShare = () => true`, `navigator.share = (d) => { window.__shared = d.files[0]; window.__shareAt = performance.now(); return Promise.resolve(); }`로 바꾼다.
  - 설정 → `#set-send`를 연다.
    - 준비 중에는 `#sd-share`가 `disabled`
    - 준비가 끝나면 활성화된다.
    - `#sd-hint`에 "AirDrop"이 있다.
  - `#sd-share` 클릭 → `window.__shared.name`이 `/^reinvent2026-이어하기-\d{8}-\d{4}\.json$/`와 맞는다.
  - 파일 텍스트를 `JSON.parse` → `app === "reinvent2026"`, `data.favorites`가 있고 `data.theme`이 없다. 사진 1장을 넣어 둔 경우 `Object.keys(receipts).length === 1`
  - `#sd-photos`를 끄면 다시 준비되고, 공유한 파일의 `receipts`가 `{}`
  - 클릭에서 공유까지 걸린 시간 `__shareAt - clickAt < 50`ms (클릭 뒤에 따로 기다리지 않음)
  - `canShare`가 거짓인 컨텍스트에서는 다운로드 이벤트가 생기고 "다운로드 폴더에 저장했어요"가 토스트로 뜬다.
  - `#sd-code` → 클립보드 텍스트가 `z1.`로 시작한다 (Playwright `grantPermissions(["clipboard-read","clipboard-write"])`).
  - 설정 카드 `#set-sync-status`에 "마지막으로 보냄"과 오늘 날짜가 있다.

- [ ] **Step 2: 실행해서 실패 확인** — `#set-send`가 없다.

- [ ] **Step 3: 구현**
  - **시트를 열 때:** `Transfer.prepare()`를 시작한다. 체크를 바꾸면 다시 준비한다. 준비가 끝나기 전에는 `#sd-share`·`#sd-code`가 `disabled`이고 문구는 "준비 중…"
  - **클릭할 때:** 준비해 둔 `file`로 `navigator.share({ files: [file], title: "re:Invent 출장 앱 데이터" })`만 바로 부른다.
    - `AbortError`는 조용히 넘어간다.
    - `canShare`가 거짓이면 `download()`하고 토스트 "다운로드 폴더에 저장했어요. AirDrop·카톡으로 보내세요"를 띄운다.
  - **보내기 성공 시:** `S().sync_local.last_sent_at = Date.now()`, `TransferUI.markBackup()`
  - **`#sd-code`:** 준비해 둔 `code`를 `navigator.clipboard.writeText`로 복사한다. 실패하면 지금처럼 textarea를 선택하고 `execCommand("copy")`. 시트에 "사진은 파일로 보내야 함께 옮겨져요" 안내를 붙인다.
  - **`#sd-hint` 문구** (`browserEnv().os` 기준)
    - iOS: "공유 창에서 AirDrop → 내 Mac을 고르세요"
    - Android: "공유 창에서 카카오톡 → 나와의 채팅을 고르세요"
    - desktop: "저장한 파일을 AirDrop·카톡으로 폰에 보내세요"
  - **사진 크기 표시:** data URL 길이로 계산하고 "약 N.NMB"로 쓴다.
  - **설정 카드**
    - `<div class="card"><h3>🔄 다른 기기와 이어하기</h3>`
    - 설명 한 줄: "폰과 PC에서 번갈아 써도 가져올 때 합쳐져요."
    - `#set-send`·`#set-recv`는 큰 버튼 두 개
    - 상태 줄 `#set-sync-status`: "마지막으로 보냄 MM/DD HH:MM · 받음 MM/DD HH:MM (from)". 없으면 "아직 주고받은 적 없어요"
    - `#set-undo`: 되돌리기 사본이 있을 때만 보인다.
    - `#set-backup`
    - `#set-install`은 다른 카드로 옮겨 그대로 둔다.
    - `#set-recv`와 `#set-undo`는 Task 7의 함수에 연결한다. 이번 Task에서는 버튼만 두고, `#set-recv`는 기존 `TransferUI.showImport`를 임시로 부른다.

- [ ] **Step 4: 실행해서 통과 확인** — `send.test.js` PASS, `node scripts/test-sync.js`, `node scripts/check-data.js` 통과

- [ ] **Step 5: 커밋**

```bash
git add js/transfer.js js/settings.js css/style.css
git commit -m "feat(sync): send sheet with share sheet file, photos and short code"
```

---

### Task 7: 받기·미리보기·반영·되돌리기 + 온보딩 연결

**Files:**
- Modify: `js/transfer.js` (`Transfer.decode`, `TransferUI.showImport` 삭제)
- Modify: `js/settings.js` (`#set-recv`, `#set-undo` 연결)
- Modify: `js/app.js` (`stepBranch`의 `#ob-import`)
- Modify: `js/expenses.js` (필요하면 `Receipts.put`이 data URL에서 만든 Blob을 받음, 변경 없음 예상)
- Modify: `css/style.css`

**Interfaces:**
- Consumes:
  - `Sync.parse`, `Sync.decodeCode`, `Sync.merge`, `Sync.replaceSynced`, `Sync.lost`, `Sync.synced`
  - `Store.replace`, `Receipts.keys/put/del`, `SYNC_CFG`
- Produces:
  - `TransferUI.showReceive(onDone)`. `onDone()`은 반영된 뒤 불린다. 온보딩은 여기서 `onboarded = true`
  - `Transfer.read(fileOrText) → Promise<parsed>`: 파일이면 `.text()` → `JSON.parse` → `Sync.parse`, 문자열이면 `Sync.decodeCode` → `Sync.parse`
  - `Transfer.apply(parsed, mode) → Promise<summary>`: `mode = "merge" | "replace"`. 스펙 6.2 반영 순서 1–5
  - `Transfer.undo() → void`
  - `Transfer.undoInfo() → { at } | null`
  - 컬렉션 → 한국어 이름 표 `SYNC_LABELS`
    - 관심 세션, 내 일정, 예약 상태, 대체 세션, 세션 메모, 지출, 준비물, 출발 전 할 일, 고정 일정(`fixed_off`·`fixed_edits` 같은 이름), 동료 일정, 발표 메모, Expo 부스, 출장 정보, 프로필, 환율, 예산
    - 표에 없는 키는 키 이름 그대로 쓴다.
  - DOM id
    - 받기 시트: `#rv-drop`, `#rv-file`, `#rv-code`, `#rv-code-go`
    - 미리보기 시트: `#mg-rows`, `#mg-merge`, `#mg-over`, `#mg-cancel`
    - 되돌리기 막대: `#undo-bar` 안에 `#undo-go`

- [ ] **Step 1: 실패하는 브라우저 테스트 작성** (작업용 임시 폴더 `receive.test.js`, 컨텍스트 두 개 "phone"·"pc")
  - **phone에서 보낼 데이터 만들기:** `Sessions.toggleFav(a)`, `daily_plan`에 세션 2개, 지출 1건+사진을 넣고 Task 6 방식으로 파일을 받아 둔다.
  - **pc는 온보딩 전:** `stepBranch` → `#ob-import` → 받기 시트
    - `#rv-file`에 파일을 `setInputFiles` → 미리보기 `#mg-rows`에 "내 일정 +2", "지출 +1", "영수증 사진 +1"
    - `#mg-merge` → 홈으로 간다. `S().onboarded === true`, `S().theme === "system"` (phone의 `"dark"`가 넘어오지 않음), 지출의 사진이 `Receipts.get`으로 있다.
  - **pc에서 고쳐 돌려보내기:** 지출 금액 수정, 일정 1개 삭제 → 보내기 파일 → phone에서 **끌어다 놓기**로 받는다.
    - 끌어다 놓기는 `DataTransfer`를 만들어 `#rv-drop`에 `drop` 이벤트를 보낸다.
    - 미리보기 "지출 변경 1", "내 일정 삭제 1" → 합치기 → 반영 확인
  - **phone이 같은 파일을 다시 받기:** "이미 같은 상태예요". 반영 전후 `stamps`가 같다.
  - **`#undo-go`:** 직전 합치기 전 상태로 돌아간다 (일정 2개, 금액 원래대로). `Transfer.undoInfo() === null`
  - **덮어쓰기:** `#mg-over` 확인 창(`page.on("dialog")`) 문구에 "이 기기에만 있는"과 개수가 있다. 수락하면 합치는 키가 가져온 파일과 같다.
  - **코드 받기:** `#rv-code`에 Task 6의 `z1.` 코드를 붙여넣고 `#rv-code-go` → 미리보기가 뜬다. 사진 줄은 없다.
  - **앱 파일이 아닌 것:** CSV 파일을 `setInputFiles` → 토스트 "re:Invent 앱 파일이 아니에요". `S()`가 그대로다.
  - **예전 백업:** 업데이트 전 형식(`profile` 포함 상태 통째) 파일 → 미리보기에 "처음 합칠 때는 예전에 지운 항목이 다시 생길 수 있어요". 같은 파일을 다시 합치면 이 문구가 없다.
  - **사진 정리:** 합치기로 지워진 지출의 사진은 반영 직후 남아 있다. 다음 가져오기를 반영하면 `Receipts.keys()`에서 빠진다.

- [ ] **Step 2: 실행해서 실패 확인** — `TransferUI.showReceive`가 없다.

- [ ] **Step 3: 구현**
  - **받기 시트**
    - 끌어다 놓기 영역 문구: "여기에 파일을 끌어다 놓으세요"
    - 폰 안내: "AirDrop·카톡으로 받은 파일은 파일 앱 → 다운로드에 있어요"
    - 파일 선택 `accept=".json,application/json"`
    - 받기 시트가 열려 있는 동안 `window` `dragover`/`drop`을 가로챈다. `document`에 한 번만 등록하고, `#rv-drop`이 없으면 무시한다.
  - **읽기 오류 토스트**
    - `not-app`·JSON 오류: "re:Invent 앱 파일이 아니에요"
    - `no-gzip`: "이 브라우저에서는 이 코드를 풀 수 없어요. 파일로 보내 주세요"
  - **미리보기:** `Sync.merge`를 미리 돌린다 (opts는 `S().sync_local`의 두 시각과 `parsed.exported_at`).
    - 제목: "📥 {from}에서 {MM/DD HH:MM}에 보낸 데이터". `from`이나 시각이 없으면 "📥 가져온 데이터"
    - 줄 형식: `"{이름} +a · 변경 c · 삭제 d"` (0인 부분은 뺀다)
    - 사진 줄: "영수증 사진 +n" (이 기기에 없고 합친 결과가 가리키는 사진)
    - 경고 문구는 스펙 6.2 그대로
  - **덮어쓰기 확인:** `confirm("이 기기에만 있는 " + Sync.lost 결과를 "내 일정 2개·지출 1건" 형식으로 + "이 사라져요. 덮어쓸까요?")`
  - **`Transfer.apply` 순서**
    1. `localStorage.setItem("reinvent2026.undo", JSON.stringify({ at: Date.now(), data: Sync.synced(S()) }))`
    2. `Receipts.keys()` 중 현재 상태와 새 상태 어느 쪽도 가리키지 않는 것을 `del`
    3. `Store.replace(새 상태)`
    4. 가져온 사진 중 새 상태가 가리키고 이 기기에 없는 것을 `fetch(dataURL).then(r => r.blob())` → `Receipts.put`
    5. `sync_local` 갱신 → `Store.save()`
    6. `Views[currentTab]()` 다시 그리기, `#undo-bar` 표시 (12초 뒤 자동 숨김, 기존 `#update-bar` 스타일을 따른다)
  - **`Transfer.undo()`:** 사본의 `data`로 `Sync.replaceSynced(S(), data)` → `Store.replace` → 사본 삭제 → 다시 그리기 → 토스트 "가져오기 전으로 되돌렸어요"
  - **온보딩:** `#ob-import` → `TransferUI.showReceive(() => { S().onboarded = true; Store.save(); finishOnboarding(); })`
  - **설정:** `#set-recv` → `TransferUI.showReceive()`, `#set-undo` → `Transfer.undo()`

- [ ] **Step 4: 실행해서 통과 확인** — `receive.test.js`, `send.test.js` PASS, Node 테스트·`check-data.js` 통과

- [ ] **Step 5: 커밋**

```bash
git add js/transfer.js js/settings.js js/app.js js/expenses.js css/style.css
git commit -m "feat(sync): receive by drag-and-drop or file, preview, merge and undo"
```

---

### Task 8: 문서·최종 확인

**Files:**
- Modify: `README.md` ("## 다른 기기와 이어하기" 섹션: 보내기·받기 경로 2개, 합치기 규칙 한 줄, 첫 합치기 안내)
- Modify: `docs/superpowers/specs/2026-10-28-device-sync-design.md` (상태: "구현됨")

- [ ] **Step 1: 모든 검사 실행**

Run: `node scripts/check-data.js && node scripts/test-sync.js`
Expected: 둘 다 ✅

Run: 작업용 임시 폴더의 브라우저 테스트 전부 (install-first, wide-nav, travel-copy, replay-venue, store-sync, receipt-id, send, receive)
Expected: 모두 `0 failed`

- [ ] **Step 2: 화면 확인** — 보내기·받기·미리보기 시트를 폰 폭(390)과 PC 폭(1280), 라이트·다크로 찍어 본다. 넘침·겹침이 없어야 한다.

- [ ] **Step 3: 커밋 후 push**

```bash
git add README.md docs/superpowers/specs/2026-10-28-device-sync-design.md
git commit -m "docs: how to continue on another device"
git push -u origin claude/elegant-gates-nt1flv
```
