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

let estado = {
  clientId: null,
  clients: [],
  cliente: null,
  weeks: [],
  demandas: [],
  colaboradores: [],
  weekTabSelecionada: null, // id da semana, ou "pacote"
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
  return date.toISOString().slice(0, 10);
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

  const [{ data: clients }, { data: cliente }, { data: colaboradores }] = await Promise.all([
    window.supabaseClient.from("clients").select("*").eq("ativo", true).order("nome"),
    window.supabaseClient.from("clients").select("*").eq("id", estado.clientId).single(),
    window.supabaseClient.from("colaboradores").select("*").eq("ativo", true).order("nome"),
  ]);

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
  const [{ data: weeks }, { data: demandas }] = await Promise.all([
    window.supabaseClient.from("weeks").select("*").eq("client_id", estado.clientId).order("semana_inicio"),
    window.supabaseClient.from("demandas").select("*").eq("client_id", estado.clientId),
  ]);

  estado.weeks = weeks || [];
  estado.demandas = demandas || [];

  await garantirProximasSemanas();

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
  const naoConcluidas = estado.weeks.filter((w) => w.status !== "concluida");
  const temAguardando = naoConcluidas.some((w) => w.status === "aguardando_validacao");
  const temDisponivel = naoConcluidas.some((w) => w.status === "disponivel");

  if (temAguardando && temDisponivel) return;

  const ultima = [...estado.weeks].sort((a, b) => (a.semana_inicio < b.semana_inicio ? 1 : -1))[0];
  let proxima = ultima ? addDias(ultima.semana_inicio, 7) : toISODate(segundaFeiraDe(new Date()));

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
  const semanas = [...estado.weeks].sort((a, b) => (a.semana_inicio < b.semana_inicio ? -1 : 1));

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

  el.innerHTML = tabsSemana + tabPacote;

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
      itens: estado.demandas.filter((d) => d.week_id === semana.id && d.bloco === dia),
    })
  ).join("");

  ligarEventosDoGrid();
}

function renderBlockCard({ bloco, titulo, weekId, itens }) {
  const isPacote = bloco === "datas_comemorativas";
  const feitos = itens.filter((i) => i.status === "publicada").length;

  return `
    <div class="block-card" data-bloco="${bloco}" data-week-id="${weekId || ""}">
      <h3>${titulo} <span class="block-count">${feitos}/${itens.length}</span></h3>

      ${itens.map((item) => renderDemandaItem(item, isPacote)).join("") || '<p style="font-size:12px; color:var(--text-muted);">Nenhuma tarefa ainda.</p>'}

      <button class="btn btn-ghost" style="margin-top:10px; width:100%;" data-acao="abrir-form" data-bloco="${bloco}" data-week-id="${weekId || ""}">+ Adicionar tarefa</button>

      <div class="add-form" data-form-bloco="${bloco}" data-form-week="${weekId || ""}">
        ${camposTarefaHTML(isPacote, null)}
        <button class="btn btn-primary" data-acao="salvar-tarefa" data-bloco="${bloco}" data-week-id="${weekId || ""}">Salvar tarefa</button>
        <button class="btn btn-ghost" data-acao="fechar-form" data-bloco="${bloco}" data-week-id="${weekId || ""}">Cancelar</button>
      </div>
    </div>
  `;
}

// Campos do formulário de tarefa, reaproveitados tanto para adicionar uma
// tarefa nova (item = null) quanto para editar uma já existente (item
// preenchido, pré-seleciona os valores atuais).
function camposTarefaHTML(isPacote, item) {
  item = item || {};
  const tipo = item.tipo_publicacao || "agendada";
  const horaVal = item.hora_publicacao ? item.hora_publicacao.slice(0, 5) : "";

  return `
    <div class="field">
      <label>Tarefa</label>
      <input type="text" class="input-titulo" placeholder="Ex: Subir post feed" value="${escapeHtml(item.titulo || "")}" />
    </div>
    <div class="field">
      <label>Descrição (o que é e como deve ser feito)</label>
      <textarea class="input-descricao" rows="2" placeholder="Opcional">${escapeHtml(item.descricao || "")}</textarea>
    </div>
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
  `;
}

function renderDemandaItem(item, isPacote) {
  const metaBits = [];
  if (item.tipo_publicacao === "manual") metaBits.push("Manual");
  if (item.data_publicacao) metaBits.push(formatarDataCurta(item.data_publicacao) + (item.hora_publicacao ? " " + item.hora_publicacao.slice(0, 5) : ""));
  if (item.prazo_pacote) metaBits.push("Prazo: " + formatarDataCurta(item.prazo_pacote));
  if (item.link) metaBits.push(`<a href="${escapeHtml(item.link)}" target="_blank" rel="noopener">Ver arte</a>`);

  const accent = window.ACCENT_POR_STATUS[item.status] || "var(--border-hairline)";

  return `
    <div class="demanda-item" data-id="${item.id}" style="--item-accent:${accent}">
      <div class="demanda-title">
        <span class="pill pill-${item.status}">${NOME_STATUS[item.status]}</span>
        ${escapeHtml(item.titulo)}
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

  const payload = {
    client_id: estado.clientId,
    week_id: weekId || null,
    bloco,
    titulo,
    descricao: form.querySelector(".input-descricao").value.trim() || null,
    tipo_publicacao: form.querySelector(".input-tipo").value,
    responsavel_id: form.querySelector(".input-responsavel").value || null,
    link: form.querySelector(".input-link").value.trim() || null,
    status: "pendente",
  };

  const inputData = form.querySelector(".input-data");
  const inputHora = form.querySelector(".input-hora");
  const inputPrazo = form.querySelector(".input-prazo");
  if (inputData) payload.data_publicacao = inputData.value || null;
  if (inputHora) payload.hora_publicacao = inputHora.value || null;
  if (inputPrazo) payload.prazo_pacote = inputPrazo.value || null;

  const { error } = await window.supabaseClient.from("demandas").insert(payload);
  if (error) {
    mostrarToast("Erro ao salvar: " + error.message);
    return;
  }

  mostrarToast("Tarefa adicionada.");
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
}

init();
