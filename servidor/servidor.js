"use strict";

const express = require("express");
const config = require("./config");
const banco = require("./banco/conexao");
const contas = require("./servicos/contas");
const lembretes = require("./servicos/lembretes");
const email = require("./servicos/email");
const { carregarSessao, exigirLogin } = require("./middlewares/autenticacao");
const { cabecalhos, mesmaOrigem } = require("./middlewares/seguranca");
const { ErroApi } = require("./utils/erros");

const app = express();
let bancoConectado = false;
const bancoDesativado = config.modoSemBanco || config.modoDemonstracao;

app.disable("x-powered-by");
app.set("trust proxy", "loopback");
app.use(cabecalhos);

const api = express.Router();
api.use(express.json({ limit: "3mb" }));
api.use(mesmaOrigem);
api.use((req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
});

api.get("/status", (req, res) => res.json({
    ok: true,
    email: email.configurado,
    modoDemonstracao: config.modoDemonstracao,
    modo: config.modoDemonstracao ? "demonstracao" : (config.modoSemBanco ? "sem-banco" : "mysql"),
    banco: { conectado: bancoConectado, modo: bancoConectado ? "mysql" : "desativado" }
}));
api.use((req, res, next) => {
    if (!bancoDesativado) return next();
    res.status(503).json({
        erro: config.modoDemonstracao
            ? "Esta rota pertence à API MySQL e não é usada no modo de demonstração."
            : "Esta operação requer o banco de dados, mas ele está desativado neste modo.",
        codigo: config.modoDemonstracao ? "API_MYSQL_DESATIVADA" : "BANCO_INDISPONIVEL"
    });
});
api.use(carregarSessao);
api.use("/auth", require("./rotas/auth"));
api.use(exigirLogin);
api.use("/perfil", require("./rotas/perfil"));
api.use("/pacientes", require("./rotas/pacientes"));
api.use("/avaliacoes", require("./rotas/avaliacoes"));
api.use("/planos", require("./rotas/planos"));
api.use("/consultas", require("./rotas/consultas"));
api.use("/", require("./rotas/geral"));

api.use((req, res) => {
    res.status(404).json({ erro: "Rota não encontrada.", codigo: "ROTA_INEXISTENTE" });
});

api.use((erro, req, res, next) => {
    if (res.headersSent) return next(erro);

    if (erro.type === "entity.parse.failed") {
        return res.status(400).json({ erro: "JSON inválido.", codigo: "JSON_INVALIDO" });
    }
    if (erro.type === "entity.too.large") {
        return res.status(413).json({ erro: "Os dados enviados são grandes demais.", codigo: "TAMANHO_EXCEDIDO" });
    }
    if (erro instanceof ErroApi || (erro.status && erro.status < 600 && erro.codigo)) {
        return res.status(erro.status).json({
            erro: erro.message,
            campo: erro.campo || undefined,
            codigo: erro.codigo || undefined,
            detalhes: erro.detalhes || undefined
        });
    }
    if (erro.code === "ER_DUP_ENTRY") {
        return res.status(409).json({ erro: "Registro duplicado.", codigo: "CONFLITO" });
    }
    if (["ER_CHECK_CONSTRAINT_VIOLATED", "ER_TRUNCATED_WRONG_VALUE", "ER_WRONG_VALUE", "ER_DATA_TOO_LONG",
        "ER_NO_REFERENCED_ROW_2", "ER_WARN_DATA_OUT_OF_RANGE"].includes(erro.code)) {
        return res.status(400).json({ erro: "Dados inválidos.", codigo: "DADOS_INVALIDOS" });
    }

    console.error(erro);
    res.status(500).json({ erro: "Erro interno do servidor.", codigo: "ERRO_INTERNO" });
});

app.use("/api", api);

const PROTEGIDOS = /^\/(servidor|node_modules|\.env|\.git|package(-lock)?\.json)(\/|$)|\.(bat|cmd|md|log|sql|eml)$/i;

app.use((req, res, next) => {
    let caminho = req.path;
    try { caminho = decodeURIComponent(caminho); } catch {}
    if (PROTEGIDOS.test(caminho) || caminho.split("/").some(parte => parte.startsWith("."))) {
        return res.status(404).type("text").send("Não encontrado");
    }
    next();
});

app.use(express.static(config.raiz, {
    index: "index.html",
    dotfiles: "deny",
    setHeaders: res => res.setHeader("Cache-Control", "no-cache")
}));

app.use((req, res) => res.status(404).type("text").send("Não encontrado"));

let servidor = null;
let encerrando = false;

async function encerrar(codigo = 0) {
    if (encerrando) return;
    encerrando = true;
    console.log("\n  Encerrando o NUTRIQ...");
    if (servidor) await new Promise(resolve => servidor.close(resolve));
    await banco.desconectar();
    process.exit(codigo);
}

["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"].forEach(sinal => {
    process.on(sinal, () => encerrar(0));
});

async function iniciar() {
    console.log("");
    console.log("  Iniciando o NUTRIQ...");
    let descricaoBanco = config.modoDemonstracao ? "desativado (demonstração localStorage)" : "desativado";
    if (!bancoDesativado) {
        const conexao = await banco.conectar();
        bancoConectado = true;
        descricaoBanco = `MySQL ${conexao.descricao}`;
        await contas.limparSessoes();
        setInterval(() => contas.limparSessoes().catch(() => {}), 60 * 60 * 1000).unref();
        lembretes.iniciar();
    }

    servidor = app.listen(config.porta, config.host, () => {
        console.log("");
        console.log("  NUTRIQ em execução");
        console.log(`  Endereço: ${config.urlPublica}`);
        console.log(`  Banco de dados: ${descricaoBanco}`);
        console.log(`  E-mail: ${email.configurado ? "SMTP configurado" : "modo de teste (mensagens salvas em servidor/emails)"}`);
        console.log("  Para encerrar, pressione Ctrl+C ou feche esta janela.");
        console.log("");
    });

    servidor.on("error", async erro => {
        if (erro.code === "EADDRINUSE") {
            console.error(`\n  A porta ${config.porta} já está em uso. Feche o outro programa ou defina outra porta em PORT no arquivo .env.`);
        } else {
            console.error(erro);
        }
        await encerrar(1);
    });
}

iniciar().catch(async erro => {
    console.error("\n  Não foi possível iniciar o NUTRIQ:", erro && erro.message ? erro.message : erro);
    await banco.desconectar();
    process.exit(1);
});
