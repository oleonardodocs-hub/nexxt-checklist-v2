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
// Quantos dias depois da segunda-feira cada bloco cai.
window.OFFSET_DIA_SEMANA = { segunda: 0, terca: 1, quarta: 2, quinta: 3, sexta: 4 };

// Data (AAAA-MM-DD) em que a tarefa cai de fato: usa o campo "Data" se foi
// preenchido; senão, quando dá pra saber (a tarefa está numa semana e num
// bloco de dia de semana, não no pacote de datas comemorativas), calcula a
// partir do início daquela semana. Isso faz o checklist de hoje funcionar
// mesmo quando só foi escolhida a coluninha do dia, sem preencher a data
// "de novo" lá no formulário.
function dataEfetivaDaTarefa(item, semana) {
  if (item.data_publicacao) return item.data_publicacao;
  if (!semana || window.OFFSET_DIA_SEMANA[item.bloco] === undefined) return null;
  const d = new Date(semana.semana_inicio + "T00:00:00");
  d.setDate(d.getDate() + window.OFFSET_DIA_SEMANA[item.bloco]);
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

// Atrasada = já passou do dia (ou da hora marcada, se houver) e ainda não
// foi publicada.
function tarefaAtrasada(item, dataEfetiva) {
  if (!dataEfetiva || item.status === "publicada") return false;
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");
  const hojeStr = `${ano}-${mes}-${dia}`;

  if (dataEfetiva < hojeStr) return true;
  if (dataEfetiva === hojeStr && item.hora_publicacao) {
    const [h, m] = item.hora_publicacao.split(":").map(Number);
    const prazo = new Date();
    prazo.setHours(h, m || 0, 0, 0);
    return agora > prazo;
  }
  return false;
}

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
