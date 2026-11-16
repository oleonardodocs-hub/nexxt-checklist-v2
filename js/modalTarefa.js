// Modal de "abrir tarefa": card em pop-up pra ver e editar uma demanda
// específica sem precisar navegar pro pipeline inteiro do cliente. Usado
// a partir do "Abrir" no Checklist de hoje do painel (e pode ser chamado
// de qualquer página que carregue esse arquivo).
//
// Função pública: window.abrirModalTarefa(demandaId, { aoMudar: fn })
// "aoMudar" é chamado depois de qualquer alteração salva (edição, status,
// exclusão), pra quem abriu o modal atualizar a própria tela.

(function () {
  const NOME_DIA_MODAL = {
    segunda: "Segunda-feira",
    terca: "Terça-feira",
    quarta: "Quarta-feira",
    quinta: "Quinta-feira",
    sexta: "Sexta-feira",
    datas_comemorativas: "Datas comemorativas",
  };
  const NOME_STATUS_MODAL = {
    pendente: "Pendente",
    em_producao: "Em produção",
    aguardando_validacao: "Aguardando validação",
    validada: "Validada",
    agendada: "Agendada",
    manual_pendente: "Publicação manual pendente",
    publicada: "Publicada",
  };
  function escaparHtml(str) {
    const div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
  }

  function categoriaDaTarefaModal(item) {
    return item && item.categoria === "diaria" ? "diaria" : "social";
  }

  // Pequenas versões próprias (sem depender de cliente.js, já que esse
  // arquivo também roda sozinho no dashboard) das mesmas contas de data
  // usadas pra duplicar uma tarefa pra próxima semana.
  function toISODateModal(date) {
    const ano = date.getFullYear();
    const mes = String(date.getMonth() + 1).padStart(2, "0");
    const dia = String(date.getDate()).padStart(2, "0");
    return `${ano}-${mes}-${dia}`;
  }
  function addDiasModal(isoDate, dias) {
    const d = new Date(isoDate + "T00:00:00");
    d.setDate(d.getDate() + dias);
    return toISODateModal(d);
  }
  function diasEntreModal(dataA, dataB) {
    return Math.round((new Date(dataB + "T00:00:00") - new Date(dataA + "T00:00:00")) / 86400000);
  }

  let aoMudarAtual = null;

  function elOverlay() {
    let overlay = document.getElementById("modal-tarefa-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "modal-tarefa-overlay";
      overlay.className = "modal-overlay";
      overlay.style.display = "none";
      document.body.appendChild(overlay);
      overlay.addEventListener("click", (ev) => {
        if (ev.target === overlay) fecharModalTarefa();
      });
      document.addEventListener("keydown", (ev) => {
        if (ev.key === "Escape" && overlay.style.display !== "none") fecharModalTarefa();
      });
    }
    return overlay;
  }

  function fecharModalTarefa() {
    const overlay = document.getElementById("modal-tarefa-overlay");
    if (overlay) overlay.style.display = "none";
  }
  window.fecharModalTarefa = fecharModalTarefa;

  async function abrirModalTarefa(demandaId, opcoes) {
    opcoes = opcoes || {};
    aoMudarAtual = opcoes.aoMudar || null;

    const overlay = elOverlay();
    overlay.innerHTML = '<div class="modal-card"><div class="empty-state">Carregando...</div></div>';
    overlay.style.display = "flex";

    // Modo "criar": não existe demanda ainda (ex.: clicou num card vazio da
    // prévia da próxima semana) -- abre o mesmo card, já pré-preenchido com
    // o dia/semana/cliente certos, mas pra criar em vez de editar.
    if (!demandaId && opcoes.novaTarefa) {
      const { data: colaboradores } = await window.supabaseClient.from("colaboradores").select("*").order("nome");
      let cliente = null;
      if (opcoes.novaTarefa.client_id) {
        const { data } = await window.supabaseClient.from("clients").select("*").eq("id", opcoes.novaTarefa.client_id).single();
        cliente = data || null;
      }
      const rascunho = {
        client_id: opcoes.novaTarefa.client_id,
        week_id: opcoes.novaTarefa.week_id,
        bloco: opcoes.novaTarefa.bloco,
        data_publicacao: opcoes.novaTarefa.data_publicacao || null,
        titulo: "",
        descricao: "",
        categoria: "social",
        tipo_publicacao: "agendada",
        status: "pendente",
        responsavel_id: null,
        link: null,
        link_referencia: null,
        hora_publicacao: null,
        prazo_producao: null,
      };
      renderizarModalTarefa(rascunho, colaboradores || [], cliente, true);
      return;
    }

    const [{ data: tarefa, error: errTarefa }, { data: colaboradores }] = await Promise.all([
      window.supabaseClient.from("demandas").select("*").eq("id", demandaId).single(),
      window.supabaseClient.from("colaboradores").select("*").order("nome"),
    ]);

    if (errTarefa || !tarefa) {
      overlay.innerHTML = `<div class="modal-card">${htmlErroDeCarregamento((errTarefa && errTarefa.message) || "Tarefa não encontrada.")}</div>`;
      ligarBotaoCorrigirToken();
      return;
    }

    let cliente = null;
    if (tarefa.client_id) {
      const { data } = await window.supabaseClient.from("clients").select("*").eq("id", tarefa.client_id).single();
      cliente = data || null;
    }

    renderizarModalTarefa(tarefa, colaboradores || [], cliente, false);
  }
  window.abrirModalTarefa = abrirModalTarefa;

  function renderizarModalTarefa(tarefa, colaboradores, cliente, isNovo) {
    const overlay = elOverlay();
    const isPacote = tarefa.bloco === "datas_comemorativas";
    const categoria = categoriaDaTarefaModal(tarefa);
    const horaVal = tarefa.hora_publicacao ? tarefa.hora_publicacao.slice(0, 5) : "";
    const tipo = tarefa.tipo_publicacao || "agendada";

    const corCliente = cliente ? corClienteParaCSS(cliente.cor) : null;

    overlay.innerHTML = `
      <div class="modal-card" style="${corCliente ? `--client-color:${corCliente}` : ""}">
        <div class="modal-card-head">
          <div>
            ${cliente ? `<span class="client-tag"><span class="tab-status-dot"></span>${escaparHtml(cliente.nome)}</span>` : ""}
            <h3 style="margin:8px 0 0;">${tarefa.titulo ? escaparHtml(tarefa.titulo) : "Nova tarefa"}</h3>
            <div class="modal-card-head-tags">
              <span class="pill" id="pill-status-modal">${NOME_STATUS_MODAL[tarefa.status] || tarefa.status}</span>
              ${categoria === "diaria" ? '<span class="pill">Tarefa diária</span>' : ""}
              ${tarefa.recorrente_id ? '<span class="pill">Recorrente</span>' : ""}
            </div>
          </div>
          <button type="button" class="modal-close-btn" id="btn-fechar-modal-tarefa" aria-label="Fechar" title="Fechar">✕</button>
        </div>

        <div class="modal-card-body">
          ${
            tarefa.recorrente_id
              ? `<div class="aviso-recorrente">
                  <span>Essa tarefa se repete toda ${NOME_DIA_MODAL[tarefa.bloco] || ""}.</span>
                  <button type="button" class="btn btn-ghost" id="btn-parar-recorrencia-modal" data-recorrente-id="${tarefa.recorrente_id}">Parar de repetir</button>
                </div>`
              : ""
          }

          <div class="field">
            <label>Status</label>
            <select class="input-status-modal">
              ${Object.entries(NOME_STATUS_MODAL)
                .map(([valor, nome]) => `<option value="${valor}" ${valor === tarefa.status ? "selected" : ""}>${nome}</option>`)
                .join("")}
            </select>
          </div>

          <div class="field">
            <label>Tarefa</label>
            <input type="text" class="input-titulo-modal" value="${escaparHtml(tarefa.titulo || "")}" />
          </div>
          <div class="field">
            <label>Descrição (o que é e como deve ser feito)</label>
            <textarea class="input-descricao-modal" rows="3" placeholder="Opcional">${escaparHtml(tarefa.descricao || "")}</textarea>
          </div>
          ${
            !isPacote && isNovo
              ? `<p class="field-hint">Essa tarefa nasce como mídia social (é só por aqui, pelos cards de cima, que dá pra criar uma -- tarefas diárias continuam sendo criadas lá embaixo, na seção de tarefas diárias).</p>`
              : ""
          }
          ${
            !isPacote && isNovo && tarefa.bloco
              ? `<div class="field">
                  <label class="checkbox-label"><input type="checkbox" class="input-recorrente-modal" /> Repetir toda ${NOME_DIA_MODAL[tarefa.bloco] || tarefa.bloco} (entra sozinha nas próximas semanas)</label>
                </div>`
              : ""
          }
          ${
            !isPacote && !isNovo
              ? `<div class="field">
                  <label>Tipo de demanda</label>
                  <select class="input-categoria-modal">
                    <option value="social" ${categoria === "social" ? "selected" : ""}>Mídia social</option>
                    <option value="diaria" ${categoria === "diaria" ? "selected" : ""}>Tarefa diária</option>
                  </select>
                  <p class="field-hint">Mídia social entra no progresso da semana. Tarefa diária entra só no progresso do dia.</p>
                </div>`
              : ""
          }
          <div class="grid-2">
            <div class="field">
              <label>Tipo de publicação</label>
              <select class="input-tipo-modal">
                <option value="agendada" ${tipo === "agendada" ? "selected" : ""}>Agendada</option>
                <option value="manual" ${tipo === "manual" ? "selected" : ""}>Manual (subir na hora)</option>
              </select>
            </div>
            ${
              categoria === "social"
                ? `<div class="field">
                    <label>Rede social</label>
                    ${redesSociaisCheckboxesHTML(tarefa, "input-rede-social-modal")}
                    <p class="field-hint">Pode marcar mais de uma, se a mesma publicação for pra vários lugares.</p>
                  </div>`
                : `<div class="field">
                    <label>Responsável</label>
                    <select class="input-responsavel-modal">
                      <option value="">Sem responsável definido</option>
                      ${colaboradores
                        .map((c) => `<option value="${c.id}" ${c.id === tarefa.responsavel_id ? "selected" : ""}>${escaparHtml(c.nome)}${c.funcao ? ` (${escaparHtml(c.funcao)})` : ""}</option>`)
                        .join("")}
                    </select>
                  </div>`
            }
          </div>
          ${
            categoria === "social"
              ? `<div class="field">
                  <label>Responsável</label>
                  <select class="input-responsavel-modal">
                    <option value="">Sem responsável definido</option>
                    ${colaboradores
                      .map((c) => `<option value="${c.id}" ${c.id === tarefa.responsavel_id ? "selected" : ""}>${escaparHtml(c.nome)}${c.funcao ? ` (${escaparHtml(c.funcao)})` : ""}</option>`)
                      .join("")}
                  </select>
                </div>`
              : ""
          }
          <div class="field">
            <label>Link do modelo de referência</label>
            <input type="url" class="input-link-referencia-modal" placeholder="https://..." value="${escaparHtml(tarefa.link_referencia || "")}" />
            <p class="field-hint">O modelo/referência a seguir pra produzir essa publicação.</p>
          </div>
          <div class="field">
            <label>Link (arte pronta no CRM)</label>
            <input type="url" class="input-link-modal" placeholder="https://..." value="${escaparHtml(tarefa.link || "")}" />
          </div>
          ${
            isPacote
              ? `<div class="field"><label>Prazo do pacote</label><input type="date" class="input-prazo-modal" value="${tarefa.prazo_pacote || ""}" /></div>`
              : `<div class="grid-2">
                  <div class="field"><label>Data de publicação/entrega</label><input type="date" class="input-data-modal" value="${tarefa.data_publicacao || ""}" /></div>
                  <div class="field"><label>Hora</label><input type="time" class="input-hora-modal" value="${horaVal}" /></div>
                </div>
                <div class="field">
                  <label>Prazo para ficar pronta</label>
                  <input type="date" class="input-prazo-producao-modal" value="${tarefa.prazo_producao || ""}" />
                  <p class="field-hint">Só preenche se precisar produzir ANTES do dia de publicação/entrega -- aí a tarefa aparece no Checklist de hoje nesse prazo, mesmo publicando depois.</p>
                </div>`
          }

          <p class="form-msg" id="msg-modal-tarefa"></p>
        </div>

        <div class="modal-card-footer">
          ${!isNovo ? `<button type="button" class="btn btn-perigo-ghost" id="btn-excluir-modal-tarefa">Excluir tarefa</button>` : ""}
          ${
            !isNovo && !isPacote && tarefa.week_id
              ? `<button type="button" class="btn btn-ghost" id="btn-duplicar-modal-tarefa" title="Copiar essa tarefa pra próxima semana, no mesmo dia">Duplicar</button>`
              : ""
          }
          <button type="button" class="btn btn-primary" id="btn-salvar-modal-tarefa" style="margin-left:auto;">${isNovo ? "Criar tarefa" : "Salvar alterações"}</button>
        </div>
      </div>
    `;

    document.getElementById("btn-fechar-modal-tarefa").addEventListener("click", fecharModalTarefa);

    overlay.querySelector(".input-status-modal").addEventListener("change", async (ev) => {
      // Numa tarefa nova ainda não existe linha no banco pra atualizar --
      // só guarda o valor escolhido, que vai junto quando "Criar tarefa"
      // for clicado.
      if (isNovo) {
        tarefa.status = ev.target.value;
        const pillStatusNovo = document.getElementById("pill-status-modal");
        if (pillStatusNovo) pillStatusNovo.textContent = NOME_STATUS_MODAL[tarefa.status] || tarefa.status;
        return;
      }
      const { error } = await window.supabaseClient.from("demandas").update({ status: ev.target.value }).eq("id", tarefa.id);
      if (error) {
        mostrarMsgModal("Erro ao salvar status: " + error.message, true);
        return;
      }
      tarefa.status = ev.target.value;
      const pillStatus = document.getElementById("pill-status-modal");
      if (pillStatus) pillStatus.textContent = NOME_STATUS_MODAL[tarefa.status] || tarefa.status;
      mostrarMsgModal("Status atualizado.", false);
      if (aoMudarAtual) aoMudarAtual();
    });

    const btnPararRecorrencia = document.getElementById("btn-parar-recorrencia-modal");
    if (btnPararRecorrencia) {
      btnPararRecorrencia.addEventListener("click", async () => {
        if (!confirm("Parar de repetir essa tarefa? Ela continua existindo nas semanas já criadas, só não entra mais nas próximas.")) return;
        const { error } = await window.supabaseClient.from("recorrentes").update({ ativo: false }).eq("id", btnPararRecorrencia.dataset.recorrenteId);
        if (error) {
          mostrarMsgModal("Erro ao parar recorrência: " + error.message, true);
          return;
        }
        mostrarMsgModal("Essa tarefa não vai mais se repetir.", false);
        if (aoMudarAtual) aoMudarAtual();
      });
    }

    const btnDuplicar = document.getElementById("btn-duplicar-modal-tarefa");
    if (btnDuplicar) {
      btnDuplicar.addEventListener("click", async () => {
        const { data: semanaAtual } = await window.supabaseClient.from("weeks").select("*").eq("id", tarefa.week_id).single();
        if (!semanaAtual) {
          mostrarMsgModal("Não consegui achar a semana dessa tarefa.", true);
          return;
        }
        const { data: semanasCliente } = await window.supabaseClient.from("weeks").select("*").eq("client_id", tarefa.client_id).order("semana_inicio");
        const proximaSemana = (semanasCliente || [])
          .filter((w) => w.semana_inicio > semanaAtual.semana_inicio)
          .sort((a, b) => (a.semana_inicio < b.semana_inicio ? -1 : 1))[0];
        if (!proximaSemana) {
          mostrarMsgModal("Ainda não existe uma próxima semana criada pra duplicar essa tarefa.", true);
          return;
        }

        const payload = {
          client_id: tarefa.client_id,
          week_id: proximaSemana.id,
          bloco: tarefa.bloco,
          titulo: tarefa.titulo,
          descricao: tarefa.descricao || null,
          tipo_publicacao: tarefa.tipo_publicacao,
          responsavel_id: tarefa.responsavel_id || null,
          link: tarefa.link || null,
          link_referencia: tarefa.link_referencia || null,
          categoria: categoriaDaTarefaModal(tarefa),
          rede_social: tarefa.rede_social || null,
          hora_publicacao: tarefa.hora_publicacao || null,
          status: "pendente",
          recorrente_id: null,
        };
        if (tarefa.data_publicacao) {
          payload.data_publicacao = addDiasModal(tarefa.data_publicacao, diasEntreModal(semanaAtual.semana_inicio, proximaSemana.semana_inicio));
        }

        const { error } = await window.supabaseClient.from("demandas").insert(payload);
        if (error) {
          mostrarMsgModal("Erro ao duplicar: " + error.message, true);
          return;
        }
        fecharModalTarefa();
        if (aoMudarAtual) aoMudarAtual();
      });
    }

    const btnExcluir = document.getElementById("btn-excluir-modal-tarefa");
    if (btnExcluir) {
      btnExcluir.addEventListener("click", async () => {
        if (!confirm("Excluir essa tarefa?")) return;
        const { error } = await window.supabaseClient.from("demandas").delete().eq("id", tarefa.id);
        if (error) {
          mostrarMsgModal("Erro ao excluir: " + error.message, true);
          return;
        }
        fecharModalTarefa();
        if (aoMudarAtual) aoMudarAtual();
      });
    }

    const btnSalvarTarefa = document.getElementById("btn-salvar-modal-tarefa");
    btnSalvarTarefa.addEventListener("click", async () => {
      // Desliga o botão enquanto salva -- evita duplicar a tarefa (ou a
      // recorrência inteira) se a pessoa clicar duas vezes seguidas.
      if (btnSalvarTarefa.disabled) return;
      const titulo = overlay.querySelector(".input-titulo-modal").value.trim();
      if (!titulo) {
        mostrarMsgModal("Dê um nome para a tarefa.", true);
        return;
      }
      btnSalvarTarefa.disabled = true;
      try {
        await salvarModalTarefa();
      } finally {
        btnSalvarTarefa.disabled = false;
      }
    });

    async function salvarModalTarefa() {
      const payload = {
        titulo: overlay.querySelector(".input-titulo-modal").value.trim(),
        descricao: overlay.querySelector(".input-descricao-modal").value.trim() || null,
        tipo_publicacao: overlay.querySelector(".input-tipo-modal").value,
        responsavel_id: overlay.querySelector(".input-responsavel-modal").value || null,
        link: overlay.querySelector(".input-link-modal").value.trim() || null,
        link_referencia: overlay.querySelector(".input-link-referencia-modal").value.trim() || null,
      };
      const inputCategoria = overlay.querySelector(".input-categoria-modal");
      if (inputCategoria) payload.categoria = inputCategoria.value;
      if (overlay.querySelector(".input-rede-social-modal")) payload.rede_social = obterRedesSociaisMarcadas(overlay, "input-rede-social-modal");
      const inputData = overlay.querySelector(".input-data-modal");
      const inputHora = overlay.querySelector(".input-hora-modal");
      const inputPrazo = overlay.querySelector(".input-prazo-modal");
      const inputPrazoProducao = overlay.querySelector(".input-prazo-producao-modal");
      if (inputData) payload.data_publicacao = inputData.value || null;
      if (inputHora) payload.hora_publicacao = inputHora.value || null;
      if (inputPrazo) payload.prazo_pacote = inputPrazo.value || null;
      if (inputPrazoProducao) payload.prazo_producao = inputPrazoProducao.value || null;

      if (isNovo) {
        payload.client_id = tarefa.client_id;
        payload.week_id = tarefa.week_id;
        payload.bloco = tarefa.bloco;
        payload.status = tarefa.status || "pendente";
        payload.recorrente_id = null;
        // Sem seletor de "Tipo de demanda" nesse modo (ver renderizarModalTarefa)
        // -- toda tarefa criada pelos cards da prévia nasce como mídia social.
        payload.categoria = "social";

        // "Repetir toda <dia>": mesmo motor das tarefas recorrentes de
        // sempre (tabela "recorrentes" + garantirRecorrentesNasSemanas, que
        // já roda sozinho a cada carregamento) -- só que agora criado a
        // partir do card da prévia em vez da antiga coluna por dia.
        const inputRecorrenteModal = overlay.querySelector(".input-recorrente-modal");
        if (inputRecorrenteModal && inputRecorrenteModal.checked) {
          const { data: recData, error: recErro } = await window.supabaseClient.from("recorrentes").insert({
            client_id: payload.client_id,
            bloco: payload.bloco,
            titulo: payload.titulo,
            descricao: payload.descricao,
            tipo_publicacao: payload.tipo_publicacao,
            responsavel_id: payload.responsavel_id,
            link: payload.link,
            link_referencia: payload.link_referencia,
            hora_publicacao: payload.hora_publicacao,
            categoria: "social",
            rede_social: payload.rede_social || null,
            ativo: true,
          });
          if (recErro) {
            mostrarMsgModal("Erro ao criar a repetição: " + recErro.message, true);
            return;
          }
          payload.recorrente_id = recData[0].id;
        }

        const { error } = await window.supabaseClient.from("demandas").insert(payload);
        if (error) {
          mostrarMsgModal("Erro ao criar: " + error.message, true);
          return;
        }
        fecharModalTarefa();
        if (aoMudarAtual) aoMudarAtual();
        return;
      }

      const { error } = await window.supabaseClient.from("demandas").update(payload).eq("id", tarefa.id);
      if (error) {
        mostrarMsgModal("Erro ao salvar: " + error.message, true);
        return;
      }
      fecharModalTarefa();
      if (aoMudarAtual) aoMudarAtual();
    }
  }

  function mostrarMsgModal(texto, erro) {
    const el = document.getElementById("msg-modal-tarefa");
    if (!el) return;
    el.textContent = texto;
    el.className = "form-msg " + (erro ? "error" : "ok");
  }
})();
