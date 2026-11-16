/* Navegação da apresentação: escala do palco, teclado, #n na URL e eventos de entrada/saída de slide. */
(function () {
  "use strict";

  const LARGURA = 1920, ALTURA = 1080;
  const registros = new Map();   // id do slide -> {entrar, sair, iniciado}
  let raiz, palco, slides, atual = -1;

  function ajustarEscala() {
    const s = Math.min(window.innerWidth / LARGURA, window.innerHeight / ALTURA);
    const dx = (window.innerWidth - LARGURA * s) / 2, dy = (window.innerHeight - ALTURA * s) / 2;
    palco.style.transform = `translate(${dx}px, ${dy}px) scale(${s})`;
  }

  function criarRodapes() {
    slides.forEach((sl, i) => {
      if (sl.classList.contains("capa")) return;
      const r = document.createElement("div");
      r.className = "rodape";
      const a = document.createElement("span"); a.textContent = sl.dataset.secao || "";
      const b = document.createElement("span"); b.textContent = `${i + 1} / ${slides.length}`;
      r.append(a, b);
      sl.append(r);
    });
  }

  function ir(i, atualizarUrl = true) {
    i = Math.max(0, Math.min(slides.length - 1, i));
    if (i === atual) return;
    if (atual >= 0) {
      const velho = slides[atual];
      velho.classList.remove("ativo");
      const r = registros.get(velho.id);
      if (r && r.sair) r.sair();
    }
    atual = i;
    const novo = slides[i];
    novo.classList.add("ativo");
    const r = registros.get(novo.id);
    if (r) {
      if (!r.iniciado && r.iniciar) r.iniciar(novo);
      r.iniciado = true;
      if (r.entrar) r.entrar();
    }
    if (atualizarUrl) history.replaceState(null, "", `#${i + 1}`);
  }

  function slideDaUrl() {
    const n = parseInt(location.hash.slice(1), 10);
    return Number.isFinite(n) ? n - 1 : 0;
  }

  function teclado(ev) {
    if (ev.ctrlKey || ev.altKey || ev.metaKey) return;
    const alvo = ev.target;
    const emBotao = alvo instanceof HTMLButtonElement;
    const avancar = ["ArrowRight", "ArrowDown", "PageDown", " "], voltar = ["ArrowLeft", "ArrowUp", "PageUp"];
    if (emBotao && (ev.key === " " || ev.key === "Enter")) return;
    if (avancar.includes(ev.key)) { ev.preventDefault(); ir(atual + 1); }
    else if (voltar.includes(ev.key)) { ev.preventDefault(); ir(atual - 1); }
    else if (ev.key === "Home") { ev.preventDefault(); ir(0); }
    else if (ev.key === "End") { ev.preventDefault(); ir(slides.length - 1); }
    else if (ev.key === "f" || ev.key === "F") {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen();
    }
  }

  function iniciar() {
    raiz = document.querySelector(".deck");
    palco = raiz.querySelector(".palco");
    slides = [...palco.querySelectorAll(":scope > .slide")];
    const numeros = window.NUMEROS_DECK || {};
    palco.querySelectorAll("[data-n]").forEach(n => {
      if (!(n.dataset.n in numeros)) console.error(`número sem valor: ${n.dataset.n}`);
      const valor = numeros[n.dataset.n] ?? "?";
      // data-tex: molde em TeX com # no lugar do número; o resultado é composto pelo MathJax.
      n.textContent = n.dataset.tex ? `\\(${n.dataset.tex.replace("#", valor)}\\)` : valor;
    });
    const comTex = [...palco.querySelectorAll("[data-n][data-tex]")];
    if (comTex.length && window.MathJax?.startup?.promise) {
      MathJax.startup.promise = MathJax.startup.promise.then(() => MathJax.typesetPromise(comTex));
    }
    criarRodapes();
    ajustarEscala();
    window.addEventListener("resize", ajustarEscala);
    window.addEventListener("hashchange", () => ir(slideDaUrl(), false));
    document.addEventListener("keydown", teclado, true);
    // Devolve o foco ao documento depois de usar um controle, para as setas seguirem navegando.
    palco.addEventListener("pointerup", () => {
      const a = document.activeElement;
      if (a && a !== document.body && palco.contains(a)) setTimeout(() => a.blur(), 0);
    });
    ir(slideDaUrl(), false);
  }

  window.Deck = {
    registrar(id, ganchos) { registros.set(id, { ...ganchos, iniciado: false }); },
    iniciar,
    get atual() { return atual; },
    get total() { return slides.length; },
    ir,
  };
})();
