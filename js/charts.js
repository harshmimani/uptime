// Lightweight SVG charts as strings: a single-series line and a bar strip. No library.
// Colours come from CSS (classes below), so the tokens and the contrast test stay in charge.
// Every chart carries an aria-label summary plus a visually hidden table, and each point is a
// target for the tap/hover readout wired up in the page (data-i on .chart__hit).

const W = 320;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const r1 = (v) => Math.round(v * 10) / 10;

/** Nice-ish bounds with a little headroom so the line never touches the edge. */
function bounds(vals, minSpan) {
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi - lo < minSpan) { const mid = (hi + lo) / 2; lo = mid - minSpan / 2; hi = mid + minSpan / 2; }
  const pad = (hi - lo) * 0.12;
  return [lo - pad, hi + pad];
}

/**
 * points: [{ x: label for the axis/readout, y: number, read: readout text }]
 * opts: { label (aria), fmt (y → text), minSpan, height, lowerIsBetter }
 */
export function lineChart(points, { label, fmt = (v) => String(v), minSpan = 1, height = 132, lowerIsBetter = false, neutral = false } = {}) {
  const H = height, top = 18, bottom = H - 22, left = 6, right = W - 6;
  const ys = points.map((p) => p.y);
  const [lo, hi] = bounds(ys, minSpan);
  const n = points.length;
  const X = (i) => (n === 1 ? (left + right) / 2 : left + ((right - left) * i) / (n - 1));
  const Y = (v) => bottom - ((v - lo) / (hi - lo)) * (bottom - top);
  const xy = points.map((p, i) => [r1(X(i)), r1(Y(p.y))]);
  const path = xy.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" ");
  const area = n > 1 ? `${path} L${xy[n - 1][0]} ${bottom} L${xy[0][0]} ${bottom} Z` : "";
  const last = xy[n - 1];
  const best = lowerIsBetter ? Math.min(...ys) : Math.max(...ys);
  const lastText = fmt(points[n - 1].y);
  const anchor = last[0] > W - 60 ? "end" : last[0] < 60 ? "start" : "middle";
  const hits = points.map((p, i) => {
    const x0 = n === 1 ? left : i === 0 ? left : (xy[i - 1][0] + xy[i][0]) / 2;
    const x1 = n === 1 ? right : i === n - 1 ? right : (xy[i][0] + xy[i + 1][0]) / 2;
    return `<rect class="chart__hit" data-i="${i}" x="${r1(x0)}" y="0" width="${r1(x1 - x0)}" height="${H}"/>`;
  }).join("");
  const summary = `${label}: ${n} ${n === 1 ? "entry" : "entries"}, latest ${lastText}${n > 1 ? `, ${lowerIsBetter ? "best (lowest)" : "best"} ${fmt(best)}` : ""}.`;
  return `<figure class="chart${neutral ? " chart--neutral" : ""}" tabindex="0" data-points='${esc(JSON.stringify(points.map((p) => p.read)))}'>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(summary)}" focusable="false">
      <line class="chart__base" x1="${left}" x2="${right}" y1="${bottom + 0.5}" y2="${bottom + 0.5}"/>
      ${area ? `<path class="chart__area" d="${area}"/>` : ""}
      ${n > 1 ? `<path class="chart__line" d="${path}"/>` : ""}
      ${xy.map(([x, y], i) => `<circle class="chart__dot${i === n - 1 ? " chart__dot--last" : ""}" cx="${x}" cy="${y}" r="${i === n - 1 ? 5 : 3}"/>`).join("")}
      <text class="chart__val" x="${last[0]}" y="${Math.max(12, last[1] - 10)}" text-anchor="${anchor}">${esc(lastText)}</text>
      <text class="chart__axis" x="${left}" y="${H - 4}">${esc(points[0].x)}</text>
      ${n > 1 ? `<text class="chart__axis" x="${right}" y="${H - 4}" text-anchor="end">${esc(points[n - 1].x)}</text>` : ""}
      <line class="chart__cursor" x1="0" x2="0" y1="${top - 6}" y2="${bottom}" hidden/>
      ${hits}
    </svg>
    <figcaption class="chart__read meta" aria-live="polite">${esc(points[n - 1].read)}</figcaption>
    <div class="sr-only"><table><caption>${esc(label)}</caption><tbody>${points.map((p) => `<tr><td>${esc(p.read)}</td></tr>`).join("")}</tbody></table></div>
  </figure>`;
}

