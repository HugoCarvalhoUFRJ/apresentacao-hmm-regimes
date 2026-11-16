/* Player do vórtice: η′ em cores e linhas curtas de corrente, integradas no campo de cada dia. */
(function () {
  "use strict";
  const G = window.Graficos;

  const AUSENTE = -32768;
  const PASSO_SEMENTE = 5;           // células entre sementes das linhas de corrente
  const TAU_S = 45000;               // comprimento da linha = |V| · TAU_S
  const N_PASSOS = 10;
  const QUADRO_MS = 300;
  const PARADAS = ["--div-1", "--div-2", "--div-3", "--div-4", "--div-5"];

  function criar({ alvo, controles }) {
    const D = window.DADOS_VORTICE, M = window.Mapas;
    const { nx, ny, nt } = D;
    const paraInt = b64 => new Int16Array(M.bytes(b64).buffer);
    const eta = paraInt(D.eta_mm), uu = paraInt(D.u_mm), vv = paraInt(D.v_mm);
    const estilos = getComputedStyle(alvo);
    const cores = M.lutParadas(estilos, PARADAS), terra = M.hexRgb(estilos.getPropertyValue("--terra"));
    const inicioMs = Date.parse(`${D.inicio}T00:00:00Z`);
    const dlon = D.lon[1] - D.lon[0], radLon = dlon * Math.PI / 180;
    const dxM = j => D.raio_m * Math.cos(D.lat[Math.max(0, Math.min(ny - 1, Math.round(j)))] * Math.PI / 180) * radLon;
    let t = 0, relogio = null;

    const L = 907, H = 640;
    const painel = M.painelGrade(alvo, D, { L, H, aria: "Anomalia do nível do mar e correntes" });
    const { svg, area, caixa, c, px, py, ctx, img, bx0 } = painel;
    const linhas = G.el("path", { fill: "none", stroke: "var(--tinta)", "stroke-width": "2.5px", "stroke-linecap": "round", "stroke-linejoin": "round" }, area);
    const pontas = G.el("path", { fill: "var(--tinta)" }, area);
    const celula = G.el("rect", { width: c, height: c, fill: "none", stroke: "var(--tinta)", "stroke-width": "3px", visibility: "hidden" }, area);
    painel.barraCores(cores, -D.limite_cm, D.limite_cm, "η′ (cm)");

    // Chave de escala das linhas
    const ref = 0.5, compRef = (ref * TAU_S / dxM(ny / 2)) * c;
    G.el("line", { x1: bx0, x2: bx0 + compRef, y1: caixa.base - 20, y2: caixa.base - 20, stroke: "var(--tinta)", "stroke-width": "2.5px", "stroke-linecap": "round" }, svg);
    G.el("text", { x: bx0, y: caixa.base + 14, texto: `${G.numero(ref, 1)} m s⁻¹` }, svg);

    const indice = (d, j, i) => d * ny * nx + j * nx + i;

    function velocidade(d, fi, fj) {
      if (fi < 0 || fj < 0 || fi > nx - 1 || fj > ny - 1) return null;
      const i0 = Math.min(nx - 2, Math.floor(fi)), j0 = Math.min(ny - 2, Math.floor(fj)), a = fi - i0, b = fj - j0;
      let u = 0, v = 0;
      const pesos = [[0, 0, (1 - a) * (1 - b)], [1, 0, a * (1 - b)], [0, 1, (1 - a) * b], [1, 1, a * b]];
      for (const [di, dj, w] of pesos) {
        const k = indice(d, j0 + dj, i0 + di);
        if (uu[k] === AUSENTE || vv[k] === AUSENTE) return null;
        u += w * uu[k]; v += w * vv[k];
      }
      return [u / 1000, v / 1000];
    }

    function linhasDe(d) {
      let dL = "", dP = "";
      const dt = TAU_S / N_PASSOS;
      for (let j0 = 2; j0 < ny; j0 += PASSO_SEMENTE) {
        for (let i0 = 2; i0 < nx; i0 += PASSO_SEMENTE) {
          let fi = i0, fj = j0;
          const pts = [[fi, fj]];
          for (let n = 0; n < N_PASSOS; n++) {
            const v1 = velocidade(d, fi, fj);
            if (!v1) break;
            const esc = dt / dxM(fj);
            const v2 = velocidade(d, fi + 0.5 * esc * v1[0], fj + 0.5 * esc * v1[1]);
            if (!v2) break;
            fi += esc * v2[0]; fj += esc * v2[1];
            pts.push([fi, fj]);
          }
          if (pts.length < 2) continue;
          const tl = pts.map(p => [px(p[0]), py(p[1])]);
          let comp = 0;
          for (let k = 1; k < tl.length; k++) comp += Math.hypot(tl[k][0] - tl[k - 1][0], tl[k][1] - tl[k - 1][1]);
          if (comp < 2) continue;
          tl.forEach((p, k) => { dL += `${k ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`; });
          if (comp >= 16) {
            const fim = tl[tl.length - 1], ant = tl[Math.max(0, tl.length - 3)];
            const ux = fim[0] - ant[0], uy = fim[1] - ant[1], n = Math.hypot(ux, uy) || 1, ex = ux / n, ey = uy / n;
            const bx = fim[0] - 8 * ex, by = fim[1] - 8 * ey;
            dP += `M${(fim[0] + 3 * ex).toFixed(1)} ${(fim[1] + 3 * ey).toFixed(1)}L${(bx - 5 * ey).toFixed(1)} ${(by + 5 * ex).toFixed(1)}L${(bx + 5 * ey).toFixed(1)} ${(by - 5 * ex).toFixed(1)}Z`;
          }
        }
      }
      return [dL, dP];
    }

    const dataDe = d => new Date(inicioMs + d * 86400000);
    const dmy = dt => `${String(dt.getUTCDate()).padStart(2, "0")}/${String(dt.getUTCMonth() + 1).padStart(2, "0")}/${dt.getUTCFullYear()}`;

    const grupo = document.createElement("div"); grupo.className = "botoes";
    const botao = document.createElement("button"); botao.type = "button"; botao.textContent = "Reproduzir"; grupo.appendChild(botao);
    const faixa = document.createElement("input");
    Object.assign(faixa, { type: "range", min: 0, max: nt - 1, step: 1, value: 0 });
    faixa.setAttribute("aria-label", "Dia");
    const rotulo = document.createElement("span"); rotulo.className = "data-atual";
    controles.append(grupo, faixa, rotulo);

    function ir(d) {
      t = d;
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const v = eta[indice(t, j, i)], q = ((ny - 1 - j) * nx + i) * 4;
          if (v === AUSENTE) img.data.set([terra[0], terra[1], terra[2], 255], q);
          else {
            const k = Math.round(Math.min(1, Math.max(0, (v / 10 + D.limite_cm) / (2 * D.limite_cm))) * 255);
            img.data.set([cores[k * 3], cores[k * 3 + 1], cores[k * 3 + 2], 255], q);
          }
        }
      }
      ctx.putImageData(img, 0, 0);
      const [dL, dP] = linhasDe(t);
      linhas.setAttribute("d", dL);
      pontas.setAttribute("d", dP);
      faixa.value = t;
      rotulo.textContent = dmy(dataDe(t));
    }

    function pausar() {
      if (relogio) clearInterval(relogio);
      relogio = null;
      botao.textContent = "Reproduzir";
    }
    function reproduzir() {
      if (t >= nt - 1) ir(0);
      botao.textContent = "Pausar";
      relogio = setInterval(() => {
        if (t >= nt - 1) { pausar(); return; }
        ir(t + 1);
      }, QUADRO_MS);
    }
    botao.addEventListener("click", () => { if (relogio) pausar(); else reproduzir(); });
    faixa.addEventListener("input", () => { pausar(); ir(Number(faixa.value)); });

    const dica = G.dica(alvo);
    const esconder = () => { celula.setAttribute("visibility", "hidden"); dica.esconder(); };
    svg.addEventListener("pointerleave", esconder);
    svg.addEventListener("pointermove", ev => {
      const cel = painel.celulaEm(ev);
      if (!cel) { esconder(); return; }
      const { i, j } = cel, k = indice(t, j, i);
      celula.setAttribute("x", caixa.esq + i * c);
      celula.setAttribute("y", caixa.topo + (ny - 1 - j) * c);
      celula.setAttribute("visibility", "visible");
      const pos = `${G.numero(Math.abs(D.lat[j]), 2)}°S, ${G.numero(Math.abs(D.lon[i]), 2)}°O`;
      if (eta[k] === AUSENTE) { dica.mostrar(ev, `<div class="cabeca">${pos}</div><div class="linha">Terra</div>`); return; }
      dica.mostrar(ev, `<div class="cabeca">${pos}</div><div class="linha">η′<b>${G.numero(eta[k] / 10, 1)} cm</b></div>` +
        `<div class="linha">|V|<b>${G.numero(Math.hypot(uu[k], vv[k]) / 1000, 2)} m s⁻¹</b></div>`);
    });

    ir(0);
    alvo._vortice = {
      ir, pausar,
      telaDe(lat, lon) {
        const maisProximo = (lista, v) => lista.reduce((b, x, k) => Math.abs(x - v) < Math.abs(lista[b] - v) ? k : b, 0);
        return painel.telaDe(maisProximo(D.lat, lat), maisProximo(D.lon, lon));
      },
    };
    return { pausar };
  }

  window.Vortice = { criar };
})();
