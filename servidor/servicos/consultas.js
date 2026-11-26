"use strict";

const { consultar } = require("../banco/conexao");
const v = require("../utils/validacao");
const { naoEncontrado, conflito } = require("../utils/erros");
const pacientes = require("./pacientes");

const STATUS = ["agendada", "realizada", "cancelada"];
const INTERVALO_MINIMO_MIN = 30;

const CAMPOS = `
    c.id, c.paciente_id AS pacienteId, p.nome AS paciente,
    DATE_FORMAT(c.data, '%Y-%m-%d') AS data, TIME_FORMAT(c.horario, '%H:%i') AS hora,
    TIME_FORMAT(c.horario, '%H:%i') AS horario, c.tipo, c.status, c.avaliacao, c.observacoes,
    DATE_FORMAT(c.criado_em, '%Y-%m-%dT%H:%i:%s') AS criadoEm`;

function normalizarStatus(valor) {
    const status = v.normalizarTexto(valor);
    return STATUS.includes(status) ? status : "agendada";
}

async function existeConflito(nutricionistaId, data, hora, ignorarId) {
    if (!v.dataValida(data) || !v.horaValida(hora)) return false;
    const { rowCount } = await consultar(
        `SELECT 1 FROM consultas
          WHERE nutricionista_id = ?
            AND status <> 'cancelada'
            AND id <> ?
            AND ABS(TIMESTAMPDIFF(SECOND, TIMESTAMP(data, horario), TIMESTAMP(?, ?))) < ? * 60
          LIMIT 1`,
        [nutricionistaId, v.uuidValido(ignorarId) ? ignorarId : "", data, hora, INTERVALO_MINIMO_MIN]
    );
    return rowCount > 0;
}

async function validar(nutricionistaId, dados, original) {
    const val = new v.Validador();

    if (!v.uuidValido(dados.pacienteId) || !(await pacientes.obter(nutricionistaId, dados.pacienteId))) {
        val.falha("csPaciente", "Selecione o paciente.");
    }

    const data = v.normalizarData(dados.data);
    const hora = String(dados.hora || dados.horario || "").slice(0, 5);
    const status = normalizarStatus(dados.status);

    if (!v.dataValida(data)) val.falha("csData", "Informe a data.");
    if (!v.horaValida(hora)) val.falha("csHora", "Informe um horário válido.");

    let haConflito = false;
    if (!val.erros.length) {
        const instante = v.momento(data, hora).getTime();
        const mudouHorario = !original || original.data !== data || original.hora !== hora || original.status !== "agendada";

        if (status === "agendada" && mudouHorario && instante < Date.now()) {
            val.falha("csHora", "Escolha um horário futuro ou mude a situação para Realizada.");
        } else if (status === "realizada" && instante > Date.now()) {
            val.falha("csData", dados._parcial
                ? "Só é possível concluir a consulta depois do horário marcado."
                : "Uma consulta realizada não pode estar no futuro.");
        } else if (status !== "cancelada" && await existeConflito(nutricionistaId, data, hora, original && original.id)) {
            haConflito = true;
        }
    }

    const nota = v.numero(dados.avaliacao);
    if (status === "realizada" && nota != null && !v.noIntervalo(nota, 1, 5)) {
        val.falha("csAvaliacao", "Use uma nota de 1 a 5.");
    }

    val.verificar();
    if (haConflito) throw conflito(`Respeite o intervalo mínimo de ${INTERVALO_MINIMO_MIN} minutos entre consultas.`, "csHora");

    return {
        pacienteId: dados.pacienteId,
        data,
        hora,
        status,
        tipo: v.texto(dados.tipo, 80) || "Consulta",
        observacoes: v.textoLongo(dados.observacoes, 2000),
        avaliacao: status === "realizada" && nota != null ? Math.round(nota) : null
    };
}