/**
 * Rolling-week strip: one bar per 7-day block (oldest left), height = sessions,
 * filled green when the block reached at least Minimum, outlined when it didn't.
 * weeks: [{ x, value, met, read, current }]
 */
export function weekBars(weeks, { label, height = 116 } = {}) {
  const H = height, top = 16, bottom = H - 22, n = weeks.length;
  const max = Math.max(4, ...weeks.map((w) => w.value));
  const slot = W / n, bw = Math.min(26, slot - 10);
  const bars = weeks.map((w, i) => {
    const cx = slot * i + slot / 2;
    const h = w.value ? Math.max(6, ((bottom - top) * w.value) / max) : 0;
    const y = bottom - h;
    const bar = h ? `<path class="bars__bar${w.met ? " bars__bar--met" : ""}" d="M${r1(cx - bw / 2)} ${bottom} V${r1(y + 4)} a4 4 0 0 1 4 -4 H${r1(cx + bw / 2 - 4)} a4 4 0 0 1 4 4 V${bottom} Z"/>`
      : `<line class="bars__zero" x1="${r1(cx - bw / 2)}" x2="${r1(cx + bw / 2)}" y1="${bottom - 1}" y2="${bottom - 1}"/>`;
    return `${bar}<text class="chart__axis${w.current ? " chart__axis--now" : ""}" x="${r1(cx)}" y="${H - 4}" text-anchor="middle">${esc(w.x)}</text>
      ${w.value ? `<text class="chart__num" x="${r1(cx)}" y="${r1(y - 5)}" text-anchor="middle">${w.value}</text>` : ""}
      <rect class="chart__hit" data-i="${i}" x="${r1(slot * i)}" y="0" width="${r1(slot)}" height="${H}"/>`;
  }).join("");
  const met = weeks.filter((w) => w.met).length;
  return `<figure class="chart chart--bars" tabindex="0" data-points='${esc(JSON.stringify(weeks.map((w) => w.read)))}'>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`${label}: ${met} of ${n} weeks reached at least Minimum.`)}" focusable="false">
      <line class="chart__base" x1="0" x2="${W}" y1="${bottom + 0.5}" y2="${bottom + 0.5}"/>
      ${bars}
    </svg>
    <figcaption class="chart__read meta" aria-live="polite">${esc(weeks[n - 1].read)}</figcaption>
    <div class="sr-only"><table><caption>${esc(label)}</caption><tbody>${weeks.map((w) => `<tr><td>${esc(w.read)}</td></tr>`).join("")}</tbody></table></div>
  </figure>`;
}

/**
 * Tap, hover and arrow-key readout for every chart inside `root`. Call once per page.
 * The readout line under the chart shows the point; a thin cursor marks it on line charts.
 */
export function wireCharts(root) {
  const pick = (fig, i) => {
    const pts = JSON.parse(fig.dataset.points || "[]");
    if (!pts.length) return;
    i = Math.max(0, Math.min(pts.length - 1, i));
    fig.dataset.sel = i;
    fig.querySelector(".chart__read").textContent = pts[i];
    const hit = fig.querySelector(`.chart__hit[data-i="${i}"]`);
    const cur = fig.querySelector(".chart__cursor");
    fig.querySelectorAll(".chart__hit.on").forEach((h) => h.classList.remove("on"));
    hit?.classList.add("on");
    if (cur && hit) {
      const dot = fig.querySelectorAll(".chart__dot")[i];
      const x = dot ? dot.getAttribute("cx") : Number(hit.getAttribute("x")) + Number(hit.getAttribute("width")) / 2;
      cur.setAttribute("x1", x); cur.setAttribute("x2", x); cur.hidden = false;
    }
  };
  const onHit = (ev) => {
    const hit = ev.target.closest?.(".chart__hit");
    if (hit) pick(hit.closest(".chart"), Number(hit.dataset.i));
  };
  root.addEventListener("pointerover", onHit);
  root.addEventListener("click", onHit);
  root.addEventListener("keydown", (ev) => {
    const fig = ev.target.closest?.(".chart");
    if (!fig || (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight")) return;
    ev.preventDefault();
    const n = JSON.parse(fig.dataset.points || "[]").length;
    const cur = fig.dataset.sel != null ? Number(fig.dataset.sel) : n - 1;
    pick(fig, cur + (ev.key === "ArrowRight" ? 1 : -1));
  });
}
