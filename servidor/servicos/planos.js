"use strict";

const { consultar } = require("../banco/conexao");
const v = require("../utils/validacao");
const { naoEncontrado } = require("../utils/erros");
const pacientes = require("./pacientes");
const { kcalDosMacros } = require("./calculos");

const STATUS = ["ativo", "concluido"];

const CONSULTA_BASE = `
    SELECT pl.id, pl.paciente_id AS pacienteId, p.nome AS paciente, pl.nome, pl.objetivo,
           DATE_FORMAT(pl.data_inicio, '%Y-%m-%d') AS inicio,
           COALESCE(DATE_FORMAT(pl.data_fim, '%Y-%m-%d'), '') AS fim,
           pl.calorias, pl.macros_tipo AS macrosTipo,
           pl.carboidratos_g, pl.proteinas_g, pl.gorduras_g,
           pl.observacoes, pl.status,
           DATE_FORMAT(pl.criado_em, '%Y-%m-%dT%H:%i:%s.%f') AS criadoEm
      FROM planos_alimentares pl
      JOIN pacientes p ON p.id = pl.paciente_id`;

function montar(linha) {
    const temMacros = linha.carboidratos_g != null || linha.proteinas_g != null || linha.gorduras_g != null;
    const criadoEm = String(linha.criadoEm || "").slice(0, 23);
    return {
        id: linha.id,
        pacienteId: linha.pacienteId,
        paciente: linha.paciente,
        nome: linha.nome,
        objetivo: linha.objetivo,
        inicio: linha.inicio,
        fim: linha.fim,
        calorias: linha.calorias,
        macrosTipo: linha.macrosTipo,
        macros: temMacros
            ? { carboidratos: linha.carboidratos_g || 0, proteinas: linha.proteinas_g || 0, gorduras: linha.gorduras_g || 0 }
            : null,
        observacoes: linha.observacoes,
        descricao: linha.observacoes,
        status: linha.status,
        criadoEm,
        dataCadastro: criadoEm
    };
}

function validar(dados) {
    const val = new v.Validador();

    const nome = v.texto(dados.nome, 160);
    if (nome.length < 2) val.falha("plnNome", "Informe o nome do plano.");

    const inicio = v.normalizarData(dados.inicio);
    const fim = v.normalizarData(dados.fim);
    if (!v.dataValida(inicio)) val.falha("plnInicio", "Informe a data de início.");
    if (fim && !v.dataValida(fim)) val.falha("plnFim", "Data de término inválida.");
    else if (fim && inicio && fim < inicio) val.falha("plnFim", "O término deve ser depois do início.");

    let calorias = v.numero(dados.calorias);
    if (calorias != null && !v.noIntervalo(calorias, 500, 6000)) val.falha("plnCalorias", "Use um valor entre 500 e 6000 kcal.");

    const m = dados.macros && typeof dados.macros === "object" ? dados.macros : null;
    const macros = m ? [v.numero(m.carboidratos), v.numero(m.proteinas), v.numero(m.gorduras)] : [null, null, null];
    ["plnCarb", "plnProt", "plnGord"].forEach((campo, i) => {
        if (macros[i] != null && !v.noIntervalo(macros[i], 0, 1500)) val.falha(campo, "Use um valor entre 0 e 1500 g.");
    });

    val.verificar();

    const temMacros = macros.some(x => x != null);
    if (calorias == null && temMacros) {
        calorias = kcalDosMacros(macros[0], macros[1], macros[2]);
        if (calorias < 500 || calorias > 6000) calorias = null;
    }

    return {
        nome,
        objetivo: v.texto(dados.objetivo, 120),
        inicio,
        fim: fim || null,
        calorias: calorias != null ? Math.round(calorias) : null,
        macrosTipo: dados.macrosTipo === "%" ? "%" : "g",
        carboidratos: temMacros ? macros[0] || 0 : null,
        proteinas: temMacros ? macros[1] || 0 : null,
        gorduras: temMacros ? macros[2] || 0 : null,
        observacoes: v.textoLongo(dados.observacoes != null ? dados.observacoes : dados.descricao, 4000),
        status: STATUS.includes(dados.status) ? dados.status : "ativo"
    };
}

