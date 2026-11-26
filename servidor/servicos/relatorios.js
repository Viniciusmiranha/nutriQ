"use strict";

const { consultar } = require("../banco/conexao");
const v = require("../utils/validacao");
const email = require("./email");
const pacientes = require("./pacientes");
const planos = require("./planos");
const avaliacoes = require("./avaliacoes");
const { idade, imc, classificarImc, distribuicaoMacros } = require("./calculos");

const LIMITE_MEDICOES = 6;
const esc = email.escapar;

function formatarData(iso) {
    if (!v.dataValida(iso)) return "—";
    const [ano, mes, dia] = v.normalizarData(iso).split("-");
    return `${dia}/${mes}/${ano}`;
}

function formatarNumero(n, casas = 1) {
    return Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: casas });
}

async function ultimaConsultaRealizada(nutricionistaId, pacienteId) {
    const { rows } = await consultar(
        `SELECT DATE_FORMAT(data, '%Y-%m-%d') AS data FROM consultas
          WHERE nutricionista_id = ? AND paciente_id = ? AND status = 'realizada'
          ORDER BY data DESC, horario DESC LIMIT 1`,
        [nutricionistaId, pacienteId]
    );
    return rows[0] ? rows[0].data : null;
}

async function dadosDoRelatorio(nutricionistaId, pacienteId) {
    const paciente = await pacientes.exigir(nutricionistaId, pacienteId);
    const historico = await avaliacoes.listar(nutricionistaId, pacienteId);
    const plano = await planos.principalDoPaciente(nutricionistaId, pacienteId);
    const anos = idade(paciente.nascimento);
    const medicoes = historico.slice(-LIMITE_MEDICOES).map(a => ({
        data: a.data,
        peso: a.peso,
        altura: a.altura || paciente.altura,
        imc: a.imc
    }));
    const comImc = medicoes.filter(m => m.imc != null);
    const ultimoImc = comImc.length ? comImc[comImc.length - 1].imc : null;
    const adulto = anos == null || anos >= 18;

    return {
        paciente: {
            id: paciente.id,
            nome: paciente.nome,
            email: paciente.email,
            telefone: paciente.telefone,
            genero: paciente.genero,
            objetivo: paciente.objetivo,
            idade: anos,
            altura: paciente.altura
        },
        ultimaConsulta: await ultimaConsultaRealizada(nutricionistaId, pacienteId),
        plano,
        medicoes,
        totalAvaliacoes: historico.length,
        variacaoPeso: medicoes.length > 1 ? Math.round((medicoes[medicoes.length - 1].peso - medicoes[0].peso) * 10) / 10 : null,
        ultimoImc,
        classificacaoImc: ultimoImc != null && adulto ? classificarImc(ultimoImc) : "",
        adulto,
        distribuicaoMacros: distribuicaoMacros(plano),
        emailValido: v.emailValido(paciente.email),
        emailConfigurado: email.configurado,
        geradoEm: v.hojeISO()
    };
}

function tabelaMedicoes(medicoes) {
    if (!medicoes.length) return "<p>Nenhuma avaliação registrada até o momento.</p>";
    const linhas = medicoes.map(m => `
        <tr>
          <td style="padding:8px;border-bottom:1px solid #edf0ef">${esc(formatarData(m.data))}</td>
          <td style="padding:8px;border-bottom:1px solid #edf0ef">${esc(formatarNumero(m.peso))} kg</td>
          <td style="padding:8px;border-bottom:1px solid #edf0ef">${m.altura ? esc(formatarNumero(m.altura, 0)) + " cm" : "—"}</td>
          <td style="padding:8px;border-bottom:1px solid #edf0ef">${m.imc != null ? esc(formatarNumero(m.imc)) : "—"}</td>
        </tr>`).join("");
    return `
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr style="background:#e4f3ed;text-align:left">
          <th style="padding:8px">Data</th><th style="padding:8px">Peso</th><th style="padding:8px">Altura</th><th style="padding:8px">IMC</th>
        </tr></thead>
        <tbody>${linhas}</tbody>
      </table>`;
}

