"use strict";

class ErroApi extends Error {
    constructor(status, mensagem, campo = null, codigo = null) {
        super(mensagem);
        this.status = status;
        this.campo = campo;
        this.codigo = codigo;
    }
}

const requisicaoInvalida = (mensagem, campo) => new ErroApi(400, mensagem, campo, "DADOS_INVALIDOS");
const naoAutorizado = (mensagem = "Sessão expirada. Entre novamente.", campo = null) => new ErroApi(401, mensagem, campo, "NAO_AUTORIZADO");
const naoEncontrado = (mensagem = "Registro não encontrado.") => new ErroApi(404, mensagem, null, "NAO_ENCONTRADO");
const conflito = (mensagem, campo) => new ErroApi(409, mensagem, campo, "CONFLITO");
const muitasTentativas = mensagem => new ErroApi(429, mensagem, null, "MUITAS_TENTATIVAS");

const assincrono = funcao => (req, res, next) => Promise.resolve(funcao(req, res, next)).catch(next);

module.exports = { ErroApi, requisicaoInvalida, naoAutorizado, naoEncontrado, conflito, muitasTentativas, assincrono };
