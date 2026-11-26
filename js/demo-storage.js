(function (global) {
    "use strict";

    var CHAVE = "nutriqDemoV1";
    var ITERACOES_SENHA = 100000;
    var erroAtual = null;
    var PREFERENCIAS_PADRAO = {
        notificacoesEmail: true,
        lembretesConsulta: true,
        modoEscuro: false
    };

    function copiar(valor) {
        return valor == null ? valor : JSON.parse(JSON.stringify(valor));
    }

    function erro(mensagem, campo, codigo, status) {
        var resultado = new Error(mensagem);
        resultado.campo = campo || null;
        resultado.codigo = codigo || "DEMO_INVALIDA";
        resultado.status = status || 400;
        return resultado;
    }

    function registrarErro(falha) {
        erroAtual = {
            status: falha.status || 500,
            erro: falha.message || "Não foi possível acessar os dados de demonstração.",
            codigo: falha.codigo || "DEMO_ERRO"
        };
        if (falha.campo) erroAtual.campo = falha.campo;
        return erroAtual;
    }

    function lerBanco() {
        var texto;
        try {
            texto = global.localStorage.getItem(CHAVE);
        } catch (falha) {
            throw erro("O armazenamento local está indisponível neste navegador.", null, "DEMO_STORAGE_INDISPONIVEL", 503);
        }
        if (!texto) return { versao: 1, usuarios: [], sessao: null };

        var dados;
        try {
            dados = JSON.parse(texto);
        } catch (falha) {
            throw erro("Os dados locais de demonstração estão inválidos e não foram alterados.", null, "DEMO_STORAGE_INVALIDO", 500);
        }
        if (!dados || dados.versao !== 1 || !Array.isArray(dados.usuarios)) {
            throw erro("A versão dos dados locais de demonstração não é compatível.", null, "DEMO_VERSAO_INVALIDA", 500);
        }
        return dados;
    }

    function salvarBanco(dados) {
        try {
            global.localStorage.setItem(CHAVE, JSON.stringify(dados));
        } catch (falha) {
            throw erro("Não foi possível salvar no localStorage. Verifique o espaço disponível do navegador.", null, "DEMO_STORAGE_FALHA", 507);
        }
    }

    function hojeISO() {
        var data = new Date();
        return data.getFullYear() + "-" + dois(data.getMonth() + 1) + "-" + dois(data.getDate());
    }

    function dois(valor) {
        return String(valor).padStart(2, "0");
    }

    function agoraISO() {
        return new Date().toISOString().slice(0, 19);
    }

    function novaId() {
        if (global.crypto && typeof global.crypto.randomUUID === "function") return global.crypto.randomUUID();
        var bytes = new Uint8Array(16);
        if (global.crypto && global.crypto.getRandomValues) global.crypto.getRandomValues(bytes);
        else for (var i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
        bytes[6] = (bytes[6] & 15) | 64;
        bytes[8] = (bytes[8] & 63) | 128;
        var hex = Array.from(bytes, function (n) { return n.toString(16).padStart(2, "0"); }).join("");
        return hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-" + hex.slice(12, 16) + "-" + hex.slice(16, 20) + "-" + hex.slice(20);
    }

    function normalizar(texto) {
        return String(texto == null ? "" : texto)
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .trim()
            .toLowerCase();
    }

    function emailValido(valor) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(valor || "").trim());
    }

    function cpfValido(valor) {
        var cpf = String(valor || "").replace(/\D/g, "");
        if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
        var soma = 0;
        for (var i = 0; i < 9; i++) soma += Number(cpf[i]) * (10 - i);
        var primeiro = (soma * 10) % 11;
        if (primeiro === 10) primeiro = 0;
        if (primeiro !== Number(cpf[9])) return false;
        soma = 0;
        for (var j = 0; j < 10; j++) soma += Number(cpf[j]) * (11 - j);
        var segundo = (soma * 10) % 11;
        if (segundo === 10) segundo = 0;
        return segundo === Number(cpf[10]);
    }

    function formatarCpf(valor) {
        var cpf = String(valor || "").replace(/\D/g, "");
        return cpf.length === 11
            ? cpf.slice(0, 3) + "." + cpf.slice(3, 6) + "." + cpf.slice(6, 9) + "-" + cpf.slice(9)
            : "";
    }

    function dataValida(valor) {
        var partes = String(valor || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!partes) return false;
        var data = new Date(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3]));
        return data.getFullYear() === Number(partes[1]) &&
            data.getMonth() === Number(partes[2]) - 1 &&
            data.getDate() === Number(partes[3]);
    }

    function dataHora(data, hora) {
        if (!dataValida(data) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(hora || ""))) return null;
        var partes = data.split("-").map(Number);
        var tempo = hora.split(":").map(Number);
        return new Date(partes[0], partes[1] - 1, partes[2], tempo[0], tempo[1]);
    }

    function idade(nascimento) {
        if (!dataValida(nascimento)) return null;
        var partes = nascimento.split("-").map(Number);
        var hoje = new Date();
        var anos = hoje.getFullYear() - partes[0];
        if (hoje.getMonth() + 1 < partes[1] || (hoje.getMonth() + 1 === partes[1] && hoje.getDate() < partes[2])) anos--;
        return anos >= 0 ? anos : null;
    }

    function imc(peso, altura) {
        var p = Number(peso);
        var a = Number(altura);
        if (!(p > 0) || !(a > 0)) return null;
        var metros = a > 3 ? a / 100 : a;
        return Math.round(p / (metros * metros) * 10) / 10;
    }

    function classificarImc(valor, detalhado) {
        if (valor == null) return "";
        if (valor < 18.5) return "Abaixo do peso";
        if (valor < 25) return "Peso normal";
        if (valor < 30) return "Sobrepeso";
        if (!detalhado) return "Obesidade";
        if (valor < 35) return "Obesidade grau I";
        if (valor < 40) return "Obesidade grau II";
        return "Obesidade grau III";
    }

    function contaAtual(dados) {
        var id = dados.sessao && dados.sessao.usuarioId;
        return id ? dados.usuarios.find(function (usuario) { return usuario.id === id; }) || null : null;
    }

    function exigirConta(dados) {
        var usuario = contaAtual(dados);
        if (!usuario) throw erro("Entre na conta de demonstração para continuar.", "loginEmail", "DEMO_SEM_SESSAO", 401);
        return usuario;
    }

    function lerConta() {
        var dados = lerBanco();
        return { dados: dados, usuario: exigirConta(dados) };
    }

    function alterarConta(alteracao) {
        var atual = lerConta();
        var resultado = alteracao(atual.usuario, atual.dados);
        salvarBanco(atual.dados);
        erroAtual = null;
        return copiar(resultado);
    }

    function executar(funcao, padrao) {
        try {
            var resultado = funcao();
            erroAtual = null;
            return copiar(resultado);
        } catch (falha) {
            registrarErro(falha);
            return padrao;
        }
    }

    function resultadoAssincrono(funcao) {
        return Promise.resolve().then(funcao).then(function (dados) {
            erroAtual = null;
            return { ok: true, status: 200, dados: copiar(dados) };
        }, function (falha) {
            var detalhes = registrarErro(falha);
            return { ok: false, status: detalhes.status, dados: copiar(detalhes) };
        });
    }

    function avisarDados() {
        global.dispatchEvent(new CustomEvent("nutriqDadosAtualizados"));
    }

    function avisarPerfil() {
        global.dispatchEvent(new CustomEvent("nutriqPerfilAtualizado"));
    }

    function bytesBase64(bytes) {
        var texto = "";
        bytes.forEach(function (byte) { texto += String.fromCharCode(byte); });
        return global.btoa(texto);
    }

    function base64Bytes(texto) {
        return Uint8Array.from(global.atob(texto), function (caractere) { return caractere.charCodeAt(0); });
    }

    async function derivarSenha(senha, salt) {
        if (!global.crypto || !global.crypto.subtle || !global.crypto.getRandomValues) {
            throw erro("Este navegador não oferece o recurso de proteção necessário para a autenticação local.", null, "DEMO_CRIPTOGRAFIA_INDISPONIVEL", 503);
        }
        var chave = await global.crypto.subtle.importKey(
            "raw",
            new TextEncoder().encode(String(senha)),
            "PBKDF2",
            false,
            ["deriveBits"]
        );
        var bits = await global.crypto.subtle.deriveBits({
            name: "PBKDF2",
            salt: base64Bytes(salt),
            iterations: ITERACOES_SENHA,
            hash: "SHA-256"
        }, chave, 256);
        return Array.from(new Uint8Array(bits), function (byte) { return byte.toString(16).padStart(2, "0"); }).join("");
    }

    async function novaSenhaHash(senha) {
        if (!global.crypto || !global.crypto.getRandomValues) {
            throw erro("Este navegador não oferece o recurso de proteção necessário para a autenticação local.", null, "DEMO_CRIPTOGRAFIA_INDISPONIVEL", 503);
        }
        var sal = new Uint8Array(16);
        global.crypto.getRandomValues(sal);
        var salt = bytesBase64(sal);
        return { salt: salt, hash: await derivarSenha(senha, salt) };
    }

    function validarSenha(senha, campo) {
        if (String(senha || "").length < 6) throw erro("A senha deve ter pelo menos 6 caracteres.", campo, "DADOS_INVALIDOS");
        if (String(senha).length > 128) throw erro("A senha deve ter no máximo 128 caracteres.", campo, "DADOS_INVALIDOS");
    }

    function notificarFalha(mensagem, campo) {
        var falha = erro(mensagem, campo);
        registrarErro(falha);
        return null;
    }

    function validarPaciente(dados, atual, novo) {
        var nome = String(dados.nome || "").replace(/\s+/g, " ").trim();
        var email = String(dados.email || "").trim().toLowerCase();
        var telefone = String(dados.telefone || "").trim();
        var cpfEntrada = String(dados.cpf || "").trim();
        var cpf = cpfEntrada ? formatarCpf(cpfEntrada) : "";
        var nascimento = String(dados.nascimento || "");
        var genero = String(dados.genero || "");
        var altura = dados.altura === "" || dados.altura == null ? null : Number(dados.altura);
        var peso = novo && dados.peso !== "" && dados.peso != null ? Number(dados.peso) : null;

        if (nome.length < 2) throw erro("Informe o nome do paciente.", "pacNome");
        if (!emailValido(email)) throw erro("Informe um e-mail válido.", "pacEmail");
        if (!/^[\d()+ .-]+$/.test(telefone) || !/^\d{10,11}$/.test(telefone.replace(/\D/g, ""))) {
            throw erro("Informe o DDD e um telefone válido com 10 ou 11 dígitos.", "pacTelefone");
        }
        if (cpfEntrada && !cpfValido(cpfEntrada)) throw erro("CPF inválido. Confira os números.", "pacCpf");
        if (!dataValida(nascimento) || nascimento < "1900-01-01" || nascimento > hojeISO()) {
            throw erro("Informe uma data de nascimento válida.", "pacNascimento");
        }
        if (!["Feminino", "Masculino", "Outro"].includes(genero)) throw erro("Selecione o gênero.", "pacGenero");
        if (altura != null && (!Number.isFinite(altura) || altura < 50 || altura > 250)) throw erro("Use uma altura entre 50 e 250 cm.", "pacAltura");
        if (peso != null && (!Number.isFinite(peso) || peso < 2 || peso > 500)) throw erro("Use um peso entre 2 e 500 kg.", "pacPeso");

        var usuarioAtual = contaAtual(lerBanco());
        var existentes = usuarioAtual ? usuarioAtual.pacientes : [];
        if (cpf && existentes.some(function (paciente) { return paciente.id !== (atual && atual.id) && paciente.cpf === cpf; })) {
            throw erro("Já existe um paciente com este CPF.", "pacCpf", "CONFLITO", 409);
        }

        return {
            nome: nome,
            email: email,
            telefone: telefone,
            cpf: cpf,
            nascimento: nascimento,
            genero: genero,
            altura: altura,
            status: ["ativo", "inativo", "alta"].includes(dados.status) ? dados.status : "ativo",
            objetivo: String(dados.objetivo || "").trim(),
            observacoes: String(dados.observacoes || "").trim(),
            peso: peso
        };
    }

    function avaliacaoComImc(avaliacao, alturaPaciente) {
        var altura = avaliacao.altura || alturaPaciente;
        var valor = imc(avaliacao.peso, altura);
        return Object.assign({}, avaliacao, {
            imc: valor,
            classificacaoImc: classificarImc(valor, false)
        });
    }

    function listarPacientes(conta, filtros) {
        var termo = normalizar(filtros && filtros.busca);
        return conta.pacientes.filter(function (paciente) {
            if (filtros && filtros.status && paciente.status !== filtros.status) return false;
            if (!termo) return true;
            return [paciente.nome, paciente.email, paciente.cpf, paciente.telefone]
                .some(function (valor) { return normalizar(valor).includes(termo); });
        }).sort(function (a, b) {
            return String(a.criadoEm).localeCompare(String(b.criadoEm));
        });
    }

    function obterPaciente(conta, pacienteId) {
        return conta.pacientes.find(function (paciente) { return paciente.id === String(pacienteId); }) || null;
    }

    function exigirPaciente(conta, pacienteId) {
        var paciente = obterPaciente(conta, pacienteId);
        if (!paciente) throw erro("Paciente não encontrado.", null, "NAO_ENCONTRADO", 404);
        return paciente;
    }

    function listarPlanos(conta, filtros) {
        var pacienteId = filtros && (filtros.pacienteId || filtros.paciente);
        return conta.planos.filter(function (plano) {
            return (!pacienteId || plano.pacienteId === pacienteId) &&
                (!filtros || !filtros.status || plano.status === filtros.status);
        }).sort(function (a, b) {
            return String(a.criadoEm).localeCompare(String(b.criadoEm));
        });
    }

    function calcularKcal(macros) {
        return Math.round((Number(macros.carboidratos) || 0) * 4 +
            (Number(macros.proteinas) || 0) * 4 +
            (Number(macros.gorduras) || 0) * 9);
    }

    function validarPlano(dados) {
        var nome = String(dados.nome || "").trim();
        var inicio = String(dados.inicio || "");
        var fim = String(dados.fim || "");
        var calorias = dados.calorias == null || dados.calorias === "" ? null : Number(dados.calorias);
        var macrosOriginais = dados.macros && typeof dados.macros === "object" ? dados.macros : null;
        var temMacros = Boolean(macrosOriginais && ["carboidratos", "proteinas", "gorduras"].some(function (chave) {
            return macrosOriginais[chave] != null && macrosOriginais[chave] !== "";
        }));
        var macros = temMacros ? {
            carboidratos: Number(macrosOriginais.carboidratos) || 0,
            proteinas: Number(macrosOriginais.proteinas) || 0,
            gorduras: Number(macrosOriginais.gorduras) || 0
        } : null;

        if (nome.length < 2) throw erro("Informe o nome do plano.", "plnNome");
        if (!dataValida(inicio)) throw erro("Informe a data de início.", "plnInicio");
        if (fim && !dataValida(fim)) throw erro("Data de término inválida.", "plnFim");
        if (fim && fim < inicio) throw erro("O término deve ser depois do início.", "plnFim");
        if (calorias != null && (!Number.isFinite(calorias) || calorias < 500 || calorias > 6000)) {
            throw erro("Use um valor entre 500 e 6000 kcal.", "plnCalorias");
        }
        if (macros && Object.values(macros).some(function (valor) { return valor < 0 || valor > 1500; })) {
            throw erro("Use valores entre 0 e 1500 g para os macronutrientes.", "plnCarb");
        }
        if (calorias == null && macros) {
            calorias = calcularKcal(macros);
            if (calorias < 500 || calorias > 6000) calorias = null;
        }

        var criadoEm = dados.criadoEm || dados.dataCadastro || agoraISO();
        return {
            id: dados.id || novaId(),
            pacienteId: dados.pacienteId,
            paciente: dados.paciente || "",
            nome: nome,
            objetivo: String(dados.objetivo || "").trim(),
            inicio: inicio,
            fim: fim,
            calorias: calorias == null ? null : Math.round(calorias),
            macrosTipo: dados.macrosTipo === "%" ? "%" : "g",
            macros: macros,
            observacoes: String(dados.observacoes != null ? dados.observacoes : dados.descricao || "").trim(),
            descricao: String(dados.observacoes != null ? dados.observacoes : dados.descricao || "").trim(),
            status: ["ativo", "concluido"].includes(dados.status) ? dados.status : "ativo",
            criadoEm: criadoEm,
            dataCadastro: criadoEm
        };
    }

    function consultarHorario(conta, data, hora, ignorarId) {
        var instante = dataHora(data, hora);
        if (!instante) return false;
        return conta.consultas.some(function (consulta) {
            if (consulta.id === ignorarId || consulta.status === "cancelada") return false;
            var existente = dataHora(consulta.data, consulta.hora);
            return existente && Math.abs(instante.getTime() - existente.getTime()) < 30 * 60 * 1000;
        });
    }

    function validarConsulta(conta, dados, original) {
        var paciente = obterPaciente(conta, dados.pacienteId);
        if (!paciente) throw erro("Selecione o paciente.", "csPaciente");
        var data = String(dados.data || "");
        var hora = String(dados.hora || dados.horario || "").slice(0, 5);
        var status = ["agendada", "realizada", "cancelada"].includes(dados.status) ? dados.status : "agendada";
        var instante = dataHora(data, hora);
        if (!instante) throw erro("Informe uma data e horário válidos.", "csData");

        var mudouHorario = !original || original.data !== data || original.hora !== hora || original.status !== "agendada";
        if (status === "agendada" && mudouHorario && instante.getTime() < Date.now()) {
            throw erro("Escolha um horário futuro ou mude a situação para Realizada.", "csHora");
        }
        if (status === "realizada" && instante.getTime() > Date.now()) {
            throw erro("Uma consulta realizada não pode estar no futuro.", "csData");
        }
        if (status !== "cancelada" && consultarHorario(conta, data, hora, original && original.id)) {
            throw erro("Respeite o intervalo mínimo de 30 minutos entre consultas.", "csHora", "CONFLITO", 409);
        }

        var nota = dados.avaliacao == null || dados.avaliacao === "" ? null : Number(dados.avaliacao);
        if (status === "realizada" && nota != null && (nota < 1 || nota > 5)) {
            throw erro("Use uma nota de 1 a 5.", "csAvaliacao");
        }
        return {
            id: dados.id || novaId(),
            pacienteId: paciente.id,
            paciente: paciente.nome,
            data: data,
            hora: hora,
            horario: hora,
            tipo: String(dados.tipo || "Consulta").trim().slice(0, 80) || "Consulta",
            status: status,
            avaliacao: status === "realizada" && nota != null ? Math.round(nota) : null,
            observacoes: String(dados.observacoes || "").trim(),
            criadoEm: dados.criadoEm || agoraISO()
        };
    }

    function listaConsultas(conta, filtros) {
        filtros = filtros || {};
        var agora = new Date();
        return conta.consultas.filter(function (consulta) {
            if (filtros.paciente && consulta.pacienteId !== filtros.paciente) return false;
            if (filtros.pacienteId && consulta.pacienteId !== filtros.pacienteId) return false;
            if (filtros.status && consulta.status !== filtros.status) return false;
            var instante = dataHora(consulta.data, consulta.hora);
            if (filtros.periodo === "futuras" && !(consulta.status === "agendada" && instante >= agora)) return false;
            if (filtros.periodo === "anteriores" && consulta.status === "agendada" && instante >= agora) return false;
            if (filtros.de && consulta.data < filtros.de) return false;
            if (filtros.ate && consulta.data > filtros.ate) return false;
            return true;
        }).sort(function (a, b) {
            return (a.data + "T" + a.hora).localeCompare(b.data + "T" + b.hora);
        });
    }

    function proximasConsultas(conta, dias, limite) {
        var agora = new Date();
        var fim = new Date(agora.getTime() + dias * 24 * 60 * 60 * 1000);
        return listaConsultas(conta).filter(function (consulta) {
            var instante = dataHora(consulta.data, consulta.hora);
            return consulta.status === "agendada" && instante >= agora && instante <= fim;
        }).slice(0, limite);
    }

    function percentual(atual, meta) {
        return meta > 0 ? Math.max(0, Math.min(100, atual / meta * 100)) : 0;
    }

    function taxaAdesao(conta) {
        var hoje = hojeISO();
        var limite = new Date();
        limite.setDate(limite.getDate() - 60);
        var desde = limite.getFullYear() + "-" + dois(limite.getMonth() + 1) + "-" + dois(limite.getDate());
        var ativos = conta.pacientes.filter(function (paciente) {
            return paciente.status !== "inativo" && paciente.status !== "alta";
        });
        if (!ativos.length) return null;
        var acompanhados = ativos.filter(function (paciente) {
            var avaliacaoRecente = paciente.avaliacoes.some(function (avaliacao) { return avaliacao.data >= desde && avaliacao.data <= hoje; });
            var consultaRecente = conta.consultas.some(function (consulta) {
                if (consulta.pacienteId !== paciente.id) return false;
                if (consulta.status === "realizada") return consulta.data >= desde && dataHora(consulta.data, consulta.hora) <= new Date();
                return consulta.status === "agendada" && dataHora(consulta.data, consulta.hora) >= new Date();
            });
            return avaliacaoRecente || consultaRecente;
        }).length;
        return Math.round(acompanhados / ativos.length * 100);
    }

    function resumoDashboard(conta) {
        var totalPacientes = conta.pacientes.length;
        var totalPlanos = conta.planos.length;
        var totalAvaliacoes = conta.pacientes.reduce(function (total, paciente) { return total + paciente.avaliacoes.length; }, 0);
        var totalConsultas = conta.consultas.length;
        var hoje = hojeISO();
        var mes = hoje.slice(0, 7);
        var adesao = taxaAdesao(conta);
        var metas = {
            pacientes: percentual(totalPacientes, 10),
            planos: percentual(totalPlanos, 10),
            avaliacoes: percentual(totalAvaliacoes, 10),
            adesao: adesao
        };
        var indicadores = [metas.pacientes, metas.planos, metas.avaliacoes];
        if (adesao != null) indicadores.push(adesao);
        var pacientesRecentes = conta.pacientes.slice().sort(function (a, b) {
            return String(b.criadoEm).localeCompare(String(a.criadoEm));
        }).slice(0, 5).map(function (paciente) {
            return {
                id: paciente.id,
                nome: paciente.nome,
                status: paciente.status,
                criadoEm: paciente.criadoEm,
                temPlano: conta.planos.some(function (plano) { return plano.pacienteId === paciente.id && plano.status === "ativo"; })
            };
        });

        return {
            totalPacientes: totalPacientes,
            pacientesAtivos: conta.pacientes.filter(function (paciente) { return paciente.status === "ativo"; }).length,
            totalPlanos: totalPlanos,
            totalAvaliacoes: totalAvaliacoes,
            totalConsultas: totalConsultas,
            novosNoMes: conta.pacientes.filter(function (paciente) { return String(paciente.criadoEm).slice(0, 7) === mes; }).length,
            taxaAdesao: adesao,
            metas: metas,
            percentualGeral: indicadores.reduce(function (total, valor) { return total + valor; }, 0) / indicadores.length,
            pacientesRecentes: pacientesRecentes,
            proximasConsultas: proximasConsultas(conta, 30, 5)
        };
    }

    function macrosDistribuicao(plano) {
        if (!plano || !plano.macros) return null;
        var macros = plano.macros;
        var energia = plano.macrosTipo === "%"
            ? [Number(macros.carboidratos) || 0, Number(macros.proteinas) || 0, Number(macros.gorduras) || 0]
            : [(Number(macros.carboidratos) || 0) * 4, (Number(macros.proteinas) || 0) * 4, (Number(macros.gorduras) || 0) * 9];
        var total = energia.reduce(function (soma, valor) { return soma + valor; }, 0);
        if (!total) return null;
        return {
            carboidratos: Math.round(energia[0] / total * 100),
            proteinas: Math.round(energia[1] / total * 100),
            gorduras: Math.round(energia[2] / total * 100)
        };
    }

    function relatorio(conta, pacienteId) {
        var paciente = exigirPaciente(conta, pacienteId);
        var historico = paciente.avaliacoes.slice().sort(function (a, b) {
            return (a.data + String(a.criadoEm || "")).localeCompare(b.data + String(b.criadoEm || ""));
        }).map(function (avaliacao) { return avaliacaoComImc(avaliacao, paciente.altura); });
        var planos = listarPlanos(conta, { pacienteId: pacienteId }).sort(function (a, b) {
            var ativoA = a.status !== "concluido" ? 1 : 0;
            var ativoB = b.status !== "concluido" ? 1 : 0;
            return ativoA !== ativoB ? ativoB - ativoA : String(b.criadoEm).localeCompare(String(a.criadoEm));
        });
        var plano = planos[0] || null;
        var anos = idade(paciente.nascimento);
        var medicoes = historico.slice(-6).map(function (avaliacao) {
            return {
                data: avaliacao.data,
                peso: avaliacao.peso,
                altura: avaliacao.altura || paciente.altura,
                imc: imc(avaliacao.peso, avaliacao.altura || paciente.altura)
            };
        });
        var medidosComImc = medicoes.filter(function (medicao) { return medicao.imc != null; });
        var ultimoImc = medidosComImc.length ? medidosComImc[medidosComImc.length - 1].imc : null;
        var consultasRealizadas = conta.consultas.filter(function (consulta) {
            return consulta.pacienteId === pacienteId && consulta.status === "realizada";
        }).sort(function (a, b) {
            return (b.data + b.hora).localeCompare(a.data + a.hora);
        });
        var adulto = anos == null || anos >= 18;

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
            ultimaConsulta: consultasRealizadas.length ? consultasRealizadas[0].data : null,
            plano: plano,
            medicoes: medicoes,
            totalAvaliacoes: historico.length,
            variacaoPeso: medicoes.length > 1
                ? Math.round((medicoes[medicoes.length - 1].peso - medicoes[0].peso) * 10) / 10
                : null,
            ultimoImc: ultimoImc,
            classificacaoImc: ultimoImc != null && adulto ? classificarImc(ultimoImc, false) : "",
            adulto: adulto,
            distribuicaoMacros: macrosDistribuicao(plano),
            emailValido: emailValido(paciente.email),
            emailConfigurado: false,
            geradoEm: hojeISO()
        };
    }

    function calcular(tipo, dados) {
        dados = dados || {};
        if (tipo === "imc") {
            var pesoImc = Number(dados.peso);
            var alturaImc = Number(dados.altura);
            if (!Number.isFinite(pesoImc) || pesoImc < 1 || pesoImc > 500) throw erro("Informe um peso entre 1 e 500 kg.", "peso");
            if (!Number.isFinite(alturaImc) || alturaImc < 50 || alturaImc > 250) throw erro("Informe uma altura entre 50 e 250 cm.", "altura");
            var valorImc = imc(pesoImc, alturaImc);
            return { imc: valorImc, classificacao: classificarImc(valorImc, true), peso: pesoImc, altura: alturaImc };
        }
        if (tipo === "agua") {
            var pesoAgua = Number(dados.peso);
            var atividade = Number(dados.atividadeAgua);
            var clima = Number(dados.clima);
            if (!Number.isFinite(pesoAgua) || pesoAgua < 1 || pesoAgua > 500) throw erro("Informe um peso entre 1 e 500 kg.", "peso");
            if (![0, 350, 700].includes(atividade)) throw erro("Selecione o nível de atividade física.", "atividadeAgua");
            if (![0, 300, 500].includes(clima)) throw erro("Selecione a condição climática.", "clima");
            var baseMl = pesoAgua * 35;
            return {
                baseMl: Math.round(baseMl),
                totalMl: Math.round(baseMl + atividade + clima),
                litros: Math.round((baseMl + atividade + clima) / 10) / 100,
                ajusteMl: atividade + clima,
                peso: pesoAgua
            };
        }
        if (tipo === "macros") {
            var sexo = String(dados.sexo || "");
            var idadePessoa = Number(dados.idade);
            var pesoPessoa = Number(dados.peso);
            var alturaPessoa = Number(dados.altura);
            var fator = Number(dados.atividade);
            var objetivos = {
                emagrecer: { rotulo: "Emagrecer", fator: 0.8, proteina: 2 },
                manter: { rotulo: "Manter peso", fator: 1, proteina: 1.8 },
                ganhar: { rotulo: "Ganhar massa muscular", fator: 1.1, proteina: 2 }
            };
            var objetivo = objetivos[dados.objetivo];
            var atividades = {
                "1.2": "Sedentário",
                "1.375": "Levemente ativo",
                "1.55": "Moderadamente ativo",
                "1.725": "Muito ativo",
                "1.9": "Extremamente ativo"
            };
            if (!["masculino", "feminino"].includes(sexo)) throw erro("Selecione o sexo.", "sexo");
            if (!Number.isFinite(idadePessoa) || idadePessoa < 18 || idadePessoa > 120) throw erro("Informe uma idade entre 18 e 120 anos.", "idade");
            if (!Number.isFinite(pesoPessoa) || pesoPessoa < 1 || pesoPessoa > 500) throw erro("Informe um peso entre 1 e 500 kg.", "peso");
            if (!Number.isFinite(alturaPessoa) || alturaPessoa < 50 || alturaPessoa > 250) throw erro("Informe uma altura entre 50 e 250 cm.", "altura");
            if (!atividades[String(dados.atividade)]) throw erro("Selecione o nível de atividade física.", "atividade");
            if (!objetivo) throw erro("Selecione o objetivo.", "objetivo");
            var tmb = 10 * pesoPessoa + 6.25 * alturaPessoa - 5 * idadePessoa + (sexo === "masculino" ? 5 : -161);
            var gasto = tmb * fator;
            var calorias = gasto * objetivo.fator;
            var proteinas = pesoPessoa * objetivo.proteina;
            var gorduras = pesoPessoa * 0.8;
            var carboidratos = Math.max(0, (calorias - proteinas * 4 - gorduras * 9) / 4);
            function arredondar(numero) { return Math.round(numero); }
            function percentualMacro(gramas, kcal) { return calorias > 0 ? arredondar(gramas * kcal / calorias * 100) : 0; }
            return {
                tmb: arredondar(tmb),
                gasto: arredondar(gasto),
                calorias: arredondar(calorias),
                proteinas: arredondar(proteinas),
                carboidratos: arredondar(carboidratos),
                gorduras: arredondar(gorduras),
                percentuais: {
                    proteinas: percentualMacro(proteinas, 4),
                    carboidratos: percentualMacro(carboidratos, 4),
                    gorduras: percentualMacro(gorduras, 9)
                },
                atividade: atividades[String(dados.atividade)],
                objetivo: objetivo.rotulo
            };
        }
        throw erro("Calculadora não encontrada.", null, "ROTA_INEXISTENTE", 404);
    }

    function criarApi(publica) {
        function usuarioAtual() {
            var dados = lerBanco();
            var usuario = contaAtual(dados);
            return usuario ? usuario.usuario : null;
        }

        function perfilAtual() {
            var dados = lerBanco();
            var usuario = contaAtual(dados);
            return usuario ? usuario.perfil : {};
        }

        function salvarPerfil(dadosPerfil) {
            var perfil = executar(function () {
                return alterarConta(function (usuario) {
                    var dados = dadosPerfil || {};
                    var campos = ["nome", "email", "telefone", "cidade", "estado", "crn", "especialidade", "apresentacao", "foto"];
                    campos.forEach(function (campo) {
                        if (dados[campo] !== undefined) usuario.perfil[campo] = dados[campo];
                    });
                    if (dados.preferencias && typeof dados.preferencias === "object") {
                        usuario.perfil.preferencias = Object.assign({}, usuario.perfil.preferencias, dados.preferencias);
                    }
                    if (dados.notificacoesLidas !== undefined) usuario.perfil.notificacoesLidas = dados.notificacoesLidas;
                    usuario.usuario.nome = usuario.perfil.nome;
                    usuario.usuario.email = usuario.perfil.email;
                    usuario.usuario.crn = usuario.perfil.crn;
                    return usuario.perfil;
                });
            }, null);
            if (!perfil) return { ok: false, erro: api.mensagemErro("Não foi possível salvar o perfil."), campo: erroAtual && erroAtual.campo };
            avisarPerfil();
            return { ok: true, perfil: perfil };
        }

        function novoPaciente(dados) {
            var paciente = executar(function () {
                return alterarConta(function (usuario) {
                    var validado = validarPaciente(dados || {}, null, true);
                    var novo = {
                        id: novaId(),
                        nome: validado.nome,
                        email: validado.email,
                        telefone: validado.telefone,
                        cpf: validado.cpf,
                        nascimento: validado.nascimento,
                        genero: validado.genero,
                        altura: validado.altura,
                        status: validado.status,
                        objetivo: validado.objetivo,
                        observacoes: validado.observacoes,
                        criadoEm: agoraISO(),
                        dataCadastro: agoraISO(),
                        avaliacoes: []
                    };
                    usuario.pacientes.push(novo);
                    return novo;
                });
            }, null);
            if (paciente) avisarDados();
            return paciente;
        }

        function atualizarPaciente(pacienteId, alteracoes) {
            var pacienteAtualizado = executar(function () {
                return alterarConta(function (usuario) {
                    var paciente = exigirPaciente(usuario, pacienteId);
                    var validado = validarPaciente(Object.assign({}, paciente, alteracoes), paciente, false);
                    Object.assign(paciente, validado);
                    return paciente;
                });
            }, null);
            if (pacienteAtualizado) avisarDados();
            return pacienteAtualizado;
        }

        function adicionarAvaliacao(pacienteId, dados) {
            return executar(function () {
                var resultado = alterarConta(function (usuario) {
                    var paciente = exigirPaciente(usuario, pacienteId);
                    var avaliacaoDados = dados || {};
                    var data = String(avaliacaoDados.data || "");
                    var peso = Number(avaliacaoDados.peso);
                    var altura = avaliacaoDados.altura == null || avaliacaoDados.altura === "" ? null : Number(avaliacaoDados.altura);
                    if (!dataValida(data) || data > hojeISO()) throw erro("Informe uma data de avaliação válida.", "avData");
                    if (!Number.isFinite(peso) || peso < 2 || peso > 500) throw erro("Informe um peso entre 2 e 500 kg.", "avPeso");
                    if (altura != null && (!Number.isFinite(altura) || altura < 50 || altura > 250)) throw erro("Use uma altura entre 50 e 250 cm.", "avAltura");
                    var avaliacao = {
                        id: novaId(),
                        pacienteId: paciente.id,
                        data: data,
                        peso: peso,
                        altura: altura,
                        observacoes: String(avaliacaoDados.observacoes || "").trim(),
                        criadoEm: agoraISO()
                    };
                    paciente.avaliacoes.push(avaliacao);
                    if (!paciente.altura && altura) paciente.altura = altura;
                    return avaliacaoComImc(avaliacao, paciente.altura);
                });
                avisarDados();
                return resultado;
            }, null);
        }

        function adicionarConsulta(dados) {
            return executar(function () {
                var resultado = alterarConta(function (usuario) {
                    var consulta = validarConsulta(usuario, dados || {}, null);
                    usuario.consultas.push(consulta);
                    return consulta;
                });
                avisarDados();
                return resultado;
            }, null);
        }

        function atualizarConsulta(consultaId, dados) {
            return executar(function () {
                var resultado = alterarConta(function (usuario) {
                    var atual = usuario.consultas.find(function (consulta) { return consulta.id === String(consultaId); });
                    if (!atual) throw erro("Consulta não encontrada.", null, "NAO_ENCONTRADO", 404);
                    var combinado = Object.assign({}, atual, dados || {});
                    if (dados && dados.status && dados.status !== "realizada" && dados.avaliacao === undefined) combinado.avaliacao = null;
                    var consulta = validarConsulta(usuario, combinado, atual);
                    Object.assign(atual, consulta);
                    return atual;
                });
                avisarDados();
                return resultado;
            }, null);
        }

        var api = {
            modoDemonstracao: function () { return true; },
            erro: function () { return copiar(erroAtual); },
            mensagemErro: function (padrao) { return (erroAtual && erroAtual.erro) || padrao; },
            limparCache: function () {},
            usuario: function () { return copiar(usuarioAtual()); },
            perfil: function () { return copiar(perfilAtual()); },
            salvarPerfil: salvarPerfil,

            alterarSenha: function (senhaAtual, novaSenha) {
                return Promise.resolve().then(async function () {
                    validarSenha(novaSenha, "novaSenha");
                    var dados = lerBanco();
                    var usuario = exigirConta(dados);
                    var verificacao = await derivarSenha(senhaAtual, usuario.senha.salt);
                    if (verificacao !== usuario.senha.hash) throw erro("A senha atual está incorreta.", "senhaAtual");
                    var senha = await novaSenhaHash(novaSenha);
                    var resultado = alterarConta(function (atual) {
                        atual.senha = senha;
                        return true;
                    });
                    erroAtual = null;
                    return { ok: Boolean(resultado) };
                }).catch(function (falha) {
                    var detalhes = registrarErro(falha);
                    return { ok: false, erro: detalhes.erro };
                });
            },

            entrar: function (email, senha, lembrar) {
                return resultadoAssincrono(async function () {
                    var endereco = String(email || "").trim().toLowerCase();
                    var dados = lerBanco();
                    var usuario = dados.usuarios.find(function (item) { return item.usuario.email.toLowerCase() === endereco; });
                    if (!usuario) throw erro("Este e-mail não está cadastrado. Verifique o endereço ou crie uma conta.", "loginEmail", "EMAIL_NAO_CADASTRADO", 401);
                    if (await derivarSenha(senha, usuario.senha.salt) !== usuario.senha.hash) {
                        throw erro("E-mail ou senha incorretos.", "loginPassword", "SENHA_INCORRETA", 401);
                    }
                    dados.sessao = { usuarioId: usuario.id, lembrar: lembrar !== false, criadoEm: agoraISO() };
                    salvarBanco(dados);
                    return { usuario: usuario.usuario, perfil: usuario.perfil };
                });
            },

            cadastrar: function (dadosCadastro) {
                return resultadoAssincrono(async function () {
                    var dados = dadosCadastro || {};
                    var nome = String(dados.nome || "").replace(/\s+/g, " ").trim();
                    var email = String(dados.email || "").trim().toLowerCase();
                    var cpf = String(dados.cpf || "").trim();
                    var crn = String(dados.crn || "").trim();
                    if (nome.length < 3) throw erro("Informe seu nome completo.", "registerName");
                    if (!emailValido(email)) throw erro("Digite um e-mail válido.", "registerEmail");
                    if (!cpfValido(cpf)) throw erro("Digite um CPF válido.", "registerCPF");
                    if (crn.length < 4) throw erro("Informe seu número de CRN.", "registerCRN");
                    validarSenha(dados.senha, "registerPassword");
                    if (lerBanco().usuarios.some(function (usuario) { return usuario.usuario.email.toLowerCase() === email; })) {
                        throw erro("Já existe uma conta com este e-mail.", "registerEmail", "CONFLITO", 409);
                    }
                    var senha = await novaSenhaHash(dados.senha);
                    var id = novaId();
                    var usuario = {
                        id: id,
                        nome: nome,
                        email: email,
                        crn: crn,
                        perfil: "nutricionista"
                    };
                    var perfil = {
                        nome: nome,
                        email: email,
                        telefone: "",
                        cidade: "",
                        estado: "",
                        crn: crn,
                        especialidade: "",
                        apresentacao: "",
                        foto: null,
                        preferencias: Object.assign({}, PREFERENCIAS_PADRAO),
                        notificacoesLidas: []
                    };
                    var dadosConta = {
                        id: id,
                        usuario: usuario,
                        senha: senha,
                        perfil: perfil,
                        pacientes: [],
                        planos: [],
                        consultas: []
                    };
                    var banco = lerBanco();
                    if (banco.usuarios.some(function (item) { return item.usuario.email.toLowerCase() === email; })) {
                        throw erro("Já existe uma conta com este e-mail.", "registerEmail", "CONFLITO", 409);
                    }
                    banco.usuarios.push(dadosConta);
                    salvarBanco(banco);
                    return { usuario: usuario };
                });
            },

            recuperarSenha: function () {
                return Promise.resolve({
                    ok: false,
                    status: 503,
                    dados: { erro: "A recuperação por e-mail não está disponível no modo de demonstração.", codigo: "DEMO_EMAIL_INDISPONIVEL" }
                });
            },
            redefinirSenha: function () {
                return Promise.resolve({
                    ok: false,
                    status: 503,
                    dados: { erro: "A redefinição por e-mail não está disponível no modo de demonstração.", codigo: "DEMO_EMAIL_INDISPONIVEL" }
                });
            },
            sair: function () {
                try {
                    var dados = lerBanco();
                    dados.sessao = null;
                    salvarBanco(dados);
                    erroAtual = null;
                } catch (falha) {
                    registrarErro(falha);
                }
                global.location.replace("index.html");
            },

            pacientes: {
                listar: function (filtros) {
                    return executar(function () { return listarPacientes(lerConta().usuario, filtros || {}); }, null);
                },
                obter: function (pacienteId) {
                    return executar(function () { return obterPaciente(lerConta().usuario, pacienteId); }, null);
                },
                criar: novoPaciente,
                atualizar: atualizarPaciente,
                excluir: function (pacienteId) {
                    var resumo = executar(function () {
                        return alterarConta(function (usuario) {
                            var paciente = exigirPaciente(usuario, pacienteId);
                            var vinculos = {
                                planos: usuario.planos.filter(function (plano) { return plano.pacienteId === paciente.id; }).length,
                                consultas: usuario.consultas.filter(function (consulta) { return consulta.pacienteId === paciente.id; }).length,
                                avaliacoes: paciente.avaliacoes.length
                            };
                            usuario.pacientes = usuario.pacientes.filter(function (item) { return item.id !== paciente.id; });
                            usuario.planos = usuario.planos.filter(function (plano) { return plano.pacienteId !== paciente.id; });
                            usuario.consultas = usuario.consultas.filter(function (consulta) { return consulta.pacienteId !== paciente.id; });
                            return vinculos;
                        });
                    }, null);
                    if (resumo) avisarDados();
                    return resumo;
                },
                vinculos: function (pacienteId) {
                    return executar(function () {
                        var usuario = lerConta().usuario;
                        var paciente = exigirPaciente(usuario, pacienteId);
                        return {
                            planos: usuario.planos.filter(function (plano) { return plano.pacienteId === paciente.id; }).length,
                            consultas: usuario.consultas.filter(function (consulta) { return consulta.pacienteId === paciente.id; }).length,
                            avaliacoes: paciente.avaliacoes.length
                        };
                    }, null);
                },
                adicionarAvaliacao: adicionarAvaliacao,
                removerAvaliacao: function (pacienteId, avaliacaoId) {
                    var removida = executar(function () {
                        return alterarConta(function (usuario) {
                            var paciente = exigirPaciente(usuario, pacienteId);
                            var antes = paciente.avaliacoes.length;
                            paciente.avaliacoes = paciente.avaliacoes.filter(function (avaliacao) { return avaliacao.id !== String(avaliacaoId); });
                            if (antes === paciente.avaliacoes.length) throw erro("Avaliação não encontrada.", null, "NAO_ENCONTRADO", 404);
                            return true;
                        });
                    }, false);
                    if (removida) avisarDados();
                    return removida;
                }
            },

            avaliacoes: {
                listar: function () {
                    return executar(function () {
                        return lerConta().usuario.pacientes.reduce(function (todas, paciente) {
                            return todas.concat(paciente.avaliacoes.map(function (avaliacao) {
                                return Object.assign({}, avaliacao, { pacienteId: paciente.id });
                            }));
                        }, []).sort(function (a, b) {
                            return (a.data + a.criadoEm).localeCompare(b.data + b.criadoEm);
                        });
                    }, null);
                },
                atualizar: function (avaliacaoId, dados) {
                    var resultado = executar(function () {
                        return alterarConta(function (usuario) {
                            var paciente = usuario.pacientes.find(function (item) {
                                return item.avaliacoes.some(function (avaliacao) { return avaliacao.id === String(avaliacaoId); });
                            });
                            if (!paciente) throw erro("Avaliação não encontrada.", null, "NAO_ENCONTRADO", 404);
                            var atual = paciente.avaliacoes.find(function (avaliacao) { return avaliacao.id === String(avaliacaoId); });
                            var combinado = Object.assign({}, atual, dados || {});
                            var data = String(combinado.data || "");
                            var peso = Number(combinado.peso);
                            var altura = combinado.altura == null || combinado.altura === "" ? null : Number(combinado.altura);
                            if (!dataValida(data) || data > hojeISO()) throw erro("Informe uma data de avaliação válida.", "avData");
                            if (!Number.isFinite(peso) || peso < 2 || peso > 500) throw erro("Informe um peso entre 2 e 500 kg.", "avPeso");
                            if (altura != null && (!Number.isFinite(altura) || altura < 50 || altura > 250)) throw erro("Use uma altura entre 50 e 250 cm.", "avAltura");
                            Object.assign(atual, { data: data, peso: peso, altura: altura, observacoes: String(combinado.observacoes || "").trim() });
                            return atual;
                        });
                    }, null);
                    if (resultado) avisarDados();
                    return resultado;
                },
                excluir: function (avaliacaoId) {
                    var removida = executar(function () {
                        return alterarConta(function (usuario) {
                            var paciente = usuario.pacientes.find(function (item) {
                                return item.avaliacoes.some(function (avaliacao) { return avaliacao.id === String(avaliacaoId); });
                            });
                            if (!paciente) throw erro("Avaliação não encontrada.", null, "NAO_ENCONTRADO", 404);
                            paciente.avaliacoes = paciente.avaliacoes.filter(function (avaliacao) { return avaliacao.id !== String(avaliacaoId); });
                            return true;
                        });
                    }, false);
                    if (removida) avisarDados();
                    return removida;
                }
            },

            planos: {
                listar: function (filtros) {
                    return executar(function () { return listarPlanos(lerConta().usuario, filtros || {}); }, null);
                },
                obter: function (planoId) {
                    return executar(function () {
                        var usuario = lerConta().usuario;
                        return usuario.planos.find(function (plano) { return plano.id === String(planoId); }) || null;
                    }, null);
                },
                criar: function (dados) {
                    var resultado = executar(function () {
                        return alterarConta(function (usuario) {
                            exigirPaciente(usuario, dados && dados.pacienteId);
                            var plano = validarPlano(Object.assign({}, dados, {
                                paciente: obterPaciente(usuario, dados.pacienteId).nome
                            }));
                            usuario.planos.push(plano);
                            return plano;
                        });
                    }, null);
                    if (resultado) avisarDados();
                    return resultado;
                },
                atualizar: function (planoId, dados) {
                    var resultado = executar(function () {
                        return alterarConta(function (usuario) {
                            var atual = usuario.planos.find(function (plano) { return plano.id === String(planoId); });
                            if (!atual) throw erro("Plano alimentar não encontrado.", null, "NAO_ENCONTRADO", 404);
                            var combinado = Object.assign({}, atual, dados || {});
                            if (combinado.pacienteId !== atual.pacienteId) exigirPaciente(usuario, combinado.pacienteId);
                            combinado.paciente = obterPaciente(usuario, combinado.pacienteId).nome;
                            Object.assign(atual, validarPlano(combinado));
                            return atual;
                        });
                    }, null);
                    if (resultado) avisarDados();
                    return resultado;
                },
                excluir: function (planoId) {
                    var removido = executar(function () {
                        return alterarConta(function (usuario) {
                            var antes = usuario.planos.length;
                            usuario.planos = usuario.planos.filter(function (plano) { return plano.id !== String(planoId); });
                            if (antes === usuario.planos.length) throw erro("Plano alimentar não encontrado.", null, "NAO_ENCONTRADO", 404);
                            return true;
                        });
                    }, false);
                    if (removido) avisarDados();
                    return removido;
                },
                enviar: function () {
                    return Promise.resolve({
                        ok: false,
                        status: 503,
                        dados: { erro: "O envio por e-mail não está disponível no modo de demonstração.", codigo: "DEMO_EMAIL_INDISPONIVEL" }
                    });
                }
            },

            consultas: {
                listar: function (filtros) {
                    return executar(function () { return listaConsultas(lerConta().usuario, filtros || {}); }, null);
                },
                obter: function (consultaId) {
                    return executar(function () {
                        var usuario = lerConta().usuario;
                        return usuario.consultas.find(function (consulta) { return consulta.id === String(consultaId); }) || null;
                    }, null);
                },
                criar: adicionarConsulta,
                atualizar: atualizarConsulta,
                excluir: function (consultaId) {
                    var removida = executar(function () {
                        return alterarConta(function (usuario) {
                            var antes = usuario.consultas.length;
                            usuario.consultas = usuario.consultas.filter(function (consulta) { return consulta.id !== String(consultaId); });
                            if (antes === usuario.consultas.length) throw erro("Consulta não encontrada.", null, "NAO_ENCONTRADO", 404);
                            return true;
                        });
                    }, false);
                    if (removida) avisarDados();
                    return removida;
                },
                conflito: function (data, hora, ignorarId) {
                    return executar(function () { return consultarHorario(lerConta().usuario, data, hora, ignorarId); }, false);
                }
            },

            dashboard: function () {
                return executar(function () { return resumoDashboard(lerConta().usuario); }, null);
            },
            notificacoes: function () {
                return executar(function () {
                    var usuario = lerConta().usuario;
                    var lidas = new Set(usuario.perfil.notificacoesLidas || []);
                    var itens = proximasConsultas(usuario, 7, 50).map(function (consulta) {
                        var chave = [consulta.id, consulta.data, consulta.hora].join("|");
                        return { chave: chave, lida: lidas.has(chave), consulta: consulta };
                    });
                    return { itens: itens, naoLidas: itens.filter(function (item) { return !item.lida; }).length };
                }, null);
            },
            marcarNotificacoes: function (chaves) {
                var resultado = executar(function () {
                    return alterarConta(function (usuario) {
                        var atuais = new Set(usuario.perfil.notificacoesLidas || []);
                        (Array.isArray(chaves) ? chaves : []).forEach(function (chave) { atuais.add(String(chave)); });
                        usuario.perfil.notificacoesLidas = Array.from(atuais);
                        return true;
                    });
                }, false);
                if (resultado) avisarDados();
                return resultado;
            },
            relatorio: function (pacienteId) {
                return executar(function () { return relatorio(lerConta().usuario, pacienteId); }, null);
            },
            enviarRelatorio: function () {
                return Promise.resolve({
                    ok: false,
                    status: 503,
                    dados: { erro: "O envio por e-mail não está disponível no modo de demonstração.", codigo: "DEMO_EMAIL_INDISPONIVEL" }
                });
            },
            calcular: function (tipo, dados) {
                return executar(function () { return calcular(tipo, dados); }, null);
            }
        };

        try {
            var banco = lerBanco();
            if (!publica && !contaAtual(banco)) global.location.replace("index.html");
        } catch (falha) {
            registrarErro(falha);
        }
        return api;
    }

    global.NutriqDemoStore = {
        criarApi: criarApi,
        chaveArmazenamento: CHAVE
    };
})(window);
