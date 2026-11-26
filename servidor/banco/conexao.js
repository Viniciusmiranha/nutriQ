"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn, execFileSync } = require("node:child_process");
const mysql = require("mysql2/promise");
const config = require("../config");

let pool = null;
let processoLocal = null;
let credenciaisLocais = null;

const OPCOES_BASE = {
    charset: "utf8mb4",
    dateStrings: true,
    decimalNumbers: true,
    supportBigNumbers: true,
    timezone: "local"
};

function caminhoCurto(caminho) {
    if (process.platform !== "win32" || /^[\x00-\x7F]*$/.test(caminho)) return caminho;
    try {
        const saida = execFileSync("cmd.exe", ["/d", "/c", `for %I in ("${caminho}") do @echo %~sI`], { encoding: "utf8" });
        const curto = saida.trim().split(/\r?\n/).pop();
        return curto && fs.existsSync(curto) ? curto : caminho;
    } catch {
        return caminho;
    }
}

function localizarMysqld() {
    if (config.banco.mysqld && fs.existsSync(config.banco.mysqld)) return config.banco.mysqld;
    const candidatos = [];
    ["C:\\Program Files\\MySQL", "C:\\Program Files (x86)\\MySQL"].forEach(base => {
        if (!fs.existsSync(base)) return;
        fs.readdirSync(base)
            .filter(nome => /^MySQL Server/i.test(nome))
            .forEach(nome => candidatos.push(path.join(base, nome, "bin", "mysqld.exe")));
    });
    ["C:\\xampp\\mysql\\bin\\mysqld.exe", "C:\\laragon\\bin\\mysql\\mysqld.exe"].forEach(c => candidatos.push(c));
    const encontrados = candidatos.filter(c => fs.existsSync(c)).sort().reverse();
    if (!encontrados.length) {
        throw new Error("MySQL não encontrado. Instale o MySQL Server ou informe MYSQL_HOST no arquivo .env.");
    }
    return encontrados[0];
}

function lerCredenciais() {
    const arquivo = path.join(config.banco.pastaLocal, "..", "credenciais-mysql.json");
    if (fs.existsSync(arquivo)) return JSON.parse(fs.readFileSync(arquivo, "utf8"));
    const novas = {
        root: crypto.randomBytes(18).toString("base64url"),
        app: crypto.randomBytes(18).toString("base64url")
    };
    fs.mkdirSync(path.dirname(arquivo), { recursive: true });
    fs.writeFileSync(arquivo, JSON.stringify(novas));
    return novas;
}

