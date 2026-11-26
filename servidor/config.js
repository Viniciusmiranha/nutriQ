"use strict";

const fs = require("node:fs");
const path = require("node:path");

const RAIZ = path.resolve(__dirname, "..");
const ARQUIVO_ENV = path.join(RAIZ, ".env");

if (fs.existsSync(ARQUIVO_ENV)) {
    process.loadEnvFile(ARQUIVO_ENV);
}

function inteiro(valor, padrao) {
    const n = Number.parseInt(valor, 10);
    return Number.isFinite(n) ? n : padrao;
}

function booleano(valor, padrao) {
    if (valor === undefined || valor === "") return padrao;
    return ["1", "true", "sim", "yes"].includes(String(valor).toLowerCase());
}

const porta = inteiro(process.env.PORT, 3000);

module.exports = {
    raiz: RAIZ,
    porta,
    host: process.env.HOST || "127.0.0.1",
    modoSemBanco: booleano(process.env.NUTRIQ_MODO_SEM_BANCO, false),
    modoDemonstracao: booleano(process.env.NUTRIQ_MODO_DEMO, false),
    urlPublica: (process.env.URL_PUBLICA || `http://localhost:${porta}`).replace(/\/+$/, ""),

    banco: {
        host: process.env.MYSQL_HOST || "",
        porta: inteiro(process.env.MYSQL_PORTA, 3306),
        usuario: process.env.MYSQL_USUARIO || "root",
        senha: process.env.MYSQL_SENHA || "",
        nome: process.env.MYSQL_BANCO || "nutriq",
        mysqld: process.env.MYSQLD_CAMINHO || "",
        pastaLocal: path.join(__dirname, "dados", "mysql"),
        portaLocal: inteiro(process.env.MYSQL_PORTA_LOCAL, 3307)
    },

    sessao: {
        cookie: "nutriq_sessao",
        horasSemLembrar: 12,
        diasLembrar: 30
    },

    email: {
        host: process.env.SMTP_HOST || "",
        porta: inteiro(process.env.SMTP_PORTA, 587),
        seguro: booleano(process.env.SMTP_SEGURO, false),
        usuario: process.env.SMTP_USUARIO || "",
        senha: process.env.SMTP_SENHA || "",
        remetente: process.env.EMAIL_REMETENTE || process.env.SMTP_USUARIO || "NUTRIQ <nao-responda@nutriq.local>",
        pastaTeste: path.join(__dirname, "emails")
    },

    lembretes: {
        intervaloMinutos: inteiro(process.env.LEMBRETE_INTERVALO_MIN, 10),
        antecedenciaHoras: inteiro(process.env.LEMBRETE_ANTECEDENCIA_H, 24)
    }
};
