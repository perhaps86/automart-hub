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

  function setMeta(count) {
    const m = D.meta || {};
    const el = $("#meta");
    if (el) el.textContent = `총 ${count}건 · 마지막 업데이트 ${m.generated_at || "-"} KST`;
  }

  /* ---------------- 진행중 (listings) ---------------- */
  const LF = { group: "전체", seg: "전체", disc15: false, noFlag: false, soon: false, q: "" };

  function listingVisible(it) {
    if (LF.group !== "전체") {
      const g = it.brand_group === "국산" ? "국산"
        : it.brand_group === "제네시스" ? "제네시스" : "수입";
      if (g !== LF.group) return false;
    }
    if (LF.seg !== "전체" && it.segment !== LF.seg) return false;
    if (LF.disc15 && !(it.discount_ref >= 0.15)) return false;
    if (LF.noFlag && (it.constraint_flags || []).length) return false;
    if (LF.soon) {
      if (!it.deadline_iso) return false;
      const left = new Date(it.deadline_iso).getTime() - Date.now();
      if (left < 0 || left > 86400000) return false;
    }
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
      : `${it.year ?? ""} ${esc(it.model)} · 할인 ${pct(it.discount_ref)}`;
    const line = it.low_sample
      ? `최저 ${man(it.min_bid)} · 시세중앙(참고) ${man(it.encar_median)}(표본 ${it.encar_count ?? 0}) · ${km(it.mileage_km)}`
      : `최저 ${man(it.min_bid)} · 기준가(${esc(it.ref_label)}) ${man(it.ref_price)} · 입찰상한 ${man(it.bid_cap)} · ${km(it.mileage_km)}`;
    return `<li><span class="date">${esc(it.deadline || "마감 미상")}</span>
      <h3>${title}</h3><p class="line">${line}</p>
      <div class="tags">${tags.join("")}</div>
      <p class="src">${esc(it.region || "")}
        <a href="${esc(it.detail_url)}" target="_blank" rel="noopener">automart 상세</a>${
        it.encar_url ? ` <a href="${esc(it.encar_url)}" target="_blank" rel="noopener">엔카 시세</a>` : ""}</p></li>`;
  }

  function renderListings() {
    const all = (D.listings && D.listings.items) || [];
    const vis = all.filter((i) => !i.low_sample).filter(listingVisible);
    const low = all.filter((i) => i.low_sample).filter(listingVisible);
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

  function resultItem(r) {
    const won = r.outcome === "낙찰";
    let line;
    if (won) {
      const base = r.ref_price || r.encar_median;
      const baseLabel = r.ref_price ? "기준가" : "시세중앙";
      const diff = base && r.winning_price != null ? base - r.winning_price : null;
      line = `낙찰 ${man(r.winning_price)}` +
        (base ? ` · ${baseLabel} ${man(base)}` : "") +
        (diff != null ? ` · 차액 ${diff >= 0 ? "+" : "-"}${man(diff)}` : "") +
        (r.bidder_count ? ` · 입찰 ${r.bidder_count}명` : "");
    } else {
      const base = r.ref_price || r.encar_median;
      line = `최저 ${man(r.min_bid_price)}` +
        (base ? ` · ${r.ref_price ? "기준가" : "시세중앙"} ${man(base)}` : "");
    }
    return `<li><span class="date">${esc(r.date || "")}</span>
      <h3><span class="tag ${won ? "blue" : ""}">${won ? "낙찰" : "유찰"}</span>
        ${r.year ?? ""} ${esc(r.model)}</h3>
      <p class="line">${line}</p>
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
    bars($("#b-bars"), s.bands || []);
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

  /* ---------------- dispatch ---------------- */
  const inits = { listings: initListings, results: initResults, stats: initStats, costs: initCosts };
  const init = inits[document.body.dataset.page];
  if (init) {
    try { init(); } catch (e) {
      const el = $("#list") || $("#meta") || document.body;
      el.textContent = "데이터 로드 실패 — data/*.js 가 없거나 손상됨";
    }
  }
})();
