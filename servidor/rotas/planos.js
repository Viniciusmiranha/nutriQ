"use strict";

const express = require("express");
const planos = require("../servicos/planos");
const relatorios = require("../servicos/relatorios");
const { assincrono } = require("../utils/erros");

const rotas = express.Router();

rotas.get("/", assincrono(async (req, res) => {
    res.json(await planos.listar(req.usuario.id, { pacienteId: req.query.paciente, status: req.query.status }));
}));

rotas.post("/", assincrono(async (req, res) => {
    res.status(201).json(await planos.criar(req.usuario.id, req.body));
}));

rotas.get("/:id", assincrono(async (req, res) => {
    res.json(await planos.obter(req.usuario.id, req.params.id));
}));

rotas.put("/:id", assincrono(async (req, res) => {
    res.json(await planos.atualizar(req.usuario.id, req.params.id, req.body));
}));

rotas.delete("/:id", assincrono(async (req, res) => {
    await planos.excluir(req.usuario.id, req.params.id);
    res.json({ ok: true });
}));

rotas.post("/:id/enviar", assincrono(async (req, res) => {
    res.json(await relatorios.enviarPlano(req.usuario.id, req.params.id));
}));

module.exports = rotas;
