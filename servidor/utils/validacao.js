"use strict";

const crypto = require("node:crypto");
const { requisicaoInvalida } = require("./erros");

function novoId() {
    return crypto.randomUUID();
}

const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const REGEX_HORA = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function texto(valor, limite = 500) {
    return String(valor == null ? "" : valor).replace(/\s+/g, " ").trim().slice(0, limite);
}

function textoLongo(valor, limite = 4000) {
    return String(valor == null ? "" : valor).trim().slice(0, limite);
}

function soDigitos(valor) {
    return String(valor == null ? "" : valor).replace(/\D/g, "");
}

function numero(valor) {
    if (valor === "" || valor == null) return null;
    const n = Number(String(valor).replace(",", "."));
    return Number.isFinite(n) ? n : NaN;
}

function cpfValido(valor) {
    const cpf = soDigitos(valor);
    if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
    for (let t = 9; t <= 10; t++) {
        let soma = 0;
        for (let i = 0; i < t; i++) soma += Number(cpf.charAt(i)) * (t + 1 - i);
        if ((soma * 10) % 11 % 10 !== Number(cpf.charAt(t))) return false;
    }
    return true;
}

function formatarCpf(valor) {
    const d = soDigitos(valor);
    return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : "";
}

function emailValido(valor) {
    return REGEX_EMAIL.test(String(valor || "").trim());
}

function dataValida(valor) {
    const partes = String(valor || "").split("T")[0].match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!partes) return false;
    const [ano, mes, dia] = partes.slice(1).map(Number);
    const data = new Date(ano, mes - 1, dia);
    return data.getFullYear() === ano && data.getMonth() === mes - 1 && data.getDate() === dia;
}

function normalizarData(valor) {
    return String(valor || "").split("T")[0];
}

function horaValida(valor) {
    return REGEX_HORA.test(String(valor || ""));
}

function hojeISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function agoraLocal() {
    const d = new Date();
    const dois = n => String(n).padStart(2, "0");
    return `${hojeISO()} ${dois(d.getHours())}:${dois(d.getMinutes())}:${dois(d.getSeconds())}`;
}

function momento(data, hora) {
    const [ano, mes, dia] = normalizarData(data).split("-").map(Number);
    const [h, m] = String(hora || "00:00").split(":").map(Number);
    return new Date(ano, mes - 1, dia, h || 0, m || 0);
}

function uuidValido(valor) {
    return REGEX_UUID.test(String(valor || ""));
}

function exigirId(valor, mensagem = "Identificador inválido.") {
    if (!uuidValido(valor)) throw requisicaoInvalida(mensagem);
    return String(valor);
}

function noIntervalo(valor, minimo, maximo) {
    return valor != null && !Number.isNaN(valor) && valor >= minimo && valor <= maximo;
}

function normalizarTexto(valor) {
    return String(valor == null ? "" : valor).normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}

class Validador {
    constructor() {
        this.erros = [];
    }

    falha(campo, mensagem) {
        this.erros.push({ campo, mensagem });
    }

    verificar() {
        if (this.erros.length) {
            const erro = requisicaoInvalida(this.erros[0].mensagem, this.erros[0].campo);
            erro.detalhes = this.erros;
            throw erro;
        }
    }
}

module.exports = {
    novoId,
    texto,
    textoLongo,
    soDigitos,
    numero,
    cpfValido,
    formatarCpf,
    emailValido,
    dataValida,
    normalizarData,
    horaValida,
    hojeISO,
    agoraLocal,
    momento,
    uuidValido,
    exigirId,
    noIntervalo,
    normalizarTexto,
    Validador
};
