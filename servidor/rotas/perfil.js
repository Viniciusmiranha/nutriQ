"use strict";

const express = require("express");
const contas = require("../servicos/contas");
const { assincrono } = require("../utils/erros");

const rotas = express.Router();

rotas.get("/", assincrono(async (req, res) => {
    res.json(await contas.obterPerfil(req.usuario.id));
}));

rotas.put("/", assincrono(async (req, res) => {
    res.json(await contas.atualizarPerfil(req.usuario.id, req.body));
}));

rotas.put("/preferencias", assincrono(async (req, res) => {
    res.json(await contas.atualizarPerfil(req.usuario.id, { preferencias: req.body }));
}));

rotas.put("/foto", assincrono(async (req, res) => {
    res.json(await contas.atualizarPerfil(req.usuario.id, { foto: req.body.foto }));
}));

rotas.delete("/foto", assincrono(async (req, res) => {
    res.json(await contas.atualizarPerfil(req.usuario.id, { foto: null }));
}));

module.exports = rotas;
