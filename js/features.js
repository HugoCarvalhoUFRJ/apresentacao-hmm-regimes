/* Features: mapas das colunas de X na janela do vórtice, referencial da isóbata, winsorização e tabela da matriz. */
(function () {
  "use strict";
  const G = window.Graficos;

  const AUSENTE = -32768;
  const DIV = ["--div-1", "--div-2", "--div-3", "--div-4", "--div-5"];
  const DIA_INICIAL = 13;
  const CELULA_INICIAL = { lat: -22.44, lon: -39.38 };

  const maisProximo = (lista, v) => lista.reduce((b, x, k) => Math.abs(x - v) < Math.abs(lista[b] - v) ? k : b, 0);
  const semSub = s => s.replace(/<\/?sub>/g, "");
  const posTexto = (D, j, i) => `${G.numero(Math.abs(D.lat[j]), 2)}°S, ${G.numero(Math.abs(D.lon[i]), 2)}°O`;

  /* Mapa da feature selecionada. Sem `linhas`, mostra só o mapa; `chaves` limita as colunas disponíveis. */
  function criar({ mapa, controles, linhas = null, cabecalho = null, chaves = null, colunaInicial = "zeta", L = 950, H = 640 }) {
    const D = window.DADOS_FEATURES, M = window.Mapas;
    const { nt, ny, nx, colunas } = D, nc = colunas.length;
    const x = new Int16Array(M.bytes(D.x_mm).buffer), oceano = M.bytes(D.oceano);
    const estilos = getComputedStyle(mapa);
    const lutDiv = M.lutParadas(estilos, DIV), lutSeq = M.lutParadas(estilos, M.ETAPAS_RAMPA);
    const terra = M.hexRgb(estilos.getPropertyValue("--terra")), fora = M.hexRgb(estilos.getPropertyValue("--fora-analise"));
    const inicioMs = Date.parse(`${D.inicio}T00:00:00Z`);
    const dmy = d => {
      const q = new Date(inicioMs + d * 86400000);
      return `${String(q.getUTCDate()).padStart(2, "0")}/${String(q.getUTCMonth() + 1).padStart(2, "0")}/${q.getUTCFullYear()}`;
    };
    const indice = (t, c, j, i) => (t * nc + c) * ny * nx + j * nx + i;

    let t = DIA_INICIAL, col = colunas.findIndex(c => c.chave === colunaInicial);
    let sel = { j: maisProximo(D.lat, CELULA_INICIAL.lat), i: maisProximo(D.lon, CELULA_INICIAL.lon) };

    const painel = M.painelGrade(mapa, D, { L, H, aria: "Mapa da feature selecionada" });
    const { svg, area, caixa, c, ctx, img } = painel;
    const marca = linhas ? G.el("rect", { width: c, height: c, fill: "none", stroke: "var(--tinta)", "stroke-width": "4px" }, area) : null;
    const sob = G.el("rect", { width: c, height: c, fill: "none", stroke: "var(--tinta)", "stroke-width": "2.5px", visibility: "hidden" }, area);
    const posiciona = (r, j, i) => { r.setAttribute("x", caixa.esq + i * c); r.setAttribute("y", caixa.topo + (ny - 1 - j) * c); };

    const grupo = document.createElement("div"); grupo.className = "botoes";
    const faixa = document.createElement("input");
    Object.assign(faixa, { type: "range", min: 0, max: nt - 1, step: 1, value: t });
    faixa.setAttribute("aria-label", "Dia");
    const rotulo = document.createElement("span"); rotulo.className = "data-atual";
    controles.append(grupo, faixa, rotulo);

    const visiveis = colunas.filter(k => !chaves || chaves.includes(k.chave));
    const seletor = M.botoes(grupo, visiveis.map(k => [k.chave, k.rotulo]), colunaInicial, k => definirColuna(colunas.findIndex(q => q.chave === k)));

    const filas = linhas ? colunas.map((k, q) => {
      const fila = document.createElement("div"); fila.className = "linha-x";
      fila.innerHTML = `<span>${k.rotulo}</span><span class="trilha"><i class="zero"></i><i class="barra"></i></span><span class="valor"></span>`;
      fila.addEventListener("click", () => definirColuna(q));
      linhas.appendChild(fila);
      return { fila, barra: fila.querySelector(".barra"), valor: fila.querySelector(".valor") };
    }) : [];

    function definirColuna(q) {
      col = q;
      seletor.definir(colunas[q].chave);
      desenhar();
    }

    function desenharMapa() {
      const k = colunas[col], lut = k.tipo === "div" ? lutDiv : lutSeq;
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const v = x[indice(t, col, j, i)], q = ((ny - 1 - j) * nx + i) * 4;
          let rgb;
          if (v === AUSENTE) rgb = oceano[j * nx + i] ? fora : terra;
          else {
            const a = Math.round(Math.min(1, Math.max(0, ((v / 1000) * k.fator - k.lo) / (k.hi - k.lo))) * 255);
            rgb = [lut[a * 3], lut[a * 3 + 1], lut[a * 3 + 2]];
          }
          img.data.set([rgb[0], rgb[1], rgb[2], 255], q);
        }
      }
      ctx.putImageData(img, 0, 0);
      painel.barraCores(lut, k.lo, k.hi, semSub(k.rotulo) + (k.unidade ? ` (${k.unidade})` : ""));
    }

    function desenharLinha() {
      if (!linhas) return;
      cabecalho.textContent = `Célula ${posTexto(D, sel.j, sel.i)}, ${dmy(t)}`;
      posiciona(marca, sel.j, sel.i);
      filas.forEach((f, q) => {
        const v = x[indice(t, q, sel.j, sel.i)] / 1000, meia = 50 / D.x_max;
        f.barra.style.left = v >= 0 ? "50%" : `${50 + v * meia}%`;
        f.barra.style.width = `${Math.abs(v) * meia}%`;
        f.barra.classList.toggle("negativa", v < 0);
        f.valor.textContent = G.numero(v, 2);
        f.fila.classList.toggle("ativa", q === col);
      });
    }

    function desenhar() {
      desenharMapa();
      desenharLinha();
      faixa.value = t;
      rotulo.textContent = dmy(t);
    }

    faixa.addEventListener("input", () => { t = Number(faixa.value); desenhar(); });

    const dica = G.dica(mapa);
    const esconder = () => { sob.setAttribute("visibility", "hidden"); dica.esconder(); };
    svg.addEventListener("pointerleave", esconder);
    svg.addEventListener("pointermove", ev => {
      const cel = painel.celulaEm(ev);
      if (!cel) { esconder(); return; }
      posiciona(sob, cel.j, cel.i);
      sob.setAttribute("visibility", "visible");
      const v = x[indice(t, col, cel.j, cel.i)], k = colunas[col];
      let html = `<div class="cabeca">${posTexto(D, cel.j, cel.i)}</div>`;
      if (v === AUSENTE) html += `<div class="linha">${oceano[cel.j * nx + cel.i] ? "Fora da análise" : "Terra"}</div>`;
      else html += `<div class="linha">${k.rotulo}<b>${G.numero(v / 1000 * k.fator, k.casas)}${k.unidade ? " " + k.unidade : ""}</b></div>` +
        `<div class="linha">X<b>${G.numero(v / 1000, 2)}</b></div>`;
      dica.mostrar(ev, html);
    });
    if (linhas) {
      svg.addEventListener("click", ev => {
        const cel = painel.celulaEm(ev);
        if (!cel || x[indice(t, col, cel.j, cel.i)] === AUSENTE) return;
        sel = cel;
        desenharLinha();
      });
    }

    desenhar();
    mapa._features = {
      telaDe: (lat, lon) => painel.telaDe(maisProximo(D.lat, lat), maisProximo(D.lon, lon)),
      ir(d) { t = d; desenhar(); },
    };
  }

  /* Versor ê∥ ou velocidade média sobre as células de análise. */
  function referencial({ mapa, controles }) {
    const D = window.DADOS_FEATURES, M = window.Mapas, E = window.Esquemas;
    const { ny, nx } = D;
    const para = b64 => new Int16Array(M.bytes(b64).buffer);
    const vers = para(D.versor_e4), vel = para(D.v_medio_mm), prof = para(D.prof_m), oceano = M.bytes(D.oceano);
    const estilos = getComputedStyle(mapa);
    const terra = M.hexRgb(estilos.getPropertyValue("--terra")), fora = M.hexRgb(estilos.getPropertyValue("--fora-analise"));
    const analise = M.hexRgb(estilos.getPropertyValue("--azul-100"));
    const painel = M.painelGrade(mapa, D, { L: 770, H: 640, aria: "Versor ao longo da isóbata e velocidade média" });
    const { svg, area, caixa, c, px, py, ctx, img } = painel;

    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i, q = ((ny - 1 - j) * nx + i) * 4;
        const rgb = prof[k] !== AUSENTE ? analise : oceano[k] ? fora : terra;
        img.data.set([rgb[0], rgb[1], rgb[2], 255], q);
      }
    }
    ctx.putImageData(img, 0, 0);

    const setas = G.el("g", {}, area);
    const chave = G.el("g", {}, svg);
    const ESCALA_V = 90;                // px por m s⁻¹
    function desenhar(modo) {
      setas.replaceChildren();
      chave.replaceChildren();
      for (let j = 1; j < ny; j += 4) {
        for (let i = 1; i < nx; i += 4) {
          const k = j * nx + i;
          if (prof[k] === AUSENTE) continue;
          const x0 = px(i), y0 = py(j);
          if (modo === "e") {
            const ex = vers[k] / 1e4, ey = vers[k + ny * nx] / 1e4;
            E.seta(setas, x0 - 11 * ex, y0 + 11 * ey, x0 + 13 * ex, y0 - 13 * ey, { ponta: 5, largura: 2.5 });
          } else {
            const ux = vel[k] / 1000, uy = vel[k + ny * nx] / 1000;
            if (Math.hypot(ux, uy) * ESCALA_V < 5) continue;
            E.seta(setas, x0, y0, x0 + ux * ESCALA_V, y0 - uy * ESCALA_V, { ponta: 5, largura: 2.5 });
          }
        }
      }
      if (modo === "v") {
        const x0 = caixa.esq + 18, y0 = caixa.topo + 34;
        G.el("line", { x1: x0, x2: x0 + 0.5 * ESCALA_V, y1: y0, y2: y0, stroke: "var(--tinta)", "stroke-width": "2.5px", "stroke-linecap": "round" }, chave);
        G.el("text", { x: x0 + 0.5 * ESCALA_V + 12, y: y0 + 9, texto: "0,5 m s⁻¹" }, chave);
      }
    }
    const grupo = document.createElement("div"); grupo.className = "botoes";
    controles.appendChild(grupo);
    M.botoes(grupo, [["e", "ê<sub>∥</sub>"], ["v", "Velocidade média"]], "e", desenhar);
    desenhar("e");

    const dica = G.dica(mapa);
    const sob = G.el("rect", { width: c, height: c, fill: "none", stroke: "var(--tinta)", "stroke-width": "2.5px", visibility: "hidden" }, area);
    const esconder = () => { sob.setAttribute("visibility", "hidden"); dica.esconder(); };
    svg.addEventListener("pointerleave", esconder);
    svg.addEventListener("pointermove", ev => {
      const cel = painel.celulaEm(ev);
      if (!cel) { esconder(); return; }
      const k = cel.j * nx + cel.i;
      sob.setAttribute("x", caixa.esq + cel.i * c); sob.setAttribute("y", caixa.topo + (ny - 1 - cel.j) * c); sob.setAttribute("visibility", "visible");
      let html = `<div class="cabeca">${posTexto(D, cel.j, cel.i)}</div>`;
      if (prof[k] === AUSENTE) html += `<div class="linha">${oceano[k] ? "Fora da análise" : "Terra"}</div>`;
      else html += `<div class="linha">Prof.<b>${prof[k].toLocaleString("pt-BR")} m</b></div>`;
      dica.mostrar(ev, html);
    });
    mapa._referencial = { telaDe: (lat, lon) => painel.telaDe(maisProximo(D.lat, lat), maisProximo(D.lon, lon)) };
  }

  /* Histograma antes da winsorização, com os limites de corte. */
  function histograma({ alvo, controles, curtose }) {
    const D = window.DADOS_FEATURES, M = window.Mapas;
    const nomes = { zeta: "ζ/|f|", W: "W/f²", zeta_g: "ζ<sub>geo</sub>/|f|", W_g: "W<sub>geo</sub>/f²" };
    const L = 907, H = 590, cx = { esq: 112, dir: L - 30, topo: 14, base: H - 92 };
    const svg = G.el("svg", { viewBox: `0 0 ${L} ${H}`, role: "img", "aria-label": "Histograma antes da winsorização" }, alvo);
    const dica = G.dica(alvo);
    let barras = [];
    function desenhar(chave) {
      svg.replaceChildren();
      const h = D.hist[chave], n = h.frac.length, x1 = h.x0 + n * h.dx;
      const pos = h.frac.filter(v => v > 0), piso = Math.floor(Math.log10(Math.min(...pos))), teto = Math.ceil(Math.log10(Math.max(...pos)));
      const x = G.linear(h.x0, x1, cx.esq, cx.dir), y = G.linear(piso, teto, cx.base, cx.topo);
      const marcasY = []; for (let p = piso; p <= teto; p++) marcasY.push(p);
      const ms = x.marcas(6), casas = Math.max(0, -Math.floor(Math.log10((ms[1] - ms[0]) * 1.0001)));
      G.eixos(svg, x, y, cx, { rotuloX: semSub(nomes[chave]), rotuloY: "Fração das amostras", marcasY, fmtY: p => G.decada(p), nX: 6, casas });
      G.el("rect", { x: cx.esq, y: cx.topo, width: x(h.q_lo) - cx.esq, height: cx.base - cx.topo, fill: "var(--serie-2)", "fill-opacity": "0.14" }, svg);
      G.el("rect", { x: x(h.q_hi), y: cx.topo, width: cx.dir - x(h.q_hi), height: cx.base - cx.topo, fill: "var(--serie-2)", "fill-opacity": "0.14" }, svg);
      barras = h.frac.map((f, k) => {
        if (f <= 0) return null;
        const xa = x(h.x0 + k * h.dx), xb = x(h.x0 + (k + 1) * h.dx);
        G.el("rect", { x: xa + 1, y: y(Math.log10(f)), width: Math.max(1, xb - xa - 2), height: cx.base - y(Math.log10(f)), fill: "var(--azul-500)" }, svg);
        return { xa, xb, f, v: h.x0 + (k + 0.5) * h.dx };
      });
      for (const q of [h.q_lo, h.q_hi]) G.el("line", { x1: x(q), x2: x(q), y1: cx.topo, y2: cx.base, stroke: "var(--serie-2)", "stroke-width": "3.5px" }, svg);
      G.el("text", { class: "rotulo-direto", x: x(h.q_lo) + 10, y: cx.topo + 32, texto: `1%: ${G.numero(h.q_lo, 3)}` }, svg);
      G.el("text", { class: "rotulo-direto", x: x(h.q_hi) - 10, y: cx.topo + 32, "text-anchor": "end", texto: `99%: ${G.numero(h.q_hi, 3)}` }, svg);
      curtose.textContent = `Curtose em excesso: ${G.numero(h.curt_antes, 1)} antes, ${G.numero(h.curt_depois, 1)} depois.`;
    }
    svg.addEventListener("pointermove", ev => {
      const [mx] = G.pontoSvg(svg, ev);
      const b = barras.find(q => q && mx >= q.xa && mx <= q.xb);
      if (!b) { dica.esconder(); return; }
      dica.mostrar(ev, `<div class="linha">Valor<b>${G.numero(b.v, 3)}</b></div><div class="linha">Fração<b>${G.cientifico(b.f)}</b></div>`);
    });
    svg.addEventListener("pointerleave", () => dica.esconder());
    const grupo = document.createElement("div"); grupo.className = "botoes";
    controles.appendChild(grupo);
    M.botoes(grupo, Object.entries(nomes), "W", desenhar);
    desenhar("W");
  }

  function tabela(alvo) {
    const D = window.DADOS_FEATURES, cols = D.colunas;
    const celula = (v, casas) => `<td>${G.numero(v, casas)}</td>`;
    let html = `<thead><tr><th>(p, t)</th>${cols.map(k => `<th>${k.rotulo}</th>`).join("")}</tr></thead><tbody>`;
    for (const l of D.linhas) {
      if (!l) html += `<tr class="reticencias"><td>⋮</td>${cols.map(() => "<td>⋮</td>").join("")}</tr>`;
      else html += `<tr><td>${l.rotulo}</td>${l.x.map(v => celula(v, 2)).join("")}</tr>`;
    }
    html += `</tbody><tbody class="escalas">`;
    html += `<tr><td>σ<sub>c</sub></td>${cols.map(k => celula(k.sigma, 3)).join("")}</tr>`;
    html += `<tr><td>w<sub>c</sub></td>${cols.map(k => `<td>${k.peso === 1 ? "1" : G.numero(k.peso, 1)}</td>`).join("")}</tr>`;
    html += `<tr><td>Winsorização</td>${cols.map(k => `<td>${k.winsor ? "sim" : "—"}</td>`).join("")}</tr></tbody>`;
    alvo.innerHTML = html;
  }

  window.Features = { criar, referencial, histograma, tabela };
})();
