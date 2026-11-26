"use strict";

const { ErroApi, muitasTentativas } = require("../utils/erros");

function cabecalhos(req, res, next) {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Referrer-Policy", "same-origin");
    next();
}

function mesmaOrigem(req, res, next) {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    const origem = req.headers.origin;
    if (!origem) return next();
    try {
        if (new URL(origem).host === req.headers.host) return next();
    } catch {}
    next(new ErroApi(403, "Origem da requisição não autorizada.", null, "ORIGEM_INVALIDA"));
}

function limitarTentativas({ janelaMinutos, maximo, chave }) {
    const registros = new Map();
    const janela = janelaMinutos * 60 * 1000;

    setInterval(() => {
        const agora = Date.now();
        registros.forEach((valor, k) => {
            if (valor.inicio + janela < agora) registros.delete(k);
        });
    }, janela).unref();

    return (req, res, next) => {
        const id = `${req.ip}|${chave ? chave(req) : ""}`;
        const agora = Date.now();
        const registro = registros.get(id);
        if (!registro || registro.inicio + janela < agora) {
            registros.set(id, { inicio: agora, total: 1 });
            return next();
        }
        registro.total += 1;
        if (registro.total > maximo) {
            const minutos = Math.ceil((registro.inicio + janela - agora) / 60000);
            return next(muitasTentativas(`Muitas tentativas. Aguarde ${minutos} minuto(s) e tente novamente.`));
        }
        next();
    };
}

module.exports = { cabecalhos, mesmaOrigem, limitarTentativas };
