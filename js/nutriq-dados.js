(function (global) {
    "use strict";

    var API = global.NutriqApi;
    var ouvintes = [];

    function avisarMudanca() {
        ouvintes.forEach(function (fn) {
            try { fn(); } catch (e) {   }
        });
    }

    function aoMudar(fn) {
        if (typeof fn === "function") ouvintes.push(fn);
    }

    global.addEventListener("nutriqDadosAtualizados", avisarMudanca);

function escapar(texto) {
        return String(texto == null ? "" : texto)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function normalizar(texto) {
        return String(texto == null ? "" : texto)
            .normalize("NFD")
            .replace(/[̀-ͯ]/g, "")
            .trim()
            .toLowerCase();
    }

    function lerISO(valor) {
        if (valor instanceof Date) return isNaN(valor) ? null : valor;
        var p = String(valor || "").split("T")[0].split("-");
        if (p.length !== 3) return null;
        var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
        var confere = d.getFullYear() === Number(p[0]) &&
            d.getMonth() === Number(p[1]) - 1 &&
            d.getDate() === Number(p[2]);
        return confere ? d : null;
    }

    function paraISO(d) {
        var m = String(d.getMonth() + 1).padStart(2, "0");
        var dia = String(d.getDate()).padStart(2, "0");
        return d.getFullYear() + "-" + m + "-" + dia;
    }

    function hojeISO() {
        return paraISO(new Date());
    }

    function formatarData(valor) {
        var d = null;
        if (typeof valor === "string" && valor.indexOf("T") !== -1) {
            var completa = new Date(valor);
            d = isNaN(completa) ? null : completa;
        } else {
            d = lerISO(valor);
        }
        return d ? d.toLocaleDateString("pt-BR") : "—";
    }

    function momento(data, hora) {
        var d = lerISO(data);
        if (!d) return null;
        var h = String(hora || "00:00").split(":");
        return new Date(d.getFullYear(), d.getMonth(), d.getDate(), Number(h[0]) || 0, Number(h[1]) || 0);
    }

    function idade(paciente) {
        var nasc = lerISO(paciente && paciente.nascimento);
        if (!nasc) return null;
        var hoje = new Date();
        var anos = hoje.getFullYear() - nasc.getFullYear();
        var fez = hoje.getMonth() > nasc.getMonth() ||
            (hoje.getMonth() === nasc.getMonth() && hoje.getDate() >= nasc.getDate());
        if (!fez) anos--;
        return anos >= 0 ? anos : null;
    }

    function imc(peso, altura) {
        var p = Number(peso);
        var a = Number(altura);
        if (!(p > 0) || !(a > 0)) return null;
        var metros = a > 3 ? a / 100 : a;
        return Math.round((p / (metros * metros)) * 10) / 10;
    }

    function classificarImc(valor) {
        if (valor == null) return "";
        if (valor < 18.5) return "Abaixo do peso";
        if (valor < 25) return "Peso normal";
        if (valor < 30) return "Sobrepeso";
        return "Obesidade";
    }

    function mascaraTelefone(valor) {
        var d = String(valor || "").replace(/\D/g, "").slice(0, 11);
        if (d.length <= 2) return d.length ? "(" + d : "";
        if (d.length <= 6) return "(" + d.slice(0, 2) + ") " + d.slice(2);
        if (d.length <= 10) return "(" + d.slice(0, 2) + ") " + d.slice(2, 6) + "-" + d.slice(6);
        return "(" + d.slice(0, 2) + ") " + d.slice(2, 7) + "-" + d.slice(7);
    }

    function emailValido(valor) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(valor || "").trim());
    }

    function parametro(nome) {
        try {
            return new URLSearchParams(global.location.search).get(nome);
        } catch (e) {
            return null;
        }
    }

    function limparParametros() {
        try {
            global.history.replaceState(null, "", global.location.pathname);
        } catch (e) {   }
    }

function toast(mensagem, tipo) {
        var area = document.getElementById("nutriqToast");
        if (!area) {
            area = document.createElement("div");
            area.id = "nutriqToast";
            area.setAttribute("role", "status");
            area.setAttribute("aria-live", "polite");
            document.body.appendChild(area);
        }
        area.className = "nq-toast is-visible" + (tipo === "erro" ? " is-error" : "");
        area.textContent = mensagem;
        clearTimeout(toast._t);
        toast._t = setTimeout(function () {
            area.classList.remove("is-visible");
        }, tipo === "erro" ? 4500 : 3000);
    }

var pilha = [];

    function focaveis(janela) {
        return Array.prototype.slice.call(janela.querySelectorAll(
            'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])'
        )).filter(function (e) { return e.offsetParent !== null; });
    }

    function abrirModal(sobreposicao, foco) {
        if (!sobreposicao || !sobreposicao.hidden) return;
        sobreposicao._focoAnterior = document.activeElement;
        sobreposicao.hidden = false;
        pilha.push(sobreposicao);
        document.body.classList.add("nq-modal-open");

        var alvo = typeof foco === "string" ? sobreposicao.querySelector(foco) : foco;
        if (!alvo) alvo = focaveis(sobreposicao)[0];
        if (alvo && alvo.focus) alvo.focus();
    }

    function fecharModal(sobreposicao) {
        if (!sobreposicao || sobreposicao.hidden) return;
        sobreposicao.hidden = true;
        pilha = pilha.filter(function (o) { return o !== sobreposicao; });
        if (!pilha.length) document.body.classList.remove("nq-modal-open");
        var anterior = sobreposicao._focoAnterior;
        if (anterior && document.contains(anterior) && anterior.focus) anterior.focus();
    }

    document.addEventListener("keydown", function (e) {
        var topo = pilha[pilha.length - 1];
        if (!topo) return;

        if (e.key === "Escape") {
            fecharModal(topo);
            return;
        }

        if (e.key === "Tab") {
            var itens = focaveis(topo);
            if (!itens.length) return;
            var primeiro = itens[0];
            var ultimo = itens[itens.length - 1];
            if (e.shiftKey && document.activeElement === primeiro) {
                e.preventDefault();
                ultimo.focus();
            } else if (!e.shiftKey && document.activeElement === ultimo) {
                e.preventDefault();
                primeiro.focus();
            }
        }
    });

    document.addEventListener("mousedown", function (e) {
        var topo = pilha[pilha.length - 1];
        if (topo && e.target === topo) fecharModal(topo);
    });

    function comAviso(resultado) {
        return resultado === false ? null : resultado;
    }

    var pacientes = {
        listar: function () { return API.pacientes.listar(); },
        obter: function (id) { return API.pacientes.obter(id); },
        criar: function (dados) { return comAviso(API.pacientes.criar(dados)); },
        atualizar: function (id, dados) { return comAviso(API.pacientes.atualizar(id, dados)); },
        excluir: function (id) { return comAviso(API.pacientes.excluir(id)); },
        vinculos: function (id) { return API.pacientes.vinculos(id); },
        adicionarAvaliacao: function (id, avaliacao) {
            return comAviso(API.pacientes.adicionarAvaliacao(id, avaliacao));
        },
        removerAvaliacao: function (id, avaliacaoId) {
            return comAviso(API.pacientes.removerAvaliacao(id, avaliacaoId));
        }
    };

    var planos = {
        listar: function () { return API.planos.listar(); },
        obter: function (id) { return API.planos.obter(id); },
        criar: function (dados) { return comAviso(API.planos.criar(dados)); },
        atualizar: function (id, dados) { return comAviso(API.planos.atualizar(id, dados)); },
        excluir: function (id) { return comAviso(API.planos.excluir(id)); },
        doPaciente: function (pacienteId) { return API.planos.listar({ paciente: pacienteId }); },
        enviar: function (id) { return API.planos.enviar(id); }
    };

    var consultas = {
        listar: function () { return API.consultas.listar(); },
        obter: function (id) { return API.consultas.obter(id); },
        criar: function (dados) { return API.consultas.criar(dados); },
        atualizar: function (id, dados) { return API.consultas.atualizar(id, dados); },
        excluir: function (id) { return comAviso(API.consultas.excluir(id)); },
        doPaciente: function (pacienteId) { return API.consultas.listar({ paciente: pacienteId }); },
        conflito: function (data, hora, ignorarId) { return API.consultas.conflito(data, hora, ignorarId); }
    };

    global.NutriqDados = Object.assign(global.NutriqDados || {}, {
        pacientes: pacientes,
        planos: planos,
        consultas: consultas,
        aoMudar: aoMudar,
        toast: toast,
        abrirModal: abrirModal,
        fecharModal: fecharModal,
        util: {
            escapar: escapar,
            normalizar: normalizar,
            lerISO: lerISO,
            paraISO: paraISO,
            hojeISO: hojeISO,
            formatarData: formatarData,
            momento: momento,
            idade: idade,
            imc: imc,
            classificarImc: classificarImc,
            mascaraTelefone: mascaraTelefone,
            emailValido: emailValido,
            parametro: parametro,
            limparParametros: limparParametros
        }
    });
})(window);
