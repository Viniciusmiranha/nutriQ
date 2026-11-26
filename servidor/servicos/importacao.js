"use strict";

const { consultar, transacao } = require("../banco/conexao");
const v = require("../utils/validacao");

function lista(valor) {
    return Array.isArray(valor) ? valor.filter(x => x && typeof x === "object" && !Array.isArray(x)).slice(0, 5000) : [];
}

function dataOuNula(valor) {
    const d = v.normalizarData(valor);
    return v.dataValida(d) ? d : null;
}

function numeroEntre(valor, minimo, maximo) {
    const n = v.numero(valor);
    return v.noIntervalo(n, minimo, maximo) ? n : null;
}

function dataHoraLocal(valor) {
    const d = new Date(valor);
    if (!valor || Number.isNaN(d.getTime())) return null;
    const dois = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())} ${dois(d.getHours())}:${dois(d.getMinutes())}:${dois(d.getSeconds())}`;
}

async function importarLegado(nutricionistaId, dados) {
    const existentes = await consultar("SELECT COUNT(*) AS total FROM pacientes WHERE nutricionista_id = ?", [nutricionistaId]);
    if (Number(existentes.rows[0].total) > 0) return { importado: false, motivo: "A conta já possui pacientes cadastrados." };

    const origem = {
        pacientes: lista(dados.pacientes),
        avaliacoes: lista(dados.avaliacoes),
        planos: lista(dados.planos),
        consultas: lista(dados.consultas)
    };
    const totais = { pacientes: 0, avaliacoes: 0, planos: 0, consultas: 0 };

    await transacao(async cliente => {
        const mapa = new Map();
        const cpfs = new Set();

        for (const p of origem.pacientes) {
            const nome = v.texto(p.nome, 160);
            if (!nome) continue;
            let cpf = v.cpfValido(p.cpf) ? v.formatarCpf(p.cpf) : "";
            if (cpfs.has(cpf)) cpf = "";
            if (cpf) cpfs.add(cpf);
            const status = ["ativo", "inativo", "alta"].includes(p.status) ? p.status : "ativo";
            const id = v.novoId();
            await cliente.query(
                `INSERT INTO pacientes (id, nutricionista_id, nome, email, telefone, cpf, data_nascimento, genero, altura_cm,
                                        status, objetivo, observacoes, criado_em)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, NOW()))`,
                [id, nutricionistaId, nome, v.texto(p.email, 200), v.texto(p.telefone, 20), cpf, dataOuNula(p.nascimento),
                    ["Feminino", "Masculino", "Outro"].includes(p.genero) ? p.genero : null,
                    numeroEntre(p.altura, 50, 250), status, v.texto(p.objetivo, 120), v.textoLongo(p.observacoes),
                    dataHoraLocal(p.dataCadastro || p.criadoEm)]
            );
            mapa.set(String(p.id), id);
            totais.pacientes++;
        }

        for (const a of origem.avaliacoes) {
            const pacienteId = mapa.get(String(a.pacienteId));
            const peso = numeroEntre(a.peso, 2, 500);
            const data = dataOuNula(a.data);
            if (!pacienteId || peso == null || !data) continue;
            await cliente.query(
                `INSERT INTO avaliacoes (id, nutricionista_id, paciente_id, data, peso_kg, altura_cm, observacoes)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [v.novoId(), nutricionistaId, pacienteId, data, peso, numeroEntre(a.altura, 50, 250), v.textoLongo(a.observacoes)]
            );
            totais.avaliacoes++;
        }

        for (const pl of origem.planos) {
            const pacienteId = mapa.get(String(pl.pacienteId));
            const nome = v.texto(pl.nome, 160);
            if (!pacienteId || !nome) continue;
            const inicio = dataOuNula(pl.inicio) || dataOuNula(pl.dataCadastro) || v.hojeISO();
            let fim = dataOuNula(pl.fim);
            if (fim && fim < inicio) fim = null;
            const m = pl.macros && typeof pl.macros === "object" ? pl.macros : null;
            await cliente.query(
                `INSERT INTO planos_alimentares (id, nutricionista_id, paciente_id, nome, objetivo, data_inicio, data_fim, calorias,
                                                 macros_tipo, carboidratos_g, proteinas_g, gorduras_g, observacoes, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [v.novoId(), nutricionistaId, pacienteId, nome, v.texto(pl.objetivo, 120), inicio, fim,
                    numeroEntre(pl.calorias, 500, 6000) != null ? Math.round(v.numero(pl.calorias)) : null,
                    pl.macrosTipo === "%" ? "%" : "g",
                    m ? numeroEntre(m.carboidratos, 0, 1500) : null,
                    m ? numeroEntre(m.proteinas, 0, 1500) : null,
                    m ? numeroEntre(m.gorduras, 0, 1500) : null,
                    v.textoLongo(pl.observacoes != null ? pl.observacoes : pl.descricao),
                    pl.status === "concluido" ? "concluido" : "ativo"]
            );
            totais.planos++;
        }

        for (const c of origem.consultas) {
            const pacienteId = mapa.get(String(c.pacienteId));
            const data = dataOuNula(c.data);
            const hora = String(c.horario || c.hora || "").slice(0, 5);
            if (!pacienteId || !data || !v.horaValida(hora)) continue;
            const status = v.normalizarTexto(c.status);
            const nota = numeroEntre(c.avaliacao, 1, 5);
            await cliente.query(
                `INSERT INTO consultas (id, nutricionista_id, paciente_id, data, horario, tipo, status, avaliacao, observacoes)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [v.novoId(), nutricionistaId, pacienteId, data, hora, v.texto(c.tipo, 80) || "Consulta",
                    ["agendada", "realizada", "cancelada"].includes(status) ? status : "agendada",
                    status === "realizada" && nota != null ? Math.round(nota) : null, v.textoLongo(c.observacoes)]
            );
            totais.consultas++;
        }
    });

    return { importado: true, totais };
}

module.exports = { importarLegado };
