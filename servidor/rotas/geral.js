"use strict";

const express = require("express");
const dashboard = require("../servicos/dashboard");
const relatorios = require("../servicos/relatorios");
const consultas = require("../servicos/consultas");
const contas = require("../servicos/contas");
const calculos = require("../servicos/calculos");
const email = require("../servicos/email");
const importacao = require("../servicos/importacao");
const { assincrono, naoEncontrado } = require("../utils/erros");

const rotas = express.Router();

rotas.get("/dashboard", assincrono(async (req, res) => {
    res.json(await dashboard.resumo(req.usuario.id));
}));

rotas.get("/dashboard/adesao", assincrono(async (req, res) => {
    res.json({ taxaAdesao: await dashboard.taxaAdesao(req.usuario.id) });
}));

rotas.get("/relatorios/:pacienteId", assincrono(async (req, res) => {
    res.json(await relatorios.dadosDoRelatorio(req.usuario.id, req.params.pacienteId));
}));

rotas.post("/relatorios/:pacienteId/enviar", assincrono(async (req, res) => {
    res.json(await relatorios.enviarRelatorio(req.usuario.id, req.params.pacienteId));
}));

rotas.get("/notificacoes", assincrono(async (req, res) => {
    const proximas = await consultas.proximas(req.usuario.id, 7);
    const perfil = await contas.obterPerfil(req.usuario.id);
    const lidas = new Set(perfil.notificacoesLidas);
    const itens = proximas.map(c => {
        const chave = [c.id, c.data, c.hora].join("|");
        return { chave, lida: lidas.has(chave), consulta: c };
    });
    res.json({ itens, naoLidas: itens.filter(i => !i.lida).length });
}));

rotas.post("/notificacoes/lidas", assincrono(async (req, res) => {
    await contas.marcarNotificacoesLidas(req.usuario.id, req.body.chaves);
    res.json({ ok: true });
}));

const CALCULADORAS = {
    macros: calculos.calcularMacros,
    imc: calculos.calcularImc,
    agua: calculos.calcularAgua
};

rotas.post("/calculos/:tipo", (req, res, next) => {
    const calcular = CALCULADORAS[req.params.tipo];
    if (!calcular) return next(naoEncontrado("Calculadora não encontrada."));
    try {
        res.json(calcular(req.body));
    } catch (erro) {
        next(erro);
    }
});

rotas.get("/emails", assincrono(async (req, res) => {
    res.json({
        configurado: email.configurado,
        historico: await email.historico(req.usuario.id)
    });
}));

rotas.get("/emails/status", assincrono(async (req, res) => {
    res.json(await email.verificarConexao());
}));

rotas.post("/importar", assincrono(async (req, res) => {
    res.json(await importacao.importarLegado(req.usuario.id, req.body || {}));
}));

module.exports = rotas;
