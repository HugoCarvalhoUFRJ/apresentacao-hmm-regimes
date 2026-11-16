/* Demonstrações do HMM: máquina com 3 estados ocultos e vibração gaussiana 1D. */
(function () {
  "use strict";
  const G = window.Graficos;

  const ESTADOS = [
    { nome: "Parada", sigla: "P", mu: 1.0, sig: 0.6 },
    { nome: "Normal", sigla: "N", mu: 2.6, sig: 0.7 },
    { nome: "Sobrecarga", sigla: "S", mu: 4.2, sig: 0.8 },
  ];
  const A_VERDADEIRA = [[0.95, 0.04, 0.01], [0.03, 0.95, 0.02], [0.02, 0.03, 0.95]];
  const VERDADE = { pi: [1 / 3, 1 / 3, 1 / 3], A: A_VERDADEIRA, mu: ESTADOS.map(e => e.mu), var: ESTADOS.map(e => e.sig * e.sig) };
  const CORES = ["var(--serie-1)", "var(--serie-2)", "var(--serie-3)"];
  const K = 3, T = 400, SEMENTE_SERIE = 20261118;
  const SEMENTES_BW = [1, 2, 17];      // inicializações do Baum–Welch; a terceira cai em ótimo local
  const TOL_LL = 1e-6, MAX_ITER = 300, QUADRO_MS = 140;
  const X_MAX = 7;
  const JANELA_INI = 170, JANELA_N = 11;  // trecho em que o GMM erra e o Viterbi acerta

  function gerar(n, semente) {
    const r = G.aleatorio(semente), z = [], x = [];
    let s = Math.floor(r.u() * K);
    for (let t = 0; t < n; t++) {
      if (t > 0) {
        let u = r.u(), j = 0;
        while (j < K - 1 && u > A_VERDADEIRA[s][j]) { u -= A_VERDADEIRA[s][j]; j++; }
        s = j;
      }
      z.push(s);
      x.push(ESTADOS[s].mu + ESTADOS[s].sig * r.normal());
    }
    return { z, x };
  }

  const normal1d = (x, mu, v) => Math.exp(-0.5 * (x - mu) * (x - mu) / v) / Math.sqrt(2 * Math.PI * v);
  const emissoes = (x, par) => x.map(v => par.mu.map((m, k) => normal1d(v, m, par.var[k])));

  /* Forward–backward com fatores de escala; devolve γ_t(k), a soma de ξ_t(i,j) e ℓ. */
  function forwardBackward(x, par) {
    const n = x.length, b = emissoes(x, par), a = [], c = new Array(n);
    a[0] = par.pi.map((p, k) => p * b[0][k]);
    c[0] = a[0].reduce((s, v) => s + v, 0);
    a[0] = a[0].map(v => v / c[0]);
    for (let t = 1; t < n; t++) {
      const at = new Array(K);
      for (let k = 0; k < K; k++) {
        let s = 0;
        for (let j = 0; j < K; j++) s += a[t - 1][j] * par.A[j][k];
        at[k] = b[t][k] * s;
      }
      c[t] = at.reduce((s, v) => s + v, 0);
      a[t] = at.map(v => v / c[t]);
    }
    const be = new Array(n);
    be[n - 1] = new Array(K).fill(1);
    for (let t = n - 2; t >= 0; t--) {
      be[t] = new Array(K);
      for (let k = 0; k < K; k++) {
        let s = 0;
        for (let j = 0; j < K; j++) s += par.A[k][j] * b[t + 1][j] * be[t + 1][j];
        be[t][k] = s / c[t + 1];
      }
    }
    const gama = a.map((at, t) => at.map((v, k) => v * be[t][k]));
    const xi = Array.from({ length: K }, () => new Array(K).fill(0));
    for (let t = 0; t < n - 1; t++) {
      for (let i = 0; i < K; i++) for (let j = 0; j < K; j++) xi[i][j] += a[t][i] * par.A[i][j] * b[t + 1][j] * be[t + 1][j] / c[t + 1];
    }
    return { gama, xi, ll: c.reduce((s, v) => s + Math.log(v), 0) };
  }

  /* Sequência de estados de maior probabilidade. */
  function viterbi(x, par) {
    const n = x.length, b = emissoes(x, par), d = [], psi = [];
    d[0] = par.pi.map((p, k) => Math.log(p) + Math.log(b[0][k]));
    for (let t = 1; t < n; t++) {
      d[t] = new Array(K); psi[t] = new Array(K);
      for (let k = 0; k < K; k++) {
        let melhor = -Infinity, arg = 0;
        for (let j = 0; j < K; j++) {
          const v = d[t - 1][j] + Math.log(par.A[j][k]);
          if (v > melhor) { melhor = v; arg = j; }
        }
        d[t][k] = melhor + Math.log(b[t][k]); psi[t][k] = arg;
      }
    }
    const z = new Array(n);
    z[n - 1] = d[n - 1].indexOf(Math.max(...d[n - 1]));
    for (let t = n - 2; t >= 0; t--) z[t] = psi[t + 1][z[t + 1]];
    return z;
  }

  /* Passo M do Baum–Welch. */
  function passoM(x, fb) {
    const n = x.length, { gama, xi } = fb, soma = new Array(K).fill(0), mu = new Array(K).fill(0), va = new Array(K).fill(0);
    for (let t = 0; t < n; t++) for (let k = 0; k < K; k++) { soma[k] += gama[t][k]; mu[k] += gama[t][k] * x[t]; }
    for (let k = 0; k < K; k++) mu[k] /= soma[k];
    for (let t = 0; t < n; t++) for (let k = 0; k < K; k++) va[k] += gama[t][k] * (x[t] - mu[k]) ** 2;
    for (let k = 0; k < K; k++) va[k] /= soma[k];
    const A = xi.map(l => { const s = l.reduce((p, v) => p + v, 0); return l.map(v => v / s); });
    return { pi: gama[0].slice(), A, mu, var: va };
  }

  function inicializar(x, semente) {
    const r = G.aleatorio(semente), usados = new Set();
    while (usados.size < K) usados.add(Math.floor(r.u() * x.length));
    const media = x.reduce((s, v) => s + v, 0) / x.length, v0 = x.reduce((s, v) => s + (v - media) ** 2, 0) / x.length;
    return {
      pi: new Array(K).fill(1 / K), mu: [...usados].map(i => x[i]).sort((a, b) => a - b), var: new Array(K).fill(v0),
      A: Array.from({ length: K }, (_, i) => Array.from({ length: K }, (__, j) => (i === j ? 0.6 : 0.2))),
    };
  }

  /* Matriz com a persistência comum a_ii = p, mantendo as proporções fora da diagonal. */
  function comPersistencia(p) {
    return A_VERDADEIRA.map((l, i) => l.map((v, j) => (i === j ? p : (1 - p) * v / (1 - l[i]))));
  }

  /* Distribuição estacionária de A por iteração de potência. */
  function estacionaria(A) {
    let v = new Array(K).fill(1 / K);
    for (let n = 0; n < 2000; n++) v = v.map((_, j) => v.reduce((s, q, i) => s + q * A[i][j], 0));
    return v;
  }

  function legendaEstados(alvo) {
    const l = document.createElement("div");
    l.className = "legenda-cores";
    l.innerHTML = ESTADOS.map((e, k) => `<span><i style="background:${CORES[k]}"></i>${e.nome} (${e.sigla})</span>`).join("");
    alvo.parentNode.insertBefore(l, alvo);
  }

  function botao(pai, texto, aoClicar) {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = texto;
    b.addEventListener("click", aoClicar);
    pai.appendChild(b);
    return b;
  }
  function grupoBotoes(c) {
    const g = document.createElement("div"); g.className = "botoes";
    c.appendChild(g);
    return g;
  }

  /* Matriz 3×3 em tons de azul. */
  function desenharMatriz(pai, x0, y0, cel, A, titulo, lut, fonte = 28, casas = 2, textos = null) {
    G.el("text", { class: "rotulo-direto", x: x0 + 1.5 * cel, y: y0 - 42, "text-anchor": "middle", texto: titulo }, pai);
    ESTADOS.forEach((e, k) => {
      G.el("text", { x: x0 + (k + 0.5) * cel, y: y0 - 10, "text-anchor": "middle", texto: e.sigla }, pai);
      G.el("text", { x: x0 - 14, y: y0 + (k + 0.5) * cel + 9, "text-anchor": "end", texto: e.sigla }, pai);
    });
    A.forEach((l, i) => l.forEach((v, j) => {
      const a = Math.round(Math.min(1, v) * 255);
      G.el("rect", { x: x0 + j * cel + 1, y: y0 + i * cel + 1, width: cel - 2, height: cel - 2, fill: `rgb(${lut[a * 3]},${lut[a * 3 + 1]},${lut[a * 3 + 2]})` }, pai);
      G.el("text", { x: x0 + (j + 0.5) * cel, y: y0 + (i + 0.5) * cel + 10, "text-anchor": "middle", style: `font-size: ${fonte}px; font-weight: 600; fill: ${v > 0.5 ? "var(--sobre-escuro)" : "var(--tinta)"}`, texto: textos ? textos[i][j] : G.numero(v, casas) }, pai);
    }));
  }

  /* Densidades de emissão: estimadas em traço cheio e, opcionalmente, verdadeiras tracejadas. */
  function desenharEmissoes(pai, caixa, par, comVerdade) {
    const dens = (mu, v) => normal1d(mu, mu, v);
    const valido = k => Number.isFinite(par.mu[k]) && par.var[k] > 0;
    const topo = Math.max(...par.mu.map((m, k) => (valido(k) ? dens(m, par.var[k]) : 0)), ...VERDADE.mu.map((m, k) => dens(m, VERDADE.var[k]))) * 1.08;
    const x = G.linear(0, X_MAX, caixa.esq, caixa.dir), y = G.linear(0, topo, caixa.base, caixa.topo);
    G.eixos(pai, x, y, caixa, { rotuloX: "Vibração (mm/s)", rotuloY: "Densidade", nX: 4, nY: 3, casas: 1, fmtX: v => G.numero(v, 0) });
    const curva = (mu, v) => {
      let d = "";
      for (let i = 0; i <= 140; i++) { const q = i / 140 * X_MAX; d += `${i ? "L" : "M"}${x(q).toFixed(1)} ${y(normal1d(q, mu, v)).toFixed(1)}`; }
      return d;
    };
    if (comVerdade) VERDADE.mu.forEach((m, k) => G.el("path", { d: curva(m, VERDADE.var[k]), fill: "none", stroke: "var(--tinta)", "stroke-width": "3px", "stroke-dasharray": "10 8" }, pai));
    par.mu.forEach((m, k) => { if (valido(k)) G.el("path", { d: curva(m, par.var[k]), fill: "none", stroke: CORES[k], "stroke-width": "4px" }, pai); });
  }

  /* Modelo gráfico: cadeia de Markov oculta e observações geradas por ela. */
  function grafo(alvo) {
    const L = 800, H = 300, xs = [190, 420, 650], yZ = 74, yX = 236, r = 48;
    const svg = G.el("svg", { viewBox: `0 0 ${L} ${H}`, role: "img", "aria-label": "Cadeia de Markov oculta e observações" }, alvo);
    const E = window.Esquemas;
    G.el("text", { class: "rotulo-direto", x: 0, y: yZ + 10, texto: "Oculto" }, svg);
    G.el("text", { class: "rotulo-direto", x: 0, y: yX + 10, texto: "Observado" }, svg);
    const indices = ["t−1", "t", "t+1"];
    xs.forEach((x, k) => {
      if (k < 2) E.seta(svg, x + r + 6, yZ, xs[k + 1] - r - 6, yZ, { largura: 3.5, ponta: 8 });
      E.seta(svg, x, yZ + r + 6, x, yX - r - 6, { largura: 3.5, ponta: 8 });
      G.el("circle", { cx: x, cy: yZ, r, fill: "var(--marinho)" }, svg);
      G.el("circle", { cx: x, cy: yX, r, fill: "var(--azul-100)", stroke: "var(--marinho)", "stroke-width": "3px" }, svg);
      const rotulo = (y, letra, cor) => {
        const n = G.el("text", { x, y: y + 11, "text-anchor": "middle", style: `font-size: 36px; font-style: italic; font-family: var(--serifa); fill: ${cor}` }, svg);
        n.innerHTML = `${letra}<tspan dy="9" style="font-size: 23px">${indices[k]}</tspan>`;
      };
      rotulo(yZ, "z", "var(--sobre-escuro)");
      rotulo(yX, "x", "var(--tinta)");
    });
    E.seta(svg, xs[2] + r + 6, yZ, L - 20, yZ, { largura: 3.5, ponta: 8, cor: "var(--eixo)" });
  }

  /* Sequência gerada pelo modelo. */
  function modelo({ serie, controles }) {
    legendaEstados(serie);
    const L = 907, H = 540, cx = { esq: 104, dir: L - 34, topo: 12, base: H - 76 };
    const svg = G.el("svg", { viewBox: `0 0 ${L} ${H}`, role: "img", "aria-label": "Sequência gerada pelo modelo" }, serie);
    const xS = G.linear(0, T, cx.esq, cx.dir), yS = G.linear(-1, X_MAX, cx.base, cx.topo);
    G.eixos(svg, xS, yS, cx, { rotuloX: "t", rotuloY: "Vibração x (mm/s)", nY: 4, nX: 8, casas: 0 });
    const linha = G.el("path", { fill: "none", stroke: "var(--eixo)", "stroke-width": "2px" }, svg);
    const pontos = G.el("g", {}, svg);
    let semente = SEMENTE_SERIE, comEstados = true;
    function desenhar() {
      const { z, x } = gerar(T, semente);
      linha.setAttribute("d", x.map((v, t) => `${t ? "L" : "M"}${xS(t).toFixed(1)} ${yS(v).toFixed(1)}`).join(""));
      pontos.replaceChildren();
      x.forEach((v, t) => G.el("circle", { cx: xS(t), cy: yS(v), r: 4.5, fill: comEstados ? CORES[z[t]] : "var(--tinta-2)" }, pontos));
    }
    const acoes = grupoBotoes(controles);
    botao(acoes, "Nova sequência", () => { semente += 1; desenhar(); });
    window.Mapas.botoes(grupoBotoes(controles), [["com", "Com estados"], ["sem", "Sem estados"]], "com", c => { comEstados = c === "com"; desenhar(); });
    desenhar();
  }

  /* Matriz de transição e distribuições de emissão do exemplo. */
  function parametros(alvo) {
    legendaEstados(alvo);
    const lut = window.Mapas.lutParadas(getComputedStyle(alvo), window.Mapas.ETAPAS_RAMPA);
    const svg = G.el("svg", { viewBox: "0 0 907 470", role: "img", "aria-label": "Matriz de transição e distribuições de emissão", preserveAspectRatio: "xMidYMin meet" }, alvo);
    desenharMatriz(svg, 48, 76, 112, A_VERDADEIRA, "Matriz A", lut);
    desenharEmissoes(svg, { esq: 500, dir: 890, topo: 30, base: 380 }, VERDADE, false);
  }

  /* Classificação sem tempo: componente de maior responsabilidade, com pesos estacionários. */
  function classificarGMM(x, A) {
    const pesos = estacionaria(A), b = emissoes(x, VERDADE);
    return b.map(l => { const q = l.map((v, k) => v * pesos[k]); return q.indexOf(Math.max(...q)); });
  }

  /* GMM em 1D: observações no eixo x, sem ordem temporal, com as regiões de decisão. */
  function gmmSemTempo(alvo) {
    legendaEstados(alvo);
    const { x, z } = gerar(T, SEMENTE_SERIE), pesos = estacionaria(A_VERDADEIRA), classe = classificarGMM(x, A_VERDADEIRA);
    const L = 785, H = 560, cx = { esq: 100, dir: L - 20, topo: 14, base: H - 76 }, baseDens = cx.base - 110;
    const svg = G.el("svg", { viewBox: `0 0 ${L} ${H}`, role: "img", "aria-label": "Observações sem ordem temporal, com a classificação do GMM" }, alvo);
    const dens = (v, k) => pesos[k] * normal1d(v, VERDADE.mu[k], VERDADE.var[k]);
    const topo = Math.max(...VERDADE.mu.map((m, k) => dens(m, k))) * 1.08;
    const xS = G.linear(-1, X_MAX, cx.esq, cx.dir), yS = G.linear(0, topo, baseDens, cx.topo);
    const regioes = [];
    let ini = -1, atual = null;
    for (let i = 0; i <= 800; i++) {
      const v = -1 + i / 100, q = [0, 1, 2].map(k => dens(v, k)), c = q.indexOf(Math.max(...q));
      if (atual === null) atual = c;
      if (c !== atual || i === 800) { regioes.push({ a: ini, b: v, k: atual }); ini = v; atual = c; }
    }
    regioes.forEach(r => G.el("rect", { x: xS(r.a), y: cx.topo, width: xS(r.b) - xS(r.a), height: cx.base - cx.topo, fill: CORES[r.k], "fill-opacity": "0.12" }, svg));
    G.eixos(svg, xS, yS, cx, { rotuloX: "Vibração x (mm/s)", rotuloY: "Densidade ponderada", marcasY: [0, 0.1, 0.2], casas: 1, nX: 8, fmtX: v => G.numero(v, 0) });
    G.el("line", { x1: cx.esq, x2: cx.dir, y1: baseDens, y2: baseDens, stroke: "var(--eixo)", "stroke-width": "2px" }, svg);
    VERDADE.mu.forEach((m, k) => {
      let d = "";
      for (let i = 0; i <= 160; i++) { const v = -1 + i / 20; d += `${i ? "L" : "M"}${xS(v).toFixed(1)} ${yS(dens(v, k)).toFixed(1)}`; }
      G.el("path", { d, fill: "none", stroke: CORES[k], "stroke-width": "4px" }, svg);
    });
    const r = G.aleatorio(SEMENTE_SERIE + 1);
    const erros = G.el("g", {}, svg);
    x.forEach((v, t) => {
      const cy = baseDens + 14 + r.u() * 82;
      G.el("circle", { class: "marcador", cx: xS(v), cy, r: 6, fill: CORES[classe[t]] }, svg);
      if (classe[t] !== z[t]) G.el("circle", { cx: xS(v), cy, r: 2.6, fill: "var(--tinta)" }, erros);
    });
    svg.appendChild(erros);
    alvo._gmm = { erros: erros.children.length };
  }

  /* Faixas de estados: verdade, GMM e Viterbi, com a persistência a_ii ajustável. */
  function decodificacao({ alvo, controles }) {
    const { z, x } = gerar(T, SEMENTE_SERIE);
    const L = 907, H = 540, cx = { esq: 300, dir: L - 100, topo: 12, base: 240 };
    const svg = G.el("svg", { viewBox: `0 0 ${L} ${H}`, role: "img", "aria-label": "Estados estimados por cada método" }, alvo);
    legendaEstados(alvo);
    const lut = window.Mapas.lutParadas(getComputedStyle(alvo), window.Mapas.ETAPAS_RAMPA);
    const camadaMatriz = G.el("g", {}, svg);
    const xS = G.linear(0, T, cx.esq, cx.dir), yS = G.linear(-1, X_MAX, cx.base, cx.topo);
    G.eixos(svg, xS, yS, cx, { nY: 4, nX: 8, casas: 0 });
    G.el("path", { d: x.map((v, t) => `${t ? "L" : "M"}${xS(t).toFixed(1)} ${yS(v).toFixed(1)}`).join(""), fill: "none", stroke: "var(--tinta-2)", "stroke-width": "2px" }, svg);

    const nomes = ["Verdade", "GMM", "Viterbi"];
    const YF = 328, DY = 72, HF = 44;
    const grupos = nomes.map((nome, f) => {
      const y = YF + f * DY;
      G.el("text", { x: cx.esq - 14, y: y + 31, "text-anchor": "end", texto: nome }, svg);
      const g = G.el("g", {}, svg);
      const ac = G.el("text", { x: L - 8, y: y + 31, "text-anchor": "end", style: "font-size: 28px; font-weight: 600; fill: var(--tinta)" }, svg);
      return { g, ac, y };
    });
    function faixa(gr, s) {
      gr.g.replaceChildren();
      let ini = 0;
      for (let t = 1; t <= T; t++) {
        if (t === T || s[t] !== s[ini]) {
          G.el("rect", { x: xS(ini), y: gr.y, width: xS(t) - xS(ini), height: HF, fill: CORES[s[ini]] }, gr.g);
          ini = t;
        }
      }
      const acertos = s.reduce((n, v, t) => n + (v === z[t] ? 1 : 0), 0);
      gr.ac.textContent = gr === grupos[0] ? "" : `${G.numero(100 * acertos / T, 0)}%`;
    }

    const rotulo = document.createElement("span"); rotulo.className = "data-atual";
    const faixaEl = document.createElement("input");
    Object.assign(faixaEl, { type: "range", min: 340, max: 999, step: 1, value: 950 });
    faixaEl.setAttribute("aria-label", "Persistência");
    controles.append(rotulo, faixaEl);

    const gmm = classificarGMM(x, A_VERDADEIRA);
    let vit = [];
    faixa(grupos[0], z); faixa(grupos[1], gmm);
    function atualizar() {
      const p = Number(faixaEl.value) / 1000, A = comPersistencia(p);
      rotulo.innerHTML = `a<sub>ii</sub> = ${G.numero(p, 3)}`;
      camadaMatriz.replaceChildren();
      desenharMatriz(camadaMatriz, 30, 74, 78, A, "Matriz A", lut, 25, 3);
      vit = viterbi(x, { ...VERDADE, A });
      faixa(grupos[2], vit);
    }
    faixaEl.addEventListener("input", atualizar);
    atualizar();

    const dica = G.dica(alvo);
    const cruz = G.el("line", { y1: cx.topo, y2: YF + 2 * DY + HF, stroke: "var(--tinta)", "stroke-width": "2px", visibility: "hidden" }, svg);
    const esconder = () => { cruz.setAttribute("visibility", "hidden"); dica.esconder(); };
    svg.addEventListener("pointerleave", esconder);
    svg.addEventListener("pointermove", ev => {
      const [mx] = G.pontoSvg(svg, ev);
      if (mx < cx.esq || mx > cx.dir) { esconder(); return; }
      const t = Math.max(0, Math.min(T - 1, Math.round(xS.inversa(mx)))), px = xS(t);
      cruz.setAttribute("x1", px); cruz.setAttribute("x2", px); cruz.setAttribute("visibility", "visible");
      const linha = (rot, s) => `<div class="linha"><i style="background:${CORES[s]}"></i>${rot}<b>${ESTADOS[s].nome}</b></div>`;
      dica.mostrar(ev, `<div class="cabeca">t = ${t}, x = ${G.numero(x[t], 2)}</div>` + linha("Verdade", z[t]) + linha("GMM", gmm[t]) + linha("Viterbi", vit[t]));
    });
    alvo._dec = { definir(p) { faixaEl.value = p; atualizar(); }, acuracias: () => grupos.slice(1).map(g => g.ac.textContent) };
  }

  /* δ, predecessores e caminho num trecho da série. */
  function viterbiDetalhado(x, par) {
    const n = x.length, b = emissoes(x, par), d = [par.pi.map((p, k) => Math.log(p) + Math.log(b[0][k]))], psi = [null];
    for (let t = 1; t < n; t++) {
      d[t] = new Array(K); psi[t] = new Array(K);
      for (let k = 0; k < K; k++) {
        let melhor = -Infinity, arg = 0;
        for (let j = 0; j < K; j++) {
          const v = d[t - 1][j] + Math.log(par.A[j][k]);
          if (v > melhor) { melhor = v; arg = j; }
        }
        d[t][k] = melhor + Math.log(b[t][k]); psi[t][k] = arg;
      }
    }
    const norm = d.map(l => { const m = Math.max(...l), q = l.map(v => Math.exp(v - m)), s = q.reduce((a, c) => a + c, 0); return q.map(v => v / s); });
    const s = new Array(n);
    s[n - 1] = d[n - 1].indexOf(Math.max(...d[n - 1]));
    for (let t = n - 2; t >= 0; t--) s[t] = psi[t + 1][s[t + 1]];
    return { norm, psi, s };
  }

  /* Viterbi passo a passo: cada estado escolhe o melhor predecessor; o cálculo do nó selecionado aparece abaixo dos botões. */
  function viterbiAnimado({ alvo, controles }) {
    const serie = gerar(T, SEMENTE_SERIE);
    const x = serie.x.slice(JANELA_INI, JANELA_INI + JANELA_N), z = serie.z.slice(JANELA_INI, JANELA_INI + JANELA_N);
    const gmm = classificarGMM(serie.x, A_VERDADEIRA).slice(JANELA_INI, JANELA_INI + JANELA_N);
    const { norm, psi, s } = viterbiDetalhado(x, VERDADE), n = JANELA_N, b = emissoes(x, VERDADE);
    const L = 1070, H = 570, X0 = 190, DX = (L - X0 - 60) / (n - 1), LINHAS = [205, 305, 405], R = 32;
    const xc = c => X0 + c * DX;
    const svg = G.el("svg", { viewBox: `0 0 ${L} ${H}`, role: "img", "aria-label": "Treliça do algoritmo de Viterbi" }, alvo);

    const yO = G.linear(-1, X_MAX, 120, 12);
    G.el("text", { x: X0 - 40, y: 72, "text-anchor": "end", texto: "x" }, svg);
    G.el("line", { x1: X0 - 20, x2: L - 40, y1: 120, y2: 120, stroke: "var(--eixo)", "stroke-width": "2px" }, svg);
    G.el("path", { d: x.map((v, c) => `${c ? "L" : "M"}${xc(c).toFixed(1)} ${yO(v).toFixed(1)}`).join(""), fill: "none", stroke: "var(--tinta-2)", "stroke-width": "3px" }, svg);
    x.forEach((v, c) => {
      G.el("circle", { class: "marcador", cx: xc(c), cy: yO(v), r: 7, fill: "var(--tinta-2)" }, svg);
      G.el("text", { x: xc(c), y: 154, "text-anchor": "middle", texto: `${c + 1}` }, svg);
    });
    G.el("text", { x: X0 - 40, y: 154, "text-anchor": "end", texto: "t" }, svg);
    ESTADOS.forEach((e, k) => G.el("text", { x: X0 - 54, y: LINHAS[k] + 9, "text-anchor": "end", texto: e.nome }, svg));

    const gLinhas = G.el("g", {}, svg), gCaminho = G.el("g", {}, svg), gSel = G.el("g", {}, svg), gNos = G.el("g", {}, svg), gBaixo = G.el("g", {}, svg);
    let tA = 0, voltaDe = n, relogio = null, sobre = null;
    const status = document.createElement("span"); status.className = "data-atual";
    const calculo = document.createElement("span"); calculo.className = "calculo";
    const acoes = grupoBotoes(controles), corrida = grupoBotoes(controles), rein = grupoBotoes(controles);
    const bAv = botao(acoes, "Avançar", () => { pausar(); passo(); desenhar(); });
    const bRodar = botao(corrida, "Rodar", () => { if (relogio) pausar(); else rodar(); });
    botao(rein, "Reiniciar", () => { pausar(); tA = 0; voltaDe = n; desenhar(); });
    controles.append(status, calculo);

    const fim = () => voltaDe === 0;
    function passo() { if (tA < n - 1) tA += 1; else if (voltaDe > 0) voltaDe -= 1; }
    function pausar() { if (relogio) clearInterval(relogio); relogio = null; bRodar.textContent = "Rodar"; }
    function rodar() {
      if (fim()) { tA = 0; voltaDe = n; }
      bRodar.textContent = "Pausar";
      relogio = setInterval(() => { passo(); desenhar(); if (fim()) pausar(); }, 800);
    }

    function selecionado() {
      if (sobre) return sobre;
      if (fim()) return null;
      if (voltaDe < n) return { c: voltaDe, k: s[voltaDe] };
      return { c: tA, k: norm[tA].indexOf(Math.max(...norm[tA])) };
    }

    const f2 = v => G.numero(v, 2);
    function textoCalculo(sel) {
      if (!sel) return "&nbsp;";
      const { c, k } = sel, si = ESTADOS[k].sigla, ind = c + 1;
      const inicio = `δ<sub>${ind}</sub>(${si}) = `, bx = `b<sub>${si}</sub>(x<sub>${ind}</sub>)`;
      if (c === 0) return `${inicio}ρ<sub>${si}</sub> · ${bx} = ${f2(VERDADE.pi[k])} · ${f2(b[0][k])} ∝ ${f2(norm[0][k])}`;
      const cand = [0, 1, 2].map(j => `${f2(norm[c - 1][j])} · ${f2(VERDADE.A[j][k])}`).join("; ");
      const melhor = psi[c][k], m = norm[c - 1][melhor] * VERDADE.A[melhor][k];
      return `${inicio}${bx} · max(${cand}) = ${f2(b[c][k])} · ${f2(m)} ∝ ${f2(norm[c][k])}`;
    }

    function desenhar() {
      gLinhas.replaceChildren(); gCaminho.replaceChildren(); gSel.replaceChildren(); gNos.replaceChildren(); gBaixo.replaceChildren();
      for (let c = 1; c <= tA; c++) {
        for (let k = 0; k < K; k++) {
          G.el("line", { x1: xc(c - 1), y1: LINHAS[psi[c][k]], x2: xc(c), y2: LINHAS[k], stroke: "var(--tinta-2)", "stroke-width": "3px" }, gLinhas);
        }
      }
      for (let c = Math.max(voltaDe, 1); c < n; c++) {
        G.el("line", { x1: xc(c - 1), y1: LINHAS[s[c - 1]], x2: xc(c), y2: LINHAS[s[c]], stroke: "var(--marinho)", "stroke-width": "9px", "stroke-linecap": "round" }, gCaminho);
      }
      const sel = selecionado();
      if (sel && sel.c >= 1) {
        for (let j = 0; j < K; j++) {
          const melhor = j === psi[sel.c][sel.k];
          G.el("line", { x1: xc(sel.c - 1), y1: LINHAS[j], x2: xc(sel.c), y2: LINHAS[sel.k], stroke: melhor ? "var(--tinta)" : "var(--eixo)", "stroke-width": melhor ? "5px" : "3px" }, gSel);
        }
      }
      for (let c = 0; c < n; c++) {
        for (let k = 0; k < K; k++) {
          const visitado = c <= tA, noCaminho = c >= voltaDe && s[c] === k, marcado = sel && sel.c === c && sel.k === k;
          G.el("circle", { cx: xc(c), cy: LINHAS[k], r: R, fill: noCaminho ? CORES[k] : "var(--superficie)", stroke: marcado ? "var(--tinta)" : visitado ? CORES[k] : "var(--grade)", "stroke-width": marcado ? "6px" : "4px" }, gNos);
          if (visitado) G.el("text", { x: xc(c), y: LINHAS[k] + 9, "text-anchor": "middle", style: `font-size: 25px; font-weight: 600; fill: ${noCaminho ? "var(--sobre-escuro)" : "var(--tinta)"}`, texto: f2(norm[c][k]) }, gNos);
        }
      }
      if (fim()) {
        const faixaEst = (rot, seq, y) => {
          G.el("text", { x: X0 - 54, y: y + 26, "text-anchor": "end", texto: rot }, gBaixo);
          seq.forEach((v, c) => G.el("rect", { x: xc(c) - R, y, width: 2 * R, height: 36, rx: 3, fill: CORES[v] }, gBaixo));
        };
        faixaEst("Verdade", z, 474); faixaEst("GMM", gmm, 522);
      }
      const acV = s.filter((v, c) => v === z[c]).length, acG = gmm.filter((v, c) => v === z[c]).length;
      if (fim()) status.textContent = `Sequência encontrada. Acertos: Viterbi ${acV} de ${n}; GMM ${acG} de ${n}.`;
      else if (voltaDe < n) status.textContent = `Retorno: t = ${voltaDe + 1}.`;
      else if (tA === 0) status.textContent = "Início: t = 1.";
      else if (tA === n - 1) status.textContent = `Avanço: t = ${n}. A seguir, retorno a partir do estado de maior δ.`;
      else status.textContent = `Avanço: t = ${tA + 1}.`;
      calculo.innerHTML = textoCalculo(sel);
      bAv.disabled = fim();
    }

    svg.addEventListener("pointermove", ev => {
      const [mx, my] = G.pontoSvg(svg, ev);
      let achado = null;
      for (let c = 0; c <= tA && !achado; c++) for (let k = 0; k < K; k++) if (Math.hypot(xc(c) - mx, LINHAS[k] - my) <= R + 4) achado = { c, k };
      if ((achado && (!sobre || achado.c !== sobre.c || achado.k !== sobre.k)) || (!achado && sobre)) { sobre = achado; desenhar(); }
    });
    svg.addEventListener("pointerleave", () => { if (sobre) { sobre = null; desenhar(); } });

    desenhar();
    alvo._vit = {
      avancar(q) { for (let i = 0; i < q; i++) passo(); desenhar(); },
      estado: () => ({ tA, voltaDe, s, x, z, gmm, norm, psi, b, A: VERDADE.A, rho: VERDADE.pi, calculo: calculo.textContent }),
      telaDe(c, k) { const m = svg.getScreenCTM(); return [m.a * xc(c) + m.c * LINHAS[k] + m.e, m.b * xc(c) + m.d * LINHAS[k] + m.f]; },
    };
    return { pausar };
  }

  /* Estimação por contagem, supondo os estados conhecidos, com T ajustável. */
  function contagem({ alvo, curvas, controles }) {
    legendaEstados(alvo);
    const { z, x } = gerar(T, SEMENTE_SERIE);
    const lut = window.Mapas.lutParadas(getComputedStyle(alvo), window.Mapas.ETAPAS_RAMPA);
    const L = 907, H = 440;
    const svg = G.el("svg", { viewBox: `0 0 ${L} ${H}`, role: "img", "aria-label": "Estimação por contagem com estados conhecidos", preserveAspectRatio: "xMidYMin meet" }, alvo);
    const svgE = G.el("svg", { viewBox: "0 0 785 262", role: "img", "aria-label": "Emissões estimadas e verdadeiras" }, curvas);
    const xE = G.linear(0, T, 110, L - 34), YF = 20, HF = 44;
    G.el("text", { x: 96, y: YF + 31, "text-anchor": "end", texto: "z" }, svg);
    let ini = 0;
    for (let t = 1; t <= T; t++) {
      if (t === T || z[t] !== z[ini]) { G.el("rect", { x: xE(ini), y: YF, width: xE(t) - xE(ini), height: HF, fill: CORES[z[ini]] }, svg); ini = t; }
    }
    const sombra = G.el("rect", { y: YF - 4, height: HF + 8, fill: "var(--superficie)", "fill-opacity": "0.78" }, svg);
    for (const m of [0, 100, 200, 300, 400]) G.el("text", { x: xE(m), y: YF + HF + 34, "text-anchor": "middle", texto: `${m}` }, svg);
    const conteudo = G.el("g", {}, svg);

    const rotulo = document.createElement("span"); rotulo.className = "data-atual";
    const faixa = document.createElement("input");
    Object.assign(faixa, { type: "range", min: 40, max: T, step: 10, value: T });
    faixa.setAttribute("aria-label", "Número de instantes usados");
    controles.append(rotulo, faixa);

    let resultado;
    function atualizar() {
      const n = Number(faixa.value);
      rotulo.textContent = `T = ${n}`;
      sombra.setAttribute("x", xE(n));
      sombra.setAttribute("width", Math.max(0, xE(T) - xE(n)));
      const cont = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
      for (let t = 1; t < n; t++) cont[z[t - 1]][z[t]] += 1;
      const A = cont.map(l => { const s = l.reduce((a, v) => a + v, 0); return l.map(v => (s ? v / s : 0)); });
      const mu = [], va = [];
      for (let k = 0; k < K; k++) {
        const q = x.slice(0, n).filter((_, t) => z[t] === k), m = q.length ? q.reduce((a, v) => a + v, 0) / q.length : NaN;
        mu.push(m); va.push(q.length > 1 ? q.reduce((a, v) => a + (v - m) ** 2, 0) / q.length : NaN);
      }
      resultado = { cont, A, mu, va, n };
      conteudo.replaceChildren();
      desenharMatriz(conteudo, 50, 190, 78, A, "Contagens n", lut, 26, 2, cont.map(l => l.map(v => `${v}`)));
      desenharMatriz(conteudo, 340, 190, 78, A, "Â (por linha)", lut, 25, 3);
      desenharMatriz(conteudo, 630, 190, 78, A_VERDADEIRA, "A verdadeira", lut, 25, 3);
      svgE.replaceChildren();
      desenharEmissoes(svgE, { esq: 110, dir: 765, topo: 10, base: 184 }, { mu, var: va }, true);
    }
    faixa.addEventListener("input", atualizar);
    atualizar();
    alvo._cont = { definir(v) { faixa.value = v; atualizar(); }, resultado: () => resultado, z, x };
  }

  /* α, β e γ num trecho da série, normalizados em cada instante. */
  function fbDetalhado(x, par) {
    const n = x.length, b = emissoes(x, par), a = [], be = [];
    const normalizar = l => { const s = l.reduce((p, v) => p + v, 0); return l.map(v => v / s); };
    a[0] = normalizar(par.pi.map((p, k) => p * b[0][k]));
    for (let t = 1; t < n; t++) a[t] = normalizar(b[t].map((v, k) => v * a[t - 1].reduce((s, q, j) => s + q * par.A[j][k], 0)));
    be[n - 1] = normalizar([1, 1, 1]);
    for (let t = n - 2; t >= 0; t--) be[t] = normalizar([0, 1, 2].map(k => [0, 1, 2].reduce((s, j) => s + par.A[k][j] * b[t + 1][j] * be[t + 1][j], 0)));
    const g = a.map((l, t) => normalizar(l.map((v, k) => v * be[t][k])));
    return { a, be, g, b };
  }

  /* Forward–backward passo a passo: α da esquerda para a direita, β da direita para a esquerda, γ por último. */
  function fbAnimado({ alvo, controles }) {
    const serie = gerar(T, SEMENTE_SERIE);
    const x = serie.x.slice(JANELA_INI, JANELA_INI + JANELA_N), n = JANELA_N;
    const { a, be, g, b } = fbDetalhado(x, VERDADE);
    const lut = window.Mapas.lutParadas(getComputedStyle(alvo), window.Mapas.ETAPAS_RAMPA);
    const L = 924, H = 534, X0 = 130, DX = (L - X0 - 38) / (n - 1), LC = 66, HC = 42, TOPOS = [40, 216, 392];
    const xc = c => X0 + c * DX;
    const svg = G.el("svg", { viewBox: `0 0 ${L} ${H}`, role: "img", "aria-label": "Passagens forward e backward" }, alvo);
    for (let c = 0; c < n; c++) G.el("text", { x: xc(c), y: 28, "text-anchor": "middle", texto: `${c + 1}` }, svg);
    G.el("text", { x: X0 - 44, y: 28, "text-anchor": "end", texto: "t" }, svg);
    const GRADES = [["α →", a, "α"], ["← β", be, "β"], ["γ", g, "γ"]];
    GRADES.forEach(([rotulo], f) => {
      G.el("text", { class: "rotulo-direto", x: 0, y: TOPOS[f] + 72, texto: rotulo }, svg);
      ESTADOS.forEach((e, k) => G.el("text", { x: X0 - 44, y: TOPOS[f] + k * 46 + 30, "text-anchor": "end", texto: e.sigla }, svg));
    });
    const camada = G.el("g", {}, svg);

    const FIM = 2 * n + 1;
    let e = 1, relogio = null, sobre = null;
    const status = document.createElement("span"); status.className = "data-atual";
    const calculo = document.createElement("span"); calculo.className = "calculo";
    const acoes = grupoBotoes(controles), corrida = grupoBotoes(controles), rein = grupoBotoes(controles);
    const bAv = botao(acoes, "Avançar", () => { pausar(); passo(); desenhar(); });
    const bRodar = botao(corrida, "Rodar", () => { if (relogio) pausar(); else rodar(); });
    botao(rein, "Reiniciar", () => { pausar(); e = 1; desenhar(); });
    controles.append(status, calculo);

    const passo = () => { if (e < FIM) e += 1; };
    function pausar() { if (relogio) clearInterval(relogio); relogio = null; bRodar.textContent = "Rodar"; }
    function rodar() {
      if (e >= FIM) e = 1;
      bRodar.textContent = "Pausar";
      relogio = setInterval(() => { passo(); desenhar(); if (e >= FIM) pausar(); }, 600);
    }
    const preenchida = (f, c) => (f === 0 ? c < Math.min(e, n) : f === 1 ? e > n && c >= 2 * n - e : e >= FIM);
    function atual() {
      if (sobre) return sobre;
      if (e >= FIM) return null;
      if (e <= n) { const c = e - 1; return { f: 0, c, k: a[c].indexOf(Math.max(...a[c])) }; }
      const c = 2 * n - e; return { f: 1, c, k: be[c].indexOf(Math.max(...be[c])) };
    }
    const f2 = v => G.numero(v, 2);
    function textoCalculo(sel) {
      if (!sel) return "&nbsp;";
      const { f, c, k } = sel, si = ESTADOS[k].sigla, ind = c + 1;
      if (f === 0) {
        if (c === 0) return `α<sub>1</sub>(${si}) = ρ<sub>${si}</sub> · b<sub>${si}</sub>(x<sub>1</sub>) = ${f2(VERDADE.pi[k])} · ${f2(b[0][k])} ∝ ${f2(a[0][k])}`;
        const termos = [0, 1, 2].map(j => a[c - 1][j] * VERDADE.A[j][k]);
        return `α<sub>${ind}</sub>(${si}) = b<sub>${si}</sub>(x<sub>${ind}</sub>) · Σ<sub>j</sub> α<sub>${ind - 1}</sub>(j) a<sub>j${si}</sub> = ${f2(b[c][k])} · (${termos.map(f2).join(" + ")}) ∝ ${f2(a[c][k])}`;
      }
      if (f === 1) {
        if (c === n - 1) return `β<sub>${ind}</sub>(${si}) = 1 ∝ ${f2(be[c][k])}`;
        const termos = [0, 1, 2].map(j => VERDADE.A[k][j] * b[c + 1][j] * be[c + 1][j]);
        return `β<sub>${ind}</sub>(${si}) = Σ<sub>j</sub> a<sub>${si}j</sub> b<sub>j</sub>(x<sub>${ind + 1}</sub>) β<sub>${ind + 1}</sub>(j) = ${termos.map(v => G.numero(v, 3)).join(" + ")} ∝ ${f2(be[c][k])}`;
      }
      return `γ<sub>${ind}</sub>(${si}) ∝ α<sub>${ind}</sub>(${si}) · β<sub>${ind}</sub>(${si}) = ${f2(a[c][k])} · ${f2(be[c][k])} ∝ ${f2(g[c][k])}`;
    }
    function desenhar() {
      camada.replaceChildren();
      const sel = atual();
      GRADES.forEach(([, m], f) => {
        for (let c = 0; c < n; c++) for (let k = 0; k < K; k++) {
          const cheio = preenchida(f, c), yc = TOPOS[f] + k * 46, q = Math.round(m[c][k] * 255), marcado = sel && sel.f === f && sel.c === c && sel.k === k;
          G.el("rect", { x: xc(c) - LC / 2, y: yc, width: LC, height: HC, rx: 3, fill: cheio ? `rgb(${lut[q * 3]},${lut[q * 3 + 1]},${lut[q * 3 + 2]})` : "var(--superficie)", stroke: marcado ? "var(--tinta)" : cheio ? "var(--superficie)" : "var(--grade)", "stroke-width": marcado ? "5px" : "2px" }, camada);
          if (cheio) G.el("text", { x: xc(c), y: yc + 30, "text-anchor": "middle", style: `font-size: 25px; font-weight: 600; fill: ${m[c][k] > 0.5 ? "var(--sobre-escuro)" : "var(--tinta)"}`, texto: f2(m[c][k]) }, camada);
        }
      });
      if (e >= FIM) status.textContent = "γ: combina passado (α) e futuro (β) em cada instante.";
      else if (e <= n) status.textContent = `Forward: t = ${e}, usando as observações de 1 até t.`;
      else status.textContent = `Backward: t = ${2 * n - e + 1}, usando as observações de t+1 até ${n}.`;
      calculo.innerHTML = textoCalculo(sel);
      bAv.disabled = e >= FIM;
    }
    svg.addEventListener("pointermove", ev => {
      const [mx, my] = G.pontoSvg(svg, ev);
      let achado = null;
      GRADES.forEach((_, f) => {
        for (let c = 0; c < n; c++) for (let k = 0; k < K; k++) {
          const yc = TOPOS[f] + k * 46;
          if (preenchida(f, c) && Math.abs(mx - xc(c)) <= LC / 2 && my >= yc && my <= yc + HC) achado = { f, c, k };
        }
      });
      if ((achado && (!sobre || achado.f !== sobre.f || achado.c !== sobre.c || achado.k !== sobre.k)) || (!achado && sobre)) { sobre = achado; desenhar(); }
    });
    svg.addEventListener("pointerleave", () => { if (sobre) { sobre = null; desenhar(); } });
    desenhar();
    alvo._fb = { avancar(q) { for (let i = 0; i < q; i++) passo(); desenhar(); }, estado: () => ({ e, FIM, x, a, be, g, b, A: VERDADE.A, rho: VERDADE.pi, calculo: calculo.textContent }) };
    return { pausar };
  }

  /* Baum–Welch iterando, com matrizes, emissões e curva de log-verossimilhança. */
  function baumWelch({ alvo, curva, controles }) {
    const { x } = gerar(T, SEMENTE_SERIE);
    const lut = window.Mapas.lutParadas(getComputedStyle(alvo), window.Mapas.ETAPAS_RAMPA);
    const svg = G.el("svg", { viewBox: "0 0 907 330", role: "img", "aria-label": "Parâmetros estimados e verdadeiros" }, alvo);
    legendaEstados(alvo);
    const LC = 907, HC = 230, cc = { esq: 112, dir: LC - 24, topo: 12, base: HC - 76 };
    const svgC = G.el("svg", { viewBox: `0 0 ${LC} ${HC}`, role: "img", "aria-label": "Log-verossimilhança por iteração" }, curva);

    let par, it = 0, hist = [], relogio = null, convergiu = false, idSemente = 0;
    const anteriores = [];
    const acoes = grupoBotoes(controles), corrida = grupoBotoes(controles), rein = grupoBotoes(controles);
    const bPasso = botao(acoes, "Passo", () => { pausar(); passo(); desenhar(); });
    const bRodar = botao(corrida, "Rodar", () => { if (relogio) pausar(); else rodar(); });
    botao(rein, "Nova inicialização", () => { pausar(); if (hist.length > 1) anteriores.push(hist.slice()); idSemente = (idSemente + 1) % SEMENTES_BW.length; iniciar(); });
    const leitura = document.createElement("span"); leitura.className = "data-atual";
    controles.appendChild(leitura);

    function passo() {
      if (convergiu) return;
      const fb = forwardBackward(x, par);
      const ll = fb.ll / T;
      if (hist.length && Math.abs(ll - hist[hist.length - 1]) < TOL_LL) { hist.push(ll); convergiu = true; return; }
      hist.push(ll);
      par = passoM(x, fb);
      it += 1;
      if (it >= MAX_ITER) convergiu = true;
    }
    function pausar() { if (relogio) clearInterval(relogio); relogio = null; bRodar.textContent = "Rodar"; }
    function rodar() {
      bRodar.textContent = "Pausar";
      relogio = setInterval(() => { passo(); desenhar(); if (convergiu) pausar(); }, QUADRO_MS);
    }
    function iniciar() { par = inicializar(x, SEMENTES_BW[idSemente]); it = 0; hist = []; convergiu = false; desenhar(); }

    /* Estimativas reordenadas por média crescente, para alinhar com a verdade. */
    function ordenado() {
      const o = [0, 1, 2].sort((a, b) => par.mu[a] - par.mu[b]);
      return { A: o.map(i => o.map(j => par.A[i][j])), mu: o.map(i => par.mu[i]), var: o.map(i => par.var[i]) };
    }

    function desenhar() {
      svg.replaceChildren();
      const est = ordenado();
      desenharMatriz(svg, 44, 66, 72, est.A, "A estimada", lut);
      desenharMatriz(svg, 312, 66, 72, A_VERDADEIRA, "A verdadeira", lut);
      desenharEmissoes(svg, { esq: 640, dir: 895, topo: 16, base: 240 }, est, true);
      bPasso.disabled = convergiu;
      const llTxt = hist.length ? `, ℓ/T = ${G.numero(hist[hist.length - 1], 3)}` : "";
      leitura.textContent = `Iteração ${it}${llTxt}. Tracejado: emissões verdadeiras.`;
      svgC.replaceChildren();
      const todas = [...anteriores, hist], valores = todas.flat();
      const maxIt = Math.max(30, ...todas.map(h => h.length - 1));
      let lo = valores.length ? Math.min(...valores) : -2.2, hi = valores.length ? Math.max(...valores) : -1.4;
      if (hi - lo < 0.1) { lo -= 0.05; hi += 0.05; }
      const pad = (hi - lo) * 0.08;
      const xC = G.linear(0, maxIt, cc.esq, cc.dir), yC = G.linear(lo - pad, hi + pad, cc.base, cc.topo);
      G.eixos(svgC, xC, yC, cc, { rotuloX: "Iteração", rotuloY: "ℓ / T", nY: 3, nX: 6, casas: 1, fmtX: v => G.numero(v, 0) });
      const traco = (h, cor, l) => {
        if (!h.length) return;
        G.el("path", { d: h.map((v, i) => `${i ? "L" : "M"}${xC(i).toFixed(1)} ${yC(v).toFixed(1)}`).join(""), fill: "none", stroke: cor, "stroke-width": l, "stroke-linejoin": "round" }, svgC);
      };
      anteriores.forEach(h => traco(h, "var(--eixo)", "3px"));
      traco(hist, "var(--marinho)", "4px");
    }
    iniciar();
    alvo._bw = {
      avancar(n) { for (let i = 0; i < n && !convergiu; i++) passo(); desenhar(); },
      estado: () => ({ it, convergiu, hist: hist.slice(), est: ordenado(), semente: SEMENTES_BW[idSemente] }),
    };
    return { pausar };
  }

  /* ---- Etapas da aplicação no exemplo: várias máquinas como réplicas do mesmo processo. ---- */
  const NM = 8, TM = 200, FRAC_GMM = 0.25, N_BW = 3, A_II_INICIO = 0.95, SEMENTE_MAQ = SEMENTE_SERIE + 1000;

  /* GMM em 1D com K = 3, componentes ordenados por média crescente (P, N, S). */
  function gmm1d(v) {
    const n = v.length, s = v.slice().sort((a, b) => a - b), q = p => s[Math.floor(p * (n - 1))];
    const media = v.reduce((a, b) => a + b, 0) / n, v0 = v.reduce((a, b) => a + (b - media) ** 2, 0) / n;
    let mu = [q(1 / 6), q(1 / 2), q(5 / 6)], va = [v0, v0, v0], w = [1 / 3, 1 / 3, 1 / 3], llAnt = -Infinity;
    for (let it = 0; it < 2000; it++) {
      let ll = 0;
      const R = v.map(x => {
        const p = mu.map((m, k) => w[k] * normal1d(x, m, va[k])), tot = p[0] + p[1] + p[2];
        ll += Math.log(tot);
        return p.map(e => e / tot);
      });
      const sr = [0, 1, 2].map(k => R.reduce((a, r) => a + r[k], 0));
      mu = [0, 1, 2].map(k => R.reduce((a, r, i) => a + r[k] * v[i], 0) / sr[k]);
      va = [0, 1, 2].map(k => R.reduce((a, r, i) => a + r[k] * (v[i] - mu[k]) ** 2, 0) / sr[k]);
      w = sr.map(x => x / n);
      if (Math.abs(ll - llAnt) < 1e-10 * n) break;
      llAnt = ll;
    }
    const o = [0, 1, 2].sort((a, b) => mu[a] - mu[b]);
    return { mu: o.map(k => mu[k]), var: o.map(k => va[k]), w: o.map(k => w[k]) };
  }

  const porLinha = M => M.map(l => { const s = l.reduce((a, v) => a + v, 0); return l.map(v => v / s); });

  /* Baum–Welch com emissões fixas em várias séries independentes: as contagens esperadas de todas são somadas. */
  function bwVariasSeries(series, emis, pi0) {
    let par = { pi: pi0.slice(), A: Array.from({ length: K }, (_, i) => Array.from({ length: K }, (__, j) => (i === j ? A_II_INICIO : (1 - A_II_INICIO) / (K - 1)))), mu: emis.mu, var: emis.var };
    const N = series.reduce((a, x) => a + x.length, 0);
    let llAnt = -Infinity, it = 0, fbs;
    for (; it < 2000; it++) {
      fbs = series.map(x => forwardBackward(x, par));
      const ll = fbs.reduce((a, f) => a + f.ll, 0);
      if (Math.abs(ll - llAnt) < 1e-10 * N) break;
      llAnt = ll;
      const soma = fbs.reduce((S, f) => S.map((l, i) => l.map((v, j) => v + f.xi[i][j])), [[0, 0, 0], [0, 0, 0], [0, 0, 0]]);
      par = { ...par, A: porLinha(soma), pi: [0, 1, 2].map(k => fbs.reduce((a, f) => a + f.gama[0][k], 0) / series.length) };
    }
    const contagens = fbs.map(f => f.xi);
    const soma = contagens.reduce((S, C) => S.map((l, i) => l.map((v, j) => v + C[i][j])), [[0, 0, 0], [0, 0, 0], [0, 0, 0]]);
    return { par, contagens, soma, it };
  }

  function maquinas({ alvo, controles }) {
    legendaEstados(alvo);
    const lut = window.Mapas.lutParadas(getComputedStyle(alvo), window.Mapas.ETAPAS_RAMPA);
    const series = Array.from({ length: NM }, (_, m) => gerar(TM, SEMENTE_MAQ + m));
    const rng = G.aleatorio(SEMENTE_MAQ + 99);
    const amostra = series.map(s => s.x.map(() => rng.u() < FRAC_GMM));
    const escolhidas = [];
    while (escolhidas.length < N_BW) { const m = Math.floor(rng.u() * NM); if (!escolhidas.includes(m)) escolhidas.push(m); }
    escolhidas.sort((a, b) => a - b);
    const pontos = [];
    series.forEach((s, m) => s.x.forEach((v, t) => { if (amostra[m][t]) pontos.push(v); }));
    const gmm = gmm1d(pontos), emis = { mu: gmm.mu, var: gmm.var };
    const classeGMM = v => { const q = gmm.mu.map((mu, k) => gmm.w[k] * normal1d(v, mu, gmm.var[k])); return q.indexOf(Math.max(...q)); };
    const bw = bwVariasSeries(escolhidas.map(m => series[m].x), emis, gmm.w);
    const vit = series.map(s => viterbi(s.x, bw.par));
    const semTempo = series.map(s => s.x.map(classeGMM));
    const acerto = rot => 100 * rot.reduce((a, r, m) => a + r.filter((k, t) => k === series[m].z[t]).length, 0) / (NM * TM);
    const acV = acerto(vit), acG = acerto(semTempo);

    const L = 1728, H = 600, X0 = 1090, RH = 73, TOPO = 8;
    const svg = G.el("svg", { viewBox: `0 0 ${L} ${H}`, role: "img", "aria-label": "Etapas da estimação com várias máquinas" }, alvo);
    const xS = G.linear(0, TM - 1, 170, 1010);
    const linhas = series.map((s, m) => {
      const y0 = TOPO + m * RH, yS = G.linear(-1, X_MAX, y0 + 50, y0 + 4);
      const fundo = G.el("rect", { x: 0, y: y0, width: 1030, height: RH - 4, rx: 4, fill: "var(--azul-100)", display: "none" }, svg);
      const rot = G.el("text", { x: 150, y: y0 + 36, "text-anchor": "end", texto: `Máquina ${m + 1}` }, svg);
      const ponto = t => `${xS(t).toFixed(1)} ${yS(s.x[t]).toFixed(1)}`;
      const linha = G.el("path", { d: s.x.map((v, t) => `${t ? "L" : "M"}${ponto(t)}`).join(""), fill: "none", "stroke-width": "2px", "stroke-linejoin": "round" }, svg);
      // Série pintada pelo estado verdadeiro: um trecho por sequência de instantes no mesmo estado.
      const verdade = G.el("g", { display: "none" }, svg);
      for (let a = 0, t = 1; t <= TM; t++) {
        if (t === TM || s.z[t] !== s.z[a]) {
          const ts = Array.from({ length: t - a + (a ? 1 : 0) }, (_, i) => a - (a ? 1 : 0) + i);
          G.el("path", { d: ts.map((u, i) => `${i ? "L" : "M"}${ponto(u)}`).join(""), fill: "none", stroke: CORES[s.z[a]], "stroke-width": "2.5px", "stroke-linejoin": "round" }, verdade);
          a = t;
        }
      }
      const pts = G.el("g", {}, svg), faixa = G.el("g", {}, svg);
      s.x.forEach((v, t) => { if (amostra[m][t]) G.el("circle", { class: "marcador", cx: xS(t), cy: yS(v), r: 5, fill: CORES[classeGMM(v)] }, pts); });
      let ini = 0;
      for (let t = 1; t <= TM; t++) {
        if (t === TM || vit[m][t] !== vit[m][ini]) {
          G.el("rect", { x: xS(ini) - 2, y: y0 + 54, width: xS(Math.min(t, TM - 1)) - xS(ini) + 4, height: 12, fill: CORES[vit[m][ini]] }, faixa);
          ini = t;
        }
      }
      return { fundo, rot, linha, verdade, pts, faixa };
    });
    const painel = G.el("g", {}, svg);
    const texto = (x, y, t, estilo = "", ancora = "start") => G.el("text", { x, y, "text-anchor": ancora, style: estilo, texto: t }, painel);

    function painelInicio() {
      texto(X0, 60, "Cada máquina faz o papel de uma célula:", "font-size: 30px; font-weight: 600; fill: var(--tinta)");
      ["uma série de vibração por máquina", "mesma A e mesmas emissões em todas", "estados ocultos, como antes"].forEach((t, i) =>
        texto(X0 + 10, 120 + i * 52, `•  ${t}`, "font-size: 30px; fill: var(--tinta)"));
    }
    function painelGMM() {
      const cx = { esq: X0 + 96, dir: L - 20, topo: 54, base: 330 };
      texto(X0, 28, `${pontos.length} instantes sorteados, sem ordem no tempo`, "font-size: 28px; font-weight: 600; fill: var(--tinta)");
      const DB = 0.25, nb = Math.round((X_MAX + 1) / DB), cont = new Array(nb).fill(0);
      pontos.forEach(v => { const b = Math.floor((v + 1) / DB); if (b >= 0 && b < nb) cont[b] += 1; });
      const dens = cont.map(c => c / (pontos.length * DB));
      const curva = (v, k) => gmm.w[k] * normal1d(v, gmm.mu[k], gmm.var[k]);
      const topo = Math.max(...dens, ...gmm.mu.map((m, k) => curva(m, k))) * 1.08;
      const xH = G.linear(-1, X_MAX, cx.esq, cx.dir), yH = G.linear(0, topo, cx.base, cx.topo);
      G.eixos(painel, xH, yH, cx, { rotuloX: "Vibração (mm/s)", rotuloY: "Densidade", nX: 4, nY: 3, casas: 1, fmtX: v => G.numero(v, 0) });
      dens.forEach((d, b) => G.el("rect", { x: xH(-1 + b * DB) + 1, y: yH(d), width: xH(DB) - xH(0) - 2, height: cx.base - yH(d), fill: "var(--azul-200)" }, painel));
      gmm.mu.forEach((_, k) => {
        let d = "";
        for (let i = 0; i <= 160; i++) { const v = -1 + i / 160 * (X_MAX + 1); d += `${i ? "L" : "M"}${xH(v).toFixed(1)} ${yH(curva(v, k)).toFixed(1)}`; }
        G.el("path", { d, fill: "none", stroke: CORES[k], "stroke-width": "4px" }, painel);
      });
      ESTADOS.forEach((e, k) => {
        const y = 470 + k * 44;
        G.el("circle", { cx: X0 + 12, cy: y - 9, r: 10, fill: CORES[k] }, painel);
        texto(X0 + 34, y, `${e.sigla}:  μ = ${G.numero(gmm.mu[k], 2)}   σ = ${G.numero(Math.sqrt(gmm.var[k]), 2)}   π = ${G.numero(gmm.w[k], 2)}`, "font-size: 28px; fill: var(--tinta); font-variant-numeric: tabular-nums");
      });
    }
    const CEL = 44, MX = [X0 + 40, X0 + 262, X0 + 484];
    const corContagem = C => porLinha(C);
    function painelBW(comSoma) {
      escolhidas.forEach((m, i) => {
        const C = bw.contagens[i];
        desenharMatriz(painel, MX[i], 90, CEL, corContagem(C), `Máquina ${m + 1}`, lut, 21, 0, C.map(l => l.map(v => G.numero(v, 0))));
        if (i) texto(MX[i] - 62, 90 + 1.5 * CEL + 14, "+", "font-size: 44px; font-weight: 600; fill: var(--marinho)", "middle");
      });
      texto(X0, 278, "Contagens esperadas de transição, Σₜ ξₜ(i, j),", "font-size: 26px");
      texto(X0, 312, "com as emissões do GMM fixas.", "font-size: 26px");
      if (!comSoma) return;
      texto(X0 + 4, 420 + 1.5 * CEL + 14, "=", "font-size: 44px; font-weight: 600; fill: var(--marinho)");
      desenharMatriz(painel, MX[0] + 40, 420, CEL, corContagem(bw.soma), "Soma", lut, 21, 0, bw.soma.map(l => l.map(v => G.numero(v, 0))));
      texto(MX[0] + 40 + 3 * CEL + 26, 420 + 1.5 * CEL + 12, "→", "font-size: 40px; fill: var(--marinho)", "middle");
      desenharMatriz(painel, MX[1] + 30, 420, CEL, bw.par.A, "Â (por linha)", lut, 20, 2);
      desenharMatriz(painel, MX[2], 420, CEL, A_VERDADEIRA, "A verdadeira", lut, 20, 2);
    }
    function painelViterbi() {
      texto(X0, 28, `Mesmos parâmetros nas ${NM} máquinas`, "font-size: 28px; font-weight: 600; fill: var(--tinta)");
      desenharMatriz(painel, X0 + 40, 120, 50, bw.par.A, "Â", lut, 21, 2);
      desenharEmissoes(painel, { esq: X0 + 330, dir: L - 20, topo: 60, base: 250 }, emis, false);
      texto(X0, 370, "Cor da série: estado verdadeiro.", "font-size: 28px; fill: var(--tinta)");
      texto(X0, 408, "Faixa abaixo: estado do Viterbi.", "font-size: 28px; fill: var(--tinta)");
      texto(X0, 450, "Acerto em relação aos estados verdadeiros:", "font-size: 28px; fill: var(--tinta)");
      texto(X0, 500, `Viterbi: ${G.numero(acV, 0)}%`, "font-size: 32px; font-weight: 600; fill: var(--tinta)");
      texto(X0 + 260, 500, `GMM, sem o tempo: ${G.numero(acG, 0)}%`, "font-size: 32px; fill: var(--tinta-2)");
    }

    const ETAPAS = [
      `${NM} máquinas com a mesma dinâmica: réplicas independentes do mesmo processo.`,
      `1. GMM: ${G.numero(100 * FRAC_GMM, 0)}% dos instantes, sorteados de todas as máquinas, estimam μₖ, σₖ e πₖ.`,
      `2. Baum–Welch: séries completas de ${N_BW} máquinas sorteadas, com as emissões do GMM fixas.`,
      `As contagens esperadas das ${N_BW} máquinas são somadas e normalizadas por linha: uma única Â.`,
      `3. Viterbi: cada uma das ${NM} máquinas é decodificada com os mesmos parâmetros.`,
    ];
    let etapa = 0;
    const acoes = grupoBotoes(controles), rein = grupoBotoes(controles);
    const bAv = botao(acoes, "Avançar", () => { if (etapa < ETAPAS.length - 1) etapa += 1; desenhar(); });
    botao(rein, "Reiniciar", () => { etapa = 0; desenhar(); });
    const status = document.createElement("span"); status.className = "data-atual";
    controles.appendChild(status);

    function desenhar() {
      linhas.forEach((l, m) => {
        const sel = (etapa === 2 || etapa === 3) && escolhidas.includes(m);
        const mostrar = (n, sim) => n.setAttribute("display", sim ? "inline" : "none");
        mostrar(l.fundo, sel);
        mostrar(l.pts, etapa === 1);
        mostrar(l.faixa, etapa === 4);
        mostrar(l.verdade, etapa === 4);
        mostrar(l.linha, etapa !== 4);
        l.linha.style.stroke = sel ? "var(--marinho)" : etapa === 0 ? "var(--tinta-2)" : "var(--eixo)";
        l.linha.style.strokeWidth = sel ? "2.5px" : "2px";
        l.rot.style.fill = sel ? "var(--tinta)" : "";
        l.rot.style.fontWeight = sel ? "600" : "";
      });
      painel.replaceChildren();
      [painelInicio, painelGMM, () => painelBW(false), () => painelBW(true), painelViterbi][etapa]();
      status.textContent = ETAPAS[etapa];
      bAv.disabled = etapa === ETAPAS.length - 1;
    }
    desenhar();
    alvo._maq = {
      ir(e) { etapa = e; desenhar(); },
      estado: () => ({ etapa, gmm, bw, escolhidas, acV, acG, nPontos: pontos.length, series: series.map(s => s.x), z: series.map(s => s.z), vit }),
    };
  }

  /* Expostos para a comparação com o hmmlearn. */
  function teste(semente, nIter) {
    const { x, z } = gerar(T, SEMENTE_SERIE);
    const ini = inicializar(x, semente), fb0 = forwardBackward(x, VERDADE), v0 = viterbi(x, VERDADE);
    let par = ini, ll = null;
    for (let i = 0; i < nIter; i++) { const fb = forwardBackward(x, par); ll = fb.ll; par = passoM(x, fb); }
    return { x, z, ini, par, ll, verdade: VERDADE, gama: fb0.gama, ll0: fb0.ll, viterbi: v0 };
  }
  function finalPorSemente(sementes) {
    const { x } = gerar(T, SEMENTE_SERIE);
    return sementes.map(s => {
      let par = inicializar(x, s), ant = null, it = 0, ll = 0;
      for (; it < MAX_ITER; it++) {
        const fb = forwardBackward(x, par); ll = fb.ll / T;
        if (ant !== null && Math.abs(ll - ant) < TOL_LL) break;
        ant = ll; par = passoM(x, fb);
      }
      return { semente: s, ll, it, mu: par.mu.slice().sort((a, b) => a - b) };
    });
  }

  window.DemoHMM = { grafo, modelo, parametros, viterbiAnimado, fbAnimado, gmmSemTempo, decodificacao, contagem, baumWelch, maquinas, teste, finalPorSemente };
})();
