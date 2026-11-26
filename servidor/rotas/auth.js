"use strict";

const express = require("express");
const config = require("../config");
const contas = require("../servicos/contas");
const { exigirLogin } = require("../middlewares/autenticacao");
const { limitarTentativas } = require("../middlewares/seguranca");
const { assincrono } = require("../utils/erros");

const rotas = express.Router();

const limiteLogin = limitarTentativas({ janelaMinutos: 15, maximo: 10, chave: req => String(req.body?.email || "").toLowerCase() });
const limiteCadastro = limitarTentativas({ janelaMinutos: 60, maximo: 10 });
const limiteRecuperacao = limitarTentativas({ janelaMinutos: 30, maximo: 5 });

function definirCookie(res, token, lembrar) {
    const opcoes = {
        httpOnly: true,
        sameSite: "lax",
        secure: config.urlPublica.startsWith("https://"),
        path: "/"
    };
    if (lembrar) opcoes.maxAge = config.sessao.diasLembrar * 24 * 60 * 60 * 1000;
    res.cookie(config.sessao.cookie, token, opcoes);
}

rotas.post("/cadastro", limiteCadastro, assincrono(async (req, res) => {
    const usuario = await contas.cadastrar(req.body);
    res.status(201).json({ usuario });
}));

rotas.post("/entrar", limiteLogin, assincrono(async (req, res) => {
    const usuario = await contas.autenticar(req.body.email, req.body.senha);
    const lembrar = req.body.lembrar !== false;
    const token = await contas.criarSessao(usuario.id, { lembrar, userAgent: req.headers["user-agent"] });
    definirCookie(res, token, lembrar);
    res.json({ usuario, perfil: await contas.obterPerfil(usuario.id) });
}));

rotas.post("/sair", assincrono(async (req, res) => {
    await contas.encerrarSessao(req.tokenSessao);
    res.clearCookie(config.sessao.cookie, { path: "/" });
    res.json({ ok: true });
}));

rotas.get("/sessao", exigirLogin, assincrono(async (req, res) => {
    res.json({ usuario: req.usuario, perfil: await contas.obterPerfil(req.usuario.id) });
}));

rotas.put("/senha", exigirLogin, assincrono(async (req, res) => {
    await contas.alterarSenha(req.usuario.id, req.body.senhaAtual, req.body.novaSenha, req.tokenSessao);
    res.json({ ok: true });
}));

rotas.post("/recuperar-senha", limiteRecuperacao, assincrono(async (req, res) => {
    const resultado = await contas.solicitarRecuperacao(req.body.email);
    if (resultado.status === "simulado") {
        console.log(`  E-mail de redefinição salvo em ${resultado.arquivo}`);
    }
    res.json({
        ok: true,
        mensagem: "Se o e-mail estiver cadastrado, enviaremos um link para criar uma nova senha."
    });
}));

rotas.post("/redefinir-senha", limiteRecuperacao, assincrono(async (req, res) => {
    await contas.redefinirSenha(req.body.token, req.body.senha);
    res.json({ ok: true });
}));

module.exports = rotas;
