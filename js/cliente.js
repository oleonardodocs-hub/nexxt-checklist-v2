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
  acessos: [],
  acessosAbertos: false,
  erroAcessos: null,
  editandoDrive: false,
  weekTabSelecionada: null, // id da semana, "pacote" ou "historico"
  historicoMes: null, // "AAAA-MM" selecionado dentro do Histórico
  mesesDiariosAbertos: {}, // quais grupos de mês da tabela de tarefas diárias estão abertos/fechados
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
  await carregarAcessos();
  renderClientSwitcher();
  renderWeekTabs();
  renderAcessos();
}

// Acessos (logins/senhas de redes sociais, CRM, e-mail etc.) são
// carregados à parte das demandas -- é informação de outra natureza, não
// precisa recarregar sempre que uma tarefa muda de status.
async function carregarAcessos() {
  const { data, error } = await window.supabaseClient.from("acessos").select("*").eq("client_id", estado.clientId).order("servico");
  if (error) {
    console.error(error);
    estado.acessos = [];
    estado.erroAcessos = error.message;
    return;
  }
  estado.acessos = data || [];
  estado.erroAcessos = null;
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
        link_referencia: r.link_referencia,
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
// Cor do cliente (botão compacto no topo, embaixo do título)
// ------------------------------------------------------------------

// Em vez da fileira de 8 bolinhas sempre visível (não ficava legal), mostra
// só um botãozinho com a cor atual -- clicar nele abre as opções de cor por
// cima, escolher uma fecha de novo. A cor de cada cliente já nasce sozinha
// na hora de criar (ver dashboard.js); isso aqui é só pra quando precisar
// trocar depois.
function renderClientSwitcher() {
  const el = document.getElementById("client-color-swatches");
  if (!el) return;
  const cor = estado.cliente ? estado.cliente.cor : null;

  el.innerHTML = `
    <div class="cor-cliente-picker">
      <button type="button" class="btn-cor-cliente-atual" id="btn-cor-cliente-toggle" title="Clique para trocar a cor do cliente">
        <span class="bolinha-cor-atual" style="background:${corClienteParaCSS(cor)}"></span>
        Cor do cliente
      </button>
      <div class="swatch-row cor-cliente-opcoes" id="cor-cliente-opcoes"></div>
    </div>
  `;

  renderSwatches(document.getElementById("cor-cliente-opcoes"), cor, atualizarCorCliente);

  document.getElementById("btn-cor-cliente-toggle").addEventListener("click", () => {
    document.getElementById("cor-cliente-opcoes").classList.toggle("open");
  });
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
// Acessos e senhas (logins de redes sociais, CRM, e-mail etc. do cliente)
// ------------------------------------------------------------------

// Fechado por padrão sempre que a página carrega, pra senha nenhuma ficar
// visível de cara pra quem só está passando o olho na tela.
function renderAcessos() {
  const el = document.getElementById("acessos-section");
  if (!el) return;

  if (!estado.acessosAbertos) {
    el.innerHTML = `
      <button class="btn btn-ghost btn-toggle-acessos-fechado" id="btn-toggle-acessos" style="margin:0 0 14px;">
        <span class="icone-chave-badge">${SVG_CHAVE}</span>
        Acessos e senhas${estado.acessos.length ? ` <span class="acessos-contador">${estado.acessos.length}</span>` : ""}
      </button>
    `;
    document.getElementById("btn-toggle-acessos").addEventListener("click", () => {
      estado.acessosAbertos = true;
      renderAcessos();
    });
    return;
  }

  if (estado.erroAcessos) {
    el.innerHTML = `
      <div class="acessos-card">
        <div class="acessos-head">
          <h3><span class="icone-chave-badge">${SVG_CHAVE}</span>Acessos e senhas</h3>
          <button class="btn btn-ghost" id="btn-fechar-acessos">Fechar</button>
        </div>
        ${htmlErroDeCarregamento(estado.erroAcessos)}
      </div>
    `;
    document.getElementById("btn-fechar-acessos").addEventListener("click", () => {
      estado.acessosAbertos = false;
      renderAcessos();
    });
    ligarBotaoCorrigirToken();
    return;
  }

  const linhas =
    estado.acessos.map((a) => renderAcessoItem(a)).join("") ||
    '<p class="empty-state" style="padding:18px 0;">Nenhum acesso cadastrado ainda.</p>';

  el.innerHTML = `
    <div class="acessos-card">
      <div class="acessos-head">
        <h3><span class="icone-chave-badge">${SVG_CHAVE}</span>Acessos e senhas</h3>
        <button class="btn btn-ghost" id="btn-fechar-acessos">Fechar</button>
      </div>
      ${renderDriveClienteHTML()}
      <div class="acessos-lista">${linhas}</div>
      <button class="btn btn-ghost" id="btn-abrir-form-acesso" style="width:100%; margin-top:10px;">+ Adicionar acesso</button>
      <div class="add-form" id="form-acesso">
        ${camposAcessoHTML(null)}
        <button class="btn btn-primary" id="btn-salvar-acesso">Salvar acesso</button>
        <button class="btn btn-ghost" id="btn-cancelar-acesso">Cancelar</button>
      </div>
    </div>
  `;

  ligarEventosAcessos();
  ligarEventosDriveCliente();
}

// Campo exclusivo pro Drive do cliente (onde ficam os projetos/mídias já
// prontos), separado dos logins/senhas de serviços abaixo -- é só um link,
// não tem usuário/senha, então ganha um bloco de destaque próprio no topo
// do painel em vez de entrar na lista genérica de acessos.
function renderDriveClienteHTML() {
  const link = estado.cliente ? estado.cliente.drive_link : null;

  if (estado.editandoDrive) {
    return `
      <div class="drive-cliente-card">
        <div class="drive-cliente-info">
          <span class="icone-pasta-badge">${SVG_PASTA}</span>
          <div class="field" style="flex:1; margin:0;">
            <label>Link do Drive do cliente</label>
            <input type="text" class="input-drive-link" placeholder="Cole aqui o link da pasta do Drive" value="${escapeHtml(link || "")}" />
          </div>
        </div>
        <div class="demanda-controls" style="margin-top:8px;">
          <button class="btn btn-primary" id="btn-salvar-drive">Salvar</button>
          <button class="btn btn-ghost" id="btn-cancelar-drive">Cancelar</button>
        </div>
      </div>
    `;
  }

  if (!link) {
    return `
      <div class="drive-cliente-card">
        <div class="drive-cliente-info">
          <span class="icone-pasta-badge">${SVG_PASTA}</span>
          <span class="drive-cliente-vazio">Nenhum Drive cadastrado ainda</span>
        </div>
        <button class="btn btn-ghost" id="btn-abrir-edicao-drive">+ Adicionar Drive</button>
      </div>
    `;
  }

  return `
    <div class="drive-cliente-card">
      <div class="drive-cliente-info">
        <span class="icone-pasta-badge">${SVG_PASTA}</span>
        <a class="drive-cliente-link" href="${escapeHtml(link)}" target="_blank" rel="noopener">Abrir Drive do cliente ↗</a>
      </div>
      <button class="btn btn-ghost" id="btn-abrir-edicao-drive">Editar</button>
    </div>
  `;
}

function ligarEventosDriveCliente() {
  const btnAbrir = document.getElementById("btn-abrir-edicao-drive");
  if (btnAbrir) {
    btnAbrir.addEventListener("click", () => {
      estado.editandoDrive = true;
      renderAcessos();
    });
  }
  const btnCancelar = document.getElementById("btn-cancelar-drive");
  if (btnCancelar) {
    btnCancelar.addEventListener("click", () => {
      estado.editandoDrive = false;
      renderAcessos();
    });
  }
  const btnSalvar = document.getElementById("btn-salvar-drive");
  if (btnSalvar) {
    btnSalvar.addEventListener("click", salvarDriveCliente);
  }
}

async function salvarDriveCliente() {
  const input = document.querySelector(".input-drive-link");
  let link = input.value.trim() || null;
  // Facilita colar só o começo do link sem "https://" -- sem isso o link
  // vira um caminho relativo da própria página e não abre o Drive.
  if (link && !/^https?:\/\//i.test(link)) link = "https://" + link;

  const { error } = await window.supabaseClient.from("clients").update({ drive_link: link }).eq("id", estado.clientId);
  if (error) {
    mostrarToast("Erro ao salvar o Drive: " + error.message);
    return;
  }

  estado.cliente.drive_link = link;
  estado.editandoDrive = false;
  mostrarToast("Drive do cliente salvo.");
  renderAcessos();
}

function camposAcessoHTML(acesso) {
  acesso = acesso || {};
  return `
    <div class="grid-2">
      <div class="field">
        <label>Serviço</label>
        <input type="text" class="input-acesso-servico" placeholder="Ex: Facebook, Instagram, CRM, E-mail" value="${escapeHtml(acesso.servico || "")}" />
      </div>
      <div class="field">
        <label>Login / usuário</label>
        <input type="text" class="input-acesso-login" value="${escapeHtml(acesso.login || "")}" />
      </div>
    </div>
    <div class="field">
      <label>Senha</label>
      <input type="text" class="input-acesso-senha" value="${escapeHtml(acesso.senha || "")}" />
    </div>
    <div class="field">
      <label>Observação (opcional)</label>
      <input type="text" class="input-acesso-obs" placeholder="Ex: código de verificação vai no e-mail da agência" value="${escapeHtml(acesso.observacao || "")}" />
    </div>
  `;
}

function renderAcessoItem(a) {
  return `
    <div class="acesso-item" data-id="${a.id}">
      <div class="acesso-info">
        <span class="acesso-servico">${escapeHtml(a.servico)}</span>
        <span class="acesso-dado">${escapeHtml(a.login || "Sem login definido")}</span>
        <span class="acesso-dado acesso-senha" data-senha="${escapeHtml(a.senha || "")}">${a.senha ? "••••••••" : "Sem senha definida"}</span>
        ${a.senha ? `<button type="button" class="btn btn-ghost btn-mini" data-acao="mostrar-senha">Mostrar</button>` : ""}
      </div>
      ${a.observacao ? `<div class="demanda-meta">${escapeHtml(a.observacao)}</div>` : ""}
      <div class="demanda-controls">
        <button class="btn btn-ghost" data-acao="editar-acesso" data-id="${a.id}">Editar</button>
        <button class="btn btn-ghost" data-acao="excluir-acesso" data-id="${a.id}" style="margin-left:auto;">Excluir</button>
      </div>
      <div class="add-form" data-edit-acesso="${a.id}">
        ${camposAcessoHTML(a)}
        <button class="btn btn-primary" data-acao="salvar-edicao-acesso" data-id="${a.id}">Salvar alterações</button>
        <button class="btn btn-ghost" data-acao="fechar-edicao-acesso" data-id="${a.id}">Cancelar</button>
      </div>
    </div>
  `;
}

function ligarEventosAcessos() {
  const el = document.getElementById("acessos-section");

  document.getElementById("btn-fechar-acessos").addEventListener("click", () => {
    estado.acessosAbertos = false;
    renderAcessos();
  });

  const btnAbrirForm = document.getElementById("btn-abrir-form-acesso");
  if (btnAbrirForm) {
    btnAbrirForm.addEventListener("click", () => {
      document.getElementById("form-acesso").classList.toggle("open");
    });
    document.getElementById("btn-cancelar-acesso").addEventListener("click", () => {
      document.getElementById("form-acesso").classList.remove("open");
    });
    document.getElementById("btn-salvar-acesso").addEventListener("click", salvarAcesso);
  }

  el.querySelectorAll('[data-acao="mostrar-senha"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const span = btn.previousElementSibling;
      if (!span || !span.classList.contains("acesso-senha")) return;
      const oculta = span.textContent.trim() === "••••••••";
      span.textContent = oculta ? span.dataset.senha : "••••••••";
      btn.textContent = oculta ? "Ocultar" : "Mostrar";
    });
  });

  el.querySelectorAll('[data-acao="editar-acesso"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelector(`[data-edit-acesso="${btn.dataset.id}"]`).classList.toggle("open");
    });
  });
  el.querySelectorAll('[data-acao="fechar-edicao-acesso"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelector(`[data-edit-acesso="${btn.dataset.id}"]`).classList.remove("open");
    });
  });
  el.querySelectorAll('[data-acao="salvar-edicao-acesso"]').forEach((btn) => {
    btn.addEventListener("click", () => salvarEdicaoAcesso(btn.dataset.id));
  });
  el.querySelectorAll('[data-acao="excluir-acesso"]').forEach((btn) => {
    btn.addEventListener("click", () => excluirAcesso(btn.dataset.id));
  });
}

