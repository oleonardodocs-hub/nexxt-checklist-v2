// Copie este arquivo para "config.js" (mesma pasta) e preencha com os dados
// do repositório do GitHub onde os dados vão ficar guardados, e a senha
// única de acesso da equipe.
//
// GITHUB_OWNER  -> seu usuário ou organização no GitHub (ex: "leonardo-nexxt")
// GITHUB_REPO   -> nome do repositório que guarda os arquivos de dados
//                  (pode ser o mesmo repositório do site, ou um separado
//                  e privado, só pra manter os dados dos clientes fora do
//                  ar público; o README explica as duas opções)
// GITHUB_BRANCH -> geralmente "main"
//
// A TEAM_PASSWORD fica visível pra quem olhar o código do site, ela só
// serve pra barrar quem cair no link sem querer, não é uma senha "de
// verdade". A proteção de verdade dos dados é o token do GitHub que cada
// pessoa da equipe cola no próprio navegador (nunca vai pro config.js nem
// pro repositório).

window.APP_CONFIG = {
  GITHUB_OWNER: "SEU-USUARIO",
  GITHUB_REPO: "SEU-REPOSITORIO-DE-DADOS",
  GITHUB_BRANCH: "main",
  TEAM_PASSWORD: "Socio26@@",
};
