// Página de um cliente: seletor de clientes, abas de semana e o checklist
// de tarefas por dia (segunda a sexta) + o bloco de datas comemorativas.

const DIAS_SEMANA = ["segunda", "terca", "quarta", "quinta", "sexta"];
const NOME_DIA = {
  segunda: "Segunda-feira",
  terca: "Terça-feira",
  quarta: "Quarta-feira",
  quinta: "Quinta-feira",
  sexta: "Sexta-feira",
};
const NOME_STATUS = {
  pendente: "Pendente",
  em_producao: "Em produção",
  aguardando_validacao: "Aguardando validação",
  validada: "Validada",
  agendada: "Agendada",
  manual_pendente: "Publicação manual pendente",
  publicada: "Publicada",
};
const NOME_DIA_LONGO = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
const NOME_MES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

let estado = {
  clientId: null,
  clients: [],
  cliente: null,
  weeks: [],
  demandas: [],
  recorrentes: [],
  colaboradores: [],
  weekTabSelecionada: null, // id da semana, "pacote" ou "historico"
  historicoMes: null, // "AAAA-MM" selecionado dentro do Histórico
};

function segundaFeiraDe(date) {
  const d = new Date(date);
  const dia = d.getDay();
  const diff = (dia === 0 ? -6 : 1) - dia;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}
