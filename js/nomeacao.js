/* Nomeação dos estados: tabela de médias físicas e caminho de cada estado pelas regras de name_clusters_physical. */
(function () {
  "use strict";
  const G = window.Graficos;

  const COR = { CB_dominante: "--regime-cb", rotacao: "--regime-rotacao", fraco_desorganizado: "--regime-fraco", inversao: "--tinta-2" };
  const barra = s => `<span class="media">${s}</span>`;
  const U = `${barra("u")}<sub>∥</sub>`, V = barra("|V|"), W = barra("W"), C = barra("C");
  const sinal = v => (v > 0 ? "+" : "") + G.numero(v, 2);

  /* Avalia as regras na ordem do código. Cada regra: regime, condições [texto, verdadeira] e se foi satisfeita. */
  function avaliar(s, L) {
    const r = [
      { regime: "rotacao", testes: [[`W&lt;0: ${G.numero(s.wneg * 100, 0)}% &gt; ${G.numero(L.wfrac * 100, 0)}%`, s.wneg > L.wfrac], [`${W}: ${sinal(s.W * 1e11)} &lt; 0`, s.W < 0]] },
      { regime: "fraco_desorganizado", testes: [[`${V}: ${G.numero(s.speed, 3)} &lt; ${G.numero(L.p25, 3)}`, s.speed < L.p25]] },
      { regime: "inversao", testes: [[`${U}: ${G.numero(s.along, 3)} ≤ ${G.numero(-L.along, 2)}`, s.along <= -L.along]] },
      { regime: "CB_dominante", testes: [[`${U}: ${G.numero(s.along, 3)} ≥ ${G.numero(L.along, 2)}`, s.along >= L.along], [`${C}: ${G.numero(s.coh, 3)} ≥ ${G.numero(L.coh, 2)}`, s.coh >= L.coh]] },
      { regime: "fraco_desorganizado", testes: [["demais casos", true]] },
    ];
    const final = r.findIndex(q => q.testes.every(t => t[1]));
    return { regras: r, final };
  }

  function criar({ tabela, caminho, controles }) {
    const D = window.DADOS_NOMEACAO, L = D.limiares, M = window.Mapas;
    let fonte = "gmm", k = 1;

    const grupo = document.createElement("div"); grupo.className = "botoes";
    controles.appendChild(grupo);
    M.botoes(grupo, [["gmm", "Rótulos do GMM"], ["hmm", "Rótulos do Viterbi"]], fonte, f => { fonte = f; desenhar(); });
    const dicaTexto = document.createElement("span"); dicaTexto.className = "data-atual";
    dicaTexto.textContent = "Clique num estado.";
    controles.appendChild(dicaTexto);

    const linhas = D.gmm.map((_, q) => {
      const tr = document.createElement("tr");
      tr.addEventListener("click", () => { k = q; desenhar(); });
      tabela.appendChild(tr);
      return tr;
    });
    const caixas = [0, 1, 2, 3, 4].map(() => {
      const c = document.createElement("div"); c.className = "regra-caixa";
      caminho.appendChild(c);
      return c;
    });

    function desenhar() {
      D[fonte].forEach((s, q) => {
        linhas[q].className = q === k ? "selecionada" : "";
        linhas[q].innerHTML = `<td>${s.k}</td><td>${G.numero(s.frac * 100, 1)}</td><td>${G.numero(s.speed, 3)}</td><td>${G.numero(s.along, 3)}</td>` +
          `<td>${G.numero(s.wneg * 100, 0)}</td><td>${sinal(s.W * 1e11)}</td><td>${G.numero(s.coh, 3)}</td>` +
          `<td><i class="chip" style="background: var(${COR[s.regime]})"></i>${s.regime}</td>`;
      });
      const { regras, final } = avaliar(D[fonte][k], L);
      regras.forEach((r, q) => {
        const situacao = q < final ? "reprovada" : q === final ? "vence" : "pulada";
        caixas[q].className = `regra-caixa ${situacao}`;
        caixas[q].innerHTML = `<div class="regra-titulo">${q + 1}. ${r.regime}</div>` + r.testes.map(([txt, ok]) =>
          `<div class="regra-teste"><span>${txt}</span>${situacao === "pulada" ? "" : `<b>${ok ? "sim" : "não"}</b>`}</div>`).join("") +
          (situacao === "pulada" ? `<div class="regra-rodape">não avaliada</div>` : "");
      });
    }

    desenhar();
    tabela._nm = {
      verificar() {
        return ["gmm", "hmm"].flatMap(f => D[f].map(s => {
          const a = avaliar(s, L);
          return { fonte: f, k: s.k, obtido: a.regras[a.final].regime, esperado: s.regime };
        }));
      },
      estado: () => ({ fonte, k, classes: caixas.map(c => c.className) }),
    };
  }

  window.Nomeacao = { criar };
})();
