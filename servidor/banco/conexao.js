
"use strict";

const mysql = require("mysql2/promise");
const config = require("../config");

let pool = null;

const OPCOES_BASE = {
    charset: "utf8mb4",
    dateStrings: true,
    decimalNumbers: true,
    supportBigNumbers: true,
    timezone: "local"
};

async function conectar() {
    if (config.modoSemBanco || config.modoDemonstracao) {
        return { externo: false, descricao: "desativado" };
    }

    if (pool) {
        return {
            externo: true,
            descricao: `${config.banco.host}:${config.banco.porta}/${config.banco.nome}`
        };
    }

    const acesso = {
        host: config.banco.host,
        port: config.banco.porta,
        user: config.banco.usuario,
        password: config.banco.senha,
        database: config.banco.nome,
        ssl: {
            minVersion: "TLSv1.2"
        }
    };

    if (!acesso.host || !acesso.user || !acesso.password || !acesso.database) {
        throw new Error("Configuração do TiDB incompleta. Confira MYSQL_HOST, MYSQL_USUARIO, MYSQL_SENHA e MYSQL_BANCO no .env.");
    }

    pool = mysql.createPool({
        ...OPCOES_BASE,
        ...acesso,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        enableKeepAlive: true
    });

    try {
        await pool.query("SELECT 1");

        console.log("Conexão com o banco de dados estabelecida.");

        return {
            externo: true,
            descricao: `${acesso.host}:${acesso.port}/${acesso.database}`
        };
    } catch (erro) {
        await pool.end().catch(() => {});
        pool = null;

        throw new Error(`Não foi possível conectar ao TiDB Cloud: ${erro.message}`);
    }
}

function normalizarResultado(resultado) {
    const [linhas] = resultado;

    if (Array.isArray(linhas)) {
        return { rows: linhas, rowCount: linhas.length };
    }

    return {
        rows: [],
        rowCount: linhas.affectedRows,
        insertId: linhas.insertId
    };
}

async function consultar(texto, parametros = []) {
    if (!pool) {
        throw new Error("Banco de dados não conectado. Execute conectar() primeiro.");
    }

    return normalizarResultado(await pool.query(texto, parametros));
}

async function transacao(funcao) {
    if (!pool) {
        throw new Error("Banco de dados não conectado. Execute conectar() primeiro.");
    }

    const conexao = await pool.getConnection();

    const cliente = {
        query: async (texto, parametros = []) => {
            return normalizarResultado(
                await conexao.query(texto, parametros)
            );
        }
    };

    try {
        await conexao.beginTransaction();

        const resultado = await funcao(cliente);

        await conexao.commit();

        return resultado;
    } catch (erro) {
        await conexao.rollback().catch(() => {});
        throw erro;
    } finally {
        conexao.release();
    }
}

async function desconectar() {
    if (pool) {
        await pool.end().catch(() => {});
        pool = null;
    }
}

module.exports = {
    conectar,
    consultar,
    transacao,
    desconectar
};