async function salvarAcesso() {
  const form = document.getElementById("form-acesso");
  const servico = form.querySelector(".input-acesso-servico").value.trim();
  if (!servico) {
    mostrarToast("Diga qual é o serviço (ex: Facebook, Instagram).");
    return;
  }
  const payload = {
    client_id: estado.clientId,
    servico,
    login: form.querySelector(".input-acesso-login").value.trim() || null,
    senha: form.querySelector(".input-acesso-senha").value || null,
    observacao: form.querySelector(".input-acesso-obs").value.trim() || null,
  };
  const { error } = await window.supabaseClient.from("acessos").insert(payload);
  if (error) {
    mostrarToast("Erro ao salvar: " + error.message);
    return;
  }
  mostrarToast("Acesso adicionado.");
  await carregarAcessos();
  renderAcessos();
}

async function salvarEdicaoAcesso(id) {
  const form = document.querySelector(`[data-edit-acesso="${id}"]`);
  const servico = form.querySelector(".input-acesso-servico").value.trim();
  if (!servico) {
    mostrarToast("Diga qual é o serviço.");
    return;
  }
  const payload = {
    servico,
    login: form.querySelector(".input-acesso-login").value.trim() || null,
    senha: form.querySelector(".input-acesso-senha").value || null,
    observacao: form.querySelector(".input-acesso-obs").value.trim() || null,
  };
  const { error } = await window.supabaseClient.from("acessos").update(payload).eq("id", id);
  if (error) {
    mostrarToast("Erro ao salvar: " + error.message);
    return;
  }
  mostrarToast("Acesso atualizado.");
  await carregarAcessos();
  renderAcessos();
}

