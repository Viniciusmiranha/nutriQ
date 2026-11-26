"use strict";

const express = require("express");
const consultas = require("../servicos/consultas");
const relatorios = require("../servicos/relatorios");
const { assincrono } = require("../utils/erros");

const rotas = express.Router();

function enviarRelatorioAoConcluir(req, anterior, consulta) {
    if (consulta.status !== "realizada" || (anterior && anterior.status === "realizada")) return;
    relatorios.enviarRelatorio(req.usuario.id, consulta.pacienteId, { automatico: true })
        .catch(erro => console.error("Falha no envio automático do relatório:", erro.message));
}

rotas.get("/", assincrono(async (req, res) => {
    res.json(await consultas.listar(req.usuario.id, {
        pacienteId: req.query.paciente,
        status: req.query.status,
        periodo: req.query.periodo,
        de: req.query.de,
        ate: req.query.ate
    }));
}));

rotas.get("/conflito", assincrono(async (req, res) => {
    res.json({ conflito: await consultas.existeConflito(req.usuario.id, req.query.data, req.query.hora, req.query.ignorar) });
}));

rotas.get("/proximas", assincrono(async (req, res) => {
    const dias = Math.min(90, Math.max(1, Number(req.query.dias) || 7));
    res.json(await consultas.proximas(req.usuario.id, dias));
}));

rotas.post("/", assincrono(async (req, res) => {
    const consulta = await consultas.criar(req.usuario.id, req.body);
    enviarRelatorioAoConcluir(req, null, consulta);
    res.status(201).json(consulta);
}));

rotas.get("/:id", assincrono(async (req, res) => {
    res.json(await consultas.obter(req.usuario.id, req.params.id));
}));

rotas.put("/:id", assincrono(async (req, res) => {
    const { anterior, consulta } = await consultas.atualizar(req.usuario.id, req.params.id, req.body);
    enviarRelatorioAoConcluir(req, anterior, consulta);
    res.json(consulta);
}));

rotas.post("/:id/concluir", assincrono(async (req, res) => {
    const { anterior, consulta } = await consultas.atualizar(req.usuario.id, req.params.id, { status: "realizada" });
    enviarRelatorioAoConcluir(req, anterior, consulta);
    res.json(consulta);
}));

rotas.post("/:id/cancelar", assincrono(async (req, res) => {
    const { consulta } = await consultas.atualizar(req.usuario.id, req.params.id, { status: "cancelada" });
    res.json(consulta);
}));

rotas.delete("/:id", assincrono(async (req, res) => {
    await consultas.excluir(req.usuario.id, req.params.id);
    res.json({ ok: true });
}));

module.exports = rotas;
