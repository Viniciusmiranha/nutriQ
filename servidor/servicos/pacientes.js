"use strict";

const { consultar, transacao } = require("../banco/conexao");
const v = require("../utils/validacao");
const { naoEncontrado, conflito } = require("../utils/erros");

const GENEROS = ["Feminino", "Masculino", "Outro"];
const STATUS = ["ativo", "inativo", "alta"];

const CAMPOS = `
    p.id, p.nome, p.email, p.telefone, p.cpf,
    COALESCE(DATE_FORMAT(p.data_nascimento, '%Y-%m-%d'), '') AS nascimento,
    COALESCE(p.genero, '') AS genero,
    p.altura_cm AS altura, p.status, p.objetivo, p.observacoes,
    DATE_FORMAT(p.criado_em, '%Y-%m-%dT%H:%i:%s') AS criadoEm,
    DATE_FORMAT(p.criado_em, '%Y-%m-%dT%H:%i:%s') AS dataCadastro`;

function validar(dados, { novo }) {
    const val = new v.Validador();

    const nome = v.texto(dados.nome, 160);
    if (nome.length < 2) val.falha("pacNome", "Informe o nome do paciente.");

    const email = v.texto(dados.email, 200).toLowerCase();
    if (!v.emailValido(email)) val.falha("pacEmail", "Informe um e-mail válido.");

    const telefone = v.texto(dados.telefone, 20);
    if (!/^[\d()+ .-]+$/.test(telefone) || !/^\d{10,11}$/.test(v.soDigitos(telefone))) {
        val.falha("pacTelefone", "Informe o DDD e um telefone válido com 10 ou 11 dígitos.");
    }

    const cpfInformado = v.texto(dados.cpf, 14);
    let cpf = "";
    if (cpfInformado) {
        if (!v.cpfValido(cpfInformado)) val.falha("pacCpf", "CPF inválido. Confira os números.");
        else cpf = v.formatarCpf(cpfInformado);
    }

    const nascimento = v.normalizarData(dados.nascimento);
    if (!v.dataValida(nascimento) || nascimento < "1900-01-01") {
        val.falha("pacNascimento", "Informe uma data de nascimento válida.");
    } else if (nascimento > v.hojeISO()) {
        val.falha("pacNascimento", "A data de nascimento não pode ser futura.");
    }

    const genero = String(dados.genero || "");
    if (!GENEROS.includes(genero)) val.falha("pacGenero", "Selecione o gênero.");

    const altura = v.numero(dados.altura);
    if (altura != null && !v.noIntervalo(altura, 50, 250)) val.falha("pacAltura", "Use uma altura entre 50 e 250 cm.");

    const peso = novo ? v.numero(dados.peso) : null;
    if (peso != null && !v.noIntervalo(peso, 2, 500)) val.falha("pacPeso", "Use um peso entre 2 e 500 kg.");

    const status = STATUS.includes(dados.status) ? dados.status : "ativo";

    val.verificar();

    return {
        nome, email, telefone, cpf, nascimento, genero,
        altura, status,
        objetivo: v.texto(dados.objetivo, 120),
        observacoes: v.textoLongo(dados.observacoes, 4000),
        peso
    };
}

async function anexarAvaliacoes(nutricionistaId, pacientes) {
    if (!pacientes.length) return pacientes;
    const ids = pacientes.map(p => p.id);
    const { rows } = await consultar(
        `SELECT id, paciente_id AS pacienteId, DATE_FORMAT(data, '%Y-%m-%d') AS data,
                peso_kg AS peso, altura_cm AS altura, observacoes
           FROM avaliacoes
          WHERE nutricionista_id = ? AND paciente_id IN (?)
          ORDER BY data, criado_em`,
        [nutricionistaId, ids]
    );
    const porPaciente = new Map(ids.map(id => [id, []]));
    rows.forEach(a => {
        porPaciente.get(a.pacienteId).push({ id: a.id, data: a.data, peso: a.peso, altura: a.altura, observacoes: a.observacoes });
    });
    pacientes.forEach(p => { p.avaliacoes = porPaciente.get(p.id) || []; });
    return pacientes;
}

