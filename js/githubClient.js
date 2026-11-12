// "Banco de dados" usando o próprio GitHub: cada tabela é um arquivo JSON
// (data/<tabela>.json) dentro de um repositório, lido e escrito pela API
// de Contents do GitHub (https://docs.github.com/pt/rest/repos/contents).
//
// Expõe window.supabaseClient com a MESMA forma de uso do supabase-js que
// o resto do app já chama (.from(tabela).select()...eq()...order(),
// .insert(), .update().eq()/.in(), .delete().eq()), só trocando o motor por
// baixo. Assim dashboard.js, cliente.js e colaboradores.js não precisaram
// mudar quase nada.
//
// Cada pessoa da equipe usa o PRÓPRIO token do GitHub (gerado na conta dela,
// com acesso de escrita ao repositório de dados), guardado só no navegador
// dela (localStorage). O token nunca é commitado nem enviado a lugar
// nenhum além da API do GitHub.

(function () {
  const CFG = window.APP_CONFIG || {};
  const OWNER = CFG.GITHUB_OWNER;
  const REPO = CFG.GITHUB_REPO;
  const BRANCH = CFG.GITHUB_BRANCH || "main";
  const PASTA_DADOS = "data";

  if (!OWNER || OWNER.includes("SEU-USUARIO") || !REPO || REPO.includes("SEU-REPOSITORIO")) {
    console.warn(
      "APP_CONFIG não configurado. Copie js/config.example.js para js/config.js e preencha GITHUB_OWNER/GITHUB_REPO."
    );
  }

  function getToken() {
    return (localStorage.getItem("github_token") || "").trim();
  }

  function apiHeaders(extra) {
    const token = getToken();
    const headers = Object.assign({ Accept: "application/vnd.github+json" }, extra || {});
    if (token) headers["Authorization"] = "token " + token;
    return headers;
  }

  function utf8ParaBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let binario = "";
    bytes.forEach((b) => (binario += String.fromCharCode(b)));
    return btoa(binario);
  }

  function base64ParaUtf8(b64) {
    const binario = atob((b64 || "").replace(/\n/g, ""));
    const bytes = Uint8Array.from(binario, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  function uuid() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  async function corpoErro(res) {
    try {
      const j = await res.json();
      return j && j.message ? j.message : res.statusText;
    } catch (e) {
      return res.statusText;
    }
  }

  // cache em memória desta aba: { [tabela]: { rows, sha } }
  const cache = {};

  async function lerTabela(tabela) {
    if (cache[tabela]) return cache[tabela];

    const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${PASTA_DADOS}/${tabela}.json?ref=${encodeURIComponent(BRANCH)}`;
    // "no-store" evita que o navegador devolva uma resposta antiga em cache
    // pra essa mesma URL (o que faria a gente tentar de novo com o sha
    // desatualizado e cair sempre no mesmo erro 409).
    const res = await fetch(url, { headers: apiHeaders(), cache: "no-store" });

    if (res.status === 404) {
      cache[tabela] = { rows: [], sha: null };
      return cache[tabela];
    }
    if (!res.ok) {
      throw new Error(`GitHub (${tabela}.json): ${res.status} ${await corpoErro(res)}`);
    }

    const json = await res.json();
    let rows = [];
    try {
      rows = JSON.parse(base64ParaUtf8(json.content) || "[]");
    } catch (e) {
      rows = [];
    }
    cache[tabela] = { rows, sha: json.sha };
    return cache[tabela];
  }

  // regrava o arquivo inteiro da tabela; tenta de novo em caso de conflito
  // de edição simultânea (409 por causa do sha desatualizado)
  async function escreverTabela(tabela, rows, mensagem) {
    for (let tentativa = 0; tentativa < 3; tentativa++) {
      const atual = await lerTabela(tabela);
      const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${PASTA_DADOS}/${tabela}.json`;
      const body = {
        message: mensagem || `Atualiza ${tabela}.json`,
        content: utf8ParaBase64(JSON.stringify(rows, null, 2)),
        branch: BRANCH,
      };
      if (atual.sha) body.sha = atual.sha;

      const res = await fetch(url, {
        method: "PUT",
        headers: apiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const json = await res.json();
        cache[tabela] = { rows, sha: json.content.sha };
        return { error: null };
      }

      if (res.status === 409) {
        delete cache[tabela]; // alguém mexeu antes, relê e tenta de novo
        if (tentativa < 2) continue;
        return { error: { message: "Alguém mais salvou uma mudança bem na mesma hora. Tente de novo." } };
      }

      if (res.status === 401 || res.status === 403) {
        return { error: { message: "Acesso negado pelo GitHub. Confira se o seu token ainda é válido e tem permissão de escrita nesse repositório." } };
      }

      return { error: { message: `GitHub (${tabela}.json): ${res.status} ${await corpoErro(res)}` } };
    }
    return { error: { message: "Não foi possível salvar: conflito de edição simultânea. Tente de novo." } };
  }

  function bate(linha, filtros) {
    return filtros.every(([col, val]) => linha[col] === val);
  }

  function ordenar(linhas, coluna) {
    if (!coluna) return linhas;
    return [...linhas].sort((a, b) => (a[coluna] > b[coluna] ? 1 : a[coluna] < b[coluna] ? -1 : 0));
  }

  function criarConsulta(tabela) {
    const estadoConsulta = { filtros: [], filtrosIn: [], colunaOrdem: null };

    async function linhasFiltradas() {
      const { rows } = await lerTabela(tabela);
      let out = rows.filter((r) => bate(r, estadoConsulta.filtros));
      estadoConsulta.filtrosIn.forEach(([col, vals]) => {
        out = out.filter((r) => vals.includes(r[col]));
      });
      return ordenar(out, estadoConsulta.colunaOrdem);
    }

    async function aplicarAtualizacao(combina, payload) {
      const atual = await lerTabela(tabela);
      const novasLinhas = atual.rows.map((r) =>
        combina(r) ? Object.assign({}, r, payload, { updated_at: new Date().toISOString() }) : r
      );
      return escreverTabela(tabela, novasLinhas, `Atualiza ${tabela}`);
    }

    const consulta = {
      select() {
        return this;
      },
      order(coluna) {
        estadoConsulta.colunaOrdem = coluna;
        return this;
      },
      eq(coluna, valor) {
        estadoConsulta.filtros.push([coluna, valor]);
        return this;
      },
      in(coluna, valores) {
        estadoConsulta.filtrosIn.push([coluna, valores]);
        return this;
      },

      async single() {
        try {
          const linhas = await linhasFiltradas();
          return { data: linhas[0] || null, error: linhas[0] ? null : { message: "Registro não encontrado" } };
        } catch (e) {
          return { data: null, error: { message: e.message } };
        }
      },

      then(resolve) {
        linhasFiltradas()
          .then((linhas) => resolve({ data: linhas, error: null }))
          .catch((e) => resolve({ data: null, error: { message: e.message } }));
      },

      insert(payload) {
        const arr = Array.isArray(payload) ? payload : [payload];
        const comIds = arr.map((p) =>
          Object.assign({ id: uuid(), created_at: new Date().toISOString() }, p)
        );
        const promessa = (async () => {
          try {
            const atual = await lerTabela(tabela);
            const novasLinhas = atual.rows.concat(comIds);
            const { error } = await escreverTabela(tabela, novasLinhas, `Adiciona em ${tabela}`);
            return { data: error ? null : comIds, error };
          } catch (e) {
            return { data: null, error: { message: e.message } };
          }
        })();
        promessa.select = () => promessa;
        return promessa;
      },

      update(payload) {
        return {
          eq: (coluna, valor) => aplicarAtualizacao((r) => r[coluna] === valor, payload),
          in: (coluna, valores) => aplicarAtualizacao((r) => valores.includes(r[coluna]), payload),
        };
      },

      delete() {
        return {
          eq: async (coluna, valor) => {
            try {
              const atual = await lerTabela(tabela);
              const novasLinhas = atual.rows.filter((r) => r[coluna] !== valor);
              return escreverTabela(tabela, novasLinhas, `Remove de ${tabela}`);
            } catch (e) {
              return { error: { message: e.message } };
            }
          },
        };
      },
    };

    return consulta;
  }

  window.supabaseClient = {
    from(tabela) {
      return criarConsulta(tabela);
    },
  };
})();
