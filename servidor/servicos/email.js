"use strict";

const fs = require("node:fs");
const path = require("node:path");
const nodemailer = require("nodemailer");
const config = require("../config");
const { consultar } = require("../banco/conexao");
const { emailValido, novoId } = require("../utils/validacao");
const { requisicaoInvalida } = require("../utils/erros");

const configurado = Boolean(config.email.host && config.email.usuario && config.email.senha);

const transporte = configurado
    ? nodemailer.createTransport({
        host: config.email.host,
        port: config.email.porta,
        secure: config.email.seguro,
        auth: { user: config.email.usuario, pass: config.email.senha }
    })
    : nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "windows" });

function escapar(texto) {
    return String(texto == null ? "" : texto)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function modelo(titulo, conteudo, assinatura) {
    return `<!doctype html>
<html lang="pt-BR">
<body style="margin:0;padding:24px;background:#f3f7f5;font-family:Arial,Helvetica,sans-serif;color:#273143">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e3ebe7">
    <div style="background:#087f68;color:#ffffff;padding:22px 28px">
      <div style="font-size:13px;letter-spacing:2px;font-weight:bold">NUTRIQ</div>
      <h1 style="margin:6px 0 0;font-size:21px">${escapar(titulo)}</h1>
    </div>
    <div style="padding:24px 28px;font-size:14px;line-height:1.6">${conteudo}</div>
    <div style="padding:16px 28px;background:#f7faf9;color:#5f6c78;font-size:12px">
      ${assinatura ? escapar(assinatura) + "<br>" : ""}Mensagem enviada pelo NUTRIQ. Em caso de dúvidas, responda diretamente ao seu nutricionista.
    </div>
  </div>
</body>
</html>`;
}

function textoSimples(html) {
    return String(html)
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<(br|\/p|\/tr|\/h\d|\/li|\/div)>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, "\"")
        .replace(/&#39;/g, "'")
        .replace(/[ \t]+/g, " ")
        .replace(/\n\s+/g, "\n")
        .trim();
}

async function registrar(dados) {
    await consultar(
        `INSERT INTO emails_enviados (id, nutricionista_id, paciente_id, tipo, destinatario, assunto, status, erro)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [novoId(), dados.nutricionistaId || null, dados.pacienteId || null, dados.tipo, dados.para, dados.assunto, dados.status, dados.erro || null]
    ).catch(erro => console.error("Não foi possível registrar o envio de e-mail:", erro.message));
}

async function enviar({ para, assunto, html, tipo, nutricionistaId, pacienteId, responderPara }) {
    if (!emailValido(para)) throw requisicaoInvalida("O destinatário não tem um e-mail válido cadastrado.", "email");

    const mensagem = {
        from: config.email.remetente,
        to: para,
        subject: assunto,
        html,
        text: textoSimples(html),
        replyTo: emailValido(responderPara) ? responderPara : undefined
    };

    try {
        const info = await transporte.sendMail(mensagem);
        let status = "enviado";
        let arquivo = null;

        if (!configurado) {
            status = "simulado";
            fs.mkdirSync(config.email.pastaTeste, { recursive: true });
            const nome = `${new Date().toISOString().replace(/[:.]/g, "-")}-${tipo}.eml`;
            arquivo = path.join(config.email.pastaTeste, nome);
            fs.writeFileSync(arquivo, info.message);
        }

        await registrar({ nutricionistaId, pacienteId, tipo, para, assunto, status });
        return { status, para, arquivo: arquivo ? path.relative(config.raiz, arquivo) : null };
    } catch (erro) {
        await registrar({ nutricionistaId, pacienteId, tipo, para, assunto, status: "falhou", erro: erro.message });
        const falha = new Error("Não foi possível enviar o e-mail. Verifique a configuração do servidor de e-mail.");
        falha.status = 502;
        falha.codigo = "FALHA_EMAIL";
        throw falha;
    }
}

function enviarEmSegundoPlano(dados) {
    enviar(dados).catch(erro => console.error(`Falha no envio automático (${dados.tipo}):`, erro.message));
}

async function verificarConexao() {
    if (!configurado) return { configurado: false };
    try {
        await transporte.verify();
        return { configurado: true, conectado: true };
    } catch (erro) {
        return { configurado: true, conectado: false, erro: erro.message };
    }
}

async function historico(nutricionistaId, limite = 30) {
    const { rows } = await consultar(
        `SELECT e.id, e.tipo, e.destinatario, e.assunto, e.status, e.erro,
                DATE_FORMAT(e.criado_em, '%Y-%m-%dT%H:%i:%s') AS criadoEm,
                p.nome AS paciente
           FROM emails_enviados e
           LEFT JOIN pacientes p ON p.id = e.paciente_id
          WHERE e.nutricionista_id = ?
          ORDER BY e.criado_em DESC
          LIMIT ?`,
        [nutricionistaId, limite]
    );
    return rows;
}

module.exports = { enviar, enviarEmSegundoPlano, verificarConexao, historico, modelo, escapar, configurado };
