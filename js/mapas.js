/* Mapa da grade LSE24: batimetria em células, isóbatas, caixas e aproximação animada. Coordenadas do "mundo": (lon, Mercator em graus). */
(function () {
  "use strict";
  const G = window.Graficos;

  const PROF_MIN = 10, PROF_MAX = 6000;
  const MARCAS_PROF = [50, 200, 1000, 5000];
  const ETAPAS_RAMPA = ["--azul-100", "--azul-200", "--azul-300", "--azul-400", "--azul-500", "--azul-600", "--azul-700"];
  const CABO = { lat: -22.0, lon: -41.0, nome: "Cabo de São Tomé" };
  const PASSOS_GRAUS = [10, 5, 2, 1, 0.5];
  const DURACAO_MS = 500;

  const mercator = lat => (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2));
  const mercatorInv = y => (2 * Math.atan(Math.exp(y * Math.PI / 180)) - Math.PI / 2) * 180 / Math.PI;
  const fracaoProf = p => Math.min(1, Math.max(0, Math.log(p / PROF_MIN) / Math.log(PROF_MAX / PROF_MIN)));

  function bytes(b64) {
    const s = atob(b64), u = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    return u;
  }

  function hexRgb(h) {
    const c = h.trim().replace("#", "");
    return [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16));
  }

  function rampa(estilos) {
    const cores = ETAPAS_RAMPA.map(n => hexRgb(estilos.getPropertyValue(n)));
    return t => {
      const p = t * (cores.length - 1), i = Math.min(cores.length - 2, Math.floor(p)), f = p - i;
      return cores[i].map((c, k) => Math.round(c + (cores[i + 1][k] - c) * f));
    };
  }

  function caminhoIsobatas(linhas) {
    let d = "";
    for (const l of linhas) {
      for (let i = 0; i < l.length; i += 2) d += `${i ? "L" : "M"}${l[i]} ${-l[i + 1]}`;
    }
    return d;
  }

  function formatoGrau(v, pos, neg) {
    const a = Math.abs(v);
    return `${Number.isInteger(a) ? a : G.numero(a, 1)}°${v < 0 ? neg : pos}`;
  }

  /* opcoes: { L, H, inicial, comMascara, caixas: [{chave, rotulo, ancora, cor}], margem } */
  function criar(alvo, opcoes) {
    const D = window.DADOS_MAPA;
    const { L, H, comMascara = false } = opcoes;
    const estilos = getComputedStyle(alvo);
    const prof = new Uint16Array(bytes(D.prof).buffer);
    const mascara = bytes(D.mascara);
    const cor = rampa(estilos);

    // Imagem das células (uma por pixel; linha 0 do canvas = norte)
    const tela = document.createElement("canvas");
    tela.width = D.nx; tela.height = D.ny;
    const ctx = tela.getContext("2d"), img = ctx.createImageData(D.nx, D.ny);
    const terra = hexRgb(estilos.getPropertyValue("--terra")), fora = hexRgb(estilos.getPropertyValue("--fora-analise"));
    for (let j = 0; j < D.ny; j++) {
      for (let i = 0; i < D.nx; i++) {
        const k = j * D.nx + i, q = ((D.ny - 1 - j) * D.nx + i) * 4, p = prof[k];
        const rgb = p === 0 ? terra : (comMascara && !mascara[k]) ? fora : cor(fracaoProf(p));
        img.data.set([rgb[0], rgb[1], rgb[2], 255], q);
      }
    }
    ctx.putImageData(img, 0, 0);

    const caixa = { esq: 104, dir: L - 16, topo: 14, base: H - 128 };
    const lp = caixa.dir - caixa.esq, ap = caixa.base - caixa.topo;
    const svg = G.el("svg", { viewBox: `0 0 ${L} ${H}`, role: "img", "aria-label": "Mapa de batimetria da grade LSE24" }, alvo);
    const idClip = `clip-${alvo.id}`;
    const defs = G.el("defs", {}, svg);
    G.el("rect", { x: caixa.esq, y: caixa.topo, width: lp, height: ap }, G.el("clipPath", { id: idClip }, defs));

    const area = G.el("g", { "clip-path": `url(#${idClip})` }, svg);
    const mundo = G.el("g", {}, area);
    const dom = D.caixas.completa;
    G.el("image", { href: tela.toDataURL(), x: dom[0], y: -dom[3], width: dom[1] - dom[0], height: dom[3] - dom[2],
      preserveAspectRatio: "none", style: "image-rendering: pixelated" }, mundo);
    for (const linhas of Object.values(D.isobatas)) {
      G.el("path", { d: caminhoIsobatas(linhas), fill: "none", stroke: "var(--tinta-2)", "stroke-width": "1.6px",
        "vector-effect": "non-scaling-stroke", "stroke-opacity": "0.75" }, mundo);
    }
    const definicoes = opcoes.caixas || [];
    for (const c of definicoes) {
      const [x0, x1, y0, y1] = D.caixas[c.chave];
      G.el("rect", { x: x0, y: -y1, width: x1 - x0, height: y1 - y0, fill: "none", stroke: c.cor, "stroke-width": "3.5px",
        "vector-effect": "non-scaling-stroke" }, mundo);
    }
    const celula = G.el("rect", { width: D.dx, height: D.dy, fill: "none", stroke: "var(--tinta)", "stroke-width": "2.5px",
      "vector-effect": "non-scaling-stroke", visibility: "hidden" }, mundo);

    const camadaEixos = G.el("g", {}, svg);
    const camadaRotulos = G.el("g", {}, svg);
    G.el("rect", { x: caixa.esq, y: caixa.topo, width: lp, height: ap, fill: "none", stroke: "var(--eixo)", "stroke-width": "2px" }, svg);

    // Barra de profundidade
    const idGrad = `grad-${alvo.id}`;
    const grad = G.el("linearGradient", { id: idGrad }, defs);
    for (let i = 0; i <= 20; i++) {
      const c = cor(i / 20);
      G.el("stop", { offset: `${i * 5}%`, "stop-color": `rgb(${c.join(",")})` }, grad);
    }
    const barraY = caixa.base + 60, barraX0 = caixa.esq + 262, barraX1 = caixa.dir - 20;
    G.el("text", { x: caixa.esq, y: barraY + 19, texto: "Profundidade (m)" }, svg);
    G.el("rect", { x: barraX0, y: barraY, width: barraX1 - barraX0, height: 24, fill: `url(#${idGrad})` }, svg);
    for (const m of MARCAS_PROF) {
      G.el("text", { x: barraX0 + fracaoProf(m) * (barraX1 - barraX0), y: barraY + 56, "text-anchor": "middle",
        texto: m.toLocaleString("pt-BR") }, svg);
    }

    function ajustar(ext, folga) {
      let [x0, x1, y0, y1] = ext;
      const fx = (x1 - x0) * folga, fy = (y1 - y0) * folga;
      x0 -= fx; x1 += fx; y0 -= fy; y1 += fy;
      const s = Math.min(lp / (x1 - x0), ap / (y1 - y0));
      const w = lp / s, h = ap / s, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      let v = [cx - w / 2, cx + w / 2, cy - h / 2, cy + h / 2];
      const encaixar = (a, b, lo, hi) => {
        if (b - a >= hi - lo) { const m = (lo + hi) / 2, t = b - a; return [m - t / 2, m + t / 2]; }
        if (a < lo) return [lo, lo + b - a];
        if (b > hi) return [hi - (b - a), hi];
        return [a, b];
      };
      [v[0], v[1]] = encaixar(v[0], v[1], dom[0], dom[1]);
      [v[2], v[3]] = encaixar(v[2], v[3], dom[2], dom[3]);
      return v;
    }

    let vista, animacao = null;
    const escala = v => lp / (v[1] - v[0]);
    const telaX = (v, x) => caixa.esq + (x - v[0]) * escala(v);
    const telaY = (v, y) => caixa.topo + (v[3] - y) * escala(v);

    function desenhar(v) {
      vista = v;
      const s = escala(v);
      mundo.setAttribute("transform", `matrix(${s} 0 0 ${s} ${caixa.esq - v[0] * s} ${caixa.topo + v[3] * s})`);

      camadaEixos.replaceChildren();
      const vao = v[1] - v[0];
      const passo = PASSOS_GRAUS.find(p => vao / p >= 3) || PASSOS_GRAUS[PASSOS_GRAUS.length - 1];
      for (let x = Math.ceil(v[0] / passo) * passo; x <= v[1] + 1e-9; x += passo) {
        const px = telaX(v, x);
        if (px < caixa.esq + 20 || px > caixa.dir - 20) continue;
        G.el("line", { x1: px, x2: px, y1: caixa.base, y2: caixa.base + 8, stroke: "var(--eixo)", "stroke-width": "2px" }, camadaEixos);
        G.el("text", { x: px, y: caixa.base + 38, "text-anchor": "middle", texto: formatoGrau(x, "L", "O") }, camadaEixos);
      }
      const latMin = mercatorInv(v[2]), latMax = mercatorInv(v[3]);
      for (let la = Math.ceil(latMin / passo) * passo; la <= latMax + 1e-9; la += passo) {
        const py = telaY(v, mercator(la));
        if (py < caixa.topo + 12 || py > caixa.base - 12) continue;
        G.el("line", { x1: caixa.esq - 8, x2: caixa.esq, y1: py, y2: py, stroke: "var(--eixo)", "stroke-width": "2px" }, camadaEixos);
        G.el("text", { x: caixa.esq - 14, y: py + 9, "text-anchor": "end", texto: formatoGrau(la, "N", "S") }, camadaEixos);
      }

      camadaRotulos.replaceChildren();
      for (const c of definicoes) {
        const [x0, x1, , y1] = D.caixas[c.chave];
        const fim = c.ancora === "end";
        let px = telaX(v, fim ? x1 : x0), py = telaY(v, y1) - 12;
        px = fim ? Math.min(px, caixa.dir - 10) : Math.max(px, caixa.esq + 10);
        py = Math.max(py, caixa.topo + 36);
        G.plaqueta(camadaRotulos, px, py, c.rotulo, fim ? "end" : "start");
      }
      if (vao < 15) {
        const px = telaX(v, CABO.lon), py = telaY(v, mercator(CABO.lat));
        G.el("circle", { class: "marcador", cx: px, cy: py, r: 8, fill: "var(--tinta)" }, camadaRotulos);
        G.plaqueta(camadaRotulos, px + 18, py + 10, CABO.nome);
      }
    }

    function ir(chave, animar = true) {
      const folga = chave === "completa" ? 0 : 0.03;
      const destino = ajustar(D.caixas[chave], folga);
      if (animacao) cancelAnimationFrame(animacao);
      if (!animar || !vista) { desenhar(destino); return; }
      const origem = vista.slice(), t0 = performance.now();
      const passo = agora => {
        const t = Math.min(1, (agora - t0) / DURACAO_MS), e = t * t * (3 - 2 * t);
        desenhar(origem.map((o, i) => o + (destino[i] - o) * e));
        animacao = t < 1 ? requestAnimationFrame(passo) : null;
      };
      animacao = requestAnimationFrame(passo);
    }

    const dica = G.dica(alvo);
    function esconder() { celula.setAttribute("visibility", "hidden"); dica.esconder(); }
    svg.addEventListener("pointerleave", esconder);
    svg.addEventListener("pointermove", ev => {
      const [mx, my] = G.pontoSvg(svg, ev);
      if (mx < caixa.esq || mx > caixa.dir || my < caixa.topo || my > caixa.base) { esconder(); return; }
      const s = escala(vista), wx = vista[0] + (mx - caixa.esq) / s, wy = vista[3] - (my - caixa.topo) / s;
      const i = Math.round((wx - D.x0) / D.dx), j = Math.round((wy - D.y0) / D.dy);
      if (i < 0 || i >= D.nx || j < 0 || j >= D.ny) { esconder(); return; }
      const lon = D.x0 + i * D.dx, p = prof[j * D.nx + i];
      celula.setAttribute("x", lon - D.dx / 2);
      celula.setAttribute("y", -(D.y0 + (j + 0.5) * D.dy));
      celula.setAttribute("visibility", D.dx * s >= 4 ? "visible" : "hidden");
      let html = `<div class="cabeca">${formatoGrau2(D.lat[j], "N", "S")}, ${formatoGrau2(lon, "L", "O")}</div>`;
      html += p === 0 ? `<div class="linha">Terra</div>` : `<div class="linha">Prof.<b>${p.toLocaleString("pt-BR")} m</b></div>`;
      if (comMascara && p !== 0) html += `<div class="linha">Análise<b>${mascara[j * D.nx + i] ? "sim" : "não"}</b></div>`;
      dica.mostrar(ev, html);
    });

    function formatoGrau2(v, pos, neg) { return `${G.numero(Math.abs(v), 2)}°${v < 0 ? neg : pos}`; }

    ir(opcoes.inicial, false);
    const api = {
      ir,
      telaDe(lat, lon) {
        const m = svg.getScreenCTM(), px = telaX(vista, lon), py = telaY(vista, mercator(lat));
        return [m.a * px + m.c * py + m.e, m.b * px + m.d * py + m.f];
      },
      get vista() { return vista.slice(); },
    };
    alvo._mapa = api;
    return api;
  }

  /* Tabela de cores (256 × 3) interpolando os tokens CSS `nomes`. */
  function lutParadas(estilos, nomes) {
    const cores = nomes.map(n => hexRgb(estilos.getPropertyValue(n)));
    const out = new Uint8ClampedArray(256 * 3);
    for (let k = 0; k < 256; k++) {
      const p = (k / 255) * (cores.length - 1), i = Math.min(cores.length - 2, Math.floor(p)), f = p - i;
      for (let c = 0; c < 3; c++) out[k * 3 + c] = cores[i][c] + (cores[i + 1][c] - cores[i][c]) * f;
    }
    return out;
  }

  /* Mapa célula a célula do recorte: moldura, canvas do campo, isóbatas, eixos e Cabo de São Tomé. D = {lat, lon, nx, ny}, j = 0 ao sul. */
  function painelGrade(alvo, D, { L, H, aria }) {
    const { nx, ny } = D, MP = window.DADOS_MAPA;
    const caixa = { esq: 104, topo: 14, base: H - 50 };
    const c = (caixa.base - caixa.topo) / ny;
    caixa.dir = caixa.esq + c * nx;
    const px = i => caixa.esq + (i + 0.5) * c, py = j => caixa.base - (j + 0.5) * c;
    const larg = caixa.dir - caixa.esq, alt = caixa.base - caixa.topo;

    const svg = G.el("svg", { viewBox: `0 0 ${L} ${H}`, role: "img", "aria-label": aria }, alvo);
    const defs = G.el("defs", {}, svg);
    const idClip = `clip-${alvo.id}`;
    G.el("rect", { x: caixa.esq, y: caixa.topo, width: larg, height: alt }, G.el("clipPath", { id: idClip }, defs));

    const fo = G.el("foreignObject", { x: caixa.esq, y: caixa.topo, width: larg, height: alt }, svg);
    const tela = document.createElementNS("http://www.w3.org/1999/xhtml", "canvas");
    tela.width = nx; tela.height = ny;
    fo.appendChild(tela);
    const ctx = tela.getContext("2d"), img = ctx.createImageData(nx, ny);

    const area = G.el("g", { "clip-path": `url(#${idClip})` }, svg);
    const dlon = D.lon[1] - D.lon[0], yBase = mercator(D.lat[0]), dyMerc = (mercator(D.lat[ny - 1]) - yBase) / (ny - 1);
    const xLon = lo => px((lo - D.lon[0]) / dlon), yMerc = y => py((y - yBase) / dyMerc);
    let dIso = "";
    for (const linhas of Object.values(MP.isobatas)) {
      for (const l of linhas) for (let i = 0; i < l.length; i += 2) dIso += `${i ? "L" : "M"}${xLon(l[i]).toFixed(1)} ${yMerc(l[i + 1]).toFixed(1)}`;
    }
    G.el("path", { d: dIso, fill: "none", stroke: "var(--tinta-2)", "stroke-width": "1.6px", "stroke-opacity": "0.7" }, area);

    G.el("rect", { x: caixa.esq, y: caixa.topo, width: larg, height: alt, fill: "none", stroke: "var(--eixo)", "stroke-width": "2px" }, svg);
    for (let lo = Math.ceil(D.lon[0]); lo <= D.lon[nx - 1]; lo += 1) {
      const x = xLon(lo);
      G.el("line", { x1: x, x2: x, y1: caixa.base, y2: caixa.base + 8, stroke: "var(--eixo)", "stroke-width": "2px" }, svg);
      G.el("text", { x, y: caixa.base + 38, "text-anchor": "middle", texto: `${Math.abs(lo)}°O` }, svg);
    }
    for (let la = Math.ceil(D.lat[0] * 2) / 2; la <= D.lat[ny - 1]; la += 0.5) {
      const y = yMerc(mercator(la));
      G.el("line", { x1: caixa.esq - 8, x2: caixa.esq, y1: y, y2: y, stroke: "var(--eixo)", "stroke-width": "2px" }, svg);
      G.el("text", { x: caixa.esq - 14, y: y + 9, "text-anchor": "end", texto: `${G.numero(Math.abs(la), Number.isInteger(la) ? 0 : 1)}°S` }, svg);
    }
    const cabo = G.el("g", {}, svg);
    const caboX = xLon(CABO.lon), caboY = yMerc(mercator(CABO.lat));
    G.el("circle", { class: "marcador", cx: caboX, cy: caboY, r: 8, fill: "var(--tinta)" }, cabo);
    G.plaqueta(cabo, caboX + 18, caboY + 10, CABO.nome);

    // Barra de cores vertical, redesenhada quando a variável muda
    const bx0 = caixa.dir + 34, bx1 = bx0 + 26, by0 = caixa.topo + 52, by1 = caixa.base - 62;
    const grupoBarra = G.el("g", {}, svg);
    const idGrad = `grad-${alvo.id}`;
    const grad = G.el("linearGradient", { id: idGrad, x1: 0, y1: 1, x2: 0, y2: 0 }, defs);
    function barraCores(lut, lo, hi, titulo) {
      grad.replaceChildren();
      for (let i = 0; i <= 20; i++) {
        const k = Math.round(i / 20 * 255);
        G.el("stop", { offset: `${i * 5}%`, "stop-color": `rgb(${lut[k * 3]},${lut[k * 3 + 1]},${lut[k * 3 + 2]})` }, grad);
      }
      grupoBarra.replaceChildren();
      G.el("rect", { x: bx0, y: by0, width: bx1 - bx0, height: by1 - by0, fill: `url(#${idGrad})` }, grupoBarra);
      G.el("text", { x: bx0, y: by0 - 22, texto: titulo }, grupoBarra);
      const y = G.linear(lo, hi, by1, by0), ms = y.marcas(6);
      const casas = Math.max(0, -Math.floor(Math.log10((ms[1] - ms[0]) * 1.0001)));
      for (const v of ms) G.el("text", { x: bx1 + 10, y: y(v) + 9, texto: G.numero(v, casas) }, grupoBarra);
    }

    function telaDe(j, i) {
      const m = svg.getScreenCTM(), x = px(i), y = py(j);
      return [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
    }
    /* Célula sob o ponteiro, ou null fora do mapa. */
    function celulaEm(ev) {
      const [mx, my] = G.pontoSvg(svg, ev);
      if (mx < caixa.esq || mx >= caixa.dir || my < caixa.topo || my >= caixa.base) return null;
      return { i: Math.floor((mx - caixa.esq) / c), j: ny - 1 - Math.floor((my - caixa.topo) / c) };
    }
    return { svg, area, caixa, c, px, py, ctx, img, bx0, barraCores, telaDe, celulaEm };
  }

  /* Grupo de botões exclusivos. opcoes: [[chave, rótulo em HTML], ...] */
  function botoes(conteiner, opcoes, inicial, aoEscolher) {
    const lista = opcoes.map(([chave, rotulo]) => {
      const b = document.createElement("button");
      b.type = "button";
      b.innerHTML = rotulo;
      b.dataset.chave = chave;
      b.classList.toggle("ativo", chave === inicial);
      b.addEventListener("click", () => {
        lista.forEach(o => o.classList.toggle("ativo", o === b));
        aoEscolher(chave);
      });
      conteiner.appendChild(b);
      return b;
    });
    return { definir(chave) { lista.forEach(o => o.classList.toggle("ativo", o.dataset.chave === chave)); } };
  }

  window.Mapas = { criar, botoes, bytes, hexRgb, mercator, caminhoIsobatas, CABO, lutParadas, painelGrade, ETAPAS_RAMPA };
})();
