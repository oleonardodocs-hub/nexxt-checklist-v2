# Gestão de Mídias Sociais

Sistema para organizar as demandas semanais de cada cliente (posts, artes,
publicações manuais) e acompanhar o andamento em um painel único.

É um site estático (HTML, CSS e JS puro, sem build) que **não depende de
nenhum serviço externo** — nem Supabase, nem qualquer outro banco de dados
na nuvem. Os dados ficam guardados como arquivos JSON dentro de um
repositório do próprio GitHub, lidos e gravados pela API do GitHub
(Contents API). Dá para rodar local, hospedar no GitHub Pages ou em
qualquer outro host de arquivos estáticos.

## Como funciona o "banco de dados"

Cada tabela do sistema (`clients`, `weeks`, `demandas`, `colaboradores`) é
um arquivo `data/<tabela>.json` dentro de um repositório do GitHub. O app
lê e grava esses arquivos direto pela API do GitHub a partir do navegador
de cada pessoa — não precisa criar nada antes: na primeira vez que alguém
salva algo (um cliente, uma tarefa, um colaborador), o arquivo
correspondente é criado automaticamente.

Isso tem algumas consequências importantes, direto e sem rodeio:

- **Cada pessoa precisa do próprio token do GitHub.** Não existe senha de
  banco compartilhada — quem for usar o sistema precisa ter acesso de
  escrita ao repositório de dados e colar o próprio token pessoal (explico
  como gerar mais abaixo). O token fica guardado só no navegador de quem
  gerou, nunca é commitado nem enviado a lugar nenhum além da própria API
  do GitHub.
- **Cada salvamento é um commit.** Adicionar uma tarefa, mudar um status,
  validar uma semana — tudo isso grava um commit novo no repositório de
  dados. Funciona bem para o volume de uma agência, mas não é instantâneo
  como um banco de dados de verdade (cada ação faz uma ida e volta à API do
  GitHub).
- **Conflitos são tratados, mas existem.** Se duas pessoas salvarem algo no
  mesmo instante, o sistema detecta o conflito e tenta de novo
  automaticamente (até 3 vezes). Em uso normal de equipe isso praticamente
  não aparece.
- **Limite de uso da API do GitHub.** Com o token pessoal, o limite é alto
  (5.000 requisições por hora por pessoa), suficiente para o uso do
  dia a dia.

## Acesso

A entrada tem duas etapas, nenhuma delas é um cadastro com e-mail:

1. **Senha única da equipe** — configurada em `js/config.js`
   (`TEAM_PASSWORD`). Quem digita certo uma vez fica liberado naquele
   navegador.
2. **Token pessoal do GitHub** — pedido só na primeira vez (ou se for
   removido do navegador). É o que permite de fato ler e gravar os dados.

**Importante sobre a senha:** como o site é só HTML/JS estático hospedado
no GitHub Pages, essa senha fica visível pra quem souber olhar o código da
página. Ela serve só pra barrar quem cair no link sem querer, não é uma
proteção de verdade. A proteção real dos dados é o token do GitHub de cada
pessoa — sem ele, não é possível ler nem gravar nada no repositório de
dados (se ele for privado) nem gravar nada nele (mesmo público).

## Como o fluxo de demandas funciona

Cada cliente tem sempre os mesmos blocos: Datas comemorativas (entregue em
pacote único, sem ciclo semanal) e Segunda a Sexta.

A cada bloco do dia dá para adicionar quantas tarefas forem necessárias
("Subir post feed", "Responder comentários da campanha" etc), cada uma com
um título, uma descrição opcional (o que é e como deve ser feito), tipo de
publicação (agendada ou manual), um responsável (ver "Equipe" abaixo) e o
link da arte pronta (o arquivo em si fica no CRM, aqui só guardamos o link).

O sistema sempre mantém uma semana de folga: existe a semana atual
(validada, é o dia a dia do cliente), a próxima semana (aguardando
validação, a que será apresentada na sexta) e a semana seguinte a essa já
liberada para quem quiser adiantar o preenchimento. Ao validar a semana, o
sistema libera automaticamente a semana seguinte.

No painel principal fica a saudação do dia com um calendário do mês, o
"Checklist de hoje" (juntando as tarefas do dia de todos os clientes num
lugar só) e um card grande por cliente com a barra de progresso da semana e
alguns números rápidos (tarefas aguardando validação, publicações manuais do
dia).

## Equipe (colaboradores)

Na página "Equipe" (link no topo de qualquer tela) dá para cadastrar os
colaboradores da agência (nome + função, ex: "Mariana, Social Media"). Eles
aparecem como opção de **Responsável** em cada tarefa, tanto ao criar quanto
para reatribuir depois, direto no checklist do cliente.

Isso é só um cadastro de nomes para organizar quem é responsável por cada
tarefa — não tem relação com o acesso ao sistema (isso é controlado pelo
token do GitHub de cada um, ver "Acesso" acima).

## Acessos e senhas

No topo da página de cada cliente tem um painel **"Acessos e senhas"**
(fechado por padrão, só clicar pra abrir) pra centralizar os logins das
contas daquele cliente — Facebook, Instagram, CRM, e-mail, ou qualquer
outra ferramenta. Cada acesso tem Serviço, Login, Senha e uma Observação
opcional; a senha fica mascarada na lista e só aparece em texto ao clicar
em "Mostrar".

