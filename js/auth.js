// Controle de acesso: senha única da equipe + token pessoal do GitHub
// (usado pelo js/githubClient.js para ler/gravar os dados). Nenhum dos
// dois é um login "de verdade" com servidor, são guardados só no
// navegador de cada pessoa (ver index.html e README.md).

function temAcessoLiberado() {
  return localStorage.getItem("equipe_autenticada") === "1" && !!localStorage.getItem("github_token");
}

function exigirAcesso() {
  if (!temAcessoLiberado()) {
    window.location.href = "index.html";
    return false;
  }
  return true;
}

function sair() {
  localStorage.removeItem("equipe_autenticada");
  window.location.href = "index.html";
}

function configurarTokenGithub() {
  const atual = localStorage.getItem("github_token") || "";
  const novo = window.prompt(
    "Cole o seu token do GitHub (com permissão de escrita no repositório de dados):",
    atual
  );
  if (novo === null) return; // cancelou
  if (novo.trim()) {
    localStorage.setItem("github_token", novo.trim());
    window.location.reload();
  }
}

// Preenche a área de ações no topo (link da equipe, configurar GitHub e
// sair). Retorna false se o acesso não estiver liberado (a página já foi
// redirecionada para o login nesse caso).
function montarTopbarAcoes(elId) {
  if (!exigirAcesso()) return false;

  const el = document.getElementById(elId);
  if (el) {
    el.innerHTML = `
      <a class="btn btn-ghost" href="colaboradores.html" style="padding:4px 10px;">Equipe</a>
      <button class="btn btn-ghost" id="btn-config-github" style="padding:4px 10px;">GitHub</button>
      <button class="btn btn-ghost" id="btn-logout" style="padding:4px 10px;">Sair</button>
    `;
    document.getElementById("btn-logout").addEventListener("click", sair);
    document.getElementById("btn-config-github").addEventListener("click", configurarTokenGithub);
  }
  return true;
}