function toISODate(date) {
  // fuso local, não UTC (ver nota em js/dashboard.js)
  const ano = date.getFullYear();
  const mes = String(date.getMonth() + 1).padStart(2, "0");
  const dia = String(date.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}
function addDias(isoDate, dias) {
  const d = new Date(isoDate + "T00:00:00");
  d.setDate(d.getDate() + dias);
  return toISODate(d);
}
function formatarDataCurta(isoDate) {
  if (!isoDate) return "";
  const [ano, mes, dia] = isoDate.split("-");
  return `${dia}/${mes}`;
}
function formatarDataLonga(isoDate) {
  const d = new Date(isoDate + "T00:00:00");
  return `${NOME_DIA_LONGO[d.getDay()]}, ${formatarDataCurta(isoDate)}`;
}
function formatarMesAno(mesStr) {
  const [ano, mes] = mesStr.split("-").map(Number);
  return `${NOME_MES[mes - 1]} de ${ano}`;
}
function somarMes(mesStr, delta) {
  const [ano, mes] = mesStr.split("-").map(Number);
  const d = new Date(ano, mes - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
// Uma semana "passada" (já virou a sexta-feira dela) some da fileira
// principal de abas e cai automaticamente no Histórico, agrupada pelo mês
// da própria data -- sem precisar de nenhum status novo nem passo manual.
function semanaPassada(semana) {
  const fimSemana = addDias(semana.semana_inicio, 4);
  return fimSemana < toISODate(new Date());
}
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}
function mostrarToast(texto) {
  const t = document.getElementById("toast");
  t.textContent = texto;
  t.style.display = "block";
  clearTimeout(window._toastTimeout);
  window._toastTimeout = setTimeout(() => (t.style.display = "none"), 2600);
}

// ------------------------------------------------------------------
// Carregamento de dados
// ------------------------------------------------------------------

async function carregarTudo() {
  const params = new URLSearchParams(window.location.search);
  estado.clientId = params.get("id");
  if (!estado.clientId) {
    window.location.href = "dashboard.html";
    return;
  }

  const [
    { data: clients, error: errClients },
    { data: cliente, error: errCliente },
    { data: colaboradores, error: errColaboradores },
  ] = await Promise.all([
    window.supabaseClient.from("clients").select("*").eq("ativo", true).order("nome"),
    window.supabaseClient.from("clients").select("*").eq("id", estado.clientId).single(),
    window.supabaseClient.from("colaboradores").select("*").eq("ativo", true).order("nome"),
  ]);

  // "Registro não encontrado" é o .single() avisando que esse id de
  // cliente não existe (link velho, cliente excluído) -- isso é diferente
  // de um erro de verdade (token vencido, sem internet etc.), que precisa
  // de uma explicação melhor do que só "cliente não encontrado".
  const erroDeVerdade = errClients || errColaboradores || (errCliente && errCliente.message !== "Registro não encontrado" ? errCliente : null);
  if (erroDeVerdade) {
    console.error(erroDeVerdade);
    document.getElementById("client-title").textContent = "Erro ao carregar";
    document.getElementById("block-grid").innerHTML = htmlErroDeCarregamento(erroDeVerdade.message);
    ligarBotaoCorrigirToken();
    return;
  }

  estado.clients = clients || [];
  estado.cliente = cliente;
  estado.colaboradores = colaboradores || [];

  if (!cliente) {
    document.getElementById("client-title").textContent = "Cliente não encontrado";
    return;
  }

  document.getElementById("client-title").textContent = cliente.nome;
  document.title = cliente.nome + " · Gestão de Mídias Sociais";

  await carregarSemanasEDemandas();
  renderClientSwitcher();
  renderWeekTabs();
}

async function carregarSemanasEDemandas() {
  const [{ data: weeks }, { data: demandas }, { data: recorrentes }] = await Promise.all([
    window.supabaseClient.from("weeks").select("*").eq("client_id", estado.clientId).order("semana_inicio"),
    window.supabaseClient.from("demandas").select("*").eq("client_id", estado.clientId),
    window.supabaseClient.from("recorrentes").select("*").eq("client_id", estado.clientId),
  ]);

  estado.weeks = weeks || [];
  estado.demandas = demandas || [];
  estado.recorrentes = recorrentes || [];

  await garantirProximasSemanas();
  await garantirRecorrentesNasSemanas(estado.weeks.filter((w) => !semanaPassada(w)).map((w) => w.id));

  // se nada selecionado ainda, seleciona a semana validada mais recente, senão a primeira disponível
  if (!estado.weekTabSelecionada) {
    const inicioAtual = toISODate(segundaFeiraDe(new Date()));
    const ativa =
      estado.weeks.filter((w) => w.status === "validada" && w.semana_inicio <= inicioAtual).sort((a, b) => (a.semana_inicio < b.semana_inicio ? 1 : -1))[0] ||
      estado.weeks.filter((w) => w.status === "aguardando_validacao")[0] ||
      estado.weeks[0];
    estado.weekTabSelecionada = ativa ? ativa.id : "pacote";
  }
}

// garante que sempre exista 1 semana "aguardando_validacao" e 1 "disponivel" à frente
async function garantirProximasSemanas() {
  // só conta o que já existe se ainda não passou -- senão, depois de um
  // tempo sem abrir o sistema, a tela ficaria sem nenhuma semana ativa
  // agora que as passadas somem da fileira principal (foram pro Histórico).
  const naoConcluidas = estado.weeks.filter((w) => w.status !== "concluida" && !semanaPassada(w));
  const temAguardando = naoConcluidas.some((w) => w.status === "aguardando_validacao");
  const temDisponivel = naoConcluidas.some((w) => w.status === "disponivel");

  if (temAguardando && temDisponivel) return;

  const segundaAtual = toISODate(segundaFeiraDe(new Date()));
  const ultima = [...estado.weeks].sort((a, b) => (a.semana_inicio < b.semana_inicio ? 1 : -1))[0];
  // nunca continua a partir de uma semana que já ficou pra trás -- sempre
  // avança a partir de hoje nesse caso, pra não nascer uma semana "nova"
  // já atrasada.
  let proxima = ultima && ultima.semana_inicio >= segundaAtual ? addDias(ultima.semana_inicio, 7) : segundaAtual;

  const novas = [];
  if (!temAguardando) {
    novas.push({ client_id: estado.clientId, semana_inicio: proxima, status: "aguardando_validacao" });
    proxima = addDias(proxima, 7);
  }
  if (!temDisponivel) {
    novas.push({ client_id: estado.clientId, semana_inicio: proxima, status: "disponivel" });
  }

  if (novas.length) {
    const { data, error } = await window.supabaseClient.from("weeks").insert(novas).select();
    if (!error && data) estado.weeks = [...estado.weeks, ...data];
  }
}

// Carimba cada tarefa recorrente ativa (ex.: "toda segunda") em toda semana
// ativa que ainda não tem uma tarefa gerada por ela -- roda sempre que a
// tela carrega, então tanto preenche as semanas futuras que já existiam
// quanto as recém-criadas, sem nunca duplicar (verifica antes de inserir).
async function garantirRecorrentesNasSemanas(weekIds) {
  const ativos = estado.recorrentes.filter((r) => r.ativo);
  if (!weekIds.length || !ativos.length) return;

  const novasDemandas = [];
  weekIds.forEach((weekId) => {
    ativos.forEach((r) => {
      const jaTem = estado.demandas.some((d) => d.week_id === weekId && d.recorrente_id === r.id);
      if (jaTem) return;
      novasDemandas.push({
        client_id: estado.clientId,
        week_id: weekId,
        bloco: r.bloco,
        titulo: r.titulo,
        descricao: r.descricao,
        tipo_publicacao: r.tipo_publicacao,
        responsavel_id: r.responsavel_id,
        link: r.link,
        hora_publicacao: r.hora_publicacao,
        categoria: categoriaDaTarefa(r),
        status: "pendente",
        recorrente_id: r.id,
      });
    });
  });

  if (novasDemandas.length) {
    const { data, error } = await window.supabaseClient.from("demandas").insert(novasDemandas).select();
    if (!error && data) estado.demandas = [...estado.demandas, ...data];
  }
}

async function pararRecorrencia(recorrenteId) {
  if (!confirm("Parar de repetir essa tarefa? As que já foram criadas continuam, só para de entrar em semanas novas.")) return;
  const { error } = await window.supabaseClient.from("recorrentes").update({ ativo: false }).eq("id", recorrenteId);
  if (error) {
    mostrarToast("Erro ao parar a repetição: " + error.message);
    return;
  }
  mostrarToast("Repetição parada.");
  await carregarSemanasEDemandas();
  renderWeekTabs();
}

// ------------------------------------------------------------------
// Seletor de clientes (pastilhas no topo)
// ------------------------------------------------------------------

function renderClientSwitcher() {
  const el = document.getElementById("client-switcher");
  el.innerHTML = estado.clients
    .map((c) => {
      const ativo = c.id === estado.clientId;
      const cor = corClienteParaCSS(c.cor);
      return `
        <a class="week-tab ${ativo ? "active" : ""}" href="cliente.html?id=${c.id}"
           style="${ativo ? "" : `border-color:color-mix(in srgb, ${cor} 40%, transparent);`}">
          <span class="tab-status-dot" style="background:${cor};"></span>${escapeHtml(c.nome)}
        </a>
      `;
    })
    .join("");

  renderSwatches(document.getElementById("client-color-swatches"), estado.cliente ? estado.cliente.cor : null, atualizarCorCliente);
}

async function atualizarCorCliente(slot) {
  const { error } = await window.supabaseClient.from("clients").update({ cor: slot }).eq("id", estado.clientId);
  if (error) {
    mostrarToast("Erro ao mudar a cor: " + error.message);
    return;
  }
  estado.cliente.cor = slot;
  const clienteNaLista = estado.clients.find((c) => c.id === estado.clientId);
  if (clienteNaLista) clienteNaLista.cor = slot;
  renderClientSwitcher();
}

// ------------------------------------------------------------------
// Abas de semana (+ datas comemorativas)
// ------------------------------------------------------------------

const DOT_POR_STATUS = {
  disponivel: "var(--accent-track)",
  aguardando_validacao: "var(--status-warning)",
  validada: "var(--status-good)",
  concluida: "var(--text-muted)",
};

function renderWeekTabs() {
  const el = document.getElementById("week-tabs");
  // A fileira principal só mostra a semana atual e as futuras -- as que já
  // passaram saem daqui sozinhas e ficam acessíveis pelo Histórico, por mês.
  const semanas = [...estado.weeks]
    .filter((w) => !semanaPassada(w))
    .sort((a, b) => (a.semana_inicio < b.semana_inicio ? -1 : 1));

  const tabsSemana = semanas
    .map((w) => {
      const ativo = w.id === estado.weekTabSelecionada;
      const fimSemana = addDias(w.semana_inicio, 4);
      return `
        <button class="week-tab ${ativo ? "active" : ""}" data-week-id="${w.id}">
          <span class="tab-status-dot" style="background:${DOT_POR_STATUS[w.status]};"></span>
          ${formatarDataCurta(w.semana_inicio)} a ${formatarDataCurta(fimSemana)}
        </button>
      `;
    })
    .join("");

  const tabPacote = `
    <button class="week-tab ${estado.weekTabSelecionada === "pacote" ? "active" : ""}" data-week-id="pacote">
      Datas comemorativas
    </button>
  `;

  const tabHistorico = `
    <button class="week-tab ${estado.weekTabSelecionada === "historico" ? "active" : ""}" data-week-id="historico">
      Histórico
    </button>
  `;

  el.innerHTML = tabsSemana + tabPacote + tabHistorico;

  el.querySelectorAll("[data-week-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      estado.weekTabSelecionada = btn.dataset.weekId;
      renderWeekTabs();
      renderWeekBanner();
      renderBlocks();
    });
  });

  renderWeekBanner();
  renderBlocks();
}

