/* EDA do GMM: cargas da PCA de X e gaussianas projetadas em pares de componentes principais. */
(function () {
  "use strict";
  const G = window.Graficos;

  const PROB_ELIPSE = 0.90;
  const RAIO = G.raioProb2d(PROB_ELIPSE);
  const DIV = ["--div-1", "--div-2", "--div-3", "--div-4", "--div-5"];
  const FUNDO = ["--superficie", "--grade", "--eixo", "--mudo"];
  const barra = s => `<span class="media">${s}</span>`;

  /* Tabela de cargas das primeiras componentes, com a variância explicada. */
  function cargas(corpo) {
    const D = window.DADOS_PCA, M = window.Mapas;
    const lut = M.lutParadas(getComputedStyle(corpo), DIV);
    const n = D.cargas[0].length;
    let html = "<tbody>";
    D.features.forEach((f, q) => {
      html += `<tr><td>${f}</td>`;
      for (let c = 0; c < n; c++) {
        const v = D.cargas[q][c], a = Math.round(Math.min(1, Math.max(0, (v + D.cargas_max) / (2 * D.cargas_max))) * 255);
        const claro = Math.abs(v) > 0.72 * D.cargas_max;
        html += `<td style="background: rgb(${lut[a * 3]},${lut[a * 3 + 1]},${lut[a * 3 + 2]}); color: var(${claro ? "--sobre-escuro" : "--tinta"})">${G.numero(Math.round(v * 100) / 100 + 0, 2)}</td>`;
      }
      html += "</tr>";
    });
    html += `</tbody><tbody class="escalas"><tr><td>Variância (%)</td>${D.variancia.slice(0, n).map(v => `<td>${G.numero(v * 100, 1)}</td>`).join("")}</tr></tbody>`;
    corpo.insertAdjacentHTML("beforeend", html);
  }

  /* Densidade de X no plano de dois PCs, com a elipse de 90% de cada estado. */
  function criar({ alvo, estados }) {
    const D = window.DADOS_PCA, F = window.DADOS_NOMEACAO.gmm, M = window.Mapas;
    const K = D.mu.length, L = 1080, H = 700, caixa = { esq: 100, dir: 1064, topo: 14, base: 618 };
    const lut = M.lutParadas(getComputedStyle(alvo), FUNDO);
    const hist = D.hist.dados.map(M.bytes), { nx, ny } = D.hist;

    const svg = G.el("svg", { viewBox: `0 0 ${L} ${H}`, role: "img", "aria-label": "Densidade de X e gaussianas projetadas no plano de dois componentes principais" }, alvo);
    const idClip = `clip-${alvo.id}`;
    G.el("rect", { x: caixa.esq, y: caixa.topo, width: caixa.dir - caixa.esq, height: caixa.base - caixa.topo }, G.el("clipPath", { id: idClip }, G.el("defs", {}, svg)));
    const fo = G.el("foreignObject", { x: caixa.esq, y: caixa.topo, width: caixa.dir - caixa.esq, height: caixa.base - caixa.topo }, svg);
    const tela = document.createElementNS("http://www.w3.org/1999/xhtml", "canvas");
    tela.width = nx; tela.height = ny;
    tela.style.imageRendering = "auto";
    fo.appendChild(tela);
    const ctx = tela.getContext("2d"), img = ctx.createImageData(nx, ny);
    const camadaEixos = G.el("g", {}, svg);
    const camadaElipses = G.el("g", { "clip-path": `url(#${idClip})` }, svg);
    const camadaRotulos = G.el("g", { "clip-path": `url(#${idClip})` }, svg);

    const par = 0;
    let sobre = null, x, y;
    const visivel = new Array(K).fill(true);
    const dica = G.dica(alvo);

    const elipse = k => {
      const [a, b] = D.pares[par];
      return { mu: [D.mu[k][a], D.mu[k][b]], S: [[D.S[k][a][a], D.S[k][a][b]], [D.S[k][b][a], D.S[k][b][b]]] };
    };

    function desenharFundo() {
      const h = hist[par];
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const v = h[j * nx + i], q = ((ny - 1 - j) * nx + i) * 4;
          img.data.set([lut[v * 3], lut[v * 3 + 1], lut[v * 3 + 2], v ? 255 : 0], q);
        }
      }
      ctx.putImageData(img, 0, 0);
    }

    function desenharElipses() {
      camadaElipses.replaceChildren();
      camadaRotulos.replaceChildren();
      const ordem = [...Array(K).keys()].filter(k => visivel[k]).sort((p, q) => (p === sobre) - (q === sobre));
      for (const k of ordem) {
        const e = elipse(k), d = G.caminhoElipse(e.mu, e.S, RAIO, x, y);
        G.el("path", { d, fill: "none", stroke: "var(--superficie)", "stroke-width": k === sobre ? "11px" : "8px" }, camadaElipses);
        G.el("path", { d, fill: "none", stroke: D.cores[k], "stroke-width": k === sobre ? "7px" : "4px" }, camadaElipses);
      }
      for (const k of ordem) {
        const e = elipse(k), sy = Math.sqrt(e.S[1][1]);     // número no ponto mais alto da elipse: os centros quase coincidem
        const lx = e.mu[0] + RAIO * e.S[0][1] / sy, ly = e.mu[1] + RAIO * sy;
        G.plaqueta(camadaRotulos, x(lx), Math.max(caixa.topo + 28, y(ly) + 9), `${k}`, "middle");
      }
    }

    function desenhar() {
      const [a, b] = D.pares[par];
      x = G.linear(D.hist.lo[a], D.hist.hi[a], caixa.esq, caixa.dir);
      y = G.linear(D.hist.lo[b], D.hist.hi[b], caixa.base, caixa.topo);
      desenharFundo();
      camadaEixos.replaceChildren();
      G.eixos(camadaEixos, x, y, caixa, {
        rotuloX: `PC${a + 1} (${G.numero(D.variancia[a] * 100, 1)}% da variância)`,
        rotuloY: `PC${b + 1} (${G.numero(D.variancia[b] * 100, 1)}%)`, nX: 8, nY: 7,
      });
      desenharElipses();
    }

    const botoes = F.map((s, k) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "estado-botao";
      b.innerHTML = `<i class="chip" style="background: ${D.cores[k]}"></i><b>${k}</b><span>${s.regime}</span>`;
      b.setAttribute("aria-pressed", "true");
      b.addEventListener("click", () => alternar(k));
      estados.appendChild(b);
      return b;
    });
    function alternar(k) {
      visivel[k] = !visivel[k];
      botoes[k].classList.toggle("desligado", !visivel[k]);
      botoes[k].setAttribute("aria-pressed", String(visivel[k]));
      if (!visivel[k] && sobre === k) { sobre = null; dica.esconder(); }
      desenharElipses();
    }

    function estadoEm(ev) {
      const [mx, my] = G.pontoSvg(svg, ev);
      if (mx < caixa.esq || mx > caixa.dir || my < caixa.topo || my > caixa.base) return null;
      const px = x.inversa(mx), py = y.inversa(my);
      let melhor = null, dMin = RAIO * RAIO;
      for (let k = 0; k < K; k++) {
        if (!visivel[k]) continue;
        const { mu, S } = elipse(k), det = S[0][0] * S[1][1] - S[0][1] * S[1][0];
        const dx = px - mu[0], dy = py - mu[1];
        const d2 = (S[1][1] * dx * dx - 2 * S[0][1] * dx * dy + S[0][0] * dy * dy) / det;
        if (d2 <= dMin) { dMin = d2; melhor = k; }
      }
      return melhor;
    }
    svg.addEventListener("pointermove", ev => {
      const k = estadoEm(ev);
      if (k !== sobre) { sobre = k; desenharElipses(); }
      if (k === null) { dica.esconder(); return; }
      const s = F[k];
      dica.mostrar(ev, `<div class="cabeca">Estado ${k}: ${s.regime}</div>` +
        `<div class="linha">Pares<b>${G.numero(s.frac * 100, 1)}%</b></div>` +
        `<div class="linha"><span>${barra("|V|")} (m s⁻¹)</span><b>${G.numero(s.speed, 3)}</b></div>` +
        `<div class="linha"><span>${barra("u")}<sub>∥</sub> (m s⁻¹)</span><b>${G.numero(s.along, 3)}</b></div>` +
        `<div class="linha"><span>W &lt; 0</span><b>${G.numero(s.wneg * 100, 0)}%</b></div>` +
        `<div class="linha">${barra("C")}<b>${G.numero(s.coh, 3)}</b></div>`);
    });
    svg.addEventListener("pointerleave", () => { if (sobre !== null) { sobre = null; desenharElipses(); } dica.esconder(); });

    desenhar();
    alvo._pca = {
      alternar,
      estado: () => ({ par, pares: D.pares, visivel: [...visivel], sobre, elipses: [...Array(K).keys()].map(elipse), paths: camadaElipses.children.length }),
      telaDe(k) {
        const e = elipse(k), m = svg.getScreenCTM(), a = x(e.mu[0]), b = y(e.mu[1]);
        return [m.a * a + m.c * b + m.e, m.b * a + m.d * b + m.f];
      },
    };
  }

  window.PCA = { cargas, criar };
})();
