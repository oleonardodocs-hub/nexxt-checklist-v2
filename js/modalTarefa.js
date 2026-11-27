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

    const rotuloTipo = isPacote ? "Data comemorativa" : categoria === "diaria" ? "Tarefa diária" : "Mídia social";
    const opcoesResponsavel = colaboradores
      .map((c) => `<option value="${c.id}" ${c.id === tarefa.responsavel_id ? "selected" : ""}>${escaparHtml(c.nome)}${c.funcao ? ` (${escaparHtml(c.funcao)})` : ""}</option>`)
      .join("");
    const responsavelAtual = colaboradores.find((c) => c.id === tarefa.responsavel_id) || null;
    const dataPrincipal = isPacote ? tarefa.prazo_pacote : tarefa.prazo_producao || tarefa.data_publicacao;
    const hojeISO = toISODateModal(new Date());
    const aprovadaModal = ["validada", "agendada", "manual_pendente", "publicada"].includes(tarefa.status);
    const atrasada = !isNovo && dataPrincipal && dataPrincipal < hojeISO && !aprovadaModal;
    const textoData = dataPrincipal ? `${dataLegivelModal(dataPrincipal)}${!isPacote && horaVal ? ` · ${horaVal}` : ""}` : "";
    const prop = (icone, rotulo, conteudo, extraClasse) => `
      <div class="mt-prop ${extraClasse || ""}">
        <span class="mt-prop-rotulo">${ICONES_MT[icone] || ""}<span>${rotulo}</span></span>
        <div class="mt-prop-valor">${conteudo}</div>
      </div>`;

    const propriedades = [
      prop(
        "status",
        "Status",
        `<div class="mt-status-linha">
          <select class="input-status-modal mt-status-select mt-status-${tarefa.status}">
            ${Object.entries(NOME_STATUS_MODAL)
              .map(([valor, nome]) => `<option value="${valor}" ${valor === tarefa.status ? "selected" : ""}>${nome}</option>`)
              .join("")}
          </select>
          <button type="button" class="mt-status-ok" id="btn-aprovar-modal" title="Marcar como validada">✓</button>
        </div>`
      ),
      prop(
        "pessoa",
        "Responsável",
        `<div class="mt-responsavel">
          <span class="mt-responsavel-avatar" id="mt-responsavel-avatar">${responsavelAtual ? conteudoAvatarHTML(responsavelAtual) : "?"}</span>
          <select class="input-responsavel-modal mt-input"><option value="">Vazio</option>${opcoesResponsavel}</select>
        </div>`
      ),
      isPacote
        ? prop("calendario", "Data", `<input type="date" class="input-prazo-modal mt-input" value="${tarefa.prazo_pacote || ""}" />`)
        : prop("calendario", "Publicação", `<input type="date" class="input-data-modal mt-input" value="${tarefa.data_publicacao || ""}" />`),
      !isPacote ? prop("relogio", "Hora", `<input type="time" class="input-hora-modal mt-input" value="${horaVal}" />`) : "",
      !isPacote
        ? prop(
            "bandeira",
            "Pronta até",
            `<input type="date" class="input-prazo-producao-modal mt-input" value="${tarefa.prazo_producao || ""}" title="Só preencha se precisar produzir antes do dia de publicação. A tarefa aparece no Checklist de hoje nesse prazo." />`
          )
        : "",
      prop(
        "envio",
        "Tipo de publicação",
        `<select class="input-tipo-modal mt-input">
          <option value="agendada" ${tipo === "agendada" ? "selected" : ""}>Agendada</option>
          <option value="manual" ${tipo === "manual" ? "selected" : ""}>Manual (subir na hora)</option>
        </select>`
      ),
      !isPacote && !isNovo
        ? prop(
            "etiqueta",
            "Tipo de demanda",
            `<select class="input-categoria-modal mt-input">
              <option value="social" ${categoria === "social" ? "selected" : ""}>Mídia social</option>
              <option value="diaria" ${categoria === "diaria" ? "selected" : ""}>Tarefa diária</option>
            </select>`
          )
        : "",
      prop(
        "link",
        "Referência",
        `<div class="mt-link">
          <input type="url" class="input-link-referencia-modal mt-input" placeholder="Cole o link" value="${escaparHtml(tarefa.link_referencia || "")}" />
          <a class="mt-link-abrir" href="${escaparHtml(tarefa.link_referencia || "#")}" target="_blank" rel="noopener" style="${tarefa.link_referencia ? "" : "display:none"}">Abrir ↗</a>
        </div>`
      ),
      prop(
        "link",
        "Material pronto",
        `<div class="mt-link">
          <input type="url" class="input-link-modal mt-input" placeholder="Link do CRM ou Drive" value="${escaparHtml(tarefa.link || "")}" />
          <a class="mt-link-abrir" href="${escaparHtml(tarefa.link || "#")}" target="_blank" rel="noopener" style="${tarefa.link ? "" : "display:none"}">Abrir ↗</a>
        </div>`
      ),
      categoria === "social" ? prop("rede", "Redes sociais", redesSociaisIconesToggleHTML(tarefa, "input-rede-social-modal"), "mt-prop-largo") : "",
      categoria === "social" ? prop("link", "Links da publicação", `<div class="mt-links-pub" id="mt-links-pub"></div>`, "mt-prop-largo") : "",
    ].join("");

    overlay.innerHTML = `
      <div class="modal-card modal-tarefa-cu ${isNovo ? "sem-chat" : ""}" style="${corCliente ? `--client-color:${corCliente}` : ""}">
        <div class="mt-main">
          <div class="mt-cabecalho">
            <div class="mt-topo">
              <div class="mt-chips">
                ${cliente ? `<span class="mt-chip mt-chip-cliente"><span class="mt-chip-ponto"></span>${escaparHtml(cliente.nome)}</span>` : ""}
                <span class="mt-chip">${rotuloTipo}</span>
                ${textoData ? `<span class="mt-chip ${atrasada ? "mt-chip-atrasada" : ""}">${ICONES_MT.calendario}${textoData}${atrasada ? " · Atrasada" : ""}</span>` : ""}
                ${
                  tarefa.recorrente_id
                    ? `<span class="mt-chip mt-chip-recorrente">↻ Repete toda ${(NOME_DIA_MODAL[tarefa.bloco] || "").replace("-feira", "").toLowerCase()}
                        <button type="button" id="btn-parar-recorrencia-modal" data-recorrente-id="${tarefa.recorrente_id}">Parar</button></span>`
                    : ""
                }
              </div>
              <button type="button" class="mt-fechar" id="btn-fechar-modal-tarefa" aria-label="Fechar" title="Fechar">✕</button>
            </div>

            <input type="text" class="input-titulo-modal mt-titulo" placeholder="${isNovo ? "Nome da nova tarefa" : "Nome da tarefa"}" value="${escaparHtml(tarefa.titulo || "")}" />

            <div class="mt-etapas" id="mt-etapas">${etapasHTML(tarefa.status)}</div>
          </div>

          <div class="mt-props">${propriedades}</div>

          ${
            !isPacote && isNovo && tarefa.bloco
              ? `<label class="checkbox-label mt-recorrente"><input type="checkbox" class="input-recorrente-modal" /> Repetir toda ${NOME_DIA_MODAL[tarefa.bloco] || tarefa.bloco}</label>`
              : ""
          }

          <div class="mt-secao">Descrição</div>
          <textarea class="input-descricao-modal mt-descricao" rows="4" placeholder="Adicione uma descrição: o que é e como deve ser feito">${escaparHtml(tarefa.descricao || "")}</textarea>

          <p class="form-msg" id="msg-modal-tarefa"></p>

          <div class="mt-acoes">
            ${!isNovo ? `<button type="button" class="btn btn-perigo-ghost" id="btn-excluir-modal-tarefa">Excluir</button>` : ""}
            ${
              !isNovo && !isPacote && tarefa.week_id
                ? `<button type="button" class="btn btn-ghost" id="btn-duplicar-modal-tarefa" title="Copiar essa tarefa pra próxima semana, no mesmo dia">Duplicar</button>`
                : ""
            }
            <button type="button" class="btn btn-primary" id="btn-salvar-modal-tarefa" style="margin-left:auto;">${isNovo ? "Criar tarefa" : "Salvar alterações"}</button>
          </div>
        </div>

        ${
          !isNovo
            ? `<aside class="mt-chat">
                <div class="mt-chat-topo">
                  <strong>Comentários</strong>
                  ${tarefa.created_at ? `<span>Criada em ${formatarDataHoraChat(tarefa.created_at, true)}</span>` : ""}
                </div>
                <div class="mt-chat-lista" id="mt-chat-lista"><div class="mt-chat-carregando">Carregando...</div></div>
                <div class="mt-chat-composer">
                  <div class="mt-chat-autor">
                    <span>Comentando como</span>
                    <select id="mt-chat-autor">
                      <option value="">Equipe</option>
                      ${colaboradores.map((c) => `<option value="${c.id}">${escaparHtml(c.nome)}</option>`).join("")}
                    </select>
                  </div>
                  <div class="mt-chat-rapidas">
                    ${RESPOSTAS_RAPIDAS.map((t) => `<button type="button" data-resposta-rapida="${t}">${t}</button>`).join("")}
                  </div>
                  <div class="mt-chat-caixa">
                    <textarea id="mt-chat-texto" rows="2" placeholder="Escreva um comentário"></textarea>
                    <button type="button" class="mt-chat-enviar" id="mt-chat-enviar" title="Enviar (Enter)">${ICONES_MT.enviar}</button>
                  </div>
                </div>
              </aside>`
            : ""
        }
      </div>
    `;

    if (!isNovo) ligarChat(tarefa, colaboradores);

    function religarEtapas() {
      overlay.querySelectorAll("[data-etapa]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const sel = overlay.querySelector(".input-status-modal");
          if (sel.value === btn.dataset.etapa) return;
          sel.value = btn.dataset.etapa;
          sel.dispatchEvent(new Event("change"));
        });
      });
    }
    religarEtapas();

    const selResp = overlay.querySelector(".input-responsavel-modal");
    selResp.addEventListener("change", () => {
      const c = colaboradores.find((x) => x.id === selResp.value);
      document.getElementById("mt-responsavel-avatar").innerHTML = c ? conteudoAvatarHTML(c) : "?";
    });

    // Um campo de link por rede ligada (histórico de onde o post foi
    // publicado). Guarda o que já foi digitado mesmo se a rede for desligada
    // e ligada de novo antes de salvar.
    const linksDigitados = Object.assign({}, typeof linksPublicacao === "function" ? linksPublicacao(tarefa) : {});
    const boxLinksPub = overlay.querySelector("#mt-links-pub");
    function renderLinksPub() {
      if (!boxLinksPub) return;
      const ligadas = (obterRedesSociaisMarcadas(overlay, "input-rede-social-modal") || "").split(",").filter(Boolean);
      if (!ligadas.length) {
        boxLinksPub.innerHTML = `<span class="mt-links-pub-vazio">Ligue uma rede acima para colar o link do post.</span>`;
        return;
      }
      boxLinksPub.innerHTML = ligadas
        .map((rede) => {
          const url = linksDigitados[rede] || "";
          const ok = /^https?:\/\//i.test(url);
          return `
            <div class="mt-link mt-link-pub" data-rede="${rede}">
              <span class="rede-icone rede-icone-${rede}"><img src="assets/redes/${rede}.png" alt="" /></span>
              <input type="url" class="mt-input input-link-pub" placeholder="Link do post no ${nomeDeRedeSocial(rede)}" value="${escaparHtml(url)}" />
              <a class="mt-link-abrir" href="${ok ? escaparHtml(url) : "#"}" target="_blank" rel="noopener" style="${ok ? "" : "display:none"}">Abrir ↗</a>
            </div>`;
        })
        .join("");
      boxLinksPub.querySelectorAll(".mt-link-pub").forEach((linha) => {
        const input = linha.querySelector("input");
        const link = linha.querySelector(".mt-link-abrir");
        input.addEventListener("input", () => {
          const v = input.value.trim();
          linksDigitados[linha.dataset.rede] = v;
          link.style.display = /^https?:\/\//i.test(v) ? "" : "none";
          link.href = v || "#";
        });
      });
    }
    renderLinksPub();
    overlay.querySelectorAll(".input-rede-social-modal input").forEach((cb) => cb.addEventListener("change", renderLinksPub));

    overlay.querySelectorAll(".mt-link:not(.mt-link-pub)").forEach((box) => {
      const input = box.querySelector("input");
      const link = box.querySelector(".mt-link-abrir");
      input.addEventListener("input", () => {
        const v = input.value.trim();
        link.style.display = /^https?:\/\//i.test(v) ? "" : "none";
        link.href = v || "#";
      });
    });

    const btnAprovarModal = document.getElementById("btn-aprovar-modal");
    if (btnAprovarModal) {
      btnAprovarModal.addEventListener("click", () => {
        const sel = overlay.querySelector(".input-status-modal");
        if (sel.value === "validada") return;
        sel.value = "validada";
        sel.dispatchEvent(new Event("change"));
      });
    }

    document.getElementById("btn-fechar-modal-tarefa").addEventListener("click", fecharModalTarefa);

    overlay.querySelector(".input-status-modal").addEventListener("change", async (ev) => {
      // Numa tarefa nova ainda não existe linha no banco pra atualizar --
      // só guarda o valor escolhido, que vai junto quando "Criar tarefa"
      // for clicado.
      if (isNovo) {
        tarefa.status = ev.target.value;
        ev.target.className = `input-status-modal mt-status-select mt-status-${tarefa.status}`;
        document.getElementById("mt-etapas").innerHTML = etapasHTML(tarefa.status);
        religarEtapas();
        return;
      }
      const { error } = await window.supabaseClient.from("demandas").update({ status: ev.target.value }).eq("id", tarefa.id);
      if (error) {
        mostrarMsgModal("Erro ao salvar status: " + error.message, true);
        return;
      }
      tarefa.status = ev.target.value;
      ev.target.className = `input-status-modal mt-status-select mt-status-${tarefa.status}`;
      document.getElementById("mt-etapas").innerHTML = etapasHTML(tarefa.status);
      religarEtapas();
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
      if (overlay.querySelector(".input-rede-social-modal")) {
        payload.rede_social = obterRedesSociaisMarcadas(overlay, "input-rede-social-modal");
        const ligadas = (payload.rede_social || "").split(",").filter(Boolean);
        const links = {};
        ligadas.forEach((r) => {
          const v = (linksDigitados[r] || "").trim();
          if (v) links[r] = v;
        });
        payload.links_publicacao = Object.keys(links).length ? links : null;
      }
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

  // Ícones (traço fino, estilo ClickUp) usados nos rótulos das propriedades.
  const svg = (d) => `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const ICONES_MT = {
    status: svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/>'),
    pessoa: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>'),
    calendario: svg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>'),
    relogio: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    bandeira: svg('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>'),
    envio: svg('<path d="M4 12l16-8-6 16-2-7-8-1z"/>'),
    etiqueta: svg('<path d="M20 12l-8 8-9-9V3h8z"/><circle cx="7.5" cy="7.5" r="1.5"/>'),
    link: svg('<path d="M10 14a4 4 0 0 0 5.6 0l3-3a4 4 0 0 0-5.6-5.6l-1 1"/><path d="M14 10a4 4 0 0 0-5.6 0l-3 3a4 4 0 0 0 5.6 5.6l1-1"/>'),
    rede: svg('<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.2 11l7.6-3.8M8.2 13l7.6 3.8"/>'),
    enviar: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M3.4 20.4l17.5-7.5a1 1 0 0 0 0-1.8L3.4 3.6a1 1 0 0 0-1.4 1.1L4 11l9 1-9 1-2 6.3a1 1 0 0 0 1.4 1.1z"/></svg>',
  };

  // Linha do tempo do status (etapas clicáveis). Agendada e publicação
  // manual pendente contam como a etapa "Aprovada".
  const ETAPAS_MT = [
    { valor: "pendente", nome: "Pendente" },
    { valor: "em_producao", nome: "Produção" },
    { valor: "aguardando_validacao", nome: "Validação" },
    { valor: "validada", nome: "Aprovada" },
    { valor: "publicada", nome: "Publicada" },
  ];
  function etapasHTML(status) {
    const s = status === "agendada" || status === "manual_pendente" ? "validada" : status;
    const idx = Math.max(0, ETAPAS_MT.findIndex((e) => e.valor === s));
    return ETAPAS_MT.map(
      (e, i) => `
        <button type="button" class="mt-etapa ${i < idx ? "is-feita" : ""} ${i === idx ? "is-atual" : ""}" data-etapa="${e.valor}" title="Mudar para ${e.nome}">
          <span class="mt-etapa-bola">${i < idx ? "✓" : i + 1}</span>
          <span class="mt-etapa-nome">${e.nome}</span>
        </button>`
    ).join('<span class="mt-etapa-linha"></span>');
  }

  const DIA_SEMANA_CURTO = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  function dataLegivelModal(iso) {
    const d = new Date(iso + "T00:00:00");
    if (isNaN(d)) return iso;
    return `${DIA_SEMANA_CURTO[d.getDay()]}, ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  // Cor fixa por pessoa (a partir do nome), pros avatares do chat.
  const CORES_AVATAR = ["#6250d6", "#2a78d6", "#1baf7a", "#eb6834", "#e87ba4", "#c98500", "#0d9488", "#e34948"];
  function corAvatar(nome) {
    let h = 0;
    for (const ch of nome || "") h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return CORES_AVATAR[h % CORES_AVATAR.length];
  }
  const RESPOSTAS_RAPIDAS = ["Ajuste pedido", "Aprovado pelo cliente", "Postado"];

  function formatarDataHoraChat(iso, soData) {
    const d = new Date(iso);
    if (isNaN(d)) return "";
    const dia = String(d.getDate()).padStart(2, "0");
    const mes = String(d.getMonth() + 1).padStart(2, "0");
    if (soData) return `${dia}/${mes}/${d.getFullYear()}`;
    const hora = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${dia}/${mes} às ${hora}:${min}`;
  }

  function iniciaisChat(nome) {
    if (typeof inicialAvatar === "function") return inicialAvatar(nome);
    return (nome || "?").trim().slice(0, 2).toUpperCase();
  }

  // Chat da tarefa (igual aos comentários do ClickUp): cada comentário é
  // uma linha da tabela "comentarios" (data/comentarios.json), ligada à
  // tarefa por demanda_id. O "Comentando como" fica salvo no navegador.
  function ligarChat(tarefa, colaboradores) {
    const lista = document.getElementById("mt-chat-lista");
    const texto = document.getElementById("mt-chat-texto");
    const btnEnviar = document.getElementById("mt-chat-enviar");
    const selAutor = document.getElementById("mt-chat-autor");
    if (!lista || !texto || !btnEnviar || !selAutor) return;

    let autorSalvo = "";
    try {
      autorSalvo = localStorage.getItem("comentario_autor_id") || "";
    } catch (e) {}
    if (autorSalvo && colaboradores.some((c) => c.id === autorSalvo)) selAutor.value = autorSalvo;
    selAutor.addEventListener("change", () => {
      try {
        localStorage.setItem("comentario_autor_id", selAutor.value);
      } catch (e) {}
    });

    let comentarios = [];

    function render() {
      if (!comentarios.length) {
        lista.innerHTML = `
          <div class="mt-chat-vazio">
            <span class="mt-chat-vazio-icone">💬</span>
            <strong>Envie o primeiro comentário</strong>
            <span>Faça uma pergunta, deixe uma atualização ou um ajuste pedido pelo cliente.</span>
          </div>`;
        return;
      }
      lista.innerHTML = comentarios
        .map((c) => {
          const nome = c.autor_nome || "Equipe";
          return `
            <div class="mt-comentario">
              <span class="mt-comentario-avatar" style="background:${corAvatar(nome)}">${conteudoAvatarHTML(colaboradores.find((x) => x.id === c.autor_id), nome)}</span>
              <div class="mt-comentario-corpo">
                <div class="mt-comentario-topo"><strong>${escaparHtml(nome)}</strong><span>${formatarDataHoraChat(c.created_at)}</span></div>
                <div class="mt-comentario-texto">${escaparHtml(c.texto).replace(/\n/g, "<br>")}</div>
              </div>
            </div>`;
        })
        .join("");
      lista.scrollTop = lista.scrollHeight;
    }

    (async () => {
      const { data, error } = await window.supabaseClient.from("comentarios").select("*").eq("demanda_id", tarefa.id).order("created_at");
      if (error) {
        lista.innerHTML = `<div class="mt-chat-vazio"><span>Não consegui carregar os comentários: ${escaparHtml(error.message)}</span></div>`;
        return;
      }
      comentarios = data || [];
      render();
    })();

    async function enviar() {
      const conteudo = texto.value.trim();
      if (!conteudo || btnEnviar.disabled) return;
      btnEnviar.disabled = true;
      const autor = colaboradores.find((c) => c.id === selAutor.value);
      const { data, error } = await window.supabaseClient.from("comentarios").insert({
        demanda_id: tarefa.id,
        client_id: tarefa.client_id || null,
        autor_id: autor ? autor.id : null,
        autor_nome: autor ? autor.nome : "Equipe",
        texto: conteudo,
      });
      btnEnviar.disabled = false;
      if (error) {
        mostrarMsgModal("Erro ao enviar comentário: " + error.message, true);
        return;
      }
      comentarios = comentarios.concat(data || []);
      texto.value = "";
      render();
    }

    btnEnviar.addEventListener("click", enviar);
    document.querySelectorAll("[data-resposta-rapida]").forEach((b) => {
      b.addEventListener("click", () => {
        texto.value = texto.value.trim() ? `${texto.value.trim()} ${b.dataset.respostaRapida}` : b.dataset.respostaRapida + ": ";
        texto.focus();
      });
    });
    texto.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" && !ev.shiftKey) {
        ev.preventDefault();
        enviar();
      }
    });
  }

  function mostrarMsgModal(texto, erro) {
    const el = document.getElementById("msg-modal-tarefa");
    if (!el) return;
    el.textContent = texto;
    el.className = "form-msg " + (erro ? "error" : "ok");
  }
})();
