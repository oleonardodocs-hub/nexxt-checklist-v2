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

// Data (AAAA-MM-DD) em que a tarefa cai de fato PRA FINS DE CHECKLIST/ATRASO:
// usa o prazo de produção ("Prazo para ficar pronta"), quando preenchido --
// é o que decide em qual dia a tarefa aparece no Checklist de hoje, mesmo
// que ela vá publicar/entregar num dia bem diferente (ex.: produzir hoje
// uma tarefa que só vai ao ar segunda-feira). Na falta dele, usa o campo
// "Data" (data de publicação/entrega); e na falta desse também, quando dá
// pra saber (a tarefa está numa semana e num bloco de dia de semana, não no
// pacote de datas comemorativas), calcula a partir do início daquela semana.
// Isso faz o checklist de hoje funcionar mesmo quando só foi escolhida a
// coluninha do dia, sem preencher nenhuma data "de novo" lá no formulário.
// Importante: isso NÃO muda em qual coluna (dia da semana)/semana a tarefa
// aparece no pipeline -- isso continua sendo só "bloco" + "week_id".
function dataEfetivaDaTarefa(item, semana) {
  if (item.prazo_producao) return item.prazo_producao;
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

// Ícone de chave (SVG embutido, herda a cor ao redor) usado no cabeçalho do
// painel de "Acessos e senhas", só pra dar uma identidade visual mais
// amigável pra aquele bloco.
const SVG_CHAVE =
  '<svg class="icone-chave" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="5.5"/><path d="M11 11.5 20.5 2M15 7l2.5 2.5M18.5 3.5 21 6"/></svg>';

// Ícone de pasta (SVG embutido, herda a cor ao redor) usado no campo do
// Drive do cliente, dentro do painel de Acessos e senhas.
const SVG_PASTA =
  '<svg class="icone-pasta" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg>';

// Redes sociais possíveis pra uma publicação -- uma mesma tarefa pode
// marcar mais de uma (ex.: Instagram + LinkedIn no mesmo post), por isso o
// campo "rede_social" guarda os valores separados por vírgula (ex.:
// "instagram,linkedin"). Tarefas antigas com uma rede só (sem vírgula)
// continuam funcionando normalmente.
window.REDES_SOCIAIS_LISTA = [
  { valor: "instagram", nome: "Instagram" },
  { valor: "tiktok", nome: "TikTok" },
  { valor: "youtube", nome: "YouTube" },
  { valor: "facebook", nome: "Facebook" },
  { valor: "linkedin", nome: "LinkedIn" },
];

// Ícone oficial de cada rede (assets/redes/<rede>.png).
function iconeRedeHTML(valor, ligada) {
  return `<span class="rede-icone rede-icone-${valor} ${ligada ? "is-on" : "is-off"}" title="${nomeDeRedeSocial(valor)}${ligada ? "" : " (não vai ser usada)"}"><img src="assets/redes/${valor}.png" alt="${nomeDeRedeSocial(valor)}" /></span>`;
}

// Todas as redes em linha: coloridas as que vão ser publicadas, em preto e
// branco (desligadas) as que não vão.
// Quando a rede ligada já tem o link do post salvo, o ícone vira link e
// abre a publicação numa aba nova.
function linhaRedesHTML(item) {
  const marcadas = new Set(listaRedesSociais(item));
  const links = linksPublicacao(item);
  return window.REDES_SOCIAIS_LISTA.map((r) => {
    const ligada = marcadas.has(r.valor);
    const url = ligada ? links[r.valor] : "";
    if (url) {
      return `<a class="rede-icone rede-icone-${r.valor} is-on rede-icone-link" href="${escaparAtributoRede(url)}" target="_blank" rel="noopener" title="Abrir publicação no ${nomeDeRedeSocial(r.valor)}"><img src="assets/redes/${r.valor}.png" alt="${nomeDeRedeSocial(r.valor)}" /></a>`;
    }
    return iconeRedeHTML(r.valor, ligada);
  }).join("");
}

// Links dos posts publicados, um por rede: { instagram: "https://...", ... }.
function linksPublicacao(item) {
  const v = item && item.links_publicacao;
  return v && typeof v === "object" ? v : {};
}

function escaparAtributoRede(t) {
  return String(t).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Versão clicável (modal): cada ícone é um checkbox escondido. Usa a mesma
// estrutura de grupo que redesSociaisCheckboxesHTML, então
// obterRedesSociaisMarcadas continua funcionando igual.
function redesSociaisIconesToggleHTML(item, classeGrupo) {
  const marcadas = new Set(listaRedesSociais(item));
  return `
    <div class="${classeGrupo} redes-toggle-grupo">
      ${window.REDES_SOCIAIS_LISTA.map(
        (r) => `
          <label class="rede-toggle" title="${r.nome}">
            <input type="checkbox" value="${r.valor}" ${marcadas.has(r.valor) ? "checked" : ""} />
            <span class="rede-icone rede-icone-${r.valor}"><img src="assets/redes/${r.valor}.png" alt="" /></span>
            <span class="rede-toggle-nome">${r.nome}</span>
          </label>`
      ).join("")}
    </div>
  `;
}

function listaRedesSociais(item) {
  const valor = item && item.rede_social;
  if (!valor) return [];
  return String(valor)
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function nomeDeRedeSocial(valor) {
  const encontrada = window.REDES_SOCIAIS_LISTA.find((r) => r.valor === valor);
  return encontrada ? encontrada.nome : valor;
}

// Um chip por rede marcada (em vez de um chip só) -- é o que entra tanto na
// linha da Prévia quanto no card de tarefa do Histórico/pacote.
function chipsRedesSociaisHTML(item) {
  return listaRedesSociais(item)
    .map((valor) => `<span class="demanda-chip demanda-chip-rede demanda-chip-rede-${valor}">${nomeDeRedeSocial(valor)}</span>`)
    .join("");
}

// Grupo de checkboxes (em vez do antigo <select> de uma rede só) -- já vem
// com as redes atuais marcadas. `classeGrupo` é a classe usada depois pra
// achar esse grupo de novo na hora de salvar (ver obterRedesSociaisMarcadas).
function redesSociaisCheckboxesHTML(item, classeGrupo) {
  const marcadas = new Set(listaRedesSociais(item));
  return `
    <div class="${classeGrupo} checkboxes-rede-social">
      ${window.REDES_SOCIAIS_LISTA
        .map(
          (r) => `
            <label class="checkbox-rede-social">
              <input type="checkbox" value="${r.valor}" ${marcadas.has(r.valor) ? "checked" : ""} />
              ${r.nome}
            </label>
          `
        )
        .join("")}
    </div>
  `;
}

// Lê o grupo de checkboxes renderizado por redesSociaisCheckboxesHTML (via
// `classeGrupo`, dentro de `root`) e devolve a string pronta pra salvar no
// campo "rede_social" -- "instagram,linkedin", ou null se nenhuma marcada.
function obterRedesSociaisMarcadas(root, classeGrupo) {
  const grupo = root.querySelector("." + classeGrupo);
  if (!grupo) return null;
  const escolhidas = Array.from(grupo.querySelectorAll('input[type="checkbox"]:checked')).map((i) => i.value);
  return escolhidas.length ? escolhidas.join(",") : null;
}

// Toda demanda é "social" (conteúdo de mídia social, linha editorial) ou
// "diaria" (tarefa operacional, pode se repetir várias vezes no mesmo
// dia). Tarefas antigas sem esse campo contam como "social", que é o uso
// original do sistema.
function categoriaDaTarefa(item) {
  return item.categoria === "diaria" ? "diaria" : "social";
}

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

// Andamento de cada tarefa (0 a 100%), baseado só no status -- dá pra ver
// de relance o quão avançada ela está (ainda nem começou? já tá em
// produção? só falta aprovar?) sem precisar abrir o card. As cores
// acompanham os mesmos tons já usados nas pills de status.
const PROGRESSO_POR_STATUS = {
  pendente: { pct: 0, cor: "var(--text-muted)" },
  em_producao: { pct: 45, cor: "var(--accent)" },
  aguardando_validacao: { pct: 75, cor: "var(--status-warning)" },
  agendada: { pct: 90, cor: "var(--accent)" },
  manual_pendente: { pct: 90, cor: "var(--status-serious)" },
  validada: { pct: 95, cor: "var(--status-good)" },
  publicada: { pct: 100, cor: "var(--status-good)" },
};
function progressoDaTarefa(status) {
  return PROGRESSO_POR_STATUS[status] || { pct: 0, cor: "var(--text-muted)" };
}

// Anel circular de progresso (SVG embutido) -- usado tanto no andamento de
// cada tarefa quanto no progresso semanal do cliente. `pct` de 0 a 100,
// `cor` qualquer valor de CSS (var(--...) ou hex), `tamanho` em pixels.
// `textoNoMeio` é opcional -- por padrão mostra a própria porcentagem.
function anelProgressoHTML(pct, cor, tamanho, textoNoMeio) {
  tamanho = tamanho || 38;
  const espessura = Math.max(3, Math.round(tamanho * 0.11));
  const raio = (tamanho - espessura) / 2;
  const centro = tamanho / 2;
  const circ = 2 * Math.PI * raio;
  const pctSeguro = Math.max(0, Math.min(100, pct));
  const offset = circ * (1 - pctSeguro / 100);
  const texto = textoNoMeio !== undefined ? textoNoMeio : `${pctSeguro}%`;
  const fonteTexto = Math.max(8, Math.round(tamanho * 0.26));

  return `
    <svg class="anel-progresso" width="${tamanho}" height="${tamanho}" viewBox="0 0 ${tamanho} ${tamanho}" role="img" aria-label="${pctSeguro}% concluído">
      <circle cx="${centro}" cy="${centro}" r="${raio}" fill="none" stroke="var(--border-hairline)" stroke-width="${espessura}" />
      <circle cx="${centro}" cy="${centro}" r="${raio}" fill="none" stroke="${cor}" stroke-width="${espessura}" stroke-linecap="round"
        stroke-dasharray="${circ.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}"
        transform="rotate(-90 ${centro} ${centro})" />
      ${
        texto
          ? `<text x="${centro}" y="${centro}" text-anchor="middle" dominant-baseline="central" class="anel-progresso-texto" style="font-size:${fonteTexto}px;">${texto}</text>`
          : ""
      }
    </svg>
  `;
}

// Iniciais de um nome (pra mostrar num avatarzinho redondo, em vez do nome
// inteiro escrito, nos cards mais compactos).
// Conteúdo do avatar de um colaborador: a foto (campo "foto", caminho ou
// link da imagem) quando tiver, senão as iniciais.
function conteudoAvatarHTML(colaborador, nomeReserva) {
  const nome = (colaborador && colaborador.nome) || nomeReserva || "";
  if (colaborador && colaborador.foto) {
    const src = String(colaborador.foto).replace(/"/g, "&quot;");
    return `<img class="avatar-foto" src="${src}" alt="" loading="lazy" />`;
  }
  const div = document.createElement("div");
  div.textContent = inicialAvatar(nome);
  return div.innerHTML;
}

function inicialAvatar(nome) {
  if (!nome) return "?";
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "?";
  const primeira = partes[0][0] || "";
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] || "" : "";
  return (primeira + ultima).toUpperCase() || "?";
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