async function excluirAcesso(id) {
  if (!confirm("Excluir esse acesso?")) return;
  const { error } = await window.supabaseClient.from("acessos").delete().eq("id", id);
  if (error) {
    mostrarToast("Erro ao excluir: " + error.message);
    return;
  }
  await carregarAcessos();
  renderAcessos();
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
  renderPreviaSemana("previa-semana-atual", 0, "Prévia desta semana", "roxo", "Esta semana");
  renderPreviaSemana("previa-proxima-semana", 7, "Prévia da próxima semana", "azul", "Próxima semana");
  renderFormNovaTarefaDiaria();
  renderTarefasDiariasSecao();
}

// Prévia de uma semana (essa ou a seguinte): um bloco à parte, acima do
// pipeline, com um cartãozinho por dia (segunda a sexta) da semana EM
// RELAÇÃO AO CALENDÁRIO (segunda-feira de hoje + `offsetDias`) -- de
// propósito não usa o status "aguardando_validacao"/"validada" pra achar a
// semana, porque esses status podem ficar numa semana mais à frente (ex.:
// se uma semana "disponível" no meio do caminho nunca foi validada à mão);
// o que o Léo quer ver aqui é sempre a semana certa pelo calendário, não a
// próxima a ser validada.
// Fica verde quando a tarefa principal de mídia social daquele dia já está
// aprovada (validada/publicada) e vermelho enquanto não estiver -- inclusive
// quando ainda nem foi criada --, pra dar uma visão rápida de "essa semana
// já está pronta?". O prazo mostrado é sempre a quinta-feira daquela semana
// (segunda-feira + 3 dias).
function renderPreviaSemana(elId, offsetDias, titulo, tema, tagTexto) {
  const el = document.getElementById(elId);
  if (!el) return;

  const inicioDaSemana = addDias(toISODate(segundaFeiraDe(new Date())), offsetDias);
  const semana = estado.weeks.find((w) => w.semana_inicio === inicioDaSemana);
  if (!semana) {
    el.style.display = "none";
    el.innerHTML = "";
    return;
  }

  const prazo = addDias(semana.semana_inicio, 3);
  let totalAprovadas = 0;

  const cards = DIAS_SEMANA.map((dia) => {
    const dataDoDia = addDias(semana.semana_inicio, window.OFFSET_DIA_SEMANA[dia]);

    // Conta como "do dia" tanto quem está fisicamente naquela coluninha
    // (semana + bloco) quanto quem foi preenchido com essa data exata no
    // campo "Data de publicação/entrega" -- mesmo que, por engano, tenha
    // sido criada em outra semana/coluna do pipeline. Sem esse segundo
    // critério, uma tarefa cadastrada na coluna errada mas com a data
    // certa nunca apareceria aqui em cima.
    const itensDoDia = estado.demandas.filter(
      (d) => (d.week_id === semana.id && d.bloco === dia) || d.data_publicacao === dataDoDia
    );
    const principal = ordenarPorCategoria(itensDoDia).find((i) => categoriaDaTarefa(i) === "social");

    // "pronta" (card verde) = já existe a demanda criada pra esse dia --
    // mesmo que ainda falte aprovar. Só fica vermelho quando NÃO tem
    // nenhuma demanda de mídia social criada ainda pra esse dia. Dentro do
    // verde, "aprovada" (validada/publicada) ganha um ✓, e o resto (pendente,
    // em produção, aguardando validação...) ganha um ○ e mostra o status
    // real, pra deixar claro que a aprovação ainda está pendente.
    let pronta = false;
    let aprovada = false;
    let textoStatus = "Nenhuma tarefa de mídia social ainda";
    let tituloTarefa = "";
    if (principal) {
      pronta = true;
      aprovada = principal.status === "validada" || principal.status === "publicada";
      textoStatus = NOME_STATUS[principal.status] || principal.status;
      tituloTarefa = principal.titulo;
    }
    if (aprovada) totalAprovadas++;

    // Linha com tarefa: clicar abre ela no modal. Linha vazia: clicar já
    // abre o modal em modo de criação, com o dia/semana certos
    // pré-preenchidos -- cria (e pode já marcar como pronta) sem precisar
    // ir lá embaixo procurar a coluna do dia.
    return `
      <button type="button" class="previa-linha ${pronta ? "previa-ok" : "previa-pendente"} ${pronta && !aprovada ? "previa-aguardando-aprovacao" : ""}"
        data-previa-dia="${dia}" ${principal ? `data-previa-tarefa-id="${principal.id}"` : ""}
        title="${escapeHtml(textoStatus)}${principal ? "" : " — clique para criar a tarefa desse dia"}">
        <span class="previa-linha-dia">${NOME_DIA[dia].replace("-feira", "").slice(0, 3).toUpperCase()} ${formatarDataCurta(dataDoDia)}</span>
        <span class="previa-linha-titulo">${tituloTarefa ? escapeHtml(tituloTarefa) : "Sem tarefa ainda"}</span>
        <span class="previa-linha-icone">${aprovada ? "✓" : pronta ? "○" : "●"}</span>
      </button>
    `;
  }).join("");

  const pctAprovadas = Math.round((totalAprovadas / DIAS_SEMANA.length) * 100);

  el.style.display = "block";
  el.innerHTML = `
    <div class="previa-semana-card previa-tema-${tema || "roxo"}">
      <span class="previa-semana-tag">${escapeHtml(tagTexto || titulo)}</span>
      <div class="previa-semana-topo">
        <span class="previa-semana-icone">${SVG_RELOGIO}</span>
        <div class="previa-semana-info">
          <strong>${escapeHtml(titulo)}</strong>
          <span class="previa-semana-prazo">Prazo máximo: ${formatarDataLonga(prazo)}</span>
        </div>
      </div>
      <div class="previa-semana-stat">
        <span class="previa-semana-stat-numero">${totalAprovadas}/${DIAS_SEMANA.length}</span>
        <span class="previa-semana-stat-label">prontas e aprovadas</span>
      </div>
      <div class="previa-semana-barra-trilho"><div class="previa-semana-barra-fill" style="width:${pctAprovadas}%"></div></div>
      <div class="previa-semana-linhas">${cards}</div>
    </div>
  `;

  el.querySelectorAll("[data-previa-dia]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idTarefa = btn.dataset.previaTarefaId;
      if (idTarefa) {
        window.abrirModalTarefa(idTarefa, { aoMudar: recarregarGrid });
        return;
      }
      window.abrirModalTarefa(null, {
        aoMudar: recarregarGrid,
        novaTarefa: {
          client_id: estado.clientId,
          week_id: semana.id,
          bloco: btn.dataset.previaDia,
          data_publicacao: addDias(semana.semana_inicio, window.OFFSET_DIA_SEMANA[btn.dataset.previaDia]),
        },
      });
    });
  });
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