async function listar(nutricionistaId, filtros = {}) {
    const parametros = [nutricionistaId];
    let filtro = "";
    if (filtros.pacienteId) {
        if (!v.uuidValido(filtros.pacienteId)) return [];
        filtro += " AND pl.paciente_id = ?";
        parametros.push(filtros.pacienteId);
    }
    if (filtros.status && STATUS.includes(filtros.status)) {
        filtro += " AND pl.status = ?";
        parametros.push(filtros.status);
    }
    const { rows } = await consultar(
        `${CONSULTA_BASE} WHERE pl.nutricionista_id = ? ${filtro} ORDER BY pl.criado_em`,
        parametros
    );
    return rows.map(montar);
}

async function obter(nutricionistaId, id) {
    if (!v.uuidValido(id)) throw naoEncontrado("Plano alimentar não encontrado.");
    const { rows } = await consultar(`${CONSULTA_BASE} WHERE pl.nutricionista_id = ? AND pl.id = ?`, [nutricionistaId, id]);
    if (!rows[0]) throw naoEncontrado("Plano alimentar não encontrado.");
    return montar(rows[0]);
}

async function criar(nutricionistaId, dados) {
    if (!v.uuidValido(dados.pacienteId)) {
        const erro = new v.Validador();
        erro.falha("plnPaciente", "Selecione o paciente.");
        erro.verificar();
    }
    await pacientes.exigir(nutricionistaId, dados.pacienteId);
    const p = validar(dados);
    const id = v.novoId();
    await consultar(
        `INSERT INTO planos_alimentares (id, nutricionista_id, paciente_id, nome, objetivo, data_inicio, data_fim, calorias,
                                         macros_tipo, carboidratos_g, proteinas_g, gorduras_g, observacoes, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, nutricionistaId, dados.pacienteId, p.nome, p.objetivo, p.inicio, p.fim, p.calorias, p.macrosTipo,
            p.carboidratos, p.proteinas, p.gorduras, p.observacoes, p.status]
    );
    return obter(nutricionistaId, id);
}

async function atualizar(nutricionistaId, id, dados) {
    const atual = await obter(nutricionistaId, id);
    const pacienteId = dados.pacienteId || atual.pacienteId;
    if (pacienteId !== atual.pacienteId) await pacientes.exigir(nutricionistaId, pacienteId);
    const p = validar(Object.assign({}, atual, dados));
    await consultar(
        `UPDATE planos_alimentares
            SET paciente_id = ?, nome = ?, objetivo = ?, data_inicio = ?, data_fim = ?, calorias = ?,
                macros_tipo = ?, carboidratos_g = ?, proteinas_g = ?, gorduras_g = ?,
                observacoes = ?, status = ?, atualizado_em = NOW()
          WHERE nutricionista_id = ? AND id = ?`,
        [pacienteId, p.nome, p.objetivo, p.inicio, p.fim, p.calorias, p.macrosTipo,
            p.carboidratos, p.proteinas, p.gorduras, p.observacoes, p.status, nutricionistaId, id]
    );
    return obter(nutricionistaId, id);
}

async function excluir(nutricionistaId, id) {
    if (!v.uuidValido(id)) throw naoEncontrado("Plano alimentar não encontrado.");
    const { rowCount } = await consultar("DELETE FROM planos_alimentares WHERE nutricionista_id = ? AND id = ?", [nutricionistaId, id]);
    if (!rowCount) throw naoEncontrado("Plano alimentar não encontrado.");
}

async function principalDoPaciente(nutricionistaId, pacienteId) {
    const lista = await listar(nutricionistaId, { pacienteId });
    lista.sort((a, b) => {
        const ativoA = a.status !== "concluido" ? 1 : 0;
        const ativoB = b.status !== "concluido" ? 1 : 0;
        if (ativoA !== ativoB) return ativoB - ativoA;
        return String(b.criadoEm).localeCompare(String(a.criadoEm));
    });
    return lista[0] || null;
}

module.exports = { listar, obter, criar, atualizar, excluir, principalDoPaciente };
