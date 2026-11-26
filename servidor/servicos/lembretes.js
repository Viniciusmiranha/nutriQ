"use strict";

const config = require("../config");
const { consultar } = require("../banco/conexao");
const v = require("../utils/validacao");
const { enviarLembrete } = require("./relatorios");

let executando = false;

async function verificar() {
    if (executando) return;
    executando = true;
    try {
        const agora = v.agoraLocal();
        const { rows } = await consultar(
            `SELECT c.id, c.nutricionista_id AS nutricionistaId, c.paciente_id AS pacienteId,
                    DATE_FORMAT(c.data, '%Y-%m-%d') AS data, TIME_FORMAT(c.horario, '%H:%i') AS hora, c.tipo,
                    p.nome AS paciente, p.email, n.nome AS nutricionista, n.crn, n.email AS emailNutricionista
               FROM consultas c
               JOIN pacientes p ON p.id = c.paciente_id
               JOIN nutricionistas n ON n.id = c.nutricionista_id
               LEFT JOIN preferencias pr ON pr.nutricionista_id = n.id
              WHERE c.status = 'agendada'
                AND c.lembrete_enviado_em IS NULL
                AND COALESCE(pr.lembretes_consulta, 1) = 1
                AND p.email <> ''
                AND TIMESTAMP(c.data, c.horario) > ?
                AND TIMESTAMP(c.data, c.horario) <= DATE_ADD(?, INTERVAL ? HOUR)
              LIMIT 50`,
            [agora, agora, config.lembretes.antecedenciaHoras]
        );

        for (const consulta of rows) {
            if (!v.emailValido(consulta.email)) continue;
            try {
                await enviarLembrete(consulta);
                await consultar("UPDATE consultas SET lembrete_enviado_em = NOW() WHERE id = ?", [consulta.id]);
            } catch (erro) {
                console.error("Falha ao enviar lembrete de consulta:", erro.message);
            }
        }
    } catch (erro) {
        console.error("Falha ao verificar lembretes:", erro.message);
    } finally {
        executando = false;
    }
}

function iniciar() {
    setTimeout(verificar, 15000).unref();
    setInterval(verificar, config.lembretes.intervaloMinutos * 60 * 1000).unref();
}

module.exports = { iniciar, verificar };