function renderWeekBanner() {
  const banner = document.getElementById("week-banner");

  if (estado.weekTabSelecionada === "historico") {
    banner.style.display = "none";
    return;
  }

  if (estado.weekTabSelecionada === "pacote") {
    banner.style.display = "flex";
    banner.innerHTML = `<span>Pacote de datas comemorativas: entregue de uma vez, sem ciclo semanal.</span>`;
    return;
  }

  const semana = estado.weeks.find((w) => w.id === estado.weekTabSelecionada);
  if (!semana) {
    banner.style.display = "none";
    return;
  }

  banner.style.display = "flex";

  const textos = {
    disponivel: "Semana liberada para adiantar o preenchimento. Ainda não entra na apresentação de sexta.",
    aguardando_validacao: "Semana pronta para ser apresentada e validada na sexta-feira.",
    validada: "Semana validada. Essas tarefas são o dia a dia atual do cliente.",
    concluida: "Semana concluída e arquivada.",
  };

  let botao = "";
  if (semana.status === "aguardando_validacao") {
    botao = `<button class="btn btn-primary" id="btn-validar-semana">Validar semana</button>`;
  }

  banner.innerHTML = `<span>${textos[semana.status] || ""}</span>${botao}`;

  const btnValidar = document.getElementById("btn-validar-semana");
  if (btnValidar) {
    btnValidar.addEventListener("click", () => validarSemana(semana.id));
  }
}

