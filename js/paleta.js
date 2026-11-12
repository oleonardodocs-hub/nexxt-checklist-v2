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

// Ícone de relógio (SVG embutido, herda a cor do texto ao redor via
// "currentColor") usado no selo de horário da tarefa.
const SVG_RELOGIO =
  '<svg class="icone-relogio" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9.5"/><path d="M12 7v5l3.2 2"/></svg>';

// Quantos minutos faltam até o horário marcado da tarefa -- só faz sentido
// (e só calculamos) quando a data efetiva dela é hoje; qualquer outro dia
// devolve null, porque não é uma contagem regressiva, é só um horário.
function minutosParaPublicacao(item, dataEfetiva) {
  if (!item.hora_publicacao || !dataEfetiva) return null;
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");
  const hojeStr = `${ano}-${mes}-${dia}`;
  if (dataEfetiva !== hojeStr) return null;

  const [h, m] = item.hora_publicacao.split(":").map(Number);
  const prazo = new Date();
  prazo.setHours(h, m || 0, 0, 0);
  return Math.round((prazo - agora) / 60000);
}

// Selo com o horário marcado pra tarefa (pensado sobretudo pras publicações
// manuais, onde alguém precisa lembrar de subir na hora certa): fica neutro
// a maior parte do tempo, vira o alerta amarelo (piscando) quando falta 1h
// ou menos pra hoje, e some pro vermelho quando já passou do horário e a
// tarefa continua sem ser publicada.
function badgeHorarioHTML(item, dataEfetiva, atrasada) {
  if (!item.hora_publicacao) return "";
  const minutos = minutosParaPublicacao(item, dataEfetiva);
  const emBreve = !atrasada && minutos !== null && minutos >= 0 && minutos <= 60;

  let classe = "badge-horario";
  let texto = item.hora_publicacao.slice(0, 5);
  if (atrasada) {
    classe += " badge-horario-atrasada";
  } else if (emBreve) {
    classe += " badge-horario-em-breve";
    texto += ` · faltam ${minutos}min`;
  }

  return `<span class="${classe}">${SVG_RELOGIO}${texto}</span>`;
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
