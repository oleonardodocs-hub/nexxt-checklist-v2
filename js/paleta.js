// Paleta de identidade dos clientes: 8 cores fixas e validadas (contraste e
// separação para daltonismo já conferidos), em vez de um seletor de cor livre.
// Cada cliente guarda o NOME do slot (ex: "violet"), não mais um hex direto,
// o que deixa a cor certa tanto no tema claro quanto no escuro (ver as
// variáveis --cat-* em css/styles.css). Clientes antigos que já tinham um hex
// salvo direto continuam funcionando normalmente (ver corClienteParaCSS).

window.PALETA_CLIENTES = [
  { slot: "blue", nome: "Azul" },
  { slot: "orange", nome: "Laranja" },
  { slot: "aqua", nome: "Água-marinha" },
  { slot: "yellow", nome: "Amarelo" },
  { slot: "magenta", nome: "Magenta" },
  { slot: "green", nome: "Verde" },
  { slot: "violet", nome: "Violeta" },
  { slot: "red", nome: "Vermelho" },
];

// Converte o que está salvo em `cliente.cor` numa cor de CSS válida.
// Aceita tanto o slot novo ("violet") quanto um hex antigo ("#2a78d6").
function corClienteParaCSS(valor) {
  if (!valor) return "var(--accent)";
  if (valor.charAt(0) === "#") return valor;
  return `var(--cat-${valor})`;
}

// Cor de destaque (barrinha lateral + leve tingimento do fundo) de cada
// card de tarefa, de acordo com o status. Reaproveita os mesmos tokens de
// cor já usados nas pills de status, só que também no corpo do card.
window.ACCENT_POR_STATUS = {
  pendente: "var(--accent)",
  em_producao: "var(--accent)",
  agendada: "var(--accent)",
  aguardando_validacao: "var(--status-warning)",
  manual_pendente: "var(--status-serious)",
  validada: "var(--status-good)",
  publicada: "var(--status-good)",
};

// Desenha a fileira de bolinhas de cor dentro de `container` e devolve o slot
// escolhido via `aoEscolher(slot)`. `valorAtual` marca a bolinha já selecionada.
function renderSwatches(container, valorAtual, aoEscolher) {
  if (!container) return;
  container.innerHTML = window.PALETA_CLIENTES
    .map(
      (c) => `
        <button type="button" class="swatch ${c.slot === valorAtual ? "selected" : ""}"
          data-slot="${c.slot}" title="${c.nome}" style="background:var(--cat-${c.slot});"
          aria-label="${c.nome}"></button>
      `
    )
    .join("");

  container.querySelectorAll(".swatch").forEach((btn) => {
    btn.addEventListener("click", () => {
      container.querySelectorAll(".swatch").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      aoEscolher(btn.dataset.slot);
    });
  });
}
