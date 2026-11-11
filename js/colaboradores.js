// Cadastro simples de colaboradores (nome + função), usados como
// responsável em cada tarefa.

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

async function carregarColaboradores() {
  const { data, error } = await window.supabaseClient.from("colaboradores").select("*").order("nome");
  const el = document.getElementById("lista-colaboradores");

  if (error) {
    el.innerHTML = '<div class="empty-state">Não foi possível carregar a equipe. Confira js/config.js e o schema do Supabase.</div>';
    return;
  }

  if (!data || data.length === 0) {
    el.innerHTML = '<div class="empty-state">Nenhum colaborador cadastrado ainda.</div>';
    return;
  }

  el.innerHTML =
    '<div class="today-wrap">' +
    data
      .map(
        (c) => `
      <div class="demanda-item" data-id="${c.id}">
        <div class="demanda-title">
          ${escapeHtml(c.nome)}
          ${!c.ativo ? '<span class="pill pill-pendente">Inativo</span>' : ""}
        </div>
        ${c.funcao ? `<div class="demanda-meta">${escapeHtml(c.funcao)}</div>` : ""}
        <div class="demanda-controls">
          <button class="btn btn-ghost" data-acao="toggle-ativo" data-id="${c.id}" data-ativo="${c.ativo}">${c.ativo ? "Desativar" : "Ativar"}</button>
          <button class="btn btn-ghost" data-acao="excluir" data-id="${c.id}" style="margin-left:auto;">Excluir</button>
        </div>
      </div>
    `
      )
      .join("") +
    "</div>";

  el.querySelectorAll('[data-acao="toggle-ativo"]').forEach((btn) => {
    btn.addEventListener("click", async () => {
      const ativo = btn.dataset.ativo === "true";
      const { error } = await window.supabaseClient
        .from("colaboradores")
        .update({ ativo: !ativo })
        .eq("id", btn.dataset.id);
      if (error) {
        mostrarToast("Erro: " + error.message);
        return;
      }
      await carregarColaboradores();
    });
  });

  el.querySelectorAll('[data-acao="excluir"]').forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Excluir este colaborador? As tarefas já atribuídas a ele ficam sem responsável.")) return;
      const { error } = await window.supabaseClient.from("colaboradores").delete().eq("id", btn.dataset.id);
      if (error) {
        mostrarToast("Erro ao excluir: " + error.message);
        return;
      }
      await carregarColaboradores();
    });
  });
}

document.getElementById("btn-salvar-colaborador").addEventListener("click", async () => {
  const nome = document.getElementById("novo-nome").value.trim();
  const funcao = document.getElementById("nova-funcao").value.trim();
  const msg = document.getElementById("msg-add-colaborador");

  if (!nome) {
    msg.textContent = "Dê um nome para o colaborador.";
    msg.className = "form-msg error";
    return;
  }

  const { error } = await window.supabaseClient.from("colaboradores").insert({ nome, funcao: funcao || null, ativo: true });
  if (error) {
    msg.textContent = "Erro ao salvar: " + error.message;
    msg.className = "form-msg error";
    return;
  }

  msg.textContent = "Colaborador adicionado.";
  msg.className = "form-msg ok";
  document.getElementById("novo-nome").value = "";
  document.getElementById("nova-funcao").value = "";
  await carregarColaboradores();
});

async function init() {
  if (!montarTopbarAcoes("user-tag")) return;
  await carregarColaboradores();
}

init();