// Mantém sempre as demandas de mídia social (a demanda principal, de
// conteúdo) no topo de cada dia, antes das tarefas diárias -- assim dá
// pra enxergar de cara qual é o post do dia mesmo quando tem várias
// tarefas operacionais acumuladas abaixo. Ordenação estável: dentro de
// cada grupo (social / diária) a ordem original se mantém.
function ordenarPorCategoria(itens) {
  const peso = (item) => (categoriaDaTarefa(item) === "social" ? 0 : 1);
  return [...itens].sort((a, b) => peso(a) - peso(b));
}

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

  // A grade de cima fica só com a demanda de mídia social de cada dia
  // (o post em si); as tarefas diárias têm a tabela própria abaixo,
  // agrupada por mês (ver renderTarefasDiariasSecao), independente de
  // qual semana está selecionada aqui em cima.
  grid.innerHTML = DIAS_SEMANA.map((dia) =>
    renderBlockCard({
      bloco: dia,
      titulo: NOME_DIA[dia],
      weekId: semana.id,
      semana,
      itens: estado.demandas.filter((d) => d.week_id === semana.id && d.bloco === dia && categoriaDaTarefa(d) === "social"),
    })
  ).join("");

  ligarEventosDoGrid();
}

// Tarefas diárias: UMA tabela só (estilo Monday), agrupada por mês do
// calendário (não mais por dia da semana) -- cada linha guarda o
// responsável, a data exata e uma observação opcional, além do status.
// Continuam sendo demandas normais (categoria "diaria"), só que soltas
// da semana/bloco: usam a "Data" (data_publicacao) como referência de
// quando a tarefa cai, que é o mesmo campo que o Checklist de hoje do
// painel (dashboard.js) já lê via dataEfetivaDaTarefa -- então a tarefa
// aparece sozinha lá assim que a data chegar, sem nada extra pra fazer
// aqui.
function renderTarefasDiariasSecao() {
  const el = document.getElementById("tarefas-diarias-meses");
  if (!el) return;

  const semanaPorId = {};
  estado.weeks.forEach((w) => (semanaPorId[w.id] = w));

  const itens = estado.demandas
    .filter((d) => categoriaDaTarefa(d) === "diaria")
    .map((item) => {
      const semana = item.week_id ? semanaPorId[item.week_id] : null;
      return { item, dataEf: dataEfetivaDaTarefa(item, semana) };
    });

  const semData = itens.filter((x) => !x.dataEf);
  const comData = itens.filter((x) => x.dataEf);

  const porMes = {};
  comData.forEach((x) => {
    const mes = x.dataEf.slice(0, 7);
    (porMes[mes] = porMes[mes] || []).push(x);
  });
  Object.keys(porMes).forEach((mes) => {
    porMes[mes].sort((a, b) => (a.dataEf < b.dataEf ? -1 : a.dataEf > b.dataEf ? 1 : 0));
  });

  const mesAtual = toISODate(new Date()).slice(0, 7);
  const mesesOrdenados = Object.keys(porMes);
  if (!mesesOrdenados.includes(mesAtual)) mesesOrdenados.push(mesAtual);
  mesesOrdenados.sort();

  const gruposHTML = mesesOrdenados
    .map((mes) => {
      const linhasDoMes = porMes[mes] || [];
      const aberto = estado.mesesDiariosAbertos[mes] !== undefined ? estado.mesesDiariosAbertos[mes] : mes === mesAtual;
      const feitas = linhasDoMes.filter((x) => x.item.status === "publicada").length;
      return `
        <div class="mes-diario-grupo" data-mes="${mes}">
          <button type="button" class="mes-diario-cabecalho" data-acao="toggle-mes-diario" data-mes="${mes}">
            <span class="mes-diario-seta">${aberto ? "▾" : "▸"}</span>
            <span class="mes-diario-nome">${formatarMesAno(mes).toUpperCase()}</span>
            <span class="mes-diario-contagem">${feitas}/${linhasDoMes.length}</span>
          </button>
          <div class="mes-diario-corpo" ${aberto ? "" : 'style="display:none;"'}>
            ${linhasDoMes.length ? renderTabelaTarefasDiarias(linhasDoMes) : '<p class="checklist-vazio">Nenhuma tarefa nesse mês ainda.</p>'}
          </div>
        </div>
      `;
    })
    .join("");

  const semDataHTML = semData.length
    ? `
      <div class="mes-diario-grupo" data-mes="sem-data">
        <div class="mes-diario-cabecalho" style="cursor:default;">
          <span class="mes-diario-nome">SEM DATA DEFINIDA</span>
          <span class="mes-diario-contagem">${semData.filter((x) => x.item.status === "publicada").length}/${semData.length}</span>
        </div>
        <div class="mes-diario-corpo">${renderTabelaTarefasDiarias(semData)}</div>
      </div>
    `
    : "";

  el.innerHTML = semDataHTML + gruposHTML;

  el.querySelectorAll('[data-acao="toggle-mes-diario"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const mes = btn.dataset.mes;
      const estavaAberto = estado.mesesDiariosAbertos[mes] !== undefined ? estado.mesesDiariosAbertos[mes] : mes === mesAtual;
      estado.mesesDiariosAbertos[mes] = !estavaAberto;
      renderTarefasDiariasSecao();
    });
  });

  ligarEventosTabelaTarefasDiarias();
}

