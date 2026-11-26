"use strict";

const config = require("../config");
const { consultar, transacao } = require("../banco/conexao");
const v = require("../utils/validacao");
const senhas = require("./senhas");
const email = require("./email");
const { requisicaoInvalida, naoAutorizado, conflito, naoEncontrado } = require("../utils/erros");

const VALIDADE_RECUPERACAO_MIN = 60;
const HASH_FICTICIO = "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$" + "A".repeat(86) + "==";

async function cadastrar(dados) {
    const val = new v.Validador();
    const nome = v.texto(dados.nome, 120);
    const mail = v.texto(dados.email, 200).toLowerCase();
    const cpf = v.texto(dados.cpf, 14);
    const crn = v.texto(dados.crn, 40);

    if (nome.length < 3) val.falha("registerName", "Informe seu nome completo.");
    if (!v.emailValido(mail)) val.falha("registerEmail", "Digite um e-mail válido.");
    if (!v.cpfValido(cpf)) val.falha("registerCPF", "Digite um CPF válido.");
    if (crn.length < 4) val.falha("registerCRN", "Informe seu número de CRN.");
    const problemaSenha = senhas.validarForca(dados.senha);
    if (problemaSenha) val.falha("registerPassword", problemaSenha);
    val.verificar();

    const existe = await consultar("SELECT 1 FROM nutricionistas WHERE email = ?", [mail]);
    if (existe.rowCount) throw conflito("Já existe uma conta com este e-mail.", "registerEmail");

    const hash = await senhas.gerarHash(dados.senha);
    const id = v.novoId();
    await transacao(async cliente => {
        await cliente.query(
            "INSERT INTO nutricionistas (id, nome, email, cpf, crn, senha_hash) VALUES (?, ?, ?, ?, ?, ?)",
            [id, nome, mail, v.formatarCpf(cpf), crn, hash]
        );
        await cliente.query("INSERT INTO preferencias (nutricionista_id) VALUES (?)", [id]);
    });

    const { rows } = await consultar(
        "SELECT id, nome, email, crn, DATE_FORMAT(criado_em, '%Y-%m-%dT%H:%i:%s') AS criadoEm FROM nutricionistas WHERE id = ?",
        [id]
    );
    return Object.assign(rows[0], { perfil: "nutricionista" });
}

async function autenticar(mail, senha) {
    const { rows } = await consultar(
        "SELECT id, nome, email, crn, senha_hash FROM nutricionistas WHERE email = ?",
        [v.texto(mail, 200).toLowerCase()]
    );
    const usuario = rows[0];
    if (!usuario) {
        await senhas.conferir(senha, HASH_FICTICIO);
        throw naoAutorizado("Este e-mail não está cadastrado. Verifique o endereço ou crie uma conta.", "loginEmail");
    }
    if (!(await senhas.conferir(senha, usuario.senha_hash))) {
        throw naoAutorizado("E-mail ou senha incorretos.", "loginPassword");
    }
    return { id: usuario.id, nome: usuario.nome, email: usuario.email, crn: usuario.crn, perfil: "nutricionista" };
}

async function criarSessao(nutricionistaId, { lembrar, userAgent }) {
    const { token, hash } = senhas.gerarToken();
    const horas = lembrar ? config.sessao.diasLembrar * 24 : config.sessao.horasSemLembrar;
    await consultar(
        `INSERT INTO sessoes (token_hash, nutricionista_id, persistente, user_agent, expira_em)
         VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR))`,
        [hash, nutricionistaId, lembrar ? 1 : 0, v.texto(userAgent, 300), horas]
    );
    return token;
}

async function encerrarSessao(token) {
    if (!token) return;
    await consultar("DELETE FROM sessoes WHERE token_hash = ?", [senhas.hashToken(token)]);
}

async function limparSessoes() {
    await consultar("DELETE FROM sessoes WHERE expira_em < NOW()");
    await consultar("DELETE FROM recuperacoes_senha WHERE expira_em < DATE_SUB(NOW(), INTERVAL 1 DAY)");
}

