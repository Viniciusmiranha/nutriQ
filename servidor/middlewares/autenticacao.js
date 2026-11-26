"use strict";

const config = require("../config");
const { consultar } = require("../banco/conexao");
const { hashToken } = require("../servicos/senhas");
const { naoAutorizado } = require("../utils/erros");

function lerCookies(req) {
    const cookies = {};
    String(req.headers.cookie || "").split(";").forEach(par => {
        const i = par.indexOf("=");
        if (i < 0) return;
        try {
            cookies[par.slice(0, i).trim()] = decodeURIComponent(par.slice(i + 1).trim());
        } catch {
            cookies[par.slice(0, i).trim()] = "";
        }
    });
    return cookies;
}

function tokenDaRequisicao(req) {
    return lerCookies(req)[config.sessao.cookie] || null;
}

async function carregarSessao(req, res, next) {
    req.usuario = null;
    req.tokenSessao = tokenDaRequisicao(req);
    if (!req.tokenSessao) return next();

    try {
        const { rows } = await consultar(
            `SELECT s.token_hash, s.persistente, s.expira_em, n.id, n.nome, n.email, n.crn
               FROM sessoes s
               JOIN nutricionistas n ON n.id = s.nutricionista_id
              WHERE s.token_hash = ? AND s.expira_em > NOW()`,
            [hashToken(req.tokenSessao)]
        );
        if (rows[0]) {
            req.usuario = { id: rows[0].id, nome: rows[0].nome, email: rows[0].email, crn: rows[0].crn, perfil: "nutricionista" };
            req.sessao = { hash: rows[0].token_hash, persistente: Boolean(rows[0].persistente) };
            if (!rows[0].persistente) {
                await consultar(
                    "UPDATE sessoes SET expira_em = DATE_ADD(NOW(), INTERVAL ? HOUR) WHERE token_hash = ?",
                    [config.sessao.horasSemLembrar, rows[0].token_hash]
                );
            }
        }
        next();
    } catch (erro) {
        next(erro);
    }
}

function exigirLogin(req, res, next) {
    if (!req.usuario) return next(naoAutorizado());
    next();
}

module.exports = { carregarSessao, exigirLogin, lerCookies };
