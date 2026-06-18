/* automart-hub 셸 — data/*.js 가 정의한 window.HUB_DATA 를 렌더링 (fetch 없음) */
(function () {
  "use strict";
  const D = window.HUB_DATA || {};
  const $ = (s) => document.querySelector(s);

  const man = (w) => (w == null ? "-" : Math.floor(Math.abs(w) / 10000).toLocaleString() + "만");
  const km = (v) => (v == null ? "-" : (v / 10000).toFixed(1) + "만km");
  const pct = (v) => (v == null ? "-" : Math.round(v * 100) + "%");
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // 연식 그룹 (진행중 필터 — publisher의 _YEAR_GROUPS와 동일 경계)
  const YEAR_GROUPS = { g2022: [2022, 9999], g1821: [2018, 2021], g1317: [2013, 2017], g2012: [0, 2012] };

  function setMeta(count) {
    const m = D.meta || {};
    const el = $("#meta");
    if (el) el.textContent = `총 ${count}건 · 마지막 업데이트 ${m.generated_at || "-"} KST`;
  }

  /* ---------------- 진행중 (listings) ---------------- */
  const LF = { group: "전체", seg: "전체", yr: "전체", disc15: false, noFlag: false, soon: false, conv: false, q: "", sort: "disc" };

  // 차체=컨버터블 판정 — 발행 데이터의 body_convertible(명시) 우선, 구버전 데이터는 trim_label로 폴백
  const isConvertible = (it) =>
    it.body_convertible === true || /컨버터블|카브리올|로드스터/.test(it.trim_label || "");

  // 정렬: 할인율순(disc, 기본 — publisher가 이미 할인순이나 토글 복귀 대비 명시 정렬) / 마감임박순(deadline, 임박 먼저)
  function sortListings(arr) {
    const a = arr.slice();
    if (LF.sort === "deadline") {
      a.sort((x, y) => {
        const tx = x.deadline_iso ? Date.parse(x.deadline_iso) : Infinity;
        const ty = y.deadline_iso ? Date.parse(y.deadline_iso) : Infinity;
        return tx - ty;
      });
    } else {
      a.sort((x, y) => {
        const dx = x.discount_ref == null ? -Infinity : x.discount_ref;
        const dy = y.discount_ref == null ? -Infinity : y.discount_ref;
        return dy - dx;
      });
    }
    return a;
  }

  function listingVisible(it) {
    if (LF.group !== "전체") {
      const g = it.brand_group === "국산" ? "국산"
        : it.brand_group === "제네시스" ? "제네시스" : "수입";
      if (g !== LF.group) return false;
    }
    if (LF.seg !== "전체" && it.segment !== LF.seg) return false;
    if (LF.yr !== "전체") {
      const g = YEAR_GROUPS[LF.yr];
      if (it.year == null || it.year < g[0] || it.year > g[1]) return false;
    }
    if (LF.disc15 && !(it.discount_ref >= 0.15)) return false;
    if (LF.noFlag && (it.constraint_flags || []).length) return false;
    if (LF.soon) {
      if (!it.deadline_iso) return false;
      const left = new Date(it.deadline_iso).getTime() - Date.now();
      if (left < 0 || left > 86400000) return false;
    }
    if (LF.conv && !isConvertible(it)) return false;
    if (LF.q && !`${it.model || ""} ${it.trim_label || ""}`.toLowerCase().includes(LF.q)) return false;
    return true;
  }

  function listingItem(it) {
    const tags = [];
    if (it.brand_group) tags.push(`<span class="tag blue">${esc(it.brand_group)}</span>`);
    if (it.segment) tags.push(`<span class="tag">${esc(it.segment)}</span>`);
    if (it.trim_label) tags.push(`<span class="tag">${esc(it.trim_label)}</span>`);
    (it.constraint_flags || []).forEach((f) => tags.push(`<span class="tag warn">⚠${esc(f)}</span>`));
    if (it.match_score != null && it.match_score < 100)
      tags.push(`<span class="tag">fuzzy ${it.match_score}</span>`);
    if (it.repair_addon > 0)
      tags.push(`<span class="tag" title="${esc((it.repair_notes || []).join(" / "))}">수리비 +${man(it.repair_addon)}</span>`);
    const title = it.low_sample
      ? `${it.year ?? ""} ${esc(it.model)}`
      : `${it.year ?? ""} ${esc(it.model)} · 실구매할인 ${pct(it.discount_buy ?? it.discount_ref)}`;
    const line = it.low_sample
      ? `최저 ${man(it.min_bid)} · 시세중앙(참고) ${man(it.encar_median)}(표본 ${it.encar_count ?? 0}) · ${km(it.mileage_km)}`
      : `최저 ${man(it.min_bid)} · 기준가(${esc(it.ref_label)}) ${man(it.ref_price)} · 보수가 ${man(it.bid_cap)} · 하드캡 ${man(it.hard_cap)} · ${km(it.mileage_km)}`;
    const costRows = Object.entries(it.cost_items || {})
      .map(([k, v]) => `<tr><td>${esc(k)}</td><td>${Number(v).toLocaleString()}원</td></tr>`).join("");
    const disc = it.discount_ref;
    const costBox = `<div class="costbox">
      <table><tbody>
        <tr><td>최저입찰가</td><td>${(it.min_bid ?? 0).toLocaleString()}원</td></tr>
        ${costRows}
        <tr class="sum"><td>부대비용 합계</td><td>${(it.cost_total ?? 0).toLocaleString()}원</td></tr>
        <tr class="sum"><td>총실구매비용</td><td>${(it.total_cost ?? 0).toLocaleString()}원</td></tr>
        ${it.ref_price ? `<tr><td>기준가(${esc(it.ref_label)})</td><td>${it.ref_price.toLocaleString()}원</td></tr>
        ${it.encar_buy_price ? `<tr><td>엔카 실구매가(+세금·정비)</td><td>${it.encar_buy_price.toLocaleString()}원</td></tr>
        <tr class="sum"><td>실구매 차익(엔카실구매가-총비용)</td><td>${(it.encar_buy_price - (it.total_cost ?? 0)).toLocaleString()}원${it.discount_buy != null ? ` (${Math.round(it.discount_buy * 100)}%)` : ""}</td></tr>`
        : `<tr class="sum"><td>차익(기준가-총비용)</td><td>${(it.ref_price - (it.total_cost ?? 0)).toLocaleString()}원${disc != null ? ` (${Math.round(disc * 100)}%)` : ""}</td></tr>`}` : ""}
      </tbody></table>
      ${(it.cost_notes || []).map((n) => `<p class="note">※ ${esc(n)}</p>`).join("")}
      <p class="note">※ 엔카 실구매가 = 엔카 차값 + 취득세·공채·이전·정비(엔카로 사도 드는 공통비용). 진짜 할인 = 이 대비 총비용.</p>
      <p class="note">※ 부대비용은 간이 추정 — 정확한 수치는 엑셀에서 항목 수정 가능</p>
    </div>`;
    return `<li><span class="date">${esc(it.deadline || "마감 미상")}</span>
      <h3>${title}</h3><p class="line">${line}</p>
      <div class="tags">${tags.join("")}</div>
      <p class="src">${esc(it.region || "")}
        <a href="${esc(it.detail_url)}" target="_blank" rel="noopener">automart 상세</a>${
        it.encar_url ? ` <a href="${esc(it.encar_url)}" target="_blank" rel="noopener">엔카 시세${it.encar_count ? `(${it.encar_count}대)` : ""}</a>` : ""}
        <a class="costlink">비용내역</a></p>${costBox}</li>`;
  }

  function renderListings() {
    const all = (D.listings && D.listings.items) || [];
    const vis = sortListings(all.filter((i) => !i.low_sample).filter(listingVisible));
    const low = sortListings(all.filter((i) => i.low_sample).filter(listingVisible));
    $("#list").innerHTML = vis.map(listingItem).join("") ||
      `<li class="empty">조건에 맞는 매물이 없습니다</li>`;
    $("#count").textContent = `${vis.length}건`;
    const wrap = $("#low-wrap");
    wrap.style.display = low.length ? "" : "none";
    $("#low-sum").textContent = `시세 표본 부족 ${low.length}건 — 기준가 미산출(중앙값 참고)`;
    $("#low-list").innerHTML = low.map(listingItem).join("");
  }

  function initListings() {
    setMeta(((D.listings && D.listings.items) || []).length);
    document.querySelectorAll(".chip").forEach((c) => {
      c.addEventListener("click", () => {
        const k = c.dataset.k, v = c.dataset.v;
        if (v !== undefined) {
          LF[k] = v;
          document.querySelectorAll(`.chip[data-k="${k}"]`)
            .forEach((x) => x.classList.toggle("on", x === c));
        } else {
          LF[k] = !LF[k];
          c.classList.toggle("on", LF[k]);
        }
        renderListings();
      });
    });
    $("#q").addEventListener("input", (e) => {
      LF.q = e.target.value.trim().toLowerCase();
      renderListings();
    });
    renderListings();
  }

  /* ---------------- 입찰결과 (results) ---------------- */
  let RFILTER = "전체";

  function verdictBadge(v) {
    if (!v || !v.level) return "";
    const map = { cheap: ["싸게", "v-cheap"], fair: ["적정", "v-fair"], pricey: ["비싸게", "v-pricey"] };
    const [txt, cls] = map[v.level];
    return `<span class="tag ${cls}">${txt}</span>`;
  }

  function resultItem(r) {
    const won = r.outcome === "낙찰";
    const v = won ? r.verdict : null;
    const badge = verdictBadge(v);
    let line, sub = "";
    if (won) {
      line = `낙찰 ${man(r.winning_price)}` + (r.bidder_count ? ` · 입찰 ${r.bidder_count}명` : "");
      if (v && v.level) {
        const warn = v.warnings && v.warnings.length
          ? ` <span class="warn">⚠${esc(v.warnings.join("·"))}</span>` : "";
        sub = `총비용 ${man(v.total_cost)} · 시세 p10 ${man(v.p10)} / p25 ${man(v.p25)}${warn}`;
      } else {
        sub = r.encar_median
          ? `시세중앙(참고) ${man(r.encar_median)} · 표본 ${r.encar_count ?? 0} · 판정불가`
          : "판정불가(데이터 없음)";
      }
    } else {
      const base = r.ref_price || r.encar_median;
      line = `최저 ${man(r.min_bid_price)}` +
        (base ? ` · ${r.ref_price ? "기준가" : "시세중앙"} ${man(base)}` : "");
    }
    return `<li><span class="date">${esc(r.date || "")}</span>
      <h3><span class="tag ${won ? "blue" : ""}">${won ? "낙찰" : "유찰"}</span>${badge ? " " + badge : ""}
        ${r.year ?? ""} ${esc(r.model)}</h3>
      <p class="line">${line}</p>
      ${sub ? `<p class="line sub">${sub}</p>` : ""}
      <p class="src"><a href="${esc(r.detail_url)}" target="_blank" rel="noopener">automart 상세</a>${
        r.encar_search_url ? ` <a href="${esc(r.encar_search_url)}" target="_blank" rel="noopener">엔카 시세</a>` : ""}</p></li>`;
  }

  function renderResults() {
    const all = (D.results && D.results.items) || [];
    const vis = all.filter((r) =>
      RFILTER === "전체" ? true : RFILTER === "낙찰" ? r.outcome === "낙찰" : r.outcome !== "낙찰");
    $("#list").innerHTML = vis.map(resultItem).join("") ||
      `<li class="empty">아직 수집된 결과가 없습니다 — 매일 알림이 쌓아갑니다</li>`;
    $("#count").textContent = `${vis.length}건`;
  }

  function initResults() {
    setMeta(((D.results && D.results.items) || []).length);
    document.querySelectorAll(".chip[data-k='rf']").forEach((c) => {
      c.addEventListener("click", () => {
        RFILTER = c.dataset.v;
        document.querySelectorAll(".chip[data-k='rf']")
          .forEach((x) => x.classList.toggle("on", x === c));
        renderResults();
      });
    });
    renderResults();
  }

  /* ---------------- 통계 (stats) ---------------- */
  function bars(el, rows) {
    const maxv = Math.max(1, ...rows.map((r) => Math.max(r.won, r.passed)));
    el.innerHTML = rows.map((r) => `<div class="bar-row"><span class="bl">${esc(r.label)}</span>
      <div class="bar-track">
        <div class="bar" style="width:${(r.won / maxv) * 55}%"></div>
        <div class="bar gray" style="width:${(r.passed / maxv) * 55}%"></div>
      </div><span class="bv">${r.won} / ${r.passed}</span></div>`).join("");
  }

  function initStats() {
    const s = D.stats || {};
    setMeta(s.sample || 0);
    if (s.insufficient) {
      $("#banner").style.display = "";
      $("#banner").textContent = `표본 축적 중 (${s.sample || 0}건 / 30건) — 수치는 참고만`;
    }
    $("#c-won").textContent = s.won ?? 0;
    $("#c-passed").textContent = s.passed ?? 0;
    $("#c-ratio").textContent = s.ratio_median != null ? (s.ratio_median * 100).toFixed(1) + "%" : "-";
    $("#c-bidders").textContent = s.bidders_avg ?? "-";
    bars($("#m-bars"), s.monthly || []);

    // 연식별 예측할인 분포 — "최근 연식일수록 할인율이 낮다" 가설 검증용
    const groups = [{ label: "전체", bands: s.bands || [], sample: s.sample || 0, disc_median: null }]
      .concat(s.year_bands || []);
    const chipsEl = $("#yg-chips");
    function showGroup(i) {
      const g = groups[i];
      bars($("#b-bars"), g.bands || []);
      $("#yg-info").textContent = g.label === "전체" ? ""
        : `표본 ${g.sample}건` + (g.disc_median != null ? ` · 예측할인 중앙값 ${Math.round(g.disc_median * 100)}%` : "");
      chipsEl.querySelectorAll(".chip").forEach((c, j) => c.classList.toggle("on", j === i));
    }
    if (chipsEl) {
      chipsEl.innerHTML = groups.map((g, i) =>
        `<button class="chip${i === 0 ? " on" : ""}" type="button">${esc(g.label)}</button>`).join("");
      chipsEl.querySelectorAll(".chip").forEach((c, i) => c.addEventListener("click", () => showGroup(i)));
      showGroup(0);
    } else {
      bars($("#b-bars"), s.bands || []);
    }
  }

  /* ---------------- 비용참고표 (costs) ---------------- */
  const SEGS = ["경차", "소형", "준중형", "중형", "대형", "SUV대형", "기본"];

  function table(el, head, rows) {
    el.innerHTML = `<table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
      <tbody>${rows.map((r) => `<tr>${r.map((c) =>
        `<td>${typeof c === "number" ? c.toLocaleString() : esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  }

  function initCosts() {
    const c = D.costs || {};
    setMeta(Object.keys(c.repair_keywords || {}).length);
    table($("#t-maint"), ["비용그룹", ...SEGS],
      Object.entries(c.maintenance || {}).map(([g, t]) => [g, ...SEGS.map((s) => t[s] ?? "")]));
    table($("#t-trans"), ["지역", "금액(원)"], Object.entries(c.transport || {}));
    table($("#t-repair"), ["결함 키워드", "가산(원)"], Object.entries(c.repair_keywords || {}));
    table($("#t-flags"), ["거래제약 키워드(⚠ 표시만, 비용 미반영)"],
      (c.constraint_keywords || []).map((k) => [k]));
  }

  /* ---------------- 나의입찰 (mybids) ---------------- */
  function bidOutcomeBadge(o) {
    const cls = o === "낙찰" ? "blue" : o === "패찰" ? "v-pricey" : "";
    return `<span class="tag ${cls}">${esc(o || "기록")}</span>`;
  }

  // 물건별 '내 메모' — localStorage(브라우저 단독, 서버/발행과 무관). 키=공고번호(없으면 날짜|모델).
  const MEMO_PREFIX = "automart:mybid-memo:";
  function memoKey(b) { return b.notice || `${b.date || ""}|${b.model || ""}`; }
  function getMemo(key) {
    try { return localStorage.getItem(MEMO_PREFIX + key) || ""; } catch (e) { return ""; }
  }
  function setMemo(key, val) {
    try {
      const v = (val || "").trim();
      if (v) localStorage.setItem(MEMO_PREFIX + key, v);
      else localStorage.removeItem(MEMO_PREFIX + key);   // 빈 메모 = 삭제
    } catch (e) { /* 시크릿모드 등 저장 불가 — 조용히 무시 */ }
  }
  function memoInner(key, editing) {
    const val = getMemo(key);
    if (editing) {
      return `<textarea class="memo-input" rows="2" placeholder="이 물건에 대한 내 메모">${esc(val)}</textarea>
        <div class="memo-btns"><button type="button" class="memo-save">저장</button><button type="button" class="memo-cancel">취소</button></div>`;
    }
    if (val) {
      return `<p class="memo-show">📝 <b>내 메모:</b> <span class="memo-text">${esc(val)}</span>` +
        `<button type="button" class="memo-edit">수정</button><button type="button" class="memo-del">삭제</button></p>`;
    }
    return `<button type="button" class="memo-add">✏️ 내 메모 추가</button>`;
  }

  function mybidItem(b) {
    const parts = [];
    if (b.min_bid != null) parts.push(`예정가 ${man(b.min_bid)}`);
    if (b.encar_p10 != null || b.encar_median != null)
      parts.push(`엔카 p10 ${man(b.encar_p10)} / 중앙 ${man(b.encar_median)}`);
    if (b.my_bid != null) parts.push(`내 입찰 ${man(b.my_bid)}`);
    if (b.winning_price != null) parts.push(`낙찰 ${man(b.winning_price)}`);
    const head = [b.gen, b.model, b.year].filter((x) => x != null && x !== "").join(" ");
    const links = [];
    if (b.detail_url) links.push(`<a href="${esc(b.detail_url)}" target="_blank" rel="noopener">automart 상세</a>`);
    if (b.encar_url) links.push(`<a href="${esc(b.encar_url)}" target="_blank" rel="noopener">엔카 시세</a>`);
    const key = memoKey(b);
    return `<li><span class="date">${esc(b.date || "")}${b.notice ? " · " + esc(b.notice) : ""}</span>
      <h3>${bidOutcomeBadge(b.outcome)} ${esc(head)}</h3>
      <p class="line">${parts.join(" · ")}</p>
      ${b.memo ? `<p class="line sub">📝 ${esc(b.memo)}</p>` : ""}
      <div class="usermemo" data-key="${esc(key)}">${memoInner(key, false)}</div>
      ${links.length ? `<p class="src">${links.join(" ")}</p>` : ""}</li>`;
  }

  function initBids() {
    const d = D.mybids || {};
    const items = d.items || [];
    setMeta(items.length);
    const note = $("#note");
    if (note) {
      if (d.note) { note.style.display = ""; note.textContent = "📌 " + d.note; }
      else note.style.display = "none";
    }
    $("#list").innerHTML = items.map(mybidItem).join("") ||
      `<li class="empty">아직 기록된 입찰이 없습니다 — my_bids.yaml에 추가됩니다</li>`;
  }

  /* ---------------- 내 메모 추가/수정/삭제 (이벤트 위임) ---------------- */
  document.addEventListener("click", (e) => {
    const region = e.target.closest(".usermemo");
    if (!region) return;
    const key = region.dataset.key;
    const show = (editing) => {
      region.innerHTML = memoInner(key, editing);     // 같은 컨테이너 갱신 — 키 재조회 없음
      if (editing) {
        const ta = region.querySelector(".memo-input");
        if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
      }
    };
    if (e.target.closest(".memo-add") || e.target.closest(".memo-edit")) show(true);
    else if (e.target.closest(".memo-cancel")) show(false);
    else if (e.target.closest(".memo-save")) {
      const ta = region.querySelector(".memo-input");
      setMemo(key, ta ? ta.value : "");
      show(false);
    } else if (e.target.closest(".memo-del")) {
      if (window.confirm("이 물건의 내 메모를 삭제할까요?")) { setMemo(key, ""); show(false); }
    }
  });

  /* ---------------- 도움말 툴팁 (모바일 탭 토글) ---------------- */
  document.addEventListener("click", (e) => {
    const h = e.target.closest(".help");
    document.querySelectorAll(".help.open").forEach((x) => { if (x !== h) x.classList.remove("open"); });
    if (h) h.classList.toggle("open");
  });

  /* ---------------- 비용내역 펼침 ---------------- */
  document.addEventListener("click", (e) => {
    const l = e.target.closest(".costlink");
    if (!l) return;
    const box = l.closest("li") && l.closest("li").querySelector(".costbox");
    if (box) box.classList.toggle("open");
  });

  /* ---------------- dispatch ---------------- */
  const inits = { listings: initListings, results: initResults, stats: initStats, costs: initCosts, bids: initBids };
  const init = inits[document.body.dataset.page];
  if (init) {
    try { init(); } catch (e) {
      const el = $("#list") || $("#meta") || document.body;
      el.textContent = "데이터 로드 실패 — data/*.js 가 없거나 손상됨";
    }
  }
})();
