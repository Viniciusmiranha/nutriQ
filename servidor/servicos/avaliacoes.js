"use strict";

const { consultar, transacao } = require("../banco/conexao");
const v = require("../utils/validacao");
const { naoEncontrado } = require("../utils/erros");
const pacientes = require("./pacientes");
const { imc, classificarImc } = require("./calculos");

const CAMPOS = `
    a.id, a.paciente_id AS pacienteId, DATE_FORMAT(a.data, '%Y-%m-%d') AS data,
    a.peso_kg AS peso, a.altura_cm AS altura, a.observacoes,
    DATE_FORMAT(a.criado_em, '%Y-%m-%dT%H:%i:%s') AS criadoEm`;

function validar(dados) {
    const val = new v.Validador();
    const data = v.normalizarData(dados.data);
    if (!v.dataValida(data)) val.falha("avData", "Informe a data da avaliação.");
    else if (data > v.hojeISO()) val.falha("avData", "A data da avaliação não pode ser futura.");

    const peso = v.numero(dados.peso);
    if (!v.noIntervalo(peso, 2, 500)) val.falha("avPeso", "Informe um peso entre 2 e 500 kg.");

    const altura = v.numero(dados.altura);
    if (altura != null && !v.noIntervalo(altura, 50, 250)) val.falha("avAltura", "Use uma altura entre 50 e 250 cm.");

    val.verificar();
    return { data, peso, altura, observacoes: v.textoLongo(dados.observacoes, 2000) };
}

function comImc(avaliacao, alturaPaciente) {
    const altura = avaliacao.altura || alturaPaciente;
    const valor = imc(avaliacao.peso, altura);
    return Object.assign({}, avaliacao, { imc: valor, classificacaoImc: classificarImc(valor) });
}

async function listar(nutricionistaId, pacienteId) {
    const paciente = await pacientes.exigir(nutricionistaId, pacienteId);
    const { rows } = await consultar(
        `SELECT ${CAMPOS} FROM avaliacoes a
          WHERE a.nutricionista_id = ? AND a.paciente_id = ?
          ORDER BY a.data, a.criado_em`,
        [nutricionistaId, pacienteId]
    );
    return rows.map(a => comImc(a, paciente.altura));
}

async function listarTodas(nutricionistaId) {
    const { rows } = await consultar(
        `SELECT ${CAMPOS} FROM avaliacoes a WHERE a.nutricionista_id = ? ORDER BY a.data, a.criado_em`,
        [nutricionistaId]
    );
    return rows;
}

async function obter(nutricionistaId, id) {
    if (!v.uuidValido(id)) throw naoEncontrado("Avaliação não encontrada.");
    const { rows } = await consultar(
        `SELECT ${CAMPOS} FROM avaliacoes a WHERE a.nutricionista_id = ? AND a.id = ?`,
        [nutricionistaId, id]
    );
    if (!rows[0]) throw naoEncontrado("Avaliação não encontrada.");
    return rows[0];
}

async function criar(nutricionistaId, pacienteId, dados) {
    const paciente = await pacientes.exigir(nutricionistaId, pacienteId);
    const a = validar(dados);
    const id = v.novoId();

    await transacao(async cliente => {
        await cliente.query(
            `INSERT INTO avaliacoes (id, nutricionista_id, paciente_id, data, peso_kg, altura_cm, observacoes)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [id, nutricionistaId, pacienteId, a.data, a.peso, a.altura, a.observacoes]
        );
        if (!paciente.altura && a.altura) {
            await cliente.query(
                "UPDATE pacientes SET altura_cm = ?, atualizado_em = NOW() WHERE nutricionista_id = ? AND id = ?",
                [a.altura, nutricionistaId, pacienteId]
            );
        }
    });

    return comImc(await obter(nutricionistaId, id), paciente.altura || a.altura);
}

async function atualizar(nutricionistaId, id, dados) {
    const atual = await obter(nutricionistaId, id);
    const a = validar(Object.assign({}, atual, dados));
    await consultar(
        `UPDATE avaliacoes SET data = ?, peso_kg = ?, altura_cm = ?, observacoes = ?
          WHERE nutricionista_id = ? AND id = ?`,
        [a.data, a.peso, a.altura, a.observacoes, nutricionistaId, id]
    );
    return obter(nutricionistaId, id);
}

async function excluir(nutricionistaId, id, pacienteId) {
    if (!v.uuidValido(id)) throw naoEncontrado("Avaliação não encontrada.");
    const parametros = [nutricionistaId, id];
    let filtro = "";
    if (pacienteId) {
        filtro = " AND paciente_id = ?";
        parametros.push(pacienteId);
    }
    const { rowCount } = await consultar(`DELETE FROM avaliacoes WHERE nutricionista_id = ? AND id = ?${filtro}`, parametros);
    if (!rowCount) throw naoEncontrado("Avaliação não encontrada.");
}

module.exports = { listar, listarTodas, obter, criar, atualizar, excluir, comImc };
