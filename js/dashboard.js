// Lógica do painel principal: um card grande por cliente, com progresso
// da semana ativa e alguns indicadores rápidos ao lado.

const DIAS_SEMANA = ["segunda", "terca", "quarta", "quinta", "sexta"];
const NOME_DIA = {
  segunda: "Segunda-feira",
  terca: "Terça-feira",
  quarta: "Quarta-feira",
  quinta: "Quinta-feira",
  sexta: "Sexta-feira",
  datas_comemorativas: "Datas comemorativas",
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

function diaDeHojeChave() {
  const mapa = { 1: "segunda", 2: "terca", 3: "quarta", 4: "quinta", 5: "sexta" };
  return mapa[new Date().getDay()] || null;
}

function segundaFeiraDe(date) {
  const d = new Date(date);
  const dia = d.getDay(); // 0 = domingo
  const diff = (dia === 0 ? -6 : 1) - dia;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toISODate(date) {
  return date.toISOString().slice(0, 10);
}

function hojeISO() {
  return toISODate(new Date());
}

function addDias(isoDate, dias) {
  const d = new Date(isoDate + "T00:00:00");
  d.setDate(d.getDate() + dias);
  return toISODate(d);
}

function capitalizarPrimeira(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function saudacaoPorHorario() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

function renderSaudacaoEData() {
  const hoje = new Date();
  document.getElementById("saudacao").textContent = saudacaoPorHorario();
  document.getElementById("data-hoje").textContent = capitalizarPrimeira(
    new Intl.DateTimeFormat("pt-BR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(hoje)
  );
}

function renderCalendario() {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth();
  const hojeDia = hoje.getDate();

  document.getElementById("calendar-mes").textContent = capitalizarPrimeira(
    new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(hoje)
  );

  const primeiroDiaSemana = new Date(ano, mes, 1).getDay(); // 0 = domingo
  const diasNoMes = new Date(ano, mes + 1, 0).getDate();
  const nomesDow = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  let html = nomesDow.map((d) => `<div class="cal-dow">${d}</div>`).join("");
  for (let i = 0; i < primeiroDiaSemana; i++) html += `<div class="cal-day is-muted"></div>`;
  for (let dia = 1; dia <= diasNoMes; dia++) {
    html += `<div class="cal-day ${dia === hojeDia ? "is-today" : ""}">${dia}</div>`;
  }

  document.getElementById("calendar-grid").innerHTML = html;
}

async function carregarDados() {
  const [
    { data: clients, error: errClients },
    { data: weeks, error: errWeeks },
    { data: demandas, error: errDemandas },
    { data: colaboradores, error: errColaboradores },
  ] = await Promise.all([
    window.supabaseClient.from("clients").select("*").eq("ativo", true).order("nome"),
    window.supabaseClient.from("weeks").select("*"),
    window.supabaseClient.from("demandas").select("*"),
    window.supabaseClient.from("colaboradores").select("*").eq("ativo", true),
  ]);

  if (errClients || errWeeks || errDemandas || errColaboradores) {
    console.error(errClients || errWeeks || errDemandas || errColaboradores);
    document.getElementById("client-grid").innerHTML =
      '<div class="empty-state">Não foi possível carregar os dados. Confira js/config.js e o schema do Supabase.</div>';
    return;
  }

  const colaboradoresPorId = {};
  (colaboradores || []).forEach((c) => (colaboradoresPorId[c.id] = c.nome));

  renderClientes(clients || [], weeks || [], demandas || [], colaboradoresPorId);
}

function renderClientes(clients, weeks, demandas, colaboradoresPorId) {
  const grid = document.getElementById("client-grid");

  if (clients.length === 0) {
    grid.innerHTML = '<div class="empty-state">Nenhum cliente cadastrado ainda. Use o botão "+ Novo cliente" abaixo.</div>';
    renderChecklistHoje([], null, colaboradoresPorId || {});
    return;
  }

  const inicioSemanaAtual = toISODate(segundaFeiraDe(new Date()));
  const hoje = hojeISO();
  const diaHoje = diaDeHojeChave();
  const checklistHoje = [];

  grid.innerHTML = clients
    .map((cliente) => {
      const semanasCliente = weeks.filter((w) => w.client_id === cliente.id);
      const demandasCliente = demandas.filter((d) => d.client_id === cliente.id);

      // semana atual já validada (vira o dia a dia do cliente)
      const semanaAtiva = semanasCliente
        .filter((w) => w.status === "validada" && w.semana_inicio <= inicioSemanaAtual)
        .sort((a, b) => (a.semana_inicio < b.semana_inicio ? 1 : -1))[0];

      // semana aguardando validação (a que será apresentada na próxima sexta)
      const semanaAguardando = semanasCliente
        .filter((w) => w.status === "aguardando_validacao")
        .sort((a, b) => (a.semana_inicio < b.semana_inicio ? -1 : 1))[0];

      const semanaDisponivel = semanasCliente
        .filter((w) => w.status === "disponivel")
        .sort((a, b) => (a.semana_inicio < b.semana_inicio ? -1 : 1))[0];

      // o card sempre mostra o progresso da semana atual validada; quando ainda não
      // existe uma semana validada (cliente novo, ou ainda não passou a sexta),
      // cai para a próxima semana disponível e avisa que são tarefas da semana que vem
      let semanaMostrada = semanaAtiva;
      let semanaEhProxima = false;
      if (!semanaMostrada) {
        semanaMostrada = semanaAguardando || semanaDisponivel;
        semanaEhProxima = !!semanaMostrada;
      }

      const demandasSemanaAtiva = semanaAtiva
        ? demandasCliente.filter((d) => d.week_id === semanaAtiva.id)
        : [];
      const demandasSemanaMostrada = semanaMostrada
        ? demandasCliente.filter((d) => d.week_id === semanaMostrada.id)
        : [];

      const total = demandasSemanaMostrada.length;
      const publicadas = demandasSemanaMostrada.filter((d) => d.status === "publicada").length;
      const pct = total > 0 ? Math.round((publicadas / total) * 100) : 0;

      const pendentesValidacao = demandasCliente.filter((d) => d.status === "aguardando_validacao").length;
      const manualHoje = demandasCliente.filter(
        (d) => d.tipo_publicacao === "manual" && d.status === "manual_pendente" && d.data_publicacao === hoje
      ).length;

      // monta o checklist do dia: tarefas do bloco de hoje na semana ativa,
      // mais qualquer publicação manual pendente datada para hoje (ainda que fora do bloco)
      const idsJaIncluidos = new Set();
      if (diaHoje && semanaAtiva) {
        demandasSemanaAtiva
          .filter((d) => d.bloco === diaHoje && d.status !== "publicada")
          .forEach((d) => {
            idsJaIncluidos.add(d.id);
            checklistHoje.push({ cliente, item: d });
          });
      }
      demandasCliente
        .filter((d) => d.data_publicacao === hoje && d.status !== "publicada" && !idsJaIncluidos.has(d.id))
        .forEach((d) => checklistHoje.push({ cliente, item: d }));

      let nextStep = "Sem semana criada ainda";
      if (semanaAguardando) {
        nextStep = `Validar semana de ${formatarDataCurta(semanaAguardando.semana_inicio)}`;
      } else if (total > 0 && pct === 100) {
        nextStep = "Semana concluída";
      } else if (semanaMostrada) {
        nextStep = "Em andamento";
      }

      const weekLabel = semanaMostrada
        ? `Semana de ${formatarDataCurta(semanaMostrada.semana_inicio)} a ${formatarDataCurta(addDias(semanaMostrada.semana_inicio, 4))}${
            semanaEhProxima ? '<span class="tag-proxima">semana que vem</span>' : ""
          }`
        : "Nenhuma semana criada ainda";

      return `
        <a class="client-card" href="cliente.html?id=${cliente.id}" style="--client-color:${cliente.cor}">
          <div class="client-card-main">
            <div>
              <p class="client-name">${escapeHtml(cliente.nome)}</p>
              <p class="client-sub">${total > 0 ? `${publicadas} de ${total} publicadas` : "Nenhuma tarefa nessa semana"}</p>
              <p class="week-label">${weekLabel}</p>
            </div>
            <span class="next-step">${nextStep}</span>
          </div>
          <div class="client-card-side">
            <div class="meter-block">
              <div class="meter-label">
                <span>Progresso da semana</span>
                <span class="meter-value">${pct}%</span>
              </div>
              <div class="meter-track">
                <div class="meter-fill ${pct === 100 && total > 0 ? "is-complete" : ""}" style="width:${pct}%"></div>
              </div>
            </div>
            <div class="stat-row">
              <div class="stat-tile ${pendentesValidacao > 0 ? "has-warning" : ""}">
                <div class="stat-value">${pendentesValidacao}</div>
                <div class="stat-label">Aguardando validação</div>
              </div>
              <div class="stat-tile ${manualHoje > 0 ? "has-warning" : ""}">
                <div class="stat-value">${manualHoje}</div>
                <div class="stat-label">Manual hoje</div>
              </div>
            </div>
          </div>
        </a>
      `;
    })
    .join("");

  renderChecklistHoje(checklistHoje, diaHoje, colaboradoresPorId);
}

function renderChecklistHoje(lista, diaHoje, colaboradoresPorId) {
  const el = document.getElementById("today-checklist");

  if (!diaHoje) {
    el.innerHTML = '<div class="empty-state">Hoje não tem bloco diário (fim de semana). Só aparecem aqui publicações manuais datadas para hoje, se houver.</div>';
    if (lista.length === 0) return;
  }

  if (lista.length === 0) {
    el.innerHTML = '<div class="empty-state">Nenhuma tarefa pendente para hoje.</div>';
    return;
  }

  el.innerHTML =
    '<div class="today-wrap">' +
    lista
      .map(({ cliente, item }) => `
        <div class="demanda-item">
          <div class="demanda-title">
            <span class="pill pill-${item.status}">${NOME_STATUS[item.status]}</span>
            <span class="client-tag"><span class="tab-status-dot" style="background:${cliente.cor};"></span>${escapeHtml(cliente.nome)}</span>
            ${escapeHtml(item.titulo)}
          </div>
          ${item.descricao ? `<div class="demanda-meta" style="color:var(--text-secondary);">${escapeHtml(item.descricao)}</div>` : ""}
          <div class="demanda-controls">
            ${item.hora_publicacao ? `<span class="demanda-meta">${item.hora_publicacao.slice(0, 5)}</span>` : ""}
            ${item.tipo_publicacao === "manual" ? '<span class="demanda-meta">Manual</span>' : ""}
            ${item.responsavel_id && colaboradoresPorId[item.responsavel_id] ? `<span class="demanda-meta">${escapeHtml(colaboradoresPorId[item.responsavel_id])}</span>` : ""}
            <button class="btn btn-primary" data-marcar-feito="${item.id}" style="margin-left:auto;">Marcar como feito</button>
            <a class="btn btn-ghost" href="cliente.html?id=${cliente.id}">Abrir</a>
          </div>
        </div>
      `)
      .join("") +
    "</div>";

  el.querySelectorAll("[data-marcar-feito]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      const { error } = await window.supabaseClient
        .from("demandas")
        .update({ status: "publicada" })
        .eq("id", btn.dataset.marcarFeito);
      if (error) {
        alert("Erro ao marcar como feito: " + error.message);
        btn.disabled = false;
        return;
      }
      await carregarDados();
    });
  });
}

function formatarDataCurta(isoDate) {
  const [ano, mes, dia] = isoDate.split("-");
  return `${dia}/${mes}`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

async function init() {
  if (!montarTopbarAcoes("user-tag")) return;
  renderSaudacaoEData();
  renderCalendario();
  await carregarDados();
}

document.getElementById("btn-toggle-add").addEventListener("click", () => {
  document.getElementById("form-add-client").classList.toggle("open");
});

document.getElementById("btn-salvar-cliente").addEventListener("click", async () => {
  const nome = document.getElementById("novo-nome").value.trim();
  const cor = document.getElementById("novo-cor").value;
  const msg = document.getElementById("msg-add-client");

  if (!nome) {
    msg.textContent = "Dê um nome para o cliente.";
    msg.className = "form-msg error";
    return;
  }

  const { error } = await window.supabaseClient.from("clients").insert({ nome, cor, ativo: true });
  if (error) {
    msg.textContent = "Erro ao salvar: " + error.message;
    msg.className = "form-msg error";
    return;
  }

  msg.textContent = "Cliente adicionado.";
  msg.className = "form-msg ok";
  document.getElementById("novo-nome").value = "";
  document.getElementById("form-add-client").classList.remove("open");
  await carregarDados();
});

init();