// Tabela de uma lista de linhas (de um mês, ou do grupo "sem data"):
// checkbox, tarefa, responsável, status (reaproveita os mesmos 7 status e
// cores de pill do pipeline principal), data e observação.
function renderTabelaTarefasDiarias(linhas) {
  const corpo = linhas
    .map(({ item, dataEf }) => {
      const concluida = item.status === "publicada";
      const colaborador = item.responsavel_id ? estado.colaboradores.find((c) => c.id === item.responsavel_id) : null;
      return `
        <div class="tabela-diaria-linha ${concluida ? "is-concluida" : ""}" data-id="${item.id}">
          <input type="checkbox" class="checklist-check" data-id="${item.id}" ${concluida ? "checked" : ""} />
          <span class="tabela-diaria-titulo" data-abrir-tarefa-diaria="${item.id}" title="Clique para abrir e editar essa tarefa">${escapeHtml(item.titulo)}</span>
          <span class="tabela-diaria-responsavel">${
            colaborador
              ? `<span class="demanda-chip demanda-chip-pessoa"><span class="demanda-chip-avatar">${escapeHtml(inicialAvatar(colaborador.nome))}</span>${escapeHtml(colaborador.nome)}</span>`
              : '<span class="tabela-diaria-vazio">—</span>'
          }</span>
          <span class="pill pill-${item.status}">${NOME_STATUS[item.status]}</span>
          <span class="tabela-diaria-data">${dataEf ? formatarDataCurta(dataEf) : "—"}</span>
          <span class="tabela-diaria-obs" title="${escapeHtml(item.descricao || "")}">${item.descricao ? escapeHtml(item.descricao) : '<span class="tabela-diaria-vazio">—</span>'}</span>
        </div>
      `;
    })
    .join("");

  return `
    <div class="tabela-diaria">
      <div class="tabela-diaria-linha tabela-diaria-cabecalho">
        <span></span>
        <span>Tarefa</span>
        <span>Responsável</span>
        <span>Status</span>
        <span>Data</span>
        <span>Observação</span>
      </div>
      ${corpo}
    </div>
  `;
}

