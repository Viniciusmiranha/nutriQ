"use strict";

const express = require("express");
const pacientes = require("../servicos/pacientes");
const avaliacoes = require("../servicos/avaliacoes");
const relatorios = require("../servicos/relatorios");
const { assincrono } = require("../utils/erros");

const rotas = express.Router();

rotas.get("/", assincrono(async (req, res) => {
    res.json(await pacientes.listar(req.usuario.id, { busca: req.query.busca, status: req.query.status }));
}));

rotas.post("/", assincrono(async (req, res) => {
    res.status(201).json(await pacientes.criar(req.usuario.id, req.body));
}));

rotas.get("/:id", assincrono(async (req, res) => {
    res.json(await pacientes.exigir(req.usuario.id, req.params.id));
}));

rotas.put("/:id", assincrono(async (req, res) => {
    res.json(await pacientes.atualizar(req.usuario.id, req.params.id, req.body));
}));

rotas.delete("/:id", assincrono(async (req, res) => {
    res.json(await pacientes.excluir(req.usuario.id, req.params.id));
}));

rotas.get("/:id/vinculos", assincrono(async (req, res) => {
    res.json(await pacientes.vinculos(req.usuario.id, req.params.id));
}));

rotas.get("/:id/avaliacoes", assincrono(async (req, res) => {
    res.json(await avaliacoes.listar(req.usuario.id, req.params.id));
}));

rotas.post("/:id/avaliacoes", assincrono(async (req, res) => {
    const nova = await avaliacoes.criar(req.usuario.id, req.params.id, req.body);
    if (req.body.enviarEmail !== false) {
        relatorios.enviarAvaliacao(req.usuario.id, req.params.id, nova.id, { automatico: true })
            .catch(erro => console.error("Falha no envio automático da avaliação:", erro.message));
    }
    res.status(201).json(nova);
}));

rotas.delete("/:id/avaliacoes/:avaliacaoId", assincrono(async (req, res) => {
    await avaliacoes.excluir(req.usuario.id, req.params.avaliacaoId, req.params.id);
    res.json({ ok: true });
}));

rotas.post("/:id/avaliacoes/:avaliacaoId/enviar", assincrono(async (req, res) => {
    res.json(await relatorios.enviarAvaliacao(req.usuario.id, req.params.id, req.params.avaliacaoId));
}));

module.exports = rotas;
