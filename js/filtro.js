/* Slide de filtragem: série horária × diária filtrada numa janela móvel e espectros da década. */
(function () {
  "use strict";
  const G = window.Graficos;

  const DIAS_JANELA = 60;
  const VARIAVEIS = {
    ssh: { simbolo: "η", unidade: "m", unidadePsd: "m² cpd⁻¹" },
    u: { simbolo: "u", unidade: "m s⁻¹", unidadePsd: "m² s⁻² cpd⁻¹" },
    v: { simbolo: "v", unidade: "m s⁻¹", unidadePsd: "m² s⁻² cpd⁻¹" },
  };
  const COR_BRUTO = "var(--serie-1)", COR_FILTRADO = "var(--serie-2)";
  const PERIODOS_EIXO = [[1000, "1000 d"], [100, "100 d"], [30, "30 d"], [7, "7 d"], [1, "1 d"], [0.5, "12 h"]];

  function criar({ serie, espectro, controles }) {
    const D = window.DADOS_FILTRO;
    const inicioMs = Date.parse(`${D.inicio}T00:00:00Z`);
    const data = dia => new Date(inicioMs + dia * 86400000);
    const ddmm = d => `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const nDias = D.series.ssh.diario.length;
    let variavel = "ssh", janela = 60;

    const LS = 970, HS = 280, LE = 970, HE = 320;
    const svgS = G.el("svg", { viewBox: `0 0 ${LS} ${HS}`, role: "img", "aria-label": "Série horária e diária filtrada" }, serie);
    const svgE = G.el("svg", { viewBox: `0 0 ${LE} ${HE}`, role: "img", "aria-label": "Espectro de potência" }, espectro);
    const cxS = { esq: 112, dir: LS - 46, topo: 12, base: HS - 48 };
    const cxE = { esq: 112, dir: LE - 46, topo: 12, base: HE - 84 };
    const dicaS = G.dica(serie), dicaE = G.dica(espectro);

    const grupo = document.createElement("div"); grupo.className = "botoes";
    const faixa = document.createElement("input");
    Object.assign(faixa, { type: "range", min: 0, max: nDias - DIAS_JANELA - 1, step: 1, value: janela });
    faixa.setAttribute("aria-label", "Início da janela");
    const rotulo = document.createElement("span");
    controles.append(grupo, faixa, rotulo);

    let xS, yS, cruz = null;

    function limitesAno() {
      const s = D.series[variavel];
      let lo = Infinity, hi = -Infinity;
      for (const lista of [s.horario, s.diario]) for (const v of lista) { if (v < lo) lo = v; if (v > hi) hi = v; }
      return [Math.floor(lo / 100) / 10, Math.ceil(hi / 100) / 10];
    }

    function desenharSerie() {
      svgS.replaceChildren();
      const v = VARIAVEIS[variavel], s = D.series[variavel];
      const [lo, hi] = limitesAno();
      xS = G.linear(janela, janela + DIAS_JANELA, cxS.esq, cxS.dir);
      yS = G.linear(lo, hi, cxS.base, cxS.topo);
      const marcasX = [];
      for (let d = janela; d <= janela + DIAS_JANELA; d += 10) marcasX.push(d);
      G.eixos(svgS, xS, yS, cxS, { rotuloY: `${v.simbolo} (${v.unidade})`, nY: 4, casas: 1, marcasX, fmtX: d => ddmm(data(d)) });
      let d1 = "";
      for (let h = janela * 24; h <= (janela + DIAS_JANELA) * 24 && h < s.horario.length; h++) {
        d1 += `${d1 ? "L" : "M"}${xS(h / 24).toFixed(1)} ${yS(s.horario[h] / 1000).toFixed(1)}`;
      }
      G.el("path", { d: d1, fill: "none", stroke: COR_BRUTO, "stroke-width": "2px" }, svgS);
      let d2 = "";
      for (let k = janela; k <= janela + DIAS_JANELA; k++) d2 += `${d2 ? "L" : "M"}${xS(k).toFixed(1)} ${yS(s.diario[k] / 1000).toFixed(1)}`;
      G.el("path", { d: d2, fill: "none", stroke: COR_FILTRADO, "stroke-width": "4px", "stroke-linejoin": "round" }, svgS);
      cruz = G.el("line", { y1: cxS.topo, y2: cxS.base, stroke: "var(--tinta-2)", "stroke-width": "2px", visibility: "hidden" }, svgS);
      const a = data(janela), b = data(janela + DIAS_JANELA);
      rotulo.textContent = `${ddmm(a)} a ${ddmm(b)}/${D.ano}`;
    }

    function desenharEspectro() {
      svgE.replaceChildren();
      const v = VARIAVEIS[variavel], e = D.espectros[variavel];
      const maximo = Math.max(...e.bruto.filter(n => n !== null), ...e.diario.filter(n => n !== null));
      const topoDec = Math.ceil(Math.log10(maximo)), piso = topoDec - 6;
      const x = G.linear(-3, Math.log10(12), cxE.esq, cxE.dir), y = G.linear(piso, topoDec, cxE.base, cxE.topo);
      const marcasY = [];
      for (let p = piso; p <= topoDec; p += 2) marcasY.push(p);
      const rotulos = new Map(PERIODOS_EIXO.map(([t, r]) => [Math.log10(1 / t), r]));
      G.eixos(svgE, x, y, cxE, { rotuloX: "Período", rotuloY: `PSD (${v.unidadePsd})`, marcasX: [...rotulos.keys()], marcasY,
        fmtX: f => rotulos.get(f), fmtY: p => G.decada(p) });

      const linha = (valores, cor, largura) => {
        let d = "", novo = true;
        valores.forEach((p, i) => {
          if (p === null) return;                         // faixa logarítmica sem frequência de Welch
          if (p <= 0 || Math.log10(p) < piso) { novo = true; return; }
          d += `${novo ? "M" : "L"}${x(Math.log10(D.f[i])).toFixed(1)} ${y(Math.log10(p)).toFixed(1)}`;
          novo = false;
        });
        G.el("path", { d, fill: "none", stroke: cor, "stroke-width": largura, "stroke-linejoin": "round" }, svgE);
      };
      linha(e.bruto, COR_BRUTO, "2.5px");
      linha(e.diario, COR_FILTRADO, "4px");

      const marcas = [["corte", "7 d", "start"], ["inercial", "f", "end"], ["K1", "K₁", "start"], ["M2", "M₂", "start"]];
      for (const [chave, texto, ancora] of marcas) {
        const px = x(Math.log10(D.marcas[chave]));
        G.el("line", { x1: px, x2: px, y1: cxE.topo, y2: cxE.base, stroke: "var(--tinta-2)", "stroke-width": "2px" }, svgE);
        G.el("text", { class: "rotulo-direto", x: px + (ancora === "start" ? 8 : -8), y: cxE.topo + 30, "text-anchor": ancora, texto }, svgE);
      }

      const cruzE = G.el("line", { y1: cxE.topo, y2: cxE.base, stroke: "var(--tinta-2)", "stroke-width": "2px", visibility: "hidden" }, svgE);
      svgE.onpointermove = ev => {
        const [mx] = G.pontoSvg(svgE, ev);
        if (mx < cxE.esq || mx > cxE.dir) { cruzE.setAttribute("visibility", "hidden"); dicaE.esconder(); return; }
        const alvoLog = x.inversa(mx);
        let k = -1, melhor = Infinity;
        D.f.forEach((f, i) => {
          if (e.bruto[i] === null && e.diario[i] === null) return;
          const d = Math.abs(Math.log10(f) - alvoLog);
          if (d < melhor) { melhor = d; k = i; }
        });
        const px = x(Math.log10(D.f[k]));
        cruzE.setAttribute("x1", px); cruzE.setAttribute("x2", px); cruzE.setAttribute("visibility", "visible");
        const dias = 1 / D.f[k];
        const periodo = dias >= 1 ? `${G.numero(dias, dias >= 10 ? 0 : 1)} d` : `${G.numero(dias * 24, 1)} h`;
        dicaE.mostrar(ev, `<div class="cabeca">Período ${periodo}</div>` +
          `<div class="linha"><i style="background:${COR_BRUTO}"></i>Horário<b>${G.cientifico(e.bruto[k])}</b></div>` +
          `<div class="linha"><i style="background:${COR_FILTRADO}"></i>Diário<b>${G.cientifico(e.diario[k])}</b></div>`);
      };
      svgE.onpointerleave = () => { cruzE.setAttribute("visibility", "hidden"); dicaE.esconder(); };
    }

    svgS.addEventListener("pointermove", ev => {
      const [mx] = G.pontoSvg(svgS, ev);
      if (mx < cxS.esq || mx > cxS.dir) { cruz.setAttribute("visibility", "hidden"); dicaS.esconder(); return; }
      const s = D.series[variavel], v = VARIAVEIS[variavel];
      const h = Math.max(0, Math.min(s.horario.length - 1, Math.round(xS.inversa(mx) * 24)));
      const dia = Math.round(h / 24), px = xS(h / 24);
      cruz.setAttribute("x1", px); cruz.setAttribute("x2", px); cruz.setAttribute("visibility", "visible");
      const quando = data(h / 24);
      dicaS.mostrar(ev, `<div class="cabeca">${ddmm(quando)}/${D.ano} ${String(quando.getUTCHours()).padStart(2, "0")} h</div>` +
        `<div class="linha"><i style="background:${COR_BRUTO}"></i>Horário<b>${G.numero(s.horario[h] / 1000, 3)} ${v.unidade}</b></div>` +
        `<div class="linha"><i style="background:${COR_FILTRADO}"></i>Diário ${ddmm(data(dia))}<b>${G.numero(s.diario[dia] / 1000, 3)} ${v.unidade}</b></div>`);
    });
    svgS.addEventListener("pointerleave", () => { cruz.setAttribute("visibility", "hidden"); dicaS.esconder(); });

    window.Mapas.botoes(grupo, Object.entries(VARIAVEIS).map(([k, v]) => [k, v.simbolo]), variavel, k => {
      variavel = k;
      desenharSerie();
      desenharEspectro();
    });
    faixa.addEventListener("input", () => { janela = Number(faixa.value); desenharSerie(); });

    desenharSerie();
    desenharEspectro();
  }

  window.Filtro = { criar };
})();
