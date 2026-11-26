"use strict";

const express = require("express");
const avaliacoes = require("../servicos/avaliacoes");
const { assincrono } = require("../utils/erros");

const rotas = express.Router();

rotas.get("/", assincrono(async (req, res) => {
    res.json(await avaliacoes.listarTodas(req.usuario.id));
}));

rotas.get("/:id", assincrono(async (req, res) => {
    res.json(await avaliacoes.obter(req.usuario.id, req.params.id));
}));

rotas.put("/:id", assincrono(async (req, res) => {
    res.json(await avaliacoes.atualizar(req.usuario.id, req.params.id, req.body));
}));

rotas.delete("/:id", assincrono(async (req, res) => {
    await avaliacoes.excluir(req.usuario.id, req.params.id);
    res.json({ ok: true });
}));

module.exports = rotas;
