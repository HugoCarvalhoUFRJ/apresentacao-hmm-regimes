/* Esquemas didáticos das features: direção no referencial da isóbata e padrões de escoamento. */
(function () {
  "use strict";
  const G = window.Graficos;

  /* Partes de uma seta: traço e ponta triangular. */
  function seta(camada, x0, y0, x1, y1, { cor = "var(--tinta)", largura = 2.5, ponta = 8 } = {}) {
    const ux = x1 - x0, uy = y1 - y0, n = Math.hypot(ux, uy) || 1, ex = ux / n, ey = uy / n;
    const bx = x1 - ponta * 1.5 * ex, by = y1 - ponta * 1.5 * ey;
    G.el("line", { x1: x0, y1: y0, x2: bx, y2: by, stroke: cor, "stroke-width": `${largura}px`, "stroke-linecap": "round" }, camada);
    G.el("path", { d: `M${x1} ${y1}L${bx - ponta * ey} ${by + ponta * ex}L${bx + ponta * ey} ${by - ponta * ex}Z`, fill: cor }, camada);
  }

  /* Vetor arrastável no plano (ê∥, ê⊥), com leitura de |V|, θ, cos θ e sen θ. */
  function direcao(alvo) {
    const L = 900, H = 680, cx = 320, cy = 340, R1 = 270, MAX = 1.2;
    const svg = G.el("svg", { viewBox: `0 0 ${L} ${H}`, role: "img", "aria-label": "Vetor velocidade no referencial da isóbata", style: "touch-action: none; cursor: grab" }, alvo);
    for (const r of [0.5, 1.0]) {
      G.el("circle", { cx, cy, r: r * R1, fill: "none", stroke: "var(--grade)", "stroke-width": "2px" }, svg);
      G.el("text", { x: cx + 8, y: cy + r * R1 + 30, texto: `${G.numero(r, 1)} m s⁻¹` }, svg);
    }
    seta(svg, cx - R1 - 20, cy, cx + R1 + 26, cy, { cor: "var(--eixo)", largura: 2.5 });
    seta(svg, cx, cy + R1 + 20, cx, cy - R1 - 26, { cor: "var(--eixo)", largura: 2.5 });
    G.el("text", { class: "rotulo-direto", x: cx + R1 + 26, y: cy + 40, "text-anchor": "end", texto: "ê∥, sentido da CB" }, svg);
    G.el("text", { class: "rotulo-direto", x: cx + 14, y: cy - R1 - 2, texto: "ê⊥, para águas rasas" }, svg);

    const dinamico = G.el("g", {}, svg);
    const LX = 662;
    const rotulos = [["|V|", "m s⁻¹"], ["θ", "°"], ["cos θ", ""], ["sen θ", ""]];
    const valores = rotulos.map(([r], k) => {
      G.el("text", { x: LX, y: 230 + k * 62, style: "font-size: 32px", texto: r }, svg);
      return G.el("text", { x: L - 8, y: 230 + k * 62, "text-anchor": "end", style: "font-size: 32px; font-weight: 600; fill: var(--tinta)" }, svg);
    });

    let vx = 0.66, vy = 0.24;
    function desenhar() {
      dinamico.replaceChildren();
      const mag = Math.hypot(vx, vy), th = Math.atan2(vy, vx);
      const px = cx + vx * R1, py = cy - vy * R1;
      G.el("line", { x1: px, y1: py, x2: px, y2: cy, stroke: "var(--tinta-2)", "stroke-width": "2px", "stroke-dasharray": "6 6" }, dinamico);
      G.el("line", { x1: px, y1: py, x2: cx, y2: py, stroke: "var(--tinta-2)", "stroke-width": "2px", "stroke-dasharray": "6 6" }, dinamico);
      const arco = 72, grande = Math.abs(th) > Math.PI ? 1 : 0, varre = th >= 0 ? 0 : 1;
      G.el("path", { d: `M${cx + arco} ${cy}A${arco} ${arco} 0 ${grande} ${varre} ${cx + arco * Math.cos(th)} ${cy - arco * Math.sin(th)}`,
        fill: "none", stroke: "var(--serie-2)", "stroke-width": "3.5px" }, dinamico);
      seta(dinamico, cx, cy, px, py, { cor: "var(--marinho)", largura: 5, ponta: 11 });
      G.el("circle", { cx: px, cy: py, r: 13, fill: "var(--marinho)", stroke: "var(--superficie)", "stroke-width": "3px" }, dinamico);
      valores[0].textContent = `${G.numero(mag, 2)} m s⁻¹`;
      valores[1].textContent = `${G.numero(th * 180 / Math.PI, 0)}°`;
      valores[2].textContent = G.numero(mag > 1e-6 ? vx / mag : 0, 2);
      valores[3].textContent = G.numero(mag > 1e-6 ? vy / mag : 0, 2);
    }
    let arrastando = false;
    function mover(ev) {
      const [mx, my] = G.pontoSvg(svg, ev);
      let x = (mx - cx) / R1, y = (cy - my) / R1;
      const m = Math.hypot(x, y);
      if (m > MAX) { x *= MAX / m; y *= MAX / m; }
      vx = x; vy = y;
      desenhar();
    }
    svg.addEventListener("pointerdown", ev => { arrastando = true; svg.setPointerCapture(ev.pointerId); mover(ev); });
    svg.addEventListener("pointermove", ev => { if (arrastando) mover(ev); });
    svg.addEventListener("pointerup", () => { arrastando = false; });
    desenhar();
    alvo._direcao = { definir(x, y) { vx = x; vy = y; desenhar(); }, leitura: () => valores.map(v => v.textContent) };
  }

  /* Calcula ζ e W do campo (u, v), em m s⁻¹ com x e y em m, por diferenças centradas na origem. */
  function zetaW(campo) {
    const h = 1e-3, dx = s => (campo(h, 0)[s] - campo(-h, 0)[s]) / (2 * h), dy = s => (campo(0, h)[s] - campo(0, -h)[s]) / (2 * h);
    const ux = dx(0), uy = dy(0), vx = dx(1), vy = dy(1);
    const zeta = vx - uy, sn = ux - vy, ss = vx + uy;
    return { zeta, W: sn * sn + ss * ss - zeta * zeta };
  }

  /* Campos lineares com gradiente típico da mesoescala; ζ/|f| e W/f² calculados deles, com f a 22°S. */
  function padroes(alvo) {
    const L = 900, H = 712;
    const svg = G.el("svg", { viewBox: `0 0 ${L} ${H}`, role: "img", "aria-label": "Padrões de escoamento", preserveAspectRatio: "xMidYMin meet" }, alvo);
    const GRAD = 1e-5, PASSO_M = 15e3, V_REF = 0.3;     // s⁻¹; distância entre setas (m); velocidade da seta de referência (m s⁻¹)
    const F = 2 * 7.2921e-5 * Math.sin(22 * Math.PI / 180);
    const campos = [
      ["Rotação anti-horária", (x, y) => [-GRAD * y, GRAD * x]],
      ["Rotação horária", (x, y) => [GRAD * y, -GRAD * x]],
      ["Cisalhamento", (x, y) => [GRAD * y, 0]],
      ["Deformação", (x, y) => [GRAD * x, -GRAD * y]],
    ];
    const LADO = 256, COLUNAS = [90, 530], LINHA = 356, n = 5, esc = (LADO / (n + 1)) * 0.46;
    const fmt = v => G.numero(Math.round(v * 100) / 100 + 0, 2);
    campos.forEach(([nome, f], k) => {
      const x0 = COLUNAS[k % 2], y0 = Math.floor(k / 2) * LINHA, topo = y0 + 44;
      G.el("text", { class: "rotulo-direto", x: x0 + LADO / 2, y: y0 + 28, "text-anchor": "middle", texto: nome }, svg);
      G.el("rect", { x: x0, y: topo, width: LADO, height: LADO, fill: "none", stroke: "var(--eixo)", "stroke-width": "2px" }, svg);
      for (let a = -2; a <= 2; a++) {
        for (let b = -2; b <= 2; b++) {
          const [u, v] = f(a * PASSO_M, b * PASSO_M).map(c => c / V_REF), cxp = x0 + LADO / 2 + a * LADO / (n + 1), cyp = topo + LADO / 2 - b * LADO / (n + 1);
          if (Math.hypot(u, v) < 1e-9) { G.el("circle", { cx: cxp, cy: cyp, r: 3.5, fill: "var(--tinta)" }, svg); continue; }
          seta(svg, cxp - u * esc, cyp + v * esc, cxp + u * esc, cyp - v * esc, { ponta: 6, largura: 2.5 });
        }
      }
      const { zeta, W } = zetaW(f);
      G.el("text", { x: x0 + LADO / 2, y: topo + LADO + 38, "text-anchor": "middle", style: "font-size: 30px; fill: var(--tinta)", texto: `ζ/|f| = ${fmt(zeta / F)},  W/f² = ${fmt(W / (F * F))}` }, svg);
    });
    const xr = (COLUNAS[0] + LADO + COLUNAS[1]) / 2, yr = 150;
    seta(svg, xr - esc, yr, xr + esc, yr, { ponta: 6, largura: 2.5 });
    G.el("text", { x: xr, y: yr + 38, "text-anchor": "middle", style: "font-size: 28px; fill: var(--tinta)", texto: `${G.numero(V_REF, 1)} m s⁻¹` }, svg);
  }

  /* Janelas de 7 × 7 células com direções alinhadas e dispersas; C calculado pela fórmula do slide. */
  function coerencia(alvo) {
    const L = 900, H = 540;
    const svg = G.el("svg", { viewBox: `0 0 ${L} ${H}`, role: "img", "aria-label": "Coerência direcional", preserveAspectRatio: "xMidYMin meet" }, alvo);
    const r = G.aleatorio(20261109), LADO = 350, Y = 44, n = 7, passo = LADO / n, l = passo * 0.36;
    const conjuntos = [
      ["Direções alinhadas", () => -1.75 + 0.22 * r.normal()],
      ["Direções dispersas", () => r.u() * 2 * Math.PI],
    ];
    conjuntos.forEach(([nome, ang], k) => {
      const x0 = 50 + k * 450;
      G.el("text", { class: "rotulo-direto", x: x0 + LADO / 2, y: 28, "text-anchor": "middle", texto: nome }, svg);
      G.el("rect", { x: x0, y: Y, width: LADO, height: LADO, fill: "none", stroke: "var(--eixo)", "stroke-width": "2px" }, svg);
      let sx = 0, sy = 0;
      for (let a = 0; a < n; a++) {
        for (let b = 0; b < n; b++) {
          const th = ang(), cxp = x0 + (a + 0.5) * passo, cyp = Y + (b + 0.5) * passo;
          sx += Math.cos(th); sy += Math.sin(th);
          seta(svg, cxp - l * Math.cos(th), cyp + l * Math.sin(th), cxp + l * Math.cos(th), cyp - l * Math.sin(th), { ponta: 6, largura: 2.5 });
        }
      }
      G.el("rect", { x: x0 + 3 * passo, y: Y + 3 * passo, width: passo, height: passo, fill: "none", stroke: "var(--marinho)", "stroke-width": "4px" }, svg);
      G.el("text", { x: x0 + LADO / 2, y: Y + LADO + 42, "text-anchor": "middle", style: "font-size: 30px; fill: var(--tinta)", texto: `C = ${G.numero(Math.hypot(sx, sy) / (n * n), 2)}` }, svg);
    });
    seta(svg, L / 2 - l - 150, Y + LADO + 96, L / 2 + l - 150, Y + LADO + 96, { ponta: 6, largura: 2.5 });
    G.el("text", { x: L / 2 - 150 + l + 18, y: Y + LADO + 105, style: "font-size: 28px; fill: var(--tinta)", texto: "vetor unitário V/|V|" }, svg);
  }

  window.Esquemas = { direcao, padroes, coerencia, seta };
})();