function ligarEventosTabelaTarefasDiarias() {
  const el = document.getElementById("tarefas-diarias-meses");
  if (!el) return;

  // Marcar/desmarcar a caixinha muda o status direto (publicada = feita),
  // sem precisar abrir a tarefa inteira pra isso.
  el.querySelectorAll(".checklist-check").forEach((chk) => {
    chk.addEventListener("change", async () => {
      chk.disabled = true;
      await atualizarStatus(chk.dataset.id, chk.checked ? "publicada" : "pendente");
    });
  });

  // Clicar no título abre a tarefa inteira no modal -- é lá que dá pra
  // ver/editar responsável, data, observação e status com calma.
  el.querySelectorAll("[data-abrir-tarefa-diaria]").forEach((span) => {
    span.addEventListener("click", () => {
      window.abrirModalTarefa(span.dataset.abrirTarefaDiaria, { aoMudar: recarregarGrid });
    });
  });
}

// Formulário único de criar tarefa diária: título, responsável, data e
// observação -- monta só uma vez (o select de responsável depende da
// lista de colaboradores já carregada) e fica escondido até clicar em
// "+ Nova tarefa diária".
function renderFormNovaTarefaDiaria() {
  const form = document.getElementById("form-nova-tarefa-diaria");
  const btnNova = document.getElementById("btn-nova-tarefa-diaria");
  if (!form || !btnNova || form.dataset.montado) return;
  form.dataset.montado = "1";

  const hoje = toISODate(new Date());

  form.innerHTML = `
    <div class="grid-2">
      <div class="field">
        <label>Tarefa</label>
        <input type="text" class="input-titulo-diaria" placeholder="Nome da tarefa" />
      </div>
      <div class="field">
        <label>Responsável</label>
        <select class="input-responsavel">
          <option value="">Sem responsável definido</option>
          ${estado.colaboradores
            .map((c) => `<option value="${c.id}">${escapeHtml(c.nome)}${c.funcao ? ` (${escapeHtml(c.funcao)})` : ""}</option>`)
            .join("")}
          <option value="__novo__">+ Novo colaborador...</option>
        </select>
      </div>
    </div>
    <div class="grid-2">
      <div class="field">
        <label>Dia que vai ser a tarefa</label>
        <input type="date" class="input-data-diaria" value="${hoje}" />
      </div>
      <div class="field">
        <label>Observação (opcional)</label>
        <input type="text" class="input-obs-diaria" placeholder="Opcional" />
      </div>
    </div>
    <div class="add-form-recorrente-acoes">
      <button type="button" class="btn btn-primary" data-acao="salvar-tarefa-diaria">Adicionar</button>
      <button type="button" class="btn btn-ghost" data-acao="fechar-form-tarefa-diaria">Cancelar</button>
    </div>
  `;

  configurarSelectResponsavel(form.querySelector(".input-responsavel"));

  btnNova.addEventListener("click", () => form.classList.toggle("open"));
  form.querySelector('[data-acao="fechar-form-tarefa-diaria"]').addEventListener("click", () => {
    form.classList.remove("open");
  });

  form.querySelector('[data-acao="salvar-tarefa-diaria"]').addEventListener("click", async () => {
    const btn = form.querySelector('[data-acao="salvar-tarefa-diaria"]');
    if (btn.disabled) return;
    const titulo = form.querySelector(".input-titulo-diaria").value.trim();
    if (!titulo) {
      mostrarToast("Dê um nome para a tarefa.");
      return;
    }
    const responsavelId = form.querySelector(".input-responsavel").value || null;
    const data = form.querySelector(".input-data-diaria").value || null;
    const observacao = form.querySelector(".input-obs-diaria").value.trim() || null;

    btn.disabled = true;
    try {
      const { error } = await window.supabaseClient.from("demandas").insert({
        client_id: estado.clientId,
        titulo,
        responsavel_id: responsavelId,
        data_publicacao: data,
        descricao: observacao,
        categoria: "diaria",
        tipo_publicacao: "manual",
        status: "pendente",
      });
      if (error) {
        mostrarToast("Erro ao salvar: " + error.message);
        return;
      }
      form.querySelector(".input-titulo-diaria").value = "";
      form.querySelector(".input-obs-diaria").value = "";
      form.querySelector(".input-data-diaria").value = hoje;
      form.classList.remove("open");
      mostrarToast("Tarefa adicionada. Ela já entra sozinha no Checklist de hoje do painel quando chegar a data.");
      await carregarSemanasEDemandas();
      renderWeekTabs();
    } finally {
      btn.disabled = false;
    }
  });
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
  Object.keys(porDia).forEach((dia) => {
    porDia[dia].sort((a, b) => (categoriaDaTarefa(a.item) === "social" ? 0 : 1) - (categoriaDaTarefa(b.item) === "social" ? 0 : 1));
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
      <label>Link do modelo de referência</label>
      <input type="url" class="input-link-referencia" placeholder="https://..." value="${escapeHtml(item.link_referencia || "")}" />
      <p class="field-hint">O modelo/referência a seguir pra produzir essa publicação.</p>
    </div>
    <div class="field">
      <label>Link (arte pronta no CRM)</label>
      <input type="url" class="input-link" placeholder="https://..." value="${escapeHtml(item.link || "")}" />
    </div>
    ${
      isPacote
        ? `<div class="field"><label>Prazo do pacote</label><input type="date" class="input-prazo" value="${item.prazo_pacote || ""}" /></div>`
        : `<div class="grid-2">
            <div class="field"><label>Data de publicação/entrega</label><input type="date" class="input-data" value="${item.data_publicacao || ""}" /></div>
            <div class="field"><label>Hora</label><input type="time" class="input-hora" value="${horaVal}" /></div>
          </div>
          <div class="field">
            <label>Prazo para ficar pronta</label>
            <input type="date" class="input-prazo-producao" value="${item.prazo_producao || ""}" />
            <p class="field-hint">Só preenche se precisar produzir ANTES do dia de publicação/entrega -- aí a tarefa aparece no Checklist de hoje nesse prazo, mesmo publicando depois.</p>
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

// Card encolhido: mostra só o essencial pra reconhecer a tarefa de relance
// (status, título, selos) + um resuminho de uma linha só. O resto -- editar
// qualquer campo, trocar responsável, excluir, duplicar -- fica dentro do
// card-modal que abre ao clicar (ver js/modalTarefa.js), pra não lotar a
// coluna do dia com formulário aberto em cada tarefa. "Aprovar" continua
// visível aqui fora porque é a ação mais repetida no dia a dia.
function renderDemandaItem(item, isPacote, semana) {
  const corCliente = corClienteParaCSS(estado.cliente ? estado.cliente.cor : null);
  const dataEfetiva = dataEfetivaDaTarefa(item, semana);
  const atrasada = tarefaAtrasada(item, dataEfetiva);
  const categoria = categoriaDaTarefa(item);
  const podeAprovar = categoria === "social" && item.status !== "validada" && item.status !== "publicada";
  // Anel circular (ver paleta.js) mostrando o quão avançada a tarefa está,
  // só pelo status -- dá pra bater o olho e saber se é só uma ideia anotada
  // (0%) ou se já tá quase pronta (perto de 100%), sem abrir o card.
  const progresso = progressoDaTarefa(item.status);

  const colaborador = item.responsavel_id ? estado.colaboradores.find((c) => c.id === item.responsavel_id) : null;

  // Cada informação vira um chip próprio (em vez de tudo numa linha de
  // texto só) -- fica mais fácil de escanear, e o responsável ganha um
  // avatarzinho com as iniciais em vez de só o nome corrido.
  const chips = [];
  if (colaborador) {
    chips.push(
      `<span class="demanda-chip demanda-chip-pessoa"><span class="demanda-chip-avatar">${escapeHtml(inicialAvatar(colaborador.nome))}</span>${escapeHtml(colaborador.nome)}</span>`
    );
  }
  if (item.tipo_publicacao === "manual") chips.push(`<span class="demanda-chip">Manual</span>`);
  if (item.data_publicacao) chips.push(`<span class="demanda-chip">${formatarDataCurta(item.data_publicacao)}</span>`);
  if (item.prazo_pacote) chips.push(`<span class="demanda-chip">Prazo: ${formatarDataCurta(item.prazo_pacote)}</span>`);

  return `
    <div class="demanda-item categoria-${categoria} ${atrasada ? "is-atrasada" : ""}" data-id="${item.id}" style="--client-color:${corCliente}">
      <div class="demanda-abrir" data-abrir-tarefa="${item.id}" role="button" tabindex="0" title="Clique para abrir e editar essa tarefa">
        <div class="demanda-card-topo">
          <span class="demanda-anel" title="Andamento: ${progresso.pct}%">${anelProgressoHTML(progresso.pct, progresso.cor, 38)}</span>
          <div class="demanda-card-info">
            <div class="demanda-card-titulo-linha">
              <span class="demanda-card-titulo">${escapeHtml(item.titulo)}</span>
              ${atrasada ? '<span class="badge-atrasada">Atrasada</span>' : ""}
            </div>
            <div class="demanda-card-badges">
              <span class="pill pill-${item.status}">${NOME_STATUS[item.status]}</span>
              ${categoria === "diaria" ? '<span class="badge-categoria">Diária</span>' : ""}
              ${item.recorrente_id ? '<span class="badge-recorrente">Recorrente</span>' : ""}
              ${badgeHorarioHTML(item, dataEfetiva, atrasada)}
            </div>
          </div>
        </div>
        ${item.descricao ? `<div class="demanda-meta demanda-meta-resumo">${escapeHtml(item.descricao)}</div>` : ""}
        ${chips.length ? `<div class="demanda-card-chips">${chips.join("")}</div>` : ""}
      </div>
      ${podeAprovar ? `<button class="btn btn-aprovar btn-aprovar-encolhido" data-acao="aprovar-tarefa" data-id="${item.id}">Aprovar</button>` : ""}
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
    // Desliga o botão enquanto salva -- sem isso, um segundo clique (ex.:
    // internet lenta, clique duplo sem querer) dispara duas inserções e
    // cria uma tarefa (ou até uma recorrência inteira) duplicada.
    btn.addEventListener("click", async () => {
      if (btn.disabled) return;
      btn.disabled = true;
      try {
        await salvarTarefa(btn.dataset.bloco, btn.dataset.weekId || null);
      } finally {
        btn.disabled = false;
      }
    });
  });

  grid.querySelectorAll(".input-responsavel").forEach(configurarSelectResponsavel);

  // Card encolhido: clicar nele (ou dar Enter/Espaço com o teclado) abre a
  // tarefa inteira no modal -- é lá que vivem editar, trocar responsável,
  // duplicar e excluir agora.
  grid.querySelectorAll("[data-abrir-tarefa]").forEach((el) => {
    const abrir = () => window.abrirModalTarefa(el.dataset.abrirTarefa, { aoMudar: recarregarGrid });
    el.addEventListener("click", abrir);
    el.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        abrir();
      }
    });
  });

  // Aprova o conteúdo na hora, mesmo antes da data prevista -- não precisa
  // esperar a validação da semana inteira (toda sexta) pra liberar um post
  // que já ficou pronto antes. Fica fora do card-modal de propósito: é a
  // ação mais repetida no dia a dia, não compensa abrir o card só pra isso.
  grid.querySelectorAll('[data-acao="aprovar-tarefa"]').forEach((btn) => {
    btn.addEventListener("click", () => atualizarStatus(btn.dataset.id, "validada"));
  });
}