async function validarSemana(weekId) {
  const demandasDaSemana = estado.demandas.filter((d) => d.week_id === weekId && d.status === "aguardando_validacao");
  const ids = demandasDaSemana.map((d) => d.id);

  if (ids.length > 0) {
    const { error: errDemandas } = await window.supabaseClient
      .from("demandas")
      .update({ status: "validada" })
      .in("id", ids);
    if (errDemandas) {
      mostrarToast("Erro ao validar tarefas: " + errDemandas.message);
      return;
    }
  }

  const { error: errWeek } = await window.supabaseClient.from("weeks").update({ status: "validada" }).eq("id", weekId);
  if (errWeek) {
    mostrarToast("Erro ao validar semana: " + errWeek.message);
    return;
  }

  mostrarToast("Semana validada.");
  await carregarSemanasEDemandas();
  renderWeekTabs();
}

// ------------------------------------------------------------------
// Blocos (checklist de cada dia, ou o pacote de datas comemorativas)
// ------------------------------------------------------------------

function renderBlocks() {
  const grid = document.getElementById("block-grid");

  if (estado.weekTabSelecionada === "historico") {
    grid.innerHTML = renderHistorico();
    const card = grid.querySelector(".historico-card");
    card.querySelector('[data-acao="historico-anterior"]').addEventListener("click", () => {
      estado.historicoMes = somarMes(estado.historicoMes, -1);
      renderBlocks();
    });
    card.querySelector('[data-acao="historico-proximo"]').addEventListener("click", () => {
      estado.historicoMes = somarMes(estado.historicoMes, 1);
      renderBlocks();
    });
    ligarEventosDoGrid();
    return;
  }

  if (estado.weekTabSelecionada === "pacote") {
    grid.innerHTML = renderBlockCard({
      bloco: "datas_comemorativas",
      titulo: "Datas comemorativas",
      weekId: null,
      itens: estado.demandas.filter((d) => d.bloco === "datas_comemorativas"),
    });
    ligarEventosDoGrid();
    return;
  }

  const semana = estado.weeks.find((w) => w.id === estado.weekTabSelecionada);
  if (!semana) {
    grid.innerHTML = '<div class="empty-state">Selecione uma semana.</div>';
    return;
  }

  grid.innerHTML = DIAS_SEMANA.map((dia) =>
    renderBlockCard({
      bloco: dia,
      titulo: NOME_DIA[dia],
      weekId: semana.id,
      semana,
      itens: estado.demandas.filter((d) => d.week_id === semana.id && d.bloco === dia),
    })
  ).join("");

  ligarEventosDoGrid();
}

function renderBlockCard({ bloco, titulo, weekId, semana, itens }) {
  const isPacote = bloco === "datas_comemorativas";
  const feitos = itens.filter((i) => i.status === "publicada").length;

  return `
    <div class="block-card" data-bloco="${bloco}" data-week-id="${weekId || ""}">
      <h3>${titulo} <span class="block-count">${feitos}/${itens.length}</span></h3>

      ${itens.map((item) => renderDemandaItem(item, isPacote, semana)).join("") || '<p style="font-size:12px; color:var(--text-muted);">Nenhuma tarefa ainda.</p>'}

      <button class="btn btn-ghost" style="margin-top:10px; width:100%;" data-acao="abrir-form" data-bloco="${bloco}" data-week-id="${weekId || ""}">+ Adicionar tarefa</button>

      <div class="add-form" data-form-bloco="${bloco}" data-form-week="${weekId || ""}">
        ${camposTarefaHTML(isPacote, null, bloco)}
        <button class="btn btn-primary" data-acao="salvar-tarefa" data-bloco="${bloco}" data-week-id="${weekId || ""}">Salvar tarefa</button>
        <button class="btn btn-ghost" data-acao="fechar-form" data-bloco="${bloco}" data-week-id="${weekId || ""}">Cancelar</button>
      </div>
    </div>
  `;
}