function blocoPlano(plano, distribuicao) {
    if (!plano) return "<p>Nenhum plano alimentar ativo no momento.</p>";
    const macros = plano.macros
        ? `<li>Carboidratos: ${esc(formatarNumero(plano.macros.carboidratos, 0))} g</li>
           <li>Proteínas: ${esc(formatarNumero(plano.macros.proteinas, 0))} g</li>
           <li>Gorduras: ${esc(formatarNumero(plano.macros.gorduras, 0))} g</li>`
        : "";
    const pct = distribuicao
        ? `<p style="margin:6px 0 0;color:#5f6c78">Distribuição calórica: ${distribuicao.carboidratos}% carboidratos · ${distribuicao.proteinas}% proteínas · ${distribuicao.gorduras}% gorduras</p>`
        : "";
    return `
      <p style="margin:0"><strong>${esc(plano.nome)}</strong>${plano.objetivo ? " · " + esc(plano.objetivo) : ""}</p>
      <p style="margin:4px 0">Período: ${esc(formatarData(plano.inicio))}${plano.fim ? " a " + esc(formatarData(plano.fim)) : " em diante"}</p>
      ${plano.calorias ? `<p style="margin:4px 0">Meta diária: <strong>${esc(formatarNumero(plano.calorias, 0))} kcal</strong></p>` : ""}
      ${macros ? `<ul style="margin:6px 0;padding-left:18px">${macros}</ul>` : ""}
      ${pct}
      ${plano.observacoes ? `<p style="margin:8px 0 0">${esc(plano.observacoes)}</p>` : ""}`;
}

function primeiroNome(nome) {
    return String(nome || "").trim().split(/\s+/)[0] || "";
}

function htmlRelatorio(dados, nutricionista) {
    const p = dados.paciente;
    const variacao = dados.variacaoPeso == null ? ""
        : `<p>Variação de peso no período: <strong>${dados.variacaoPeso === 0 ? "peso estável" : (dados.variacaoPeso > 0 ? "+" : "−") + esc(formatarNumero(Math.abs(dados.variacaoPeso))) + " kg"}</strong></p>`;
    const imcTexto = dados.ultimoImc != null
        ? `<p>Último IMC: <strong>${esc(formatarNumero(dados.ultimoImc))}</strong>${dados.classificacaoImc ? " · " + esc(dados.classificacaoImc) : ""}</p>`
        : "";

    return email.modelo("Seu relatório nutricional", `
      <p>Olá, ${esc(primeiroNome(p.nome))}!</p>
      <p>Segue o resumo do seu acompanhamento nutricional, gerado em ${esc(formatarData(dados.geradoEm))}.</p>
      <h2 style="font-size:16px;margin:22px 0 8px;color:#087f68">Dados gerais</h2>
      <p style="margin:0">${p.idade != null ? esc(p.idade) + " anos" : ""}${p.genero ? " · " + esc(p.genero) : ""}${p.objetivo ? " · Objetivo: " + esc(p.objetivo) : ""}</p>
      <p style="margin:4px 0">Última consulta realizada: ${esc(formatarData(dados.ultimaConsulta))}</p>
      <h2 style="font-size:16px;margin:22px 0 8px;color:#087f68">Evolução das avaliações</h2>
      ${tabelaMedicoes(dados.medicoes)}
      ${variacao}
      ${imcTexto}
      <h2 style="font-size:16px;margin:22px 0 8px;color:#087f68">Plano alimentar</h2>
      ${blocoPlano(dados.plano, dados.distribuicaoMacros)}
    `, assinatura(nutricionista));
}

function assinatura(nutricionista) {
    if (!nutricionista) return "";
    return `${nutricionista.nome}${nutricionista.crn ? " · " + nutricionista.crn : ""}`;
}

async function dadosNutricionista(nutricionistaId) {
    const { rows } = await consultar(
        `SELECT n.nome, n.email, n.crn, COALESCE(pr.notificacoes_email, 1) AS notificacoesEmail,
                COALESCE(pr.lembretes_consulta, 1) AS lembretesConsulta
           FROM nutricionistas n LEFT JOIN preferencias pr ON pr.nutricionista_id = n.id
          WHERE n.id = ?`,
        [nutricionistaId]
    );
    if (!rows[0]) return null;
    return Object.assign(rows[0], {
        notificacoesEmail: Boolean(Number(rows[0].notificacoesEmail)),
        lembretesConsulta: Boolean(Number(rows[0].lembretesConsulta))
    });
}

async function enviarRelatorio(nutricionistaId, pacienteId, { automatico = false } = {}) {
    const dados = await dadosDoRelatorio(nutricionistaId, pacienteId);
    const nutricionista = await dadosNutricionista(nutricionistaId);
    if (automatico && !nutricionista.notificacoesEmail) return null;
    if (automatico && !dados.emailValido) return null;
    return email.enviar({
        para: dados.paciente.email,
        assunto: `Relatório nutricional - ${dados.paciente.nome}`,
        html: htmlRelatorio(dados, nutricionista),
        tipo: automatico ? "relatorio_automatico" : "relatorio",
        nutricionistaId,
        pacienteId,
        responderPara: nutricionista.email
    });
}

