"use strict";

const demos = window.msarmDemos;
const byId = id => document.getElementById(id);
const chart = byId("chart");
const ctx = chart.getContext("2d");
const slider = byId("inspect");
const observed = "#536170";
const blue = "#527caa";
const mint = "#235c95";
const orange = "#a25424";
let model = "level";
let view = "smoothed";
let sampleStep = 120;
let horizon = 1;

const views = {
  smoothed: ["Series and smoothed regimes", "Smoothed probabilities use the full observed series."],
  filtered: ["Series and filtered regimes", "Filtered probabilities use observations available at each time step."],
  forecast: ["Forecast and prediction intervals", "The forecast line shows the conditional mean. Shaded regions show 80% and 95% pointwise residual-bootstrap intervals."]
};

function table(id, rows) {
  byId(id).replaceChildren(...rows.map(([name, truth, estimate]) => {
    const tr = document.createElement("tr");
    const label = document.createElement("th");
    label.scope = "row";
    label.textContent = name;
    tr.append(label);
    for (const value of [truth, estimate]) {
      const cell = document.createElement("td");
      cell.textContent = value.toFixed(3);
      tr.append(cell);
    }
    return tr;
  }));
}

function update() {
  const data = demos[model];
  const forecasting = view === "forecast";
  byId("chart-title").textContent = views[view][0];
  byId("chart-description").textContent = views[view][1];
  const legend = forecasting
    ? [["Observed", observed], ["Point forecast", mint], ["80% interval", "#b4cce4"], ["95% interval", "#e2ecf6"]]
    : [["Observed", observed], ["Fitted", blue], ["Regime 1", mint], ["Regime 2", orange]];
  byId("legend").replaceChildren(...legend.map(([label, color]) => {
    const item = document.createElement("span");
    item.style.setProperty("--series", color);
    item.textContent = label;
    return item;
  }));
  slider.min = forecasting ? 1 : 2;
  slider.max = forecasting ? data.forecast.length : data.y.length;
  slider.value = forecasting ? horizon : sampleStep;
  slider.labels[0].firstChild.textContent = forecasting ? "Forecast horizon " : "Observation ";
  const parameterNames = ["Intercept", "AR(1)", "Variance"];
  table("parameters", data.parameters.flatMap((row, regime) =>
    row.map((estimate, column) => [
      `R${regime + 1} ${parameterNames[column]}`, data.trueParameters[regime][column], estimate
    ])
  ));
  table("transition", data.transition.flatMap((row, to) =>
    row.map((estimate, from) => [
      `R${from + 1} to R${to + 1}`, data.trueTransition[to][from], estimate
    ])
  ));
  const errors = data.decoded.filter((state, i) => state !== data.trueState[i + 1]).length;
  byId("metrics").replaceChildren(...["Log-likelihood", "RSS", "RCM", "Entropy", "Classification error"].map((name, i) => {
    const group = document.createElement("div");
    const term = document.createElement("dt");
    const value = document.createElement("dd");
    term.textContent = name;
    value.textContent = i === 4 ? `${(100 * errors / data.decoded.length).toFixed(1)}%` : data.metrics[i].toFixed(i === 3 ? 3 : 2);
    group.append(term, value);
    return group;
  }));
  inspect();
}

function inspect() {
  const data = demos[model];
  const step = Number(slider.value);
  byId("step").textContent = step;
  if (view === "forecast") {
    horizon = step;
    const i = step - 1;
    byId("values").textContent = `Mean ${data.forecast[i].toFixed(2)} · 95% interval [${data.bands[1][i].toFixed(2)}, ${data.bands[4][i].toFixed(2)}] · P(Regime 1) ${data.future[0][i].toFixed(2)}`;
  } else {
    sampleStep = step;
    const probabilities = view === "filtered" ? data.filtered : data.smooth;
    byId("values").textContent = `Observed ${data.y[step - 1].toFixed(2)} \u00b7 True regime ${data.trueState[step - 1]} · P(Regime 1) ${probabilities[0][step - 2].toFixed(2)} · P(Regime 2) ${probabilities[1][step - 2].toFixed(2)}`;
  }
  draw();
}

