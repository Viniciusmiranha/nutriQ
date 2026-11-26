"use strict";

(() => {
    const API = window.NutriqApi;

    function falhar(padrao) {
        throw new Error(API.mensagemErro(padrao));
    }

    function cadastrarPaciente(dadosPaciente) {
        return API.pacientes.criar(dadosPaciente) || falhar("Não foi possível cadastrar o paciente.");
    }

    function listarPacientes() {
        return API.pacientes.listar();
    }

    function buscarPaciente(id) {
        return API.pacientes.obter(id);
    }

    function editarPaciente(id, alteracoes) {
        return API.pacientes.atualizar(id, alteracoes) || falhar("Não foi possível atualizar o paciente.");
    }

    function excluirPaciente(id) {
        return API.pacientes.excluir(id) || falhar("Não foi possível excluir o paciente.");
    }

    function cadastrarPlano(plano) {
        return API.planos.criar(plano) || falhar("Não foi possível cadastrar o plano alimentar.");
    }

    function listarPlanos() {
        return API.planos.listar();
    }

    function cadastrarAvaliacao(avaliacao) {
        return API.pacientes.adicionarAvaliacao(avaliacao.pacienteId, avaliacao) || falhar("Não foi possível registrar a avaliação.");
    }

    function listarAvaliacoes() {
        return API.avaliacoes.listar();
    }

    function cadastrarConsulta(consulta) {
        return API.consultas.criar(consulta) || falhar("Não foi possível agendar a consulta.");
    }

    function listarConsultas() {
        return API.consultas.listar();
    }

    let ultimoResumo = null;

    function obterResumo() {
        ultimoResumo = API.dashboard() || {
            totalPacientes: 0,
            totalPlanos: 0,
            totalAvaliacoes: 0,
            totalConsultas: 0,
            taxaAdesao: null,
            pacientesRecentes: [],
            proximasConsultas: []
        };
        return ultimoResumo;
    }

    function calcularTaxaAdesao() {
        const resumo = API.dashboard();
        return resumo ? resumo.taxaAdesao : null;
    }

    window.NutriqDados = Object.assign(window.NutriqDados || {}, {
        cadastrarPaciente,
        listarPacientes,
        buscarPaciente,
        editarPaciente,
        excluirPaciente,

        cadastrarPlano,
        listarPlanos,

        cadastrarAvaliacao,
        listarAvaliacoes,

        cadastrarConsulta,
        listarConsultas,

        calcularTaxaAdesao,
        obterResumo
    });
})();