async function enviarAvaliacao(nutricionistaId, pacienteId, avaliacaoId, { automatico = false } = {}) {
    const paciente = await pacientes.exigir(nutricionistaId, pacienteId);
    const nutricionista = await dadosNutricionista(nutricionistaId);
    if (automatico && (!nutricionista.notificacoesEmail || !v.emailValido(paciente.email))) return null;

    const historico = await avaliacoes.listar(nutricionistaId, pacienteId);
    const atual = historico.find(a => a.id === avaliacaoId);
    if (!atual) return null;
    const indice = historico.indexOf(atual);
    const anterior = indice > 0 ? historico[indice - 1] : null;
    const diferenca = anterior ? Math.round((atual.peso - anterior.peso) * 10) / 10 : null;
    const valorImc = imc(atual.peso, atual.altura || paciente.altura);

    const html = email.modelo("Resultado da sua avaliação", `
      <p>Olá, ${esc(primeiroNome(paciente.nome))}!</p>
      <p>Sua avaliação física de <strong>${esc(formatarData(atual.data))}</strong> foi registrada.</p>
      <ul style="padding-left:18px">
        <li>Peso: <strong>${esc(formatarNumero(atual.peso))} kg</strong></li>
        ${atual.altura || paciente.altura ? `<li>Altura: ${esc(formatarNumero(atual.altura || paciente.altura, 0))} cm</li>` : ""}
        ${valorImc != null ? `<li>IMC: ${esc(formatarNumero(valorImc))} · ${esc(classificarImc(valorImc))}</li>` : ""}
        ${diferenca != null ? `<li>Diferença em relação à avaliação anterior (${esc(formatarData(anterior.data))}): ${diferenca === 0 ? "sem alteração" : (diferenca > 0 ? "+" : "−") + esc(formatarNumero(Math.abs(diferenca))) + " kg"}</li>` : ""}
      </ul>
      ${atual.observacoes ? `<p>${esc(atual.observacoes)}</p>` : ""}
      <h2 style="font-size:16px;margin:22px 0 8px;color:#087f68">Histórico recente</h2>
      ${tabelaMedicoes(historico.slice(-LIMITE_MEDICOES))}
    `, assinatura(nutricionista));

    return email.enviar({
        para: paciente.email,
        assunto: `Resultado da avaliação de ${formatarData(atual.data)}`,
        html,
        tipo: automatico ? "avaliacao_automatica" : "avaliacao",
        nutricionistaId,
        pacienteId,
        responderPara: nutricionista.email
    });
}

async function enviarPlano(nutricionistaId, planoId) {
    const plano = await planos.obter(nutricionistaId, planoId);
    const paciente = await pacientes.exigir(nutricionistaId, plano.pacienteId);
    const nutricionista = await dadosNutricionista(nutricionistaId);
    const html = email.modelo("Seu plano alimentar", `
      <p>Olá, ${esc(primeiroNome(paciente.nome))}!</p>
      <p>Confira abaixo o seu plano alimentar.</p>
      ${blocoPlano(plano, distribuicaoMacros(plano))}
    `, assinatura(nutricionista));

    return email.enviar({
        para: paciente.email,
        assunto: `Plano alimentar - ${plano.nome}`,
        html,
        tipo: "plano",
        nutricionistaId,
        pacienteId: paciente.id,
        responderPara: nutricionista.email
    });
}

async function enviarLembrete(consulta) {
    const [, mes, dia] = consulta.data.split("-");
    const html = email.modelo("Lembrete de consulta", `
      <p>Olá, ${esc(primeiroNome(consulta.paciente))}!</p>
      <p>Lembramos que você tem uma consulta agendada:</p>
      <ul style="padding-left:18px">
        <li>Data: <strong>${esc(dia)}/${esc(mes)}</strong></li>
        <li>Horário: <strong>${esc(consulta.hora)}</strong></li>
        <li>Tipo: ${esc(consulta.tipo)}</li>
      </ul>
      <p>Caso precise remarcar, entre em contato com antecedência.</p>
    `, `${consulta.nutricionista}${consulta.crn ? " · " + consulta.crn : ""}`);

    return email.enviar({
        para: consulta.email,
        assunto: `Lembrete: consulta em ${dia}/${mes} às ${consulta.hora}`,
        html,
        tipo: "lembrete",
        nutricionistaId: consulta.nutricionistaId,
        pacienteId: consulta.pacienteId,
        responderPara: consulta.emailNutricionista
    });
}

module.exports = { dadosDoRelatorio, enviarRelatorio, enviarAvaliacao, enviarPlano, enviarLembrete };