// Histórico: compila tudo que já foi feito (ou estava previsto) em cada
// mês, de qualquer semana -- usa só a data efetiva de cada tarefa, que já
// existe, então não precisa de nenhum campo novo nem de "arquivar" nada à
// mão: assim que o mês vira, as tarefas dele já aparecem aqui agrupadas.
function renderHistorico() {
  if (!estado.historicoMes) estado.historicoMes = toISODate(new Date()).slice(0, 7);
  const mes = estado.historicoMes;

  const semanaPorId = {};
  estado.weeks.forEach((w) => (semanaPorId[w.id] = w));

  const itensDoMes = estado.demandas
    .map((item) => {
      const isPacote = item.bloco === "datas_comemorativas";
      const semana = item.week_id ? semanaPorId[item.week_id] : null;
      const dataEf = isPacote ? item.prazo_pacote || item.data_publicacao : dataEfetivaDaTarefa(item, semana);
      return { item, semana, isPacote, dataEf };
    })
    .filter((x) => x.dataEf && x.dataEf.slice(0, 7) === mes)
    .sort((a, b) => (a.dataEf < b.dataEf ? -1 : a.dataEf > b.dataEf ? 1 : 0));

  const porDia = {};
  itensDoMes.forEach((x) => {
    (porDia[x.dataEf] = porDia[x.dataEf] || []).push(x);
  });
  const diasOrdenados = Object.keys(porDia).sort();

  const totalItens = itensDoMes.length;
  const totalPublicadas = itensDoMes.filter((x) => x.item.status === "publicada").length;

  const corpo = diasOrdenados.length
    ? diasOrdenados
        .map(
          (dia) => `
            <div class="historico-dia">
              <h4>${formatarDataLonga(dia)} <span class="historico-dia-count">${porDia[dia].length} tarefa${porDia[dia].length === 1 ? "" : "s"}</span></h4>
              ${porDia[dia].map((x) => renderDemandaItem(x.item, x.isPacote, x.semana)).join("")}
            </div>
          `
        )
        .join("")
    : '<p class="empty-state">Nenhuma tarefa neste mês.</p>';

  return `
    <div class="block-card historico-card">
      <div class="historico-nav">
        <button class="btn btn-ghost" data-acao="historico-anterior" title="Mês anterior">‹</button>
        <h3>${formatarMesAno(mes)} <span class="block-count">${totalPublicadas}/${totalItens} publicadas</span></h3>
        <button class="btn btn-ghost" data-acao="historico-proximo" title="Próximo mês">›</button>
      </div>
      ${corpo}
    </div>
  `;
}

// Campos do formulário de tarefa, reaproveitados tanto para adicionar uma
// tarefa nova (item = null) quanto para editar uma já existente (item
// preenchido, pré-seleciona os valores atuais). "bloco" só é obrigatório
// pra tarefa nova (pra saber de qual dia oferecer a repetição); numa
// edição já vem de item.bloco.
function camposTarefaHTML(isPacote, item, bloco) {
  item = item || {};
  bloco = bloco || item.bloco;
  const tipo = item.tipo_publicacao || "agendada";
  const horaVal = item.hora_publicacao ? item.hora_publicacao.slice(0, 5) : "";
  const ehTarefaNova = !item.id;
  const categoria = categoriaDaTarefa(item);

  return `
    ${
      item.recorrente_id
        ? `<div class="aviso-recorrente">
            <span>Essa tarefa se repete toda ${NOME_DIA[item.bloco]}.</span>
            <button type="button" class="btn btn-ghost" data-acao="parar-recorrencia" data-recorrente-id="${item.recorrente_id}">Parar de repetir</button>
          </div>`
        : ""
    }
    <div class="field">
      <label>Tarefa</label>
      <input type="text" class="input-titulo" placeholder="Ex: Subir post feed" value="${escapeHtml(item.titulo || "")}" />
    </div>
    <div class="field">
      <label>Descrição (o que é e como deve ser feito)</label>
      <textarea class="input-descricao" rows="2" placeholder="Opcional">${escapeHtml(item.descricao || "")}</textarea>
    </div>
    ${
      !isPacote
        ? `<div class="field">
            <label>Tipo de demanda</label>
            <select class="input-categoria">
              <option value="social" ${categoria === "social" ? "selected" : ""}>Mídia social (conteúdo pra postar -- entra no progresso da semana)</option>
              <option value="diaria" ${categoria === "diaria" ? "selected" : ""}>Tarefa diária (operacional -- entra no progresso do dia, não no da semana)</option>
            </select>
          </div>`
        : ""
    }
    <div class="grid-2">
      <div class="field">
        <label>Tipo de publicação</label>
        <select class="input-tipo">
          <option value="agendada" ${tipo === "agendada" ? "selected" : ""}>Agendada</option>
          <option value="manual" ${tipo === "manual" ? "selected" : ""}>Manual (subir na hora)</option>
        </select>
      </div>
      <div class="field">
        <label>Responsável</label>
        <select class="input-responsavel">
          <option value="">Sem responsável definido</option>
          ${estado.colaboradores
            .map((c) => `<option value="${c.id}" ${c.id === item.responsavel_id ? "selected" : ""}>${escapeHtml(c.nome)}${c.funcao ? ` (${escapeHtml(c.funcao)})` : ""}</option>`)
            .join("")}
          <option value="__novo__">+ Novo colaborador...</option>
        </select>
      </div>
    </div>
    <div class="field">
      <label>Link (arte pronta no CRM)</label>
      <input type="url" class="input-link" placeholder="https://..." value="${escapeHtml(item.link || "")}" />
    </div>
    ${
      isPacote
        ? `<div class="field"><label>Prazo do pacote</label><input type="date" class="input-prazo" value="${item.prazo_pacote || ""}" /></div>`
        : `<div class="grid-2">
            <div class="field"><label>Data</label><input type="date" class="input-data" value="${item.data_publicacao || ""}" /></div>
            <div class="field"><label>Hora</label><input type="time" class="input-hora" value="${horaVal}" /></div>
          </div>`
    }
    ${
      !isPacote && ehTarefaNova
        ? `<div class="field">
            <label class="checkbox-label"><input type="checkbox" class="input-recorrente" /> Repetir toda ${NOME_DIA[bloco]} (entra sozinha nas próximas semanas)</label>
          </div>`
        : ""
    }
  `;
}