async function listar(nutricionistaId, filtros = {}) {
    const parametros = [nutricionistaId];
    let filtro = "";
    if (filtros.busca) {
        const termo = `%${v.texto(filtros.busca, 100)}%`;
        const digitos = v.soDigitos(filtros.busca);
        filtro += " AND (p.nome LIKE ? OR p.email LIKE ?";
        parametros.push(termo, termo);
        if (digitos) {
            filtro += " OR REGEXP_REPLACE(p.cpf, '[^0-9]', '') LIKE ? OR REGEXP_REPLACE(p.telefone, '[^0-9]', '') LIKE ?";
            parametros.push(`%${digitos}%`, `%${digitos}%`);
        }
        filtro += ")";
    }
    if (filtros.status && STATUS.includes(filtros.status)) {
        filtro += " AND p.status = ?";
        parametros.push(filtros.status);
    }
    const { rows } = await consultar(
        `SELECT ${CAMPOS} FROM pacientes p WHERE p.nutricionista_id = ? ${filtro} ORDER BY p.criado_em`,
        parametros
    );
    return anexarAvaliacoes(nutricionistaId, rows);
}

async function obter(nutricionistaId, id) {
    if (!v.uuidValido(id)) return null;
    const { rows } = await consultar(
        `SELECT ${CAMPOS} FROM pacientes p WHERE p.nutricionista_id = ? AND p.id = ?`,
        [nutricionistaId, id]
    );
    if (!rows[0]) return null;
    await anexarAvaliacoes(nutricionistaId, rows);
    return rows[0];
}

async function exigir(nutricionistaId, id) {
    const paciente = await obter(nutricionistaId, id);
    if (!paciente) throw naoEncontrado("Paciente não encontrado.");
    return paciente;
}

async function verificarCpf(nutricionistaId, cpf, ignorarId) {
    if (!cpf) return;
    const { rowCount } = await consultar(
        "SELECT 1 FROM pacientes WHERE nutricionista_id = ? AND cpf = ? AND id <> ?",
        [nutricionistaId, cpf, ignorarId || ""]
    );
    if (rowCount) throw conflito("Já existe um paciente com este CPF.", "pacCpf");
}

async function criar(nutricionistaId, dados) {
    const p = validar(dados, { novo: true });
    await verificarCpf(nutricionistaId, p.cpf, null);
    const id = v.novoId();

    await transacao(async cliente => {
        await cliente.query(
            `INSERT INTO pacientes (id, nutricionista_id, nome, email, telefone, cpf, data_nascimento, genero,
                                    altura_cm, status, objetivo, observacoes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, nutricionistaId, p.nome, p.email, p.telefone, p.cpf, p.nascimento, p.genero,
                p.altura, p.status, p.objetivo, p.observacoes]
        );
        if (p.peso != null) {
            await cliente.query(
                `INSERT INTO avaliacoes (id, nutricionista_id, paciente_id, data, peso_kg, altura_cm, observacoes)
                 VALUES (?, ?, ?, ?, ?, ?, '')`,
                [v.novoId(), nutricionistaId, id, v.hojeISO(), p.peso, p.altura]
            );
        }
    });

    return obter(nutricionistaId, id);
}

async function atualizar(nutricionistaId, id, dados) {
    const atual = await exigir(nutricionistaId, id);
    const p = validar(Object.assign({}, atual, dados), { novo: false });
    await verificarCpf(nutricionistaId, p.cpf, id);

    await consultar(
        `UPDATE pacientes SET nome = ?, email = ?, telefone = ?, cpf = ?, data_nascimento = ?, genero = ?,
                altura_cm = ?, status = ?, objetivo = ?, observacoes = ?, atualizado_em = NOW()
          WHERE nutricionista_id = ? AND id = ?`,
        [p.nome, p.email, p.telefone, p.cpf, p.nascimento, p.genero,
            p.altura, p.status, p.objetivo, p.observacoes, nutricionistaId, id]
    );
    return obter(nutricionistaId, id);
}

async function vinculos(nutricionistaId, id) {
    await exigir(nutricionistaId, id);
    const { rows } = await consultar(
        `SELECT (SELECT COUNT(*) FROM planos_alimentares WHERE nutricionista_id = ? AND paciente_id = ?) AS planos,
                (SELECT COUNT(*) FROM consultas WHERE nutricionista_id = ? AND paciente_id = ?) AS consultas,
                (SELECT COUNT(*) FROM avaliacoes WHERE nutricionista_id = ? AND paciente_id = ?) AS avaliacoes`,
        [nutricionistaId, id, nutricionistaId, id, nutricionistaId, id]
    );
    return { planos: Number(rows[0].planos), consultas: Number(rows[0].consultas), avaliacoes: Number(rows[0].avaliacoes) };
}

async function excluir(nutricionistaId, id) {
    const resumo = await vinculos(nutricionistaId, id);
    await consultar("DELETE FROM pacientes WHERE nutricionista_id = ? AND id = ?", [nutricionistaId, id]);
    return resumo;
}

module.exports = { listar, obter, exigir, criar, atualizar, excluir, vinculos };
