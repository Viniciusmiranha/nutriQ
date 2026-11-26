"use strict";

const crypto = require("node:crypto");
const { promisify } = require("node:util");

const scrypt = promisify(crypto.scrypt);
const PARAMETROS = { N: 16384, r: 8, p: 1 };
const TAMANHO = 64;

async function gerarHash(senha) {
    const salt = crypto.randomBytes(16);
    const hash = await scrypt(String(senha), salt, TAMANHO, PARAMETROS);
    return ["scrypt", PARAMETROS.N, PARAMETROS.r, PARAMETROS.p, salt.toString("base64"), hash.toString("base64")].join("$");
}

async function conferir(senha, armazenado) {
    const partes = String(armazenado || "").split("$");
    if (partes.length !== 6 || partes[0] !== "scrypt") return false;
    const [, N, r, p, salt, hash] = partes;
    const esperado = Buffer.from(hash, "base64");
    const calculado = await scrypt(String(senha), Buffer.from(salt, "base64"), esperado.length, {
        N: Number(N), r: Number(r), p: Number(p)
    });
    return esperado.length === calculado.length && crypto.timingSafeEqual(esperado, calculado);
}

function validarForca(senha) {
    const valor = String(senha || "");
    if (valor.length < 6) return "A senha deve ter pelo menos 6 caracteres.";
    if (valor.length > 128) return "A senha deve ter no máximo 128 caracteres.";
    return null;
}

function gerarToken() {
    const token = crypto.randomBytes(32).toString("base64url");
    return { token, hash: hashToken(token) };
}

function hashToken(token) {
    return crypto.createHash("sha256").update(String(token)).digest("hex");
}

module.exports = { gerarHash, conferir, validarForca, gerarToken, hashToken };