function renderDemandaItem(item, isPacote, semana) {
  const metaBits = [];
  if (item.tipo_publicacao === "manual") metaBits.push("Manual");
  if (item.data_publicacao) metaBits.push(formatarDataCurta(item.data_publicacao));
  if (item.prazo_pacote) metaBits.push("Prazo: " + formatarDataCurta(item.prazo_pacote));
  if (item.link) metaBits.push(`<a href="${escapeHtml(item.link)}" target="_blank" rel="noopener">Ver arte</a>`);

  const corCliente = corClienteParaCSS(estado.cliente ? estado.cliente.cor : null);
  const dataEfetiva = dataEfetivaDaTarefa(item, semana);
  const atrasada = tarefaAtrasada(item, dataEfetiva);
  const categoria = categoriaDaTarefa(item);
  const podeAprovar = categoria === "social" && item.status !== "validada" && item.status !== "publicada";

  return `
    <div class="demanda-item ${atrasada ? "is-atrasada" : ""}" data-id="${item.id}" style="--client-color:${corCliente}">
      <div class="demanda-title">
        <span class="pill pill-${item.status}">${NOME_STATUS[item.status]}</span>
        ${escapeHtml(item.titulo)}
        ${categoria === "diaria" ? '<span class="badge-categoria">Diária</span>' : ""}
        ${item.recorrente_id ? '<span class="badge-recorrente">Recorrente</span>' : ""}
        ${badgeHorarioHTML(item, dataEfetiva, atrasada)}
        ${atrasada ? '<span class="badge-atrasada">Atrasada</span>' : ""}
      </div>
      ${item.descricao ? `<div class="demanda-meta" style="color:var(--text-secondary);">${escapeHtml(item.descricao)}</div>` : ""}
      ${metaBits.length ? `<div class="demanda-meta">${metaBits.join(" · ")}</div>` : ""}
      <div class="demanda-controls">
        <select class="select-status" data-id="${item.id}">
          ${Object.entries(NOME_STATUS)
            .map(([valor, nome]) => `<option value="${valor}" ${valor === item.status ? "selected" : ""}>${nome}</option>`)
            .join("")}
        </select>
        <select class="select-responsavel" data-id="${item.id}" title="Responsável">
          <option value="">Responsável</option>
          ${estado.colaboradores
            .map((c) => `<option value="${c.id}" ${c.id === item.responsavel_id ? "selected" : ""}>${escapeHtml(c.nome)}</option>`)
            .join("")}
          <option value="__novo__">+ Novo colaborador...</option>
        </select>
        ${podeAprovar ? `<button class="btn btn-aprovar" data-acao="aprovar-tarefa" data-id="${item.id}">Aprovar</button>` : ""}
        <button class="btn btn-ghost" data-acao="editar-tarefa" data-id="${item.id}">Editar</button>
        <button class="btn btn-ghost" data-acao="excluir-tarefa" data-id="${item.id}" style="margin-left:auto;">Excluir</button>
      </div>

      <div class="add-form" data-edit-form="${item.id}">
        ${camposTarefaHTML(isPacote, item)}
        <button class="btn btn-primary" data-acao="salvar-edicao" data-id="${item.id}">Salvar alterações</button>
        <button class="btn btn-ghost" data-acao="fechar-edicao" data-id="${item.id}">Cancelar</button>
      </div>
    </div>
  `;
}

