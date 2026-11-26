(function (global) {
    "use strict";

    var CHAVE_LEGADA = "nutriq_dados_v1";
    var CHAVE_PREFERENCIAS = "nutriqPreferencias";
    var PAGINAS_PUBLICAS = ["", "index.html"];
    var VALIDADE_CACHE_MS = 3000;

    var pagina = global.location.pathname.split("/").pop();
    var publica = PAGINAS_PUBLICAS.indexOf(pagina) !== -1;

    var estado = { usuario: null, perfil: null };
    var cache = {};
    var ultimoErro = null;

    function interpretar(texto) {
        try { return texto ? JSON.parse(texto) : null; } catch (e) { return null; }
    }

    function detectarModoDemonstracao() {
        if (global.location.protocol === "file:") return false;
        var xhr = new XMLHttpRequest();
        try {
            xhr.open("GET", "/api/status", false);
            xhr.setRequestHeader("Accept", "application/json");
            xhr.send(null);
        } catch (e) {
            return false;
        }
        if (xhr.status < 200 || xhr.status >= 300) return false;
        var status = interpretar(xhr.responseText);
        return Boolean(status && status.modoDemonstracao === true);
    }

    var modoDemonstracao = detectarModoDemonstracao();
    if (modoDemonstracao) {
        if (!global.NutriqDemoStore) {
            throw new Error("O armazenamento do modo de demonstração não foi carregado.");
        }
        global.NutriqApi = global.NutriqDemoStore.criarApi(publica);
        return;
    }

    function irParaLogin() {
        if (!publica) global.location.replace("index.html");
    }

    function limparCache() {
        cache = {};
    }

    function requisitar(metodo, url, corpo) {
        if (metodo === "GET" && cache[url] && cache[url].expira > Date.now()) {
            return JSON.parse(cache[url].texto);
        }

        var xhr = new XMLHttpRequest();
        xhr.open(metodo, "/api" + url, false);
        xhr.setRequestHeader("Accept", "application/json");
        if (corpo !== undefined) xhr.setRequestHeader("Content-Type", "application/json");

        try {
            xhr.send(corpo === undefined ? null : JSON.stringify(corpo));
        } catch (e) {
            ultimoErro = { status: 0, erro: "Servidor indisponível. Verifique se o NUTRIQ está em execução." };
            return null;
        }

        var dados = interpretar(xhr.responseText);
        if (xhr.status === 401 && !publica) irParaLogin();

        if (xhr.status < 200 || xhr.status >= 300) {
            ultimoErro = Object.assign({ status: xhr.status }, dados || { erro: "Erro inesperado." });
            return null;
        }

        ultimoErro = null;
        if (metodo === "GET") {
            cache[url] = { texto: xhr.responseText || "null", expira: Date.now() + VALIDADE_CACHE_MS };
        } else {
            limparCache();
        }
        return dados;
    }

    function requisitarAsync(metodo, url, corpo) {
        var opcoes = {
            method: metodo,
            credentials: "same-origin",
            headers: { Accept: "application/json" }
        };
        if (corpo !== undefined) {
            opcoes.headers["Content-Type"] = "application/json";
            opcoes.body = JSON.stringify(corpo);
        }
        return fetch("/api" + url, opcoes).then(function (resposta) {
            return resposta.text().then(function (texto) {
                if (metodo !== "GET") limparCache();
                return { ok: resposta.ok, status: resposta.status, dados: interpretar(texto) };
            });
        }, function () {
            return { ok: false, status: 0, dados: { erro: "Servidor indisponível. Verifique se o NUTRIQ está em execução." } };
        });
    }

    function avisarDados() {
        try { global.dispatchEvent(new CustomEvent("nutriqDadosAtualizados")); } catch (e) {   }
    }

    function alterar(metodo, url, corpo) {
        var resultado = requisitar(metodo, url, corpo);
        if (resultado !== null) avisarDados();
        return resultado;
    }

    function espelharPreferencias(perfil) {
        if (!perfil || !perfil.preferencias) return;
        try { global.localStorage.setItem(CHAVE_PREFERENCIAS, JSON.stringify(perfil.preferencias)); } catch (e) {   }
    }

    function importarLegado() {
        var legado = null;
        try { legado = JSON.parse(global.localStorage.getItem(CHAVE_LEGADA)); } catch (e) { legado = null; }
        if (!legado || typeof legado !== "object") return;
        var resultado = requisitar("POST", "/importar", legado);
        if (resultado) {
            try { global.localStorage.removeItem(CHAVE_LEGADA); } catch (e) {   }
            if (resultado.importado) avisarDados();
        }
    }

    function carregarSessao() {
        var dados = requisitar("GET", "/auth/sessao");
        if (!dados) return false;
        estado.usuario = dados.usuario;
        estado.perfil = dados.perfil;
        espelharPreferencias(estado.perfil);
        return true;
    }

    function consulta(parametros) {
        var partes = [];
        Object.keys(parametros || {}).forEach(function (chave) {
            var valor = parametros[chave];
            if (valor !== undefined && valor !== null && valor !== "") {
                partes.push(encodeURIComponent(chave) + "=" + encodeURIComponent(valor));
            }
        });
        return partes.length ? "?" + partes.join("&") : "";
    }

    function id(valor) {
        return encodeURIComponent(String(valor || ""));
    }

    var api = {
        modoDemonstracao: function () { return false; },
        erro: function () { return ultimoErro; },
        mensagemErro: function (padrao) { return (ultimoErro && ultimoErro.erro) || padrao; },
        limparCache: limparCache,

        usuario: function () { return estado.usuario ? JSON.parse(JSON.stringify(estado.usuario)) : null; },
        perfil: function () { return estado.perfil ? JSON.parse(JSON.stringify(estado.perfil)) : {}; },

        salvarPerfil: function (dados) {
            var perfil = requisitar("PUT", "/perfil", dados);
            if (!perfil) return { ok: false, erro: api.mensagemErro("Não foi possível salvar o perfil."), campo: ultimoErro && ultimoErro.campo };
            estado.perfil = perfil;
            espelharPreferencias(perfil);
            try { global.dispatchEvent(new CustomEvent("nutriqPerfilAtualizado")); } catch (e) {   }
            return { ok: true, perfil: JSON.parse(JSON.stringify(perfil)) };
        },

        alterarSenha: function (senhaAtual, novaSenha) {
            var r = requisitar("PUT", "/auth/senha", { senhaAtual: senhaAtual, novaSenha: novaSenha });
            return r ? { ok: true } : { ok: false, erro: api.mensagemErro("Não foi possível alterar a senha.") };
        },

        entrar: function (email, senha, lembrar) {
            return requisitarAsync("POST", "/auth/entrar", { email: email, senha: senha, lembrar: lembrar });
        },
        cadastrar: function (dados) { return requisitarAsync("POST", "/auth/cadastro", dados); },
        recuperarSenha: function (email) { return requisitarAsync("POST", "/auth/recuperar-senha", { email: email }); },
        redefinirSenha: function (token, senha) { return requisitarAsync("POST", "/auth/redefinir-senha", { token: token, senha: senha }); },
        sair: function () {
            requisitarAsync("POST", "/auth/sair").then(function () {
                estado.usuario = null;
                estado.perfil = null;
                try { global.sessionStorage.clear(); } catch (e) {   }
                global.location.replace("index.html");
            });
        },

        pacientes: {
            listar: function (filtros) { return requisitar("GET", "/pacientes" + consulta(filtros)) || []; },
            obter: function (pacienteId) { return pacienteId ? requisitar("GET", "/pacientes/" + id(pacienteId)) : null; },
            criar: function (dados) { return alterar("POST", "/pacientes", dados); },
            atualizar: function (pacienteId, dados) { return alterar("PUT", "/pacientes/" + id(pacienteId), dados); },
            excluir: function (pacienteId) { return alterar("DELETE", "/pacientes/" + id(pacienteId)); },
            vinculos: function (pacienteId) { return requisitar("GET", "/pacientes/" + id(pacienteId) + "/vinculos") || { planos: 0, consultas: 0 }; },
            adicionarAvaliacao: function (pacienteId, dados) { return alterar("POST", "/pacientes/" + id(pacienteId) + "/avaliacoes", dados); },
            removerAvaliacao: function (pacienteId, avaliacaoId) {
                return alterar("DELETE", "/pacientes/" + id(pacienteId) + "/avaliacoes/" + id(avaliacaoId)) !== null;
            }
        },

        avaliacoes: {
            listar: function () { return requisitar("GET", "/avaliacoes") || []; },
            atualizar: function (avaliacaoId, dados) { return alterar("PUT", "/avaliacoes/" + id(avaliacaoId), dados); },
            excluir: function (avaliacaoId) { return alterar("DELETE", "/avaliacoes/" + id(avaliacaoId)) !== null; }
        },

        planos: {
            listar: function (filtros) { return requisitar("GET", "/planos" + consulta(filtros)) || []; },
            obter: function (planoId) { return requisitar("GET", "/planos/" + id(planoId)); },
            criar: function (dados) { return alterar("POST", "/planos", dados); },
            atualizar: function (planoId, dados) { return alterar("PUT", "/planos/" + id(planoId), dados); },
            excluir: function (planoId) { return alterar("DELETE", "/planos/" + id(planoId)) !== null; },
            enviar: function (planoId) { return requisitarAsync("POST", "/planos/" + id(planoId) + "/enviar"); }
        },

        consultas: {
            listar: function (filtros) { return requisitar("GET", "/consultas" + consulta(filtros)) || []; },
            obter: function (consultaId) { return consultaId ? requisitar("GET", "/consultas/" + id(consultaId)) : null; },
            criar: function (dados) { return alterar("POST", "/consultas", dados); },
            atualizar: function (consultaId, dados) { return alterar("PUT", "/consultas/" + id(consultaId), dados); },
            excluir: function (consultaId) { return alterar("DELETE", "/consultas/" + id(consultaId)) !== null; },
            conflito: function (data, hora, ignorarId) {
                var r = requisitar("GET", "/consultas/conflito" + consulta({ data: data, hora: hora, ignorar: ignorarId }));
                return Boolean(r && r.conflito);
            }
        },

        dashboard: function () { return requisitar("GET", "/dashboard"); },
        notificacoes: function () { return requisitar("GET", "/notificacoes") || { itens: [], naoLidas: 0 }; },
        marcarNotificacoes: function (chaves) { return requisitar("POST", "/notificacoes/lidas", { chaves: chaves }) !== null; },
        relatorio: function (pacienteId) { return requisitar("GET", "/relatorios/" + id(pacienteId)); },
        enviarRelatorio: function (pacienteId) { return requisitarAsync("POST", "/relatorios/" + id(pacienteId) + "/enviar"); },
        calcular: function (tipo, dados) { return requisitar("POST", "/calculos/" + id(tipo), dados); }
    };

    if (global.location.protocol === "file:") {
        if (!publica) {
            document.addEventListener("DOMContentLoaded", function () {
                document.body.innerHTML = '<p style="font:16px sans-serif;padding:32px">Abra o NUTRIQ pelo arquivo <strong>iniciar.bat</strong> e acesse http://localhost:3000.</p>';
            });
        }
    } else if (!publica) {
        if (carregarSessao()) {
            importarLegado();
        } else {
            irParaLogin();
        }

        document.addEventListener("visibilitychange", function () {
            if (document.visibilityState === "visible" && estado.usuario) {
                limparCache();
                avisarDados();
            }
        });
    }

    global.NutriqApi = api;
})(window);