// Recarrega os dados e redesenha a tela depois de qualquer alteração feita
// dentro do modal de tarefa (editar, trocar status, duplicar, excluir).
async function recarregarGrid() {
  await carregarSemanasEDemandas();
  renderWeekTabs();
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
  const linkReferencia = form.querySelector(".input-link-referencia").value.trim() || null;
  const inputCategoria = form.querySelector(".input-categoria");
  const categoria = inputCategoria ? inputCategoria.value : "social";

  const inputData = form.querySelector(".input-data");
  const inputHora = form.querySelector(".input-hora");
  const inputPrazo = form.querySelector(".input-prazo");
  const inputPrazoProducao = form.querySelector(".input-prazo-producao");
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
      link_referencia: linkReferencia,
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
    link_referencia: linkReferencia,
    categoria,
    status: "pendente",
    recorrente_id: recorrenteId,
  };
  if (inputData) payload.data_publicacao = inputData.value || null;
  if (inputHora) payload.hora_publicacao = horaPublicacao;
  if (inputPrazo) payload.prazo_pacote = inputPrazo.value || null;
  // Não entra no modelo da recorrência (lá em cima) de propósito: é o
  // prazo de produção DESSA ocorrência específica, não um valor fixo que
  // faria sentido repetir em toda semana futura gerada a partir dele.
  if (inputPrazoProducao) payload.prazo_producao = inputPrazoProducao.value || null;

  const { error } = await window.supabaseClient.from("demandas").insert(payload);
  if (error) {
    mostrarToast("Erro ao salvar: " + error.message);
    return;
  }

  mostrarToast(querRecorrente ? "Tarefa recorrente criada. Ela já entra sozinha nas próximas semanas." : "Tarefa adicionada.");
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

async function init() {
  if (!montarTopbarAcoes("user-tag")) return;
  await carregarTudo();

  // Atualiza os selos de horário sozinho (sem precisar recarregar a
  // página), pra a contagem "faltam Xmin" andar e o alerta amarelo/
  // vermelho aparecer na hora certa. Pula a rodada se tiver algum
  // formulário aberto, pra não atrapalhar quem está digitando.
  setInterval(() => {
    if (document.querySelector("#block-grid .add-form.open")) return;
    if (document.querySelector("#form-nova-tarefa-diaria.open")) return;
    renderBlocks();
  }, 30000);
}

init();
