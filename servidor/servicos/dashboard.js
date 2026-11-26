"use strict";

const { consultar } = require("../banco/conexao");
const v = require("../utils/validacao");
const consultas = require("./consultas");

const METAS = { pacientes: 10, planos: 10, avaliacoes: 10 };
const JANELA_ADESAO_DIAS = 60;

async function taxaAdesao(nutricionistaId) {
    const agora = v.agoraLocal();
    const hoje = v.hojeISO();
    const { rows } = await consultar(
        `SELECT COUNT(*) AS ativos,
                SUM(CASE WHEN EXISTS (
                        SELECT 1 FROM avaliacoes a
                         WHERE a.paciente_id = p.id AND a.data >= DATE_SUB(?, INTERVAL ? DAY)
                    ) OR EXISTS (
                        SELECT 1 FROM consultas c
                         WHERE c.paciente_id = p.id
                           AND ((c.status = 'realizada' AND c.data >= DATE_SUB(?, INTERVAL ? DAY) AND TIMESTAMP(c.data, c.horario) <= ?)
                             OR (c.status = 'agendada' AND TIMESTAMP(c.data, c.horario) >= ?))
                    ) THEN 1 ELSE 0 END) AS acompanhados
           FROM pacientes p
          WHERE p.nutricionista_id = ? AND p.status NOT IN ('inativo', 'alta')`,
        [hoje, JANELA_ADESAO_DIAS, hoje, JANELA_ADESAO_DIAS, agora, agora, nutricionistaId]
    );
    const ativos = Number(rows[0].ativos) || 0;
    const acompanhados = Number(rows[0].acompanhados) || 0;
    return ativos ? Math.round(acompanhados / ativos * 100) : null;
}

function percentual(atual, meta) {
    return meta > 0 ? Math.max(0, Math.min(100, atual / meta * 100)) : 0;
}

async function resumo(nutricionistaId) {
    const id = nutricionistaId;
    const { rows } = await consultar(
        `SELECT (SELECT COUNT(*) FROM pacientes WHERE nutricionista_id = ?) AS totalPacientes,
                (SELECT COUNT(*) FROM pacientes WHERE nutricionista_id = ? AND status = 'ativo') AS pacientesAtivos,
                (SELECT COUNT(*) FROM planos_alimentares WHERE nutricionista_id = ?) AS totalPlanos,
                (SELECT COUNT(*) FROM avaliacoes WHERE nutricionista_id = ?) AS totalAvaliacoes,
                (SELECT COUNT(*) FROM consultas WHERE nutricionista_id = ?) AS totalConsultas,
                (SELECT COUNT(*) FROM pacientes WHERE nutricionista_id = ?
                    AND DATE_FORMAT(criado_em, '%Y-%m') = DATE_FORMAT(NOW(), '%Y-%m')) AS novosNoMes`,
        [id, id, id, id, id, id]
    );
    const totais = {};
    Object.keys(rows[0]).forEach(chave => { totais[chave] = Number(rows[0][chave]) || 0; });
    const adesao = await taxaAdesao(nutricionistaId);

    const metas = {
        pacientes: percentual(totais.totalPacientes, METAS.pacientes),
        planos: percentual(totais.totalPlanos, METAS.planos),
        avaliacoes: percentual(totais.totalAvaliacoes, METAS.avaliacoes),
        adesao
    };
    const lista = [metas.pacientes, metas.planos, metas.avaliacoes];
    if (adesao != null) lista.push(adesao);

    const recentes = await consultar(
        `SELECT p.id, p.nome, p.status, DATE_FORMAT(p.criado_em, '%Y-%m-%dT%H:%i:%s') AS criadoEm,
                EXISTS (SELECT 1 FROM planos_alimentares pl WHERE pl.paciente_id = p.id AND pl.status = 'ativo') AS temPlano
           FROM pacientes p
          WHERE p.nutricionista_id = ?
          ORDER BY p.criado_em DESC
          LIMIT 5`,
        [nutricionistaId]
    );

    return Object.assign({}, totais, {
        taxaAdesao: adesao,
        metas,
        percentualGeral: lista.reduce((s, n) => s + n, 0) / lista.length,
        pacientesRecentes: recentes.rows.map(p => Object.assign(p, { temPlano: Boolean(p.temPlano) })),
        proximasConsultas: await consultas.proximas(nutricionistaId, 30, 5)
    });
}

module.exports = { resumo, taxaAdesao, METAS };