async function listar(nutricionistaId, filtros = {}) {
    const parametros = [nutricionistaId];
    let filtro = "";
    if (filtros.pacienteId) {
        if (!v.uuidValido(filtros.pacienteId)) return [];
        parametros.push(filtros.pacienteId);
        filtro += " AND c.paciente_id = ?";
    }
    if (filtros.status && STATUS.includes(filtros.status)) {
        parametros.push(filtros.status);
        filtro += " AND c.status = ?";
    }
    if (filtros.periodo === "futuras" || filtros.periodo === "anteriores") {
        parametros.push(v.agoraLocal());
        const condicao = "c.status = 'agendada' AND TIMESTAMP(c.data, c.horario) >= ?";
        filtro += filtros.periodo === "futuras" ? ` AND ${condicao}` : ` AND NOT (${condicao})`;
    }
    if (filtros.de && v.dataValida(filtros.de)) {
        parametros.push(filtros.de);
        filtro += " AND c.data >= ?";
    }
    if (filtros.ate && v.dataValida(filtros.ate)) {
        parametros.push(filtros.ate);
        filtro += " AND c.data <= ?";
    }
    const { rows } = await consultar(
        `SELECT ${CAMPOS}
           FROM consultas c
           JOIN pacientes p ON p.id = c.paciente_id
          WHERE c.nutricionista_id = ? ${filtro}
          ORDER BY c.data, c.horario`,
        parametros
    );
    return rows;
}

async function obter(nutricionistaId, id) {
    if (!v.uuidValido(id)) throw naoEncontrado("Consulta não encontrada.");
    const { rows } = await consultar(
        `SELECT ${CAMPOS}
           FROM consultas c
           JOIN pacientes p ON p.id = c.paciente_id
          WHERE c.nutricionista_id = ? AND c.id = ?`,
        [nutricionistaId, id]
    );
    if (!rows[0]) throw naoEncontrado("Consulta não encontrada.");
    return rows[0];
}

async function criar(nutricionistaId, dados) {
    const c = await validar(nutricionistaId, dados, null);
    const id = v.novoId();
    await consultar(
        `INSERT INTO consultas (id, nutricionista_id, paciente_id, data, horario, tipo, status, avaliacao, observacoes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, nutricionistaId, c.pacienteId, c.data, c.hora, c.tipo, c.status, c.avaliacao, c.observacoes]
    );
    return obter(nutricionistaId, id);
}

async function atualizar(nutricionistaId, id, dados) {
    const atual = await obter(nutricionistaId, id);
    const combinado = Object.assign({}, atual, dados);
    if (dados.status && normalizarStatus(dados.status) !== "realizada" && dados.avaliacao === undefined) combinado.avaliacao = null;
    const c = await validar(nutricionistaId, Object.assign(combinado, { _parcial: !dados.data }), atual);
    const horarioMudou = atual.data !== c.data || atual.hora !== c.hora;

    await consultar(
        `UPDATE consultas
            SET paciente_id = ?, data = ?, horario = ?, tipo = ?, status = ?, avaliacao = ?, observacoes = ?,
                lembrete_enviado_em = CASE WHEN ? THEN NULL ELSE lembrete_enviado_em END,
                atualizado_em = NOW()
          WHERE nutricionista_id = ? AND id = ?`,
        [c.pacienteId, c.data, c.hora, c.tipo, c.status, c.avaliacao, c.observacoes, horarioMudou, nutricionistaId, id]
    );
    const nova = await obter(nutricionistaId, id);
    return { anterior: atual, consulta: nova };
}

async function excluir(nutricionistaId, id) {
    if (!v.uuidValido(id)) throw naoEncontrado("Consulta não encontrada.");
    const { rowCount } = await consultar("DELETE FROM consultas WHERE nutricionista_id = ? AND id = ?", [nutricionistaId, id]);
    if (!rowCount) throw naoEncontrado("Consulta não encontrada.");
}

async function proximas(nutricionistaId, dias = 7, limite = 50) {
    const agora = v.agoraLocal();
    const { rows } = await consultar(
        `SELECT ${CAMPOS}
           FROM consultas c
           JOIN pacientes p ON p.id = c.paciente_id
          WHERE c.nutricionista_id = ?
            AND c.status = 'agendada'
            AND TIMESTAMP(c.data, c.horario) >= ?
            AND TIMESTAMP(c.data, c.horario) <= DATE_ADD(?, INTERVAL ? DAY)
          ORDER BY c.data, c.horario
          LIMIT ?`,
        [nutricionistaId, agora, agora, dias, limite]
    );
    return rows;
}

module.exports = { listar, obter, criar, atualizar, excluir, existeConflito, proximas, STATUS };
