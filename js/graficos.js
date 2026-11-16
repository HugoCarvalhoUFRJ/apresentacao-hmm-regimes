/* Utilitários de gráfico em SVG: escalas, eixos, elipses de covariância, dica flutuante e números aleatórios com semente.
   Cores sempre por token CSS: passar "var(--nome)" em fill/stroke. */
(function () {
  "use strict";

  const NS = "http://www.w3.org/2000/svg";
  const COMO_ESTILO = new Set(["fill", "stroke", "stroke-width", "opacity", "fill-opacity", "stroke-opacity", "stroke-dasharray"]);

  function el(tag, attrs, pai) {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === "texto") n.textContent = v;
      else if (COMO_ESTILO.has(k)) n.style.setProperty(k, v);
      else n.setAttribute(k, v);
    }
    if (pai) pai.appendChild(n);
    return n;
  }

  /* Número com vírgula decimal e sinal de menos tipográfico. */
  function numero(x, casas = 0) {
    return x.toFixed(casas).replace(".", ",").replace("-", "−");
  }

  const SOBRESCRITOS = { "-": "⁻", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };

  /* 10 elevado a um inteiro, como texto: 10⁻³. */
  function decada(p) { return "10" + String(p).split("").map(c => SOBRESCRITOS[c]).join(""); }

  /* Notação científica curta: 1,2×10⁻³. */
  function cientifico(x, casas = 1) {
    if (x === null || !Number.isFinite(x) || x === 0) return "—";
    const [m, e] = x.toExponential(casas).split("e");
    return `${m.replace(".", ",")}×${decada(parseInt(e, 10))}`;
  }

  function marcas(a, b, n) {
    const bruto = (b - a) / Math.max(1, n);
    const pot = Math.pow(10, Math.floor(Math.log10(bruto)));
    const r = bruto / pot;
    const passo = (r <= 1 ? 1 : r <= 2 ? 2 : r <= 5 ? 5 : 10) * pot;
    const out = [];
    for (let v = Math.ceil(a / passo - 1e-9) * passo; v <= b + passo * 1e-9; v += passo) out.push(Math.abs(v) < passo * 1e-9 ? 0 : v);
    return out;
  }

  function linear(d0, d1, r0, r1) {
    const f = x => r0 + (x - d0) * (r1 - r0) / (d1 - d0);
    f.inversa = y => d0 + (y - r0) * (d1 - d0) / (r1 - r0);
    f.marcas = n => marcas(d0, d1, n);
    return f;
  }

  /* Área de plotagem com grade, eixos e títulos. `caixa` = {esq, dir, topo, base} em unidades do viewBox. */
  function eixos(svg, x, y, caixa, { rotuloX = "", rotuloY = "", nX = 6, nY = 6, casas = 0, marcasX, marcasY, fmtX, fmtY } = {}) {
    const g = el("g", {}, svg);
    for (const v of marcasY || y.marcas(nY)) {
      el("line", { x1: caixa.esq, x2: caixa.dir, y1: y(v), y2: y(v), stroke: "var(--grade)", "stroke-width": "1.5px" }, g);
      el("text", { x: caixa.esq - 12, y: y(v) + 9, "text-anchor": "end", texto: fmtY ? fmtY(v) : numero(v, casas) }, g);
    }
    for (const v of marcasX || x.marcas(nX)) {
      el("line", { x1: x(v), x2: x(v), y1: caixa.topo, y2: caixa.base, stroke: "var(--grade)", "stroke-width": "1.5px" }, g);
      el("text", { x: x(v), y: caixa.base + 34, "text-anchor": "middle", texto: fmtX ? fmtX(v) : numero(v, casas) }, g);
    }
    el("line", { x1: caixa.esq, x2: caixa.dir, y1: caixa.base, y2: caixa.base, stroke: "var(--eixo)", "stroke-width": "2px" }, g);
    el("line", { x1: caixa.esq, x2: caixa.esq, y1: caixa.topo, y2: caixa.base, stroke: "var(--eixo)", "stroke-width": "2px" }, g);
    if (rotuloX) el("text", { x: (caixa.esq + caixa.dir) / 2, y: caixa.base + 72, "text-anchor": "middle", texto: rotuloX }, g);
    if (rotuloY) {
      const ym = (caixa.topo + caixa.base) / 2;
      el("text", { transform: `translate(${caixa.esq - 76},${ym}) rotate(-90)`, "text-anchor": "middle", texto: rotuloY }, g);
    }
    return g;
  }

  /* Caminho da elipse {x : (x−μ)ᵀ Σ⁻¹ (x−μ) = nSigma²} para Σ 2×2. */
  function caminhoElipse(mu, S, nSigma, x, y, n = 72) {
    const l11 = Math.sqrt(S[0][0]), l21 = S[1][0] / l11, l22 = Math.sqrt(Math.max(S[1][1] - l21 * l21, 0));
    let d = "";
    for (let i = 0; i < n; i++) {
      const t = 2 * Math.PI * i / n, a = nSigma * Math.cos(t), b = nSigma * Math.sin(t);
      d += `${i ? "L" : "M"}${x(mu[0] + l11 * a).toFixed(1)} ${y(mu[1] + l21 * a + l22 * b).toFixed(1)}`;
    }
    return d + "Z";
  }

  /* Raio de Mahalanobis da elipse com probabilidade p de uma normal 2D: r² = −2 ln(1−p) (χ² com 2 g.l.). */
  function raioProb2d(p) { return Math.sqrt(-2 * Math.log(1 - p)); }

  /* Gerador com semente (mulberry32) e normal por Box–Muller. */
  function aleatorio(semente) {
    let s = semente >>> 0, reserva = null;
    function u() {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    function normal() {
      if (reserva !== null) { const r = reserva; reserva = null; return r; }
      const a = 2 * Math.PI * u(), r = Math.sqrt(-2 * Math.log(1 - u()));
      reserva = r * Math.sin(a);
      return r * Math.cos(a);
    }
    return { u, normal };
  }

  /* Densidade normal bivariada. */
  function normal2d(p, mu, S) {
    const det = S[0][0] * S[1][1] - S[0][1] * S[1][0];
    const dx = p[0] - mu[0], dy = p[1] - mu[1];
    const q = (S[1][1] * dx * dx - 2 * S[0][1] * dx * dy + S[0][0] * dy * dy) / det;
    return Math.exp(-0.5 * q) / (2 * Math.PI * Math.sqrt(det));
  }

  /* Dica flutuante posicionada em coordenadas do contêiner (independe da escala do palco). */
  function dica(conteiner) {
    const d = document.createElement("div");
    d.className = "dica";
    conteiner.appendChild(d);
    return {
      mostrar(ev, html) {
        d.innerHTML = html;
        d.style.visibility = "visible";
        const r = conteiner.getBoundingClientRect(), s = r.width / conteiner.offsetWidth;
        let px = (ev.clientX - r.left) / s + 26, py = (ev.clientY - r.top) / s + 26;
        if (px + d.offsetWidth > conteiner.offsetWidth) px -= d.offsetWidth + 52;
        if (py + d.offsetHeight > conteiner.offsetHeight) py -= d.offsetHeight + 52;
        d.style.left = `${px}px`;
        d.style.top = `${py}px`;
      },
      esconder() { d.style.visibility = "hidden"; },
    };
  }

  /* Rótulo sobre mapa: texto com fundo claro, legível sobre qualquer cor. */
  function plaqueta(camada, x, y, texto, ancora = "start") {
    const fundo = el("rect", { fill: "var(--superficie)", "fill-opacity": "0.92", rx: 3 }, camada);
    const t = el("text", { class: "rotulo-mapa", x, y, "text-anchor": ancora, texto }, camada);
    const b = t.getBBox();
    fundo.setAttribute("x", b.x - 8); fundo.setAttribute("y", b.y - 3);
    fundo.setAttribute("width", b.width + 16); fundo.setAttribute("height", b.height + 6);
  }

  /* Posição do ponteiro em unidades do viewBox do svg. */
  function pontoSvg(svg, ev) {
    const m = svg.getScreenCTM().inverse();
    return [m.a * ev.clientX + m.c * ev.clientY + m.e, m.b * ev.clientX + m.d * ev.clientY + m.f];
  }

  window.Graficos = { el, numero, decada, cientifico, linear, eixos, caminhoElipse, raioProb2d, aleatorio, normal2d, dica, plaqueta, pontoSvg };
})();