async function alterarSenha(nutricionistaId, senhaAtual, novaSenha, tokenAtual) {
    const { rows } = await consultar("SELECT senha_hash FROM nutricionistas WHERE id = ?", [nutricionistaId]);
    if (!rows[0]) throw naoEncontrado("Conta não encontrada.");
    if (!(await senhas.conferir(senhaAtual, rows[0].senha_hash))) {
        throw requisicaoInvalida("A senha atual está incorreta.", "senhaAtual");
    }
    const problema = senhas.validarForca(novaSenha);
    if (problema) throw requisicaoInvalida(problema, "novaSenha");

    const hash = await senhas.gerarHash(novaSenha);
    await transacao(async cliente => {
        await cliente.query("UPDATE nutricionistas SET senha_hash = ?, atualizado_em = NOW() WHERE id = ?", [hash, nutricionistaId]);
        await cliente.query("DELETE FROM sessoes WHERE nutricionista_id = ? AND token_hash <> ?", [nutricionistaId, senhas.hashToken(tokenAtual)]);
    });
}

async function solicitarRecuperacao(mail) {
    const endereco = v.texto(mail, 200).toLowerCase();
    if (!v.emailValido(endereco)) throw requisicaoInvalida("Digite um e-mail válido.", "recoverEmail");

    const { rows } = await consultar("SELECT id, nome, email FROM nutricionistas WHERE email = ?", [endereco]);
    if (!rows[0]) return { enviado: false };

    const { token, hash } = senhas.gerarToken();
    await consultar(
        `INSERT INTO recuperacoes_senha (token_hash, nutricionista_id, expira_em)
         VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
        [hash, rows[0].id, VALIDADE_RECUPERACAO_MIN]
    );

    const link = `${config.urlPublica}/index.html?redefinir=${encodeURIComponent(token)}`;
    const html = email.modelo("Redefinição de senha", `
      <p>Olá, ${email.escapar(rows[0].nome.split(" ")[0])}!</p>
      <p>Recebemos um pedido para redefinir a senha da sua conta no NUTRIQ.</p>
      <p style="margin:22px 0"><a href="${email.escapar(link)}" style="background:#087f68;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">Criar nova senha</a></p>
      <p>O link é válido por ${VALIDADE_RECUPERACAO_MIN} minutos e só pode ser usado uma vez.</p>
      <p>Se você não fez esse pedido, ignore este e-mail. Sua senha atual continua a mesma.</p>
    `);

    const envio = await email.enviar({
        para: rows[0].email,
        assunto: "Redefinição de senha - NUTRIQ",
        html,
        tipo: "recuperacao_senha",
        nutricionistaId: rows[0].id
    });
    return { enviado: true, status: envio.status, arquivo: envio.arquivo };
}

async function redefinirSenha(token, novaSenha) {
    const problema = senhas.validarForca(novaSenha);
    if (problema) throw requisicaoInvalida(problema, "resetPassword");

    const hash = senhas.hashToken(token);
    const { rows } = await consultar(
        `SELECT nutricionista_id FROM recuperacoes_senha
          WHERE token_hash = ? AND usado_em IS NULL AND expira_em > NOW()`,
        [hash]
    );
    if (!rows[0]) throw requisicaoInvalida("O link de redefinição é inválido ou expirou. Solicite um novo.", "resetPassword");

    const senhaHash = await senhas.gerarHash(novaSenha);
    await transacao(async cliente => {
        await cliente.query("UPDATE nutricionistas SET senha_hash = ?, atualizado_em = NOW() WHERE id = ?", [senhaHash, rows[0].nutricionista_id]);
        await cliente.query("UPDATE recuperacoes_senha SET usado_em = NOW() WHERE token_hash = ?", [hash]);
        await cliente.query("DELETE FROM sessoes WHERE nutricionista_id = ?", [rows[0].nutricionista_id]);
    });
}

async function obterPerfil(nutricionistaId) {
    const { rows } = await consultar(
        `SELECT n.nome, n.email, n.telefone, n.cidade, n.estado, n.crn, n.especialidade, n.apresentacao, n.foto,
                COALESCE(pr.notificacoes_email, 1) AS notificacoesEmail,
                COALESCE(pr.lembretes_consulta, 1) AS lembretesConsulta,
                COALESCE(pr.modo_escuro, 0) AS modoEscuro,
                DATE_FORMAT(n.atualizado_em, '%Y-%m-%dT%H:%i:%s') AS atualizadoEm
           FROM nutricionistas n
           LEFT JOIN preferencias pr ON pr.nutricionista_id = n.id
          WHERE n.id = ?`,
        [nutricionistaId]
    );
    const p = rows[0];
    if (!p) throw naoEncontrado("Perfil não encontrado.");
    const lidas = await consultar("SELECT chave FROM notificacoes_lidas WHERE nutricionista_id = ?", [nutricionistaId]);
    return {
        nome: p.nome,
        email: p.email,
        telefone: p.telefone,
        cidade: p.cidade,
        estado: p.estado,
        crn: p.crn,
        especialidade: p.especialidade,
        apresentacao: p.apresentacao,
        foto: p.foto || null,
        preferencias: {
            notificacoesEmail: Boolean(Number(p.notificacoesEmail)),
            lembretesConsulta: Boolean(Number(p.lembretesConsulta)),
            modoEscuro: Boolean(Number(p.modoEscuro))
        },
        notificacoesLidas: lidas.rows.map(l => l.chave),
        atualizadoEm: p.atualizadoEm
    };
}

async function atualizarPerfil(nutricionistaId, dados) {
    const atual = await obterPerfil(nutricionistaId);
    const campo = (nome, limite) => dados[nome] !== undefined ? v.texto(dados[nome], limite) : atual[nome];
    const val = new v.Validador();

    const nome = campo("nome", 120);
    const mail = campo("email", 200).toLowerCase();
    const telefone = campo("telefone", 20);
    const crn = campo("crn", 40);

    if (nome.length < 3) val.falha("nome", "Informe seu nome completo.");
    if (!v.emailValido(mail)) val.falha("email", "Digite um e-mail válido.");
    if (telefone && !/^\d{10,11}$/.test(v.soDigitos(telefone))) val.falha("telefone", "Informe um telefone válido com DDD.");
    if (crn.length < 4) val.falha("crn", "Informe seu número de CRN.");

    let foto = atual.foto;
    if (dados.foto === null) foto = null;
    else if (typeof dados.foto === "string") {
        if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(dados.foto) || dados.foto.length > 1024 * 1024) {
            val.falha("fotoPerfil", "A foto enviada é inválida ou muito grande.");
        } else {
            foto = dados.foto;
        }
    }
    val.verificar();

    if (mail !== atual.email.toLowerCase()) {
        const existe = await consultar("SELECT 1 FROM nutricionistas WHERE email = ? AND id <> ?", [mail, nutricionistaId]);
        if (existe.rowCount) throw conflito("Este e-mail já está em uso por outra conta.", "email");
    }

    const prefs = Object.assign({}, atual.preferencias);
    if (dados.preferencias && typeof dados.preferencias === "object") {
        ["notificacoesEmail", "lembretesConsulta", "modoEscuro"].forEach(chave => {
            if (typeof dados.preferencias[chave] === "boolean") prefs[chave] = dados.preferencias[chave];
        });
    }

    await transacao(async cliente => {
        await cliente.query(
            `UPDATE nutricionistas
                SET nome = ?, email = ?, telefone = ?, cidade = ?, estado = ?, crn = ?,
                    especialidade = ?, apresentacao = ?, foto = ?, atualizado_em = NOW()
              WHERE id = ?`,
            [nome, mail, telefone, campo("cidade", 80), campo("estado", 40), crn, campo("especialidade", 120),
                dados.apresentacao !== undefined ? v.textoLongo(dados.apresentacao, 600) : atual.apresentacao, foto, nutricionistaId]
        );
        await cliente.query(
            `INSERT INTO preferencias (nutricionista_id, notificacoes_email, lembretes_consulta, modo_escuro, atualizado_em)
             VALUES (?, ?, ?, ?, NOW())
             ON DUPLICATE KEY UPDATE
                notificacoes_email = VALUES(notificacoes_email),
                lembretes_consulta = VALUES(lembretes_consulta),
                modo_escuro = VALUES(modo_escuro),
                atualizado_em = NOW()`,
            [nutricionistaId, prefs.notificacoesEmail ? 1 : 0, prefs.lembretesConsulta ? 1 : 0, prefs.modoEscuro ? 1 : 0]
        );
    });

    return obterPerfil(nutricionistaId);
}

async function marcarNotificacoesLidas(nutricionistaId, chaves) {
    const lista = (Array.isArray(chaves) ? chaves : []).map(c => v.texto(c, 200)).filter(Boolean).slice(0, 200);
    if (!lista.length) return;
    await consultar(
        "INSERT IGNORE INTO notificacoes_lidas (nutricionista_id, chave) VALUES ?",
        [lista.map(chave => [nutricionistaId, chave])]
    );
}

module.exports = {
    cadastrar,
    autenticar,
    criarSessao,
    encerrarSessao,
    limparSessoes,
    alterarSenha,
    solicitarRecuperacao,
    redefinirSenha,
    obterPerfil,
    atualizarPerfil,
    marcarNotificacoesLidas
};