function draw() {
  const data = demos[model];
  const w = chart.clientWidth;
  const h = chart.clientHeight;
  if (!w || !h) return;
  const ratio = window.devicePixelRatio || 1;
  chart.width = Math.round(w * ratio);
  chart.height = Math.round(h * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  const forecasting = view === "forecast";
  const n = data.y.length;
  const start = forecasting ? n - 64 : 1;
  const end = forecasting ? n + data.forecast.length : n;
  const x = t => 42 + (t - start) / (end - start) * (w - 58);
  const top = 16;
  const bottom = forecasting ? h - 34 : h * .55;
  const range = forecasting ? [...data.y.slice(start - 1), ...data.bands[1], ...data.bands[4]] : [...data.y, ...data.fitted];
  const minimum = Math.floor(Math.min(...range));
  const maximum = Math.ceil(Math.max(...range));
  const y = value => bottom - (value - minimum) / (maximum - minimum) * (bottom - top);
  const probY = value => h - 34 - value * (h - 34 - bottom - 27);
  ctx.font = "11px system-ui";
  ctx.lineJoin = "round";

  function grid(ticks, coordinate) {
    ctx.textAlign = "right";
    for (const tick of ticks) {
      const position = coordinate(tick);
      ctx.strokeStyle = "#e3e7eb";
      ctx.beginPath();
      ctx.moveTo(42, position);
      ctx.lineTo(w - 16, position);
      ctx.stroke();
      ctx.fillStyle = "#555f69";
      ctx.fillText(Number(tick.toFixed(1)), 35, position + 4);
    }
  }

  function line(values, first, coordinate, color, width = 1.5) {
    ctx.beginPath();
    values.forEach((value, i) => {
      if (i === 0) ctx.moveTo(x(first), coordinate(value));
      else ctx.lineTo(x(first + i), coordinate(value));
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
    ctx.lineWidth = 1;
  }

  function band(low, high, color) {
    ctx.beginPath();
    ctx.moveTo(x(n), y(data.y[n - 1]));
    low.forEach((value, i) => ctx.lineTo(x(n + i + 1), y(value)));
    for (let i = high.length - 1; i >= 0; i--) ctx.lineTo(x(n + i + 1), y(high[i]));
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  grid([minimum, (minimum + maximum) / 2, maximum], y);
  if (forecasting) {
    band(data.bands[1], data.bands[4], "#e2ecf6");
    band(data.bands[2], data.bands[3], "#b4cce4");
    line(data.y.slice(start - 1), start, y, observed);
    line([data.y[n - 1], ...data.forecast], n, y, mint, 2);
  } else {
    line(data.y, 1, y, observed);
    line(data.fitted, n - data.fitted.length + 1, y, blue);
    grid([0, .5, 1], probY);
    const probabilities = view === "filtered" ? data.filtered : data.smooth;
    line(probabilities[1], 2, probY, orange);
    line(probabilities[0], 2, probY, mint, 2);
  }
  const cursor = forecasting ? n + horizon : sampleStep;
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = "#697a8b";
  ctx.beginPath();
  ctx.moveTo(x(cursor), top);
  ctx.lineTo(x(cursor), h - 34);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#555f69";
  const ticks = forecasting ? [start, n - 32, n, n + 12, end] : Array.from({ length: 5 }, (_, i) => 1 + Math.round(i * (n - 1) / 4));
  ticks.forEach((tick, i) => {
    ctx.textAlign = i === 0 ? "left" : i === ticks.length - 1 ? "right" : "center";
    ctx.fillText(tick > n ? `+${tick - n}` : tick, x(tick), h - 14);
  });
}

for (const group of ["model", "view"]) {
  const buttons = document.querySelectorAll(`[data-${group}]`);
  buttons.forEach(button => button.addEventListener("click", () => {
    if (group === "model") model = button.dataset.model;
    else view = button.dataset.view;
    buttons.forEach(item => item.setAttribute("aria-pressed", String(item === button)));
    update();
  }));
}
slider.addEventListener("input", inspect);
new ResizeObserver(draw).observe(chart);

const comparison = byId("comparison-chart");
function drawComparison() {
  const width = comparison.clientWidth;
  const height = comparison.clientHeight;
  if (!width || !height) return;
  const ratio = window.devicePixelRatio || 1;
  comparison.width = Math.round(width * ratio);
  comparison.height = Math.round(height * ratio);
  const context = comparison.getContext("2d");
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.font = "13px system-ui";
  const left = 65;
  const right = width - 12;
  const truth = demos.level.trueState.slice(1);
  // The benchmark records a posterior-mode assignment of 159:0 after alignment.
  const paths = [["True", truth], ["MSARM", demos.level.decoded], ["MSwM", truth.map(() => 1)]];
  const unit = (right - left) / truth.length;
  paths.forEach(([label, states], row) => {
    const top = 14 + row * 32;
    context.fillStyle = "#25282c";
    context.fillText(label, 8, top + 14);
    for (let start = 0; start < states.length;) {
      let end = start + 1;
      while (states[end] === states[start]) end++;
      context.fillStyle = states[start] === 1 ? mint : orange;
      context.fillRect(left + start * unit, top, (end - start) * unit, 19);
      start = end;
    }
  });
  context.fillStyle = "#555f69";
  context.fillText("2", left, 122);
  context.textAlign = "right";
  context.fillText("160", right, 122);
}
new ResizeObserver(drawComparison).observe(comparison);
byId("show-case").addEventListener("click", () => {
  document.querySelector('[data-model="level"]').click();
  document.querySelector('[data-view="smoothed"]').click();
});
byId("copy").addEventListener("click", async () => {
  const button = byId("copy");
  try {
    await navigator.clipboard.writeText(byId("r-code").textContent);
    button.textContent = "Copied";
  } catch {
    const range = document.createRange();
    range.selectNodeContents(byId("r-code"));
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    button.textContent = "Code selected";
  }
  setTimeout(() => { button.textContent = "Copy code"; }, 1800);
});
update();
