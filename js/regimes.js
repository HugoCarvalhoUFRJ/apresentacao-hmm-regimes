/* Resultados: fração de dias em cada regime por célula e matriz de transição estimada. */
(function () {
  "use strict";
  const G = window.Graficos;

  const AUSENTE = -32768;
  const posTexto = (D, j, i) => `${G.numero(Math.abs(D.lat[j]), 2)}°S, ${G.numero(Math.abs(D.lon[i]), 2)}°O`;

  /* Três mapas na mesma escala de 0 a 100%, com barra de cores comum. */
  function mapas({ alvos, barra }) {
    const D = window.DADOS_REGIMES, M = window.Mapas, { ny, nx } = D;
    const estilos = getComputedStyle(barra);
    const lut = M.lutParadas(estilos, M.ETAPAS_RAMPA), oceano = M.bytes(D.oceano);
    const terra = M.hexRgb(estilos.getPropertyValue("--terra")), fora = M.hexRgb(estilos.getPropertyValue("--fora-analise"));
    const grades = D.fracoes.map(b => new Int16Array(M.bytes(b).buffer));

    alvos.forEach((alvo, n) => {
      const g = grades[n], painel = M.painelGrade(alvo, D, { L: 560, H: 460, aria: `Percentual dos dias no regime ${D.regimes[n]}` });
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const v = g[j * nx + i], q = ((ny - 1 - j) * nx + i) * 4;
          let rgb;
          if (v === AUSENTE) rgb = oceano[j * nx + i] ? fora : terra;
          else { const a = Math.round(Math.min(1, v / 1000) * 255); rgb = [lut[a * 3], lut[a * 3 + 1], lut[a * 3 + 2]]; }
          painel.img.data.set([rgb[0], rgb[1], rgb[2], 255], q);
        }
      }
      painel.ctx.putImageData(painel.img, 0, 0);
      const { caixa, c } = painel;
      const sob = G.el("rect", { width: c, height: c, fill: "none", stroke: "var(--tinta)", "stroke-width": "2.5px", visibility: "hidden" }, painel.area);
      const dica = G.dica(alvo);
      const esconder = () => { sob.setAttribute("visibility", "hidden"); dica.esconder(); };
      painel.svg.addEventListener("pointerleave", esconder);
      painel.svg.addEventListener("pointermove", ev => {
        const cel = painel.celulaEm(ev);
        if (!cel) { esconder(); return; }
        sob.setAttribute("x", caixa.esq + cel.i * c); sob.setAttribute("y", caixa.topo + (ny - 1 - cel.j) * c);
        sob.setAttribute("visibility", "visible");
        const v = g[cel.j * nx + cel.i];
        dica.mostrar(ev, `<div class="cabeca">${posTexto(D, cel.j, cel.i)}</div>` +
          (v === AUSENTE ? `<div class="linha">${oceano[cel.j * nx + cel.i] ? "Fora da análise" : "Terra"}</div>`
            : `<div class="linha">Dias no regime<b>${G.numero(v / 10, 1)}%</b></div>`));
      });
      alvo._rg = { valor: (j, i) => g[j * nx + i] / 10, telaDe: (j, i) => painel.telaDe(j, i) };
    });

    const svg = G.el("svg", { viewBox: "0 0 900 72", role: "img", "aria-label": "Escala de cores" }, barra);
    const X0 = 270, X1 = 870;
    const grad = G.el("linearGradient", { id: "grad-regimes", x1: 0, y1: 0, x2: 1, y2: 0 }, G.el("defs", {}, svg));
    for (let i = 0; i <= 20; i++) {
      const k = Math.round(i / 20 * 255);
      G.el("stop", { offset: `${i * 5}%`, "stop-color": `rgb(${lut[k * 3]},${lut[k * 3 + 1]},${lut[k * 3 + 2]})` }, grad);
    }
    G.el("rect", { x: X0, y: 4, width: X1 - X0, height: 26, fill: "url(#grad-regimes)" }, svg);
    G.el("text", { x: X0 - 18, y: 26, "text-anchor": "end", texto: "Dias no regime (%)" }, svg);
    for (const v of [0, 25, 50, 75, 100]) G.el("text", { x: X0 + (X1 - X0) * v / 100, y: 62, "text-anchor": "middle", texto: `${v}` }, svg);
  }

  /* Matriz de transição estimada, com a permanência média de cada estado. */
  function matriz(tabela) {
    const D = window.DADOS_REGIMES, F = window.DADOS_NOMEACAO.hmm, cores = window.DADOS_PCA.cores, M = window.Mapas;
    const lut = M.lutParadas(getComputedStyle(tabela), M.ETAPAS_RAMPA);
    let html = `<thead><tr><th>Estado</th>${D.A.map((_, j) => `<th>${j}</th>`).join("")}<th>Dias</th></tr></thead><tbody>`;
    D.A.forEach((linha, i) => {
      html += `<tr><td><i class="chip" style="background: ${cores[i]}"></i><b>${i}</b> ${F[i].regime}</td>`;
      linha.forEach(v => {
        const a = Math.round(v * 255);
        html += `<td style="background: rgb(${lut[a * 3]},${lut[a * 3 + 1]},${lut[a * 3 + 2]}); color: var(${v > 0.5 ? "--sobre-escuro" : "--tinta"})">${G.numero(v, 3)}</td>`;
      });
      html += `<td>${G.numero(1 / (1 - linha[i]), 1)}</td></tr>`;
    });
    tabela.innerHTML = html + "</tbody>";
  }

  window.Regimes = { mapas, matriz };
})();