function ligarEventosDoGrid() {
  const grid = document.getElementById("block-grid");

  grid.querySelectorAll('[data-acao="abrir-form"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const form = grid.querySelector(`[data-form-bloco="${btn.dataset.bloco}"][data-form-week="${btn.dataset.weekId}"]`);
      form.classList.toggle("open");
    });
  });

  grid.querySelectorAll('[data-acao="fechar-form"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const form = grid.querySelector(`[data-form-bloco="${btn.dataset.bloco}"][data-form-week="${btn.dataset.weekId}"]`);
      form.classList.remove("open");
    });
  });

  grid.querySelectorAll('[data-acao="salvar-tarefa"]').forEach((btn) => {
    btn.addEventListener("click", () => salvarTarefa(btn.dataset.bloco, btn.dataset.weekId || null));
  });

  grid.querySelectorAll('[data-acao="editar-tarefa"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const item = grid.querySelector(`.demanda-item[data-id="${btn.dataset.id}"]`);
      item.querySelector(`[data-edit-form="${btn.dataset.id}"]`).classList.toggle("open");
    });
  });

  grid.querySelectorAll('[data-acao="fechar-edicao"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const item = grid.querySelector(`.demanda-item[data-id="${btn.dataset.id}"]`);
      item.querySelector(`[data-edit-form="${btn.dataset.id}"]`).classList.remove("open");
    });
  });

  grid.querySelectorAll('[data-acao="salvar-edicao"]').forEach((btn) => {
    btn.addEventListener("click", () => salvarEdicaoTarefa(btn.dataset.id));
  });

  grid.querySelectorAll(".select-status").forEach((sel) => {
    sel.addEventListener("change", () => atualizarStatus(sel.dataset.id, sel.value));
  });

  grid.querySelectorAll(".select-responsavel, .input-responsavel").forEach(configurarSelectResponsavel);

  grid.querySelectorAll('[data-acao="excluir-tarefa"]').forEach((btn) => {
    btn.addEventListener("click", () => excluirTarefa(btn.dataset.id));
  });

  grid.querySelectorAll('[data-acao="parar-recorrencia"]').forEach((btn) => {
    btn.addEventListener("click", () => pararRecorrencia(btn.dataset.recorrenteId));
  });

  // Aprova o conteúdo na hora, mesmo antes da data prevista -- não precisa
  // esperar a validação da semana inteira (toda sexta) pra liberar um post
  // que já ficou pronto antes.
  grid.querySelectorAll('[data-acao="aprovar-tarefa"]').forEach((btn) => {
    btn.addEventListener("click", () => atualizarStatus(btn.dataset.id, "validada"));
  });
}

// Fica de olho nos seletores de "Responsável" (tanto o rápido, de cada
// card, quanto o de dentro dos formulários de adicionar/editar tarefa) pra
// tratar a opção "+ Novo colaborador...": cria o colaborador na hora, sem
// precisar sair da tarefa pra ir em "Equipe" cadastrar antes.
function configurarSelectResponsavel(sel) {
  sel.dataset.valorAnterior = sel.value;
  sel.addEventListener("change", async () => {
    if (sel.value !== "__novo__") {
      sel.dataset.valorAnterior = sel.value;
      if (sel.classList.contains("select-responsavel")) {
        atualizarResponsavel(sel.dataset.id, sel.value || null);
      }
      return;
    }

    const idAnterior = sel.dataset.valorAnterior || "";
    const novoId = await criarColaboradorInline();
    sel.value = novoId || idAnterior;
    sel.dataset.valorAnterior = sel.value;

    if (novoId && sel.classList.contains("select-responsavel")) {
      atualizarResponsavel(sel.dataset.id, novoId);
    }
  });
}

// Cadastra um colaborador sem sair da tela do cliente e já soma a opção
// nova em toda select de responsável visível na tela (os formulários
// abertos continuam com o que a pessoa já tinha digitado).
async function criarColaboradorInline() {
  const nome = (window.prompt("Nome do novo colaborador:") || "").trim();
  if (!nome) return null;
  const funcao = (window.prompt("Função (opcional):") || "").trim();

  const { data, error } = await window.supabaseClient
    .from("colaboradores")
    .insert({ nome, funcao: funcao || null, ativo: true });

  if (error) {
    mostrarToast("Erro ao criar colaborador: " + error.message);
    return null;
  }

  const novo = data[0];
  estado.colaboradores.push(novo);

  document.querySelectorAll(".input-responsavel, .select-responsavel").forEach((sel) => {
    const opcao = document.createElement("option");
    opcao.value = novo.id;
    opcao.textContent = novo.nome + (novo.funcao ? ` (${novo.funcao})` : "");
    const opcaoNovo = sel.querySelector('option[value="__novo__"]');
    if (opcaoNovo) sel.insertBefore(opcao, opcaoNovo);
    else sel.appendChild(opcao);
  });

  mostrarToast("Colaborador adicionado.");
  return novo.id;
}

