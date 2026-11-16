/* Demonstrações do GMM com dado artificial 2D: geração, responsabilidades e estimação por EM. */
(function () {
  "use strict";
  const G = window.Graficos;

  const VERDADE = [
    { pi: 0.45, mu: [-2.4, 1.2], S: [[1.6, 0.9], [0.9, 1.1]] },
    { pi: 0.30, mu: [2.4, 2.2], S: [[0.6, -0.25], [-0.25, 1.2]] },
    { pi: 0.25, mu: [1.0, -2.4], S: [[2.4, 0.1], [0.1, 0.35]] },
  ];
  const CORES = ["var(--serie-1)", "var(--serie-2)", "var(--serie-3)"];
  const TOKENS_CORES = ["--serie-1", "--serie-2", "--serie-3"];
  const K = VERDADE.length, N_AMOSTRA = 450, N_MAX = 1000, SEMENTE_DADOS = 20261109;
  const PROB_ELIPSE = 0.90;
  const RAIO = G.raioProb2d(PROB_ELIPSE);
  const REG_COVAR = 1e-6;           // o mesmo padrão do sklearn.mixture.GaussianMixture
  const TOL_LL = 1e-5, MAX_ITER = 200, QUADRO_MS = 180;
  // Sementes de inicialização: 18 e 6 chegam ao melhor ótimo; 9, a terceira, cai no ótimo local (único caso entre as sementes 1–20).
  const SEMENTES = [18, 6, 9];

  function amostrar(n, semente) {
    const r = G.aleatorio(semente), pontos = [];
    for (let i = 0; i < n; i++) {
      let u = r.u(), k = 0;
      while (k < K - 1 && u > VERDADE[k].pi) { u -= VERDADE[k].pi; k++; }
      const { mu, S } = VERDADE[k];
      const l11 = Math.sqrt(S[0][0]), l21 = S[1][0] / l11, l22 = Math.sqrt(S[1][1] - l21 * l21);
      const a = r.normal(), b = r.normal();
      pontos.push({ p: [mu[0] + l11 * a, mu[1] + l21 * a + l22 * b], k });
    }
    return pontos;
  }

  function responsabilidades(p, par) {
    const q = par.map(c => c.pi * G.normal2d(p, c.mu, c.S));
    const soma = q.reduce((a, b) => a + b, 0);
    return q.map(v => v / soma);
  }

  /* Passo E: responsabilidades e log-verossimilhança média. */
  function passoE(X, par) {
    let ll = 0;
    const gama = X.map(p => {
      const q = par.map(c => c.pi * G.normal2d(p, c.mu, c.S));
      const soma = q.reduce((a, b) => a + b, 0);
      ll += Math.log(soma);
      return q.map(v => v / soma);
    });
    return { gama, ll: ll / X.length };
  }

  /* Passo M: novos π, μ, Σ a partir das responsabilidades. */
  function passoM(X, gama) {
    const n = X.length;
    return Array.from({ length: K }, (_, k) => {
      let nk = 0, mx = 0, my = 0;
      for (let i = 0; i < n; i++) { const g = gama[i][k]; nk += g; mx += g * X[i][0]; my += g * X[i][1]; }
      mx /= nk; my /= nk;
      let sxx = 0, sxy = 0, syy = 0;
      for (let i = 0; i < n; i++) {
        const g = gama[i][k], dx = X[i][0] - mx, dy = X[i][1] - my;
        sxx += g * dx * dx; sxy += g * dx * dy; syy += g * dy * dy;
      }
      return { pi: nk / n, mu: [mx, my], S: [[sxx / nk + REG_COVAR, sxy / nk], [sxy / nk, syy / nk + REG_COVAR]] };
    });
  }

  /* Inicialização: médias em pontos sorteados, covariância global, pesos iguais. */
  function inicializar(X, semente) {
    const r = G.aleatorio(semente), n = X.length, usados = new Set();
    while (usados.size < K) usados.add(Math.floor(r.u() * n));
    let mx = 0, my = 0;
    for (const p of X) { mx += p[0]; my += p[1]; }
    mx /= n; my /= n;
    let sxx = 0, sxy = 0, syy = 0;
    for (const p of X) { sxx += (p[0] - mx) ** 2; sxy += (p[0] - mx) * (p[1] - my); syy += (p[1] - my) ** 2; }
    const S = [[sxx / n, sxy / n], [sxy / n, syy / n]];
    return [...usados].map(i => ({ pi: 1 / K, mu: X[i].slice(), S: S.map(l => l.slice()) }));
  }

  function eixosDispersao(alvo, L, H) {
    const caixa = { esq: 100, dir: L - 16, topo: 12, base: H - 88 };
    const x = G.linear(-7, 7, caixa.esq, caixa.dir), y = G.linear(-5, 6, caixa.base, caixa.topo);
    const svg = G.el("svg", { viewBox: `0 0 ${L} ${H}`, role: "img", "aria-label": "Dispersão de uma mistura de três gaussianas" }, alvo);
    G.eixos(svg, x, y, caixa, { rotuloX: "x₁", rotuloY: "x₂" });
    const idClip = `clip-${alvo.id}`;
    G.el("rect", { x: caixa.esq, y: caixa.topo, width: caixa.dir - caixa.esq, height: caixa.base - caixa.topo }, G.el("clipPath", { id: idClip }, G.el("defs", {}, svg)));
    return { svg, x, y, caixa, idClip };
  }

  function legendaPesos(alvo) {
    const legenda = document.createElement("div");
    legenda.className = "legenda-cores";
    legenda.innerHTML = VERDADE.map((c, k) => `<span><i style="background:${CORES[k]}"></i>k = ${k + 1}, π = ${G.numero(c.pi, 2)}</span>`).join("");
    alvo.parentNode.insertBefore(legenda, alvo);
  }

  function botao(pai, texto, aoClicar) {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = texto;
    b.addEventListener("click", aoClicar);
    pai.appendChild(b);
    return b;
  }

  function grupoBotoes(controles) {
    const g = document.createElement("div"); g.className = "botoes";
    controles.appendChild(g);
    return g;
  }

  function elipseRotulada(svg, c, k, x, y) {
    G.el("path", { d: G.caminhoElipse(c.mu, c.S, RAIO, x, y), fill: "none", stroke: CORES[k], "stroke-width": "3.5px" }, svg);
    G.el("text", { class: "rotulo-direto", x: x(c.mu[0]), y: y(c.mu[1] + RAIO * Math.sqrt(c.S[1][1])) - 14, "text-anchor": "middle", texto: `k = ${k + 1}` }, svg);
  }

  /* Geração passo a passo: sorteia a componente e depois o ponto. */
  function geracao({ alvo, controles }) {
    const { svg, x, y } = eixosDispersao(alvo, 860, 545);
    legendaPesos(alvo);
    const pontos = amostrar(N_MAX, SEMENTE_DADOS);
    const camadaElipses = G.el("g", {}, svg);
    VERDADE.forEach((c, k) => elipseRotulada(camadaElipses, c, k, x, y));
    const camadaPontos = G.el("g", {}, svg);
    let m = 0, comRotulo = true, ultimo = null;

    const leitura = document.createElement("span"); leitura.className = "data-atual";
    const acoes = grupoBotoes(controles);
    function atualizarLeitura() {
      leitura.textContent = m === 0 ? "n = 0" : comRotulo ? `n = ${m}, último k = ${pontos[m - 1].k + 1}` : `n = ${m}`;
    }
    function acrescentar(q) {
      if (ultimo) ultimo.classList.remove("selecionado");
      for (let i = 0; i < q && m < N_MAX; i++, m++) {
        const pt = pontos[m];
        ultimo = G.el("circle", { class: "marcador", cx: x(pt.p[0]), cy: y(pt.p[1]), r: 6.5, fill: comRotulo ? CORES[pt.k] : "var(--tinta-2)" }, camadaPontos);
        ultimo.dataset.k = pt.k;
      }
      if (ultimo) ultimo.classList.add("selecionado");
      atualizarLeitura();
    }
    botao(acoes, "Gerar 1", () => acrescentar(1));
    botao(acoes, "Gerar 50", () => acrescentar(50));
    botao(acoes, "Limpar", () => { camadaPontos.replaceChildren(); m = 0; ultimo = null; atualizarLeitura(); });
    const modos = grupoBotoes(controles);
    window.Mapas.botoes(modos, [["com", "Com rótulos"], ["sem", "Sem rótulos"]], "com", chave => {
      comRotulo = chave === "com";
      camadaElipses.style.display = comRotulo ? "" : "none";
      for (const c of camadaPontos.children) c.style.fill = comRotulo ? CORES[Number(c.dataset.k)] : "var(--tinta-2)";
      atualizarLeitura();
    });
    controles.appendChild(leitura);
    atualizarLeitura();
  }

  /* Cor de um ponto: média das cores das componentes, ponderada por γ. */
  function misturaCores(g, rgb) {
    const c = [0, 1, 2].map(i => Math.round(g[0] * rgb[0][i] + g[1] * rgb[1][i] + g[2] * rgb[2][i]));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }

  /* Responsabilidades com parâmetros conhecidos: cor por γ e dica com os valores. */
  function responsabilidade(alvo) {
    const { svg, x, y } = eixosDispersao(alvo, 860, 680);
    const rgb = TOKENS_CORES.map(n => window.Mapas.hexRgb(getComputedStyle(alvo).getPropertyValue(n)));
    const pontos = amostrar(N_AMOSTRA, SEMENTE_DADOS);
    const camada = G.el("g", {}, svg);
    pontos.forEach(pt => {
      pt.g = responsabilidades(pt.p, VERDADE);
      pt.no = G.el("circle", { class: "marcador", cx: x(pt.p[0]), cy: y(pt.p[1]), r: 6.5, fill: misturaCores(pt.g, rgb) }, camada);
    });
    VERDADE.forEach((c, k) => elipseRotulada(svg, c, k, x, y));

    const dica = G.dica(alvo);
    let marcado = null;
    function limpar() {
      if (marcado) marcado.no.classList.remove("selecionado");
      marcado = null;
      dica.esconder();
    }
    svg.addEventListener("pointermove", ev => {
      const [mx, my] = G.pontoSvg(svg, ev);
      let melhor = null, dMin = 40 * 40;
      for (const pt of pontos) {
        const d = (x(pt.p[0]) - mx) ** 2 + (y(pt.p[1]) - my) ** 2;
        if (d < dMin) { dMin = d; melhor = pt; }
      }
      if (!melhor) { limpar(); return; }
      if (melhor !== marcado) {
        if (marcado) marcado.no.classList.remove("selecionado");
        marcado = melhor;
        marcado.no.classList.add("selecionado");
        camada.appendChild(marcado.no);
      }
      dica.mostrar(ev, `<div class="cabeca">γ<sub>ik</sub></div>` + melhor.g.map((v, k) =>
        `<div class="linha"><i style="background:${CORES[k]}"></i>k = ${k + 1}<b>${G.numero(v, 3)}</b></div>`).join(""));
    });
    svg.addEventListener("pointerleave", limpar);
  }

  /* EM passo a passo, com a curva de log-verossimilhança e as inicializações anteriores. */
  function estimacao({ alvo, curva, controles }) {
    const dados = amostrar(N_AMOSTRA, SEMENTE_DADOS), X = dados.map(d => d.p);
    const { svg, x, y, idClip } = eixosDispersao(alvo, 907, 470);
    const rgb = TOKENS_CORES.map(n => window.Mapas.hexRgb(getComputedStyle(alvo).getPropertyValue(n)));
    const circulos = X.map(p => G.el("circle", { class: "marcador", cx: x(p[0]), cy: y(p[1]), r: 5.5, fill: "var(--eixo)" }, svg));
    const camadaElipses = G.el("g", { "clip-path": `url(#${idClip})` }, svg);

    const LC = 907, HC = 230, cc = { esq: 112, dir: LC - 24, topo: 12, base: HC - 76 };
    const svgC = G.el("svg", { viewBox: `0 0 ${LC} ${HC}`, role: "img", "aria-label": "Log-verossimilhança por iteração" }, curva);

    let par, gama = null, fase = "E", it = 0, hist = [], relogio = null, convergiu = false, idSemente = 0;
    const anteriores = [];

    const passos = grupoBotoes(controles), corrida = grupoBotoes(controles), reinicio = grupoBotoes(controles);
    const bE = botao(passos, "Passo E", () => { pausar(); executarE(); desenhar(); });
    const bM = botao(passos, "Passo M", () => { pausar(); executarM(); desenhar(); });
    const bRodar = botao(corrida, "Rodar", () => { if (relogio) pausar(); else rodar(); });
    botao(reinicio, "Nova inicialização", () => { pausar(); guardar(); idSemente = (idSemente + 1) % SEMENTES.length; iniciar(); });
    const leitura = document.createElement("span"); leitura.className = "data-atual";
    controles.appendChild(leitura);

    function executarE() {
      if (fase !== "E" || convergiu) return;
      const r = passoE(X, par);
      gama = r.gama;
      if (hist.length && Math.abs(r.ll - hist[hist.length - 1]) < TOL_LL) convergiu = true;
      hist.push(r.ll);
      fase = "M";
    }
    function executarM() {
      if (fase !== "M" || convergiu) return;
      par = passoM(X, gama);
      it += 1;
      fase = "E";
      if (it >= MAX_ITER) convergiu = true;
    }
    function pausar() {
      if (relogio) clearInterval(relogio);
      relogio = null;
      bRodar.textContent = "Rodar";
    }
    function rodar() {
      bRodar.textContent = "Pausar";
      relogio = setInterval(() => {
        executarE();
        executarM();
        desenhar();
        if (convergiu) pausar();
      }, QUADRO_MS);
    }
    function guardar() { if (hist.length > 1) anteriores.push(hist.slice()); }
    function iniciar() {
      par = inicializar(X, SEMENTES[idSemente]);
      gama = null; fase = "E"; it = 0; hist = []; convergiu = false;
      desenhar();
    }

    function desenharCurva() {
      svgC.replaceChildren();
      const todas = [...anteriores, hist], valores = todas.flat();
      const maxIt = Math.max(30, ...todas.map(h => h.length - 1));
      let lo = valores.length ? Math.min(...valores) : -6, hi = valores.length ? Math.max(...valores) : -3;
      if (hi - lo < 0.2) { lo -= 0.1; hi += 0.1; }
      const pad = (hi - lo) * 0.08;
      const xC = G.linear(0, maxIt, cc.esq, cc.dir), yC = G.linear(lo - pad, hi + pad, cc.base, cc.topo);
      G.eixos(svgC, xC, yC, cc, { rotuloX: "Iteração", rotuloY: "ℓ / n", nY: 3, nX: 6, casas: 1, fmtX: v => G.numero(v, 0) });
      const traco = (h, cor, l) => {
        if (!h.length) return;
        G.el("path", { d: h.map((v, i) => `${i ? "L" : "M"}${xC(i).toFixed(1)} ${yC(v).toFixed(1)}`).join(""), fill: "none", stroke: cor, "stroke-width": l, "stroke-linejoin": "round" }, svgC);
      };
      anteriores.forEach(h => traco(h, "var(--eixo)", "3px"));
      traco(hist, "var(--marinho)", "4px");
    }

    function desenhar() {
      camadaElipses.replaceChildren();
      par.forEach((c, k) => {
        G.el("path", { d: G.caminhoElipse(c.mu, c.S, RAIO, x, y), fill: "none", stroke: CORES[k], "stroke-width": "4px" }, camadaElipses);
        G.el("circle", { class: "marcador", cx: x(c.mu[0]), cy: y(c.mu[1]), r: 9, fill: CORES[k] }, camadaElipses);
      });
      if (convergiu) {
        VERDADE.forEach(c => G.el("path", { d: G.caminhoElipse(c.mu, c.S, RAIO, x, y), fill: "none", stroke: "var(--tinta)", "stroke-width": "3px", "stroke-dasharray": "10 8" }, camadaElipses));
        VERDADE.forEach(c => {
          const px = x(c.mu[0]), py = y(c.mu[1]), m = 13;
          G.el("path", { d: `M${px - m} ${py - m}L${px + m} ${py + m}M${px - m} ${py + m}L${px + m} ${py - m}`, fill: "none", stroke: "var(--tinta)", "stroke-width": "5px", "stroke-linecap": "round" }, camadaElipses);
        });
      }
      circulos.forEach((c, i) => {
        if (!gama) c.style.setProperty("fill", "var(--eixo)");
        else c.style.setProperty("fill", misturaCores(gama[i], rgb));
      });
      bE.disabled = fase !== "E" || convergiu;
      bM.disabled = fase !== "M" || convergiu;
      bE.classList.toggle("ativo", fase === "E" && !convergiu);
      bM.classList.toggle("ativo", fase === "M" && !convergiu);
      const llTxt = hist.length ? `, ℓ/n = ${G.numero(hist[hist.length - 1], 3)}` : "";
      leitura.textContent = `Iteração ${it}${llTxt}${convergiu ? ". Tracejado e ×: verdade." : ""}`;
      desenharCurva();
    }

    iniciar();
    alvo._em = {
      avancar(n) { for (let i = 0; i < n && !convergiu; i++) { executarE(); executarM(); } desenhar(); },
      estado: () => ({ it, convergiu, hist: hist.slice(), par: JSON.parse(JSON.stringify(par)), semente: SEMENTES[idSemente] }),
    };
    return { pausar };
  }

  /* Expostos para a comparação com o scikit-learn. */
  function teste(semente, nIter) {
    const X = amostrar(N_AMOSTRA, SEMENTE_DADOS).map(d => d.p), ini = inicializar(X, semente);
    let par = ini, ll = null;
    for (let i = 0; i < nIter; i++) { const r = passoE(X, par); ll = r.ll; par = passoM(X, r.gama); }
    return { X, ini, par, ll };
  }
  function finalPorSemente(sementes) {
    const X = amostrar(N_AMOSTRA, SEMENTE_DADOS).map(d => d.p);
    return sementes.map(s => {
      let par = inicializar(X, s), ant = null, it = 0, ll = 0;
      for (; it < MAX_ITER; it++) {
        const r = passoE(X, par); ll = r.ll;
        if (ant !== null && Math.abs(ll - ant) < TOL_LL) break;
        ant = ll; par = passoM(X, r.gama);
      }
      return { semente: s, ll, it, pi: par.map(c => c.pi) };
    });
  }

  window.DemoGMM = { geracao, responsabilidade, estimacao, teste, finalPorSemente };
})();