**Importante sobre segurança:** assim como o resto do sistema, esses dados
ficam guardados como texto simples no repositório de dados do GitHub (ver
"Como funciona o banco de dados" acima) — por isso é essencial que esse
repositório seja **privado** e separado do repositório do site, com acesso
restrito só à equipe. Mesmo assim, vale lembrar que o Git guarda histórico:
se uma senha salva aqui for trocada depois, a senha antiga continua
recuperável no histórico de commits do repositório para quem já teve (ou
tiver no futuro) acesso de leitura a ele. Então, ao trocar uma senha de
verdade numa rede social ou ferramenta, o ideal é também atualizar aqui
(pra não ficar com a informação desatualizada), mas sem contar com o
histórico do repositório como um cofre — pense nele como um "quadro de
avisos" da senha atual, não como um gerenciador de senhas de verdade.

## Estrutura do projeto

```
index.html              Tela de entrada (senha da equipe + token do GitHub)
dashboard.html           Painel: agenda, checklist de hoje, cards dos clientes
cliente.html             Detalhe de um cliente: semanas e checklist por dia
colaboradores.html       Cadastro da equipe (nome + função)
css/styles.css            Estilos
js/
  config.example.js       Modelo do arquivo de configuração (copiar para config.js)
  githubClient.js          "Banco de dados": lê/grava data/*.json via API do GitHub
  auth.js                  Controle de acesso (senha + token) e ações do topo
  dashboard.js              Lógica do painel
  cliente.js                Lógica da página do cliente
  colaboradores.js          Lógica do cadastro de equipe
assets/logo.png            Logo usado como ícone do site
```

Não existe pasta `data/` nem schema para criar antes de usar — os arquivos
`data/clients.json`, `data/weeks.json`, `data/demandas.json`,
`data/colaboradores.json`, `data/recorrentes.json` e `data/acessos.json`
são criados automaticamente no repositório de dados na primeira vez que
alguém salva algo.

## 1. Criar o repositório de dados no GitHub

Pode ser o **mesmo repositório** onde o site vai ficar hospedado, ou um
**repositório separado** — a vantagem de separar é poder deixar esse
repositório **privado** (os dados dos clientes não ficam públicos), mesmo
com o site do GitHub Pages sendo público. Repositório privado funciona
normalmente com a Contents API, só exige que o token de cada pessoa tenha
acesso a ele.

1. Crie o repositório no GitHub marcando a opção **"Add a README file"**
   na própria tela de criação (ou, se já criou sem marcar isso, entre no
   repositório e crie um arquivo qualquer direto pela interface do GitHub
   depois). Isso é necessário porque a API usada pelo sistema só consegue
   gravar `data/*.json` numa branch que já tenha pelo menos um commit; um
   repositório 100% vazio (sem nenhum commit) ainda não tem a branch
   `main` criada, e a primeira tentativa de salvar algo no site falha com
   erro 404.
2. Em **Settings > Collaborators**, adicione cada pessoa da equipe que vai
   usar o sistema, com permissão de escrita (**Write**).

## 2. Cada pessoa gera o próprio token

Cada colaborador que vai usar o sistema precisa gerar o próprio token
pessoal (fine-grained), em
[github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new):

1. **Resource owner**: a conta ou organização dona do repositório de dados.
2. **Repository access**: "Only select repositories" → escolha o
   repositório de dados criado no passo 1.
3. **Permissions > Repository permissions > Contents**: "Read and write".
4. Gere o token e cole-o na tela de entrada do site quando for pedido (ele
   fica guardado só naquele navegador).

## 3. Configurar o projeto

Copie `js/config.example.js` para `js/config.js` e preencha:

```js
window.APP_CONFIG = {
  GITHUB_OWNER: "seu-usuario-ou-organizacao",
  GITHUB_REPO: "nome-do-repositorio-de-dados",
  GITHUB_BRANCH: "main",
  TEAM_PASSWORD: "Socio26@@",
};
```

`js/config.js` **não é commitado** (está no `.gitignore`) porque, mesmo
sem token nenhum escrito nele, é o arquivo que cada ambiente (ou cada
pessoa rodando local) ajusta para o próprio repositório de dados. Ao
publicar no GitHub Pages (passo 5), esse arquivo precisa ser enviado junto
— nesse caso, como ele só contém nomes de repositório e a senha de equipe
(não o token de ninguém), pode sim subir junto com o site.

## 4. Rodar local

Qualquer servidor de arquivos estáticos serve. Exemplo com Python, dentro
da pasta do projeto:

```bash
python3 -m http.server 8080
```

Depois abra `http://localhost:8080`.

## 5. Subir no GitHub e publicar no GitHub Pages

O projeto já vem com o git iniciado. Falta criar um repositório no GitHub
para o **site** (pode ser o mesmo do passo 1, ou outro) e apontar para ele:

```bash
git add js/config.js   # ele está no .gitignore; force-add só se for subir junto com o site
git commit -m "configura repositório de dados"
git remote add origin https://github.com/SEU-USUARIO/SEU-REPOSITORIO.git
git push -u origin main
```

Depois, no repositório no GitHub: **Settings > Pages**, em "Build and
deployment" escolha "Deploy from a branch", branch `main`, pasta `/ (root)`.
Em alguns minutos o site fica disponível em
`https://SEU-USUARIO.github.io/SEU-REPOSITORIO/`.

## Adicionando clientes

Pelo próprio painel, no botão "+ Novo cliente" (nome e uma cor para
identificar o card). Ao abrir um cliente pela primeira vez, o sistema já
cria sozinho a semana atual e a próxima, prontas para preencher.