async function salvarTarefa(bloco, weekId) {
  const form = document.querySelector(`[data-form-bloco="${bloco}"][data-form-week="${weekId || ""}"]`);
  const titulo = form.querySelector(".input-titulo").value.trim();
  if (!titulo) {
    mostrarToast("Dê um nome para a tarefa.");
    return;
  }

  const descricao = form.querySelector(".input-descricao").value.trim() || null;
  const tipoPublicacao = form.querySelector(".input-tipo").value;
  const responsavelId = form.querySelector(".input-responsavel").value || null;
  const link = form.querySelector(".input-link").value.trim() || null;
  const inputCategoria = form.querySelector(".input-categoria");
  const categoria = inputCategoria ? inputCategoria.value : "social";

  const inputData = form.querySelector(".input-data");
  const inputHora = form.querySelector(".input-hora");
  const inputPrazo = form.querySelector(".input-prazo");
  const horaPublicacao = inputHora ? inputHora.value || null : null;

  const inputRecorrente = form.querySelector(".input-recorrente");
  const querRecorrente = inputRecorrente && inputRecorrente.checked;

  let recorrenteId = null;
  if (querRecorrente) {
    const { data: recData, error: recErro } = await window.supabaseClient.from("recorrentes").insert({
      client_id: estado.clientId,
      bloco,
      titulo,
      descricao,
      tipo_publicacao: tipoPublicacao,
      responsavel_id: responsavelId,
      link,
      hora_publicacao: horaPublicacao,
      categoria,
      ativo: true,
    });
    if (recErro) {
      mostrarToast("Erro ao criar a repetição: " + recErro.message);
      return;
    }
    recorrenteId = recData[0].id;
  }

  const payload = {
    client_id: estado.clientId,
    week_id: weekId || null,
    bloco,
    titulo,
    descricao,
    tipo_publicacao: tipoPublicacao,
    responsavel_id: responsavelId,
    link,
    categoria,
    status: "pendente",
    recorrente_id: recorrenteId,
  };
  if (inputData) payload.data_publicacao = inputData.value || null;
  if (inputHora) payload.hora_publicacao = horaPublicacao;
  if (inputPrazo) payload.prazo_pacote = inputPrazo.value || null;

  const { error } = await window.supabaseClient.from("demandas").insert(payload);
  if (error) {
    mostrarToast("Erro ao salvar: " + error.message);
    return;
  }

  mostrarToast(querRecorrente ? "Tarefa recorrente criada. Ela já entra sozinha nas próximas semanas." : "Tarefa adicionada.");
  await carregarSemanasEDemandas();
  renderWeekTabs();
}

async function salvarEdicaoTarefa(id) {
  const item = document.querySelector(`.demanda-item[data-id="${id}"]`);
  const form = item.querySelector(`[data-edit-form="${id}"]`);
  const titulo = form.querySelector(".input-titulo").value.trim();
  if (!titulo) {
    mostrarToast("Dê um nome para a tarefa.");
    return;
  }

  const payload = {
    titulo,
    descricao: form.querySelector(".input-descricao").value.trim() || null,
    tipo_publicacao: form.querySelector(".input-tipo").value,
    responsavel_id: form.querySelector(".input-responsavel").value || null,
    link: form.querySelector(".input-link").value.trim() || null,
  };

  const inputCategoria = form.querySelector(".input-categoria");
  if (inputCategoria) payload.categoria = inputCategoria.value;

  const inputData = form.querySelector(".input-data");
  const inputHora = form.querySelector(".input-hora");
  const inputPrazo = form.querySelector(".input-prazo");
  if (inputData) payload.data_publicacao = inputData.value || null;
  if (inputHora) payload.hora_publicacao = inputHora.value || null;
  if (inputPrazo) payload.prazo_pacote = inputPrazo.value || null;

  const { error } = await window.supabaseClient.from("demandas").update(payload).eq("id", id);
  if (error) {
    mostrarToast("Erro ao salvar: " + error.message);
    return;
  }

  mostrarToast("Tarefa atualizada.");
  await carregarSemanasEDemandas();
  renderWeekTabs();
}

async function atualizarStatus(id, novoStatus) {
  const { error } = await window.supabaseClient.from("demandas").update({ status: novoStatus }).eq("id", id);
  if (error) {
    mostrarToast("Erro: " + error.message);
    await carregarSemanasEDemandas();
    renderWeekTabs();
    return;
  }
  await carregarSemanasEDemandas();
  renderWeekTabs();
}

async function atualizarResponsavel(id, responsavelId) {
  const { error } = await window.supabaseClient.from("demandas").update({ responsavel_id: responsavelId }).eq("id", id);
  if (error) {
    mostrarToast("Erro: " + error.message);
  }
  await carregarSemanasEDemandas();
  renderWeekTabs();
}

async function excluirTarefa(id) {
  if (!confirm("Excluir esta tarefa?")) return;
  const { error } = await window.supabaseClient.from("demandas").delete().eq("id", id);
  if (error) {
    mostrarToast("Erro ao excluir: " + error.message);
    return;
  }
  await carregarSemanasEDemandas();
  renderWeekTabs();
}

// ------------------------------------------------------------------

async function init() {
  if (!montarTopbarAcoes("user-tag")) return;
  await carregarTudo();

  // Atualiza os selos de horário sozinho (sem precisar recarregar a
  // página), pra a contagem "faltam Xmin" andar e o alerta amarelo/
  // vermelho aparecer na hora certa. Pula a rodada se tiver algum
  // formulário aberto, pra não atrapalhar quem está digitando.
  setInterval(() => {
    if (document.querySelector("#block-grid .add-form.open")) return;
    renderBlocks();
  }, 30000);
}

init();
