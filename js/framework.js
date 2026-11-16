/* Aplicação ao dado real: esquemas das etapas de estimação e rótulos do GMM e do HMM por célula. */
(function () {
  "use strict";
  const G = window.Graficos;

  const AUSENTE = -32768;
  const CELULA_INICIAL = { lat: -22.21, lon: -40.42 };
  const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const INICIO_MES = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

  const maisProximo = (lista, v) => lista.reduce((b, x, k) => Math.abs(x - v) < Math.abs(lista[b] - v) ? k : b, 0);

  /* Esquema de X como grade dia × célula, com a parte usada em cada etapa em destaque. modo: "gmm", "bw" ou "viterbi". */
  function esquema(alvo, modo) {
    const D = window.DADOS_FRAMEWORK;
    const NC = 50, NL = 14, B = 9.6, ESQ = 44, TOPO = 6, L = 544, H = 180;
    const svg = G.el("svg", { viewBox: `0 0 ${L} ${H}`, role: "img", "aria-label": "Parte da matriz de entrada usada nesta etapa" }, alvo);
    const rng = G.aleatorio(20261109);
    const aceso = new Uint8Array(NC * NL);
    if (modo === "gmm") {
      const ordem = Array.from({ length: NC * NL }, (_, i) => i);
      const n = Math.round(D.frac_gmm * NC * NL);
      for (let i = 0; i < n; i++) {
        const j = i + Math.floor(rng.u() * (ordem.length - i));
        [ordem[i], ordem[j]] = [ordem[j], ordem[i]];
        aceso[ordem[i]] = 1;
      }
    } else if (modo === "bw") {
      const n = Math.round(D.frac_bw * NL), linhas = Array.from({ length: NL }, (_, i) => i);
      for (let i = 0; i < n; i++) {
        const j = i + Math.floor(rng.u() * (NL - i));
        [linhas[i], linhas[j]] = [linhas[j], linhas[i]];
        for (let c = 0; c < NC; c++) aceso[linhas[i] * NC + c] = 1;
      }
    } else aceso.fill(1);
    for (let l = 0; l < NL; l++) {
      for (let c = 0; c < NC; c++) {
        G.el("rect", { x: ESQ + c * B, y: TOPO + l * B, width: B - 1, height: B - 1, fill: aceso[l * NC + c] ? "var(--marinho)" : "var(--azul-100)" }, svg);
      }
    }
    G.el("text", { x: ESQ + NC * B / 2, y: TOPO + NL * B + 34, "text-anchor": "middle", texto: "dia t →" }, svg);
    G.el("text", { transform: `translate(26 ${TOPO + NL * B / 2}) rotate(-90)`, "text-anchor": "middle", texto: "célula p" }, svg);
    alvo._aceso = () => aceso.reduce((s, v) => s + v, 0) / aceso.length;
  }

  /* Mapa de discordância entre GMM e HMM; clicar numa célula mostra a sequência de estados de cada um no ano. */
  function celula({ mapa, serie, leitura }) {
    const D = window.DADOS_FRAMEWORK, M = window.Mapas;
    const { ny, nx, n_dias: nd, K, ano } = D;
    const indice = new Int16Array(M.bytes(D.indice).buffer), disc = new Int16Array(M.bytes(D.discordancia).buffer);
    const rotulos = M.bytes(D.rotulos), oceano = M.bytes(D.oceano);
    const estilos = getComputedStyle(mapa);
    const lut = M.lutParadas(estilos, M.ETAPAS_RAMPA);
    const terra = M.hexRgb(estilos.getPropertyValue("--terra")), fora = M.hexRgb(estilos.getPropertyValue("--fora-analise"));
    const posTexto = (j, i) => `${G.numero(Math.abs(D.lat[j]), 2)}°S, ${G.numero(Math.abs(D.lon[i]), 2)}°O`;

    const painel = M.painelGrade(mapa, D, { L: 850, H: 612, aria: "Percentual de dias em que GMM e HMM dão estados diferentes" });
    const { svg, area, caixa, c, ctx, img } = painel;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const v = disc[j * nx + i], q = ((ny - 1 - j) * nx + i) * 4;
        let rgb;
        if (v === AUSENTE) rgb = oceano[j * nx + i] ? fora : terra;
        else {
          const a = Math.round(Math.min(1, v / 10 / D.discordancia_max) * 255);
          rgb = [lut[a * 3], lut[a * 3 + 1], lut[a * 3 + 2]];
        }
        img.data.set([rgb[0], rgb[1], rgb[2], 255], q);
      }
    }
    ctx.putImageData(img, 0, 0);
    painel.barraCores(lut, 0, D.discordancia_max, "%");

    const posiciona = (r, j, i) => { r.setAttribute("x", caixa.esq + i * c); r.setAttribute("y", caixa.topo + (ny - 1 - j) * c); };
    const marca = G.el("rect", { width: c, height: c, fill: "none", stroke: "var(--tinta)", "stroke-width": "4px" }, area);
    const sob = G.el("rect", { width: c, height: c, fill: "none", stroke: "var(--tinta)", "stroke-width": "2.5px", visibility: "hidden" }, area);

    let sel = { j: maisProximo(D.lat, CELULA_INICIAL.lat), i: maisProximo(D.lon, CELULA_INICIAL.lon) };

    const L = 822, H = 560, ESQ = 58, DIR = L - 14;
    const CAIXAS = [{ esq: ESQ, dir: DIR, topo: 44, base: 236, titulo: "GMM: cada dia isolado", cor: "var(--tinta-2)" },
      { esq: ESQ, dir: DIR, topo: 298, base: 490, titulo: "HMM: Viterbi", cor: "var(--marinho)" }];
    const svgS = G.el("svg", { viewBox: `0 0 ${L} ${H}`, role: "img", "aria-label": "Sequência de estados do GMM e do HMM na célula selecionada" }, serie);
    const x = G.linear(0, nd, ESQ, DIR);
    const ys = CAIXAS.map(q => G.linear(-0.5, K - 0.5, q.base, q.topo));
    const marcasY = Array.from({ length: K }, (_, k) => k);
    CAIXAS.forEach((q, n) => {
      G.eixos(svgS, x, ys[n], q, { marcasX: INICIO_MES, marcasY, fmtY: v => `${v}`, fmtX: n ? (v => MESES[INICIO_MES.indexOf(v)]) : (() => "") });
      G.el("text", { class: "rotulo-direto", x: ESQ, y: q.topo - 14, texto: q.titulo }, svgS);
    });
    const linhas = CAIXAS.map(q => G.el("path", { fill: "none", stroke: q.cor, "stroke-width": "3px", "stroke-linejoin": "miter" }, svgS));
    const cursor = G.el("line", { y1: CAIXAS[0].topo, y2: CAIXAS[1].base, stroke: "var(--tinta)", "stroke-width": "2px", visibility: "hidden" }, svgS);

    function sequencias(q) {
      const gmm = new Uint8Array(nd), hmm = new Uint8Array(nd);
      for (let d = 0; d < nd; d++) { const v = rotulos[q * nd + d]; gmm[d] = v >> 3; hmm[d] = v & 7; }
      return { gmm, hmm };
    }
    const trocas = s => s.reduce((n, v, d) => n + (d > 0 && v !== s[d - 1] ? 1 : 0), 0);
    let atuais = null;

    function desenharSerie() {
      const q = indice[sel.j * nx + sel.i];
      atuais = sequencias(q);
      [atuais.gmm, atuais.hmm].forEach((s, n) => {
        let d_ = `M${x(0).toFixed(1)} ${ys[n](s[0]).toFixed(1)}`;
        for (let d = 0; d < nd; d++) {
          if (d > 0 && s[d] !== s[d - 1]) d_ += `V${ys[n](s[d]).toFixed(1)}`;
          d_ += `H${x(d + 1).toFixed(1)}`;
        }
        linhas[n].setAttribute("d", d_);
      });
      posiciona(marca, sel.j, sel.i);
      leitura.textContent = `${posTexto(sel.j, sel.i)}. Trocas em ${ano}: GMM ${trocas(atuais.gmm)}; HMM ${trocas(atuais.hmm)}.`;
    }

    const dicaM = G.dica(mapa);
    const esconderM = () => { sob.setAttribute("visibility", "hidden"); dicaM.esconder(); };
    svg.addEventListener("pointerleave", esconderM);
    svg.addEventListener("pointermove", ev => {
      const cel = painel.celulaEm(ev);
      if (!cel) { esconderM(); return; }
      posiciona(sob, cel.j, cel.i);
      sob.setAttribute("visibility", "visible");
      const v = disc[cel.j * nx + cel.i];
      let html = `<div class="cabeca">${posTexto(cel.j, cel.i)}</div>`;
      if (v === AUSENTE) html += `<div class="linha">${oceano[cel.j * nx + cel.i] ? "Fora da análise" : "Terra"}</div>`;
      else html += `<div class="linha">Dias com estados diferentes<b>${G.numero(v / 10, 1)}%</b></div>`;
      dicaM.mostrar(ev, html);
    });
    svg.addEventListener("click", ev => {
      const cel = painel.celulaEm(ev);
      if (!cel || indice[cel.j * nx + cel.i] < 0) return;
      sel = cel;
      desenharSerie();
    });

    const dicaS = G.dica(serie);
    const esconderS = () => { cursor.setAttribute("visibility", "hidden"); dicaS.esconder(); };
    svgS.addEventListener("pointerleave", esconderS);
    svgS.addEventListener("pointermove", ev => {
      const [mx] = G.pontoSvg(svgS, ev);
      if (mx < ESQ || mx >= DIR) { esconderS(); return; }
      const d = Math.min(nd - 1, Math.floor(x.inversa(mx)));
      cursor.setAttribute("x1", x(d + 0.5)); cursor.setAttribute("x2", x(d + 0.5));
      cursor.setAttribute("visibility", "visible");
      const q = new Date(Date.UTC(ano, 0, 1 + d));
      dicaS.mostrar(ev, `<div class="cabeca">${String(q.getUTCDate()).padStart(2, "0")}/${String(q.getUTCMonth() + 1).padStart(2, "0")}/${ano}</div>` +
        `<div class="linha">GMM<b>${atuais.gmm[d]}</b></div><div class="linha">HMM<b>${atuais.hmm[d]}</b></div>`);
    });

    desenharSerie();
    mapa._fw = {
      telaDe: (lat, lon) => painel.telaDe(maisProximo(D.lat, lat), maisProximo(D.lon, lon)),
      estado: () => ({ j: sel.j, i: sel.i, gmm: [...atuais.gmm], hmm: [...atuais.hmm], leitura: leitura.textContent }),
    };
  }

  window.Framework = { esquema, celula };
})();