function esperar(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function tentarConectar(opcoes, tentativas = 1, intervalo = 500) {
    for (let i = 0; i < tentativas; i++) {
        try {
            const conexao = await mysql.createConnection(Object.assign({}, OPCOES_BASE, opcoes));
            return conexao;
        } catch (erro) {
            if (i === tentativas - 1) throw erro;
            await esperar(intervalo);
        }
    }
    return null;
}

async function iniciarLocal() {
    const porta = config.banco.portaLocal;
    credenciaisLocais = lerCredenciais();

    const jaAtivo = await tentarConectar({ host: "127.0.0.1", port: porta, user: "root", password: credenciaisLocais.root }).catch(() => null);
    if (jaAtivo) {
        await jaAtivo.end();
        return { host: "127.0.0.1", port: porta, user: "nutriq", password: credenciaisLocais.app, database: config.banco.nome };
    }

    const mysqld = localizarMysqld();
    const baseDir = path.resolve(path.dirname(mysqld), "..");
    fs.mkdirSync(path.dirname(config.banco.pastaLocal), { recursive: true });
    const dadosDir = caminhoCurto(path.dirname(config.banco.pastaLocal)) + path.sep + path.basename(config.banco.pastaLocal);
    const primeiraVez = !fs.existsSync(path.join(config.banco.pastaLocal, "mysql"));

    if (primeiraVez) {
        console.log("  Preparando o banco MySQL pela primeira vez...");
        if (fs.existsSync(config.banco.pastaLocal)) fs.rmSync(config.banco.pastaLocal, { recursive: true, force: true });
        execFileSync(mysqld, [`--basedir=${baseDir}`, `--datadir=${dadosDir}`, "--initialize-insecure", "--console"], { stdio: "ignore" });
    }

    const argumentos = [
        `--basedir=${baseDir}`,
        `--datadir=${dadosDir}`,
        `--port=${porta}`,
        "--bind-address=127.0.0.1",
        "--mysqlx=OFF",
        "--character-set-server=utf8mb4",
        "--collation-server=utf8mb4_unicode_ci",
        "--console"
    ];
    processoLocal = spawn(mysqld, argumentos, { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
    let saidaErro = "";
    processoLocal.stderr.on("data", parte => { saidaErro = (saidaErro + parte.toString()).slice(-4000); });
    processoLocal.on("exit", () => { processoLocal = null; });

    const root = await tentarConectar(
        { host: "127.0.0.1", port: porta, user: "root", password: primeiraVez ? "" : credenciaisLocais.root },
        60, 500
    ).catch(erro => {
        const detalhe = saidaErro.split(/\r?\n/).filter(l => /ERROR/i.test(l)).slice(-2).join(" ");
        throw new Error(`Não foi possível iniciar o MySQL local. ${detalhe || erro.message}`);
    });

    try {
        if (primeiraVez) {
            await root.query("ALTER USER 'root'@'localhost' IDENTIFIED BY ?", [credenciaisLocais.root]);
        }
        await root.query(`CREATE DATABASE IF NOT EXISTS \`${config.banco.nome}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
        for (const host of ["localhost", "127.0.0.1"]) {
            await root.query("CREATE USER IF NOT EXISTS 'nutriq'@? IDENTIFIED BY ?", [host, credenciaisLocais.app]);
            await root.query(`GRANT ALL PRIVILEGES ON \`${config.banco.nome}\`.* TO 'nutriq'@?`, [host]);
        }
    } finally {
        await root.end();
    }

    return { host: "127.0.0.1", port: porta, user: "nutriq", password: credenciaisLocais.app, database: config.banco.nome };
}

async function aplicarSchema(acesso) {
    const conexao = await tentarConectar(Object.assign({}, acesso, { multipleStatements: true }));
    try {
        const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
        await conexao.query(schema);
    } finally {
        await conexao.end();
    }
}

async function conectar() {
    if (config.modoSemBanco || config.modoDemonstracao) {
        return { externo: false, descricao: "desativado" };
    }

    const externo = Boolean(config.banco.host);
    let acesso;

    if (externo) {
        acesso = {
            host: config.banco.host,
            port: config.banco.porta,
            user: config.banco.usuario,
            password: config.banco.senha,
            database: config.banco.nome
        };
        const admin = await tentarConectar(Object.assign({}, acesso, { database: undefined }));
        await admin.query(`CREATE DATABASE IF NOT EXISTS \`${config.banco.nome}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`).catch(() => {});
        await admin.end();
    } else {
        acesso = await iniciarLocal();
    }

    await aplicarSchema(acesso);
    pool = mysql.createPool(Object.assign({}, OPCOES_BASE, acesso, { connectionLimit: 10, waitForConnections: true }));

    return { externo, descricao: externo ? `${acesso.host}:${acesso.port}/${acesso.database}` : `local em ${path.relative(config.raiz, config.banco.pastaLocal)}` };
}

function normalizarResultado(resultado) {
    const [linhas] = resultado;
    if (Array.isArray(linhas)) return { rows: linhas, rowCount: linhas.length };
    return { rows: [], rowCount: linhas.affectedRows, insertId: linhas.insertId };
}

async function consultar(texto, parametros = []) {
    return normalizarResultado(await pool.query(texto, parametros));
}

async function transacao(funcao) {
    const conexao = await pool.getConnection();
    const cliente = {
        query: async (texto, parametros = []) => normalizarResultado(await conexao.query(texto, parametros))
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
    if (pool) await pool.end().catch(() => {});
    pool = null;
    if (processoLocal && credenciaisLocais) {
        const root = await tentarConectar({
            host: "127.0.0.1", port: config.banco.portaLocal, user: "root", password: credenciaisLocais.root
        }).catch(() => null);
        if (root) {
            await root.query("SHUTDOWN").catch(() => {});
            await root.end().catch(() => {});
        }
        for (let i = 0; i < 40 && processoLocal; i++) await esperar(250);
        if (processoLocal) processoLocal.kill();
    }
}

module.exports = { conectar, consultar, transacao, desconectar };
