
"use strict";

document.addEventListener("DOMContentLoaded", () => {

const METAS = {
        pacientes: 10,
        planos: 10,
        avaliacoes: 10
    };

function limitarPercentual(valor) {
        return Math.max(0, Math.min(100, valor));
    }

    function calcularPercentual(atual, meta) {
        if (meta <= 0) {
            return 0;
        }

        return limitarPercentual((atual / meta) * 100);
    }

function atualizarBarra(indice, percentual, idValor) {
        const cards = document.querySelectorAll(
            ".dashboard-goal-item"
        );

        const card = cards[indice];

        const barra = card?.querySelector(
            ".dashboard-progress-track > span"
        );

        const valor = document.getElementById(idValor);

        const porcentagem = percentual == null
            ? 0
            : limitarPercentual(percentual);

        if (barra) {
            barra.style.width = `${porcentagem}%`;
            barra.style.transition = "width 0.6s ease";
        }

        if (valor) {
            valor.textContent = percentual == null
                ? "—"
                : `${Math.round(porcentagem)}%`;
        }
    }

function atualizarCirculo(percentual) {
        const circulo = document.querySelector(
            ".dashboard-ring-value"
        );

        const texto = document.getElementById(
            "percentualMetas"
        );

        const indicador = document.querySelector(
            ".dashboard-progress-ring"
        );

        const porcentagem = limitarPercentual(percentual);

const circunferencia = 2 * Math.PI * 48;

        const deslocamento =
            circunferencia * (1 - porcentagem / 100);

        if (circulo) {
            circulo.style.strokeDasharray =
                `${circunferencia}`;

            circulo.style.strokeDashoffset =
                `${deslocamento}`;

            circulo.style.transition =
                "stroke-dashoffset 0.6s ease";
        }

        if (texto) {
            texto.textContent = `${Math.round(porcentagem)}%`;
        }

        if (indicador) {
            indicador.setAttribute(
                "aria-label",
                `${Math.round(porcentagem)} por cento das metas concluídas`
            );
        }
    }

    const listaRecentes = document.getElementById("listaPacientes");
    const listaProximas = document.getElementById("listaConsultas");
    const ROTULOS_STATUS = { ativo: "Ativo", inativo: "Inativo", alta: "Alta" };

    function iniciaisDe(nome) {
        const partes = String(nome || "?").trim().split(/\s+/);
        return ((partes[0] || "?").charAt(0) + (partes.length > 1 ? partes[partes.length - 1].charAt(0) : "")).toUpperCase();
    }

    function renderizarRecentes(pacientes) {
        if (!listaRecentes) return;
        const vazio = listaRecentes.querySelector(".dashboard-empty-message");
        listaRecentes.querySelectorAll(".dashboard-patient-row").forEach(linha => linha.remove());
        if (vazio) vazio.hidden = pacientes.length > 0;

        pacientes.forEach(paciente => {
            const linha = document.createElement("a");
            linha.className = "dashboard-patient-row";
            linha.href = "pacientes.html?ficha=" + encodeURIComponent(paciente.id);
            linha.style.textDecoration = "none";

            const avatar = document.createElement("span");
            avatar.className = "dashboard-avatar";
            avatar.textContent = iniciaisDe(paciente.nome);

            const identidade = document.createElement("span");
            identidade.className = "dashboard-patient-identity";
            const nome = document.createElement("strong");
            nome.textContent = paciente.nome;
            const detalhe = document.createElement("span");
            detalhe.textContent = paciente.temPlano ? "Plano alimentar ativo" : "Sem plano ativo";
            identidade.append(nome, detalhe);

            const status = document.createElement("span");
            status.className = "dashboard-status " + (paciente.status === "ativo" ? "dashboard-status-active" : "dashboard-status-pending");
            status.textContent = ROTULOS_STATUS[paciente.status] || "Ativo";

            const data = document.createElement("time");
            data.dateTime = paciente.criadoEm;
            data.textContent = new Date(paciente.criadoEm).toLocaleDateString("pt-BR");

            const seta = document.createElement("span");
            seta.className = "dashboard-more-button";
            seta.setAttribute("aria-hidden", "true");
            seta.textContent = "›";

            linha.append(avatar, identidade, status, data, seta);
            listaRecentes.insertBefore(linha, vazio || null);
        });
    }

    function renderizarProximas(consultas) {
        if (!listaProximas) return;
        const vazio = listaProximas.querySelector(".dashboard-empty-message");
        listaProximas.querySelectorAll(".dashboard-appointment-row").forEach(linha => linha.remove());
        if (vazio) vazio.hidden = consultas.length > 0;

        consultas.forEach(consulta => {
            const [ano, mes, dia] = consulta.data.split("-").map(Number);
            const quando = new Date(ano, mes - 1, dia);

            const linha = document.createElement("div");
            linha.className = "dashboard-appointment-row";

            const selo = document.createElement("span");
            selo.className = "dashboard-date-badge";
            const numeroDia = document.createElement("strong");
            numeroDia.textContent = String(dia).padStart(2, "0");
            const nomeMes = document.createElement("span");
            nomeMes.textContent = quando.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "").toUpperCase();
            selo.append(numeroDia, nomeMes);

            const info = document.createElement("span");
            info.className = "dashboard-appointment-info";
            const nome = document.createElement("strong");
            nome.textContent = consulta.paciente;
            const detalhe = document.createElement("span");
            detalhe.textContent = consulta.hora + " · " + (consulta.tipo || "Consulta");
            info.append(nome, detalhe);

            const espaco = document.createElement("span");
            espaco.setAttribute("aria-hidden", "true");

            const abrir = document.createElement("a");
            abrir.className = "dashboard-start-button";
            abrir.href = "consultas.html?editar=" + encodeURIComponent(consulta.id);
            abrir.textContent = "Ver consulta";

            linha.append(selo, info, espaco, abrir);
            listaProximas.appendChild(linha);
        });
    }

function atualizarMetricas() {
        if (!window.NutriqDados) {
            console.warn(
                "NutriqDados não foi carregado. Verifique a ordem dos scripts."
            );

            return;
        }

        const resumo = window.NutriqDados.obterResumo();

const contadores = {
            totalPacientes: resumo.totalPacientes,
            totalPlanos: resumo.totalPlanos,
            totalAvaliacoes: resumo.totalAvaliacoes,
            totalConsultas: resumo.totalConsultas
        };

        Object.entries(contadores).forEach(([id, valor]) => {
            const elemento = document.getElementById(id);

            if (elemento) {
                elemento.textContent = valor;
            }
        });

const percentualPacientes = calcularPercentual(
            resumo.totalPacientes,
            METAS.pacientes
        );

        const percentualPlanos = calcularPercentual(
            resumo.totalPlanos,
            METAS.planos
        );

        const percentualAvaliacoes = calcularPercentual(
            resumo.totalAvaliacoes,
            METAS.avaliacoes
        );

        const percentualAdesao = resumo.taxaAdesao;
        renderizarRecentes(resumo.pacientesRecentes || []);
        renderizarProximas(resumo.proximasConsultas || []);
        const indicadorAdesao = document.getElementById("taxaAdesao");
        if (indicadorAdesao) {
            indicadorAdesao.textContent = percentualAdesao == null
                ? "—"
                : `${percentualAdesao}%`;
        }

atualizarBarra(
            0,
            percentualPacientes,
            "metaPacientesValor"
        );

        atualizarBarra(
            1,
            percentualPlanos,
            "metaPlanosValor"
        );

        atualizarBarra(
            2,
            percentualAvaliacoes,
            "metaAvaliacoesValor"
        );

        atualizarBarra(
            3,
            percentualAdesao,
            "metaAdesaoValor"
        );

const porcentagens = [
    percentualPacientes,
    percentualPlanos,
    percentualAvaliacoes
];

if (percentualAdesao != null) porcentagens.push(percentualAdesao);
const percentualGeral = porcentagens.reduce(
    (total, percentual) => total + percentual,
    0
) / porcentagens.length;

        atualizarCirculo(percentualGeral);
    }

atualizarMetricas();

window.addEventListener(
        "nutriqDadosAtualizados",
        atualizarMetricas
    );

window.addEventListener(
        "storage",
        atualizarMetricas
    );

    function normalizarBusca(valor) {
        return String(valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    }

    const busca = document.getElementById("campoBusca");
    const formularioBusca = document.getElementById("dashboardSearch");
    if (busca && formularioBusca && window.location.pathname.split("/").pop() === "pagina1.html") {
        const resultados = document.createElement("div");
        resultados.id = "dashboardSearchResults";
        resultados.className = "dashboard-search-results";
        resultados.setAttribute("role", "region");
        resultados.setAttribute("aria-label", "Resultados de pacientes");
        resultados.setAttribute("aria-live", "polite");
        resultados.hidden = true;
        formularioBusca.appendChild(resultados);
        busca.setAttribute("aria-controls", resultados.id);

        function atualizarBusca() {
            const termo = normalizarBusca(busca.value);
            resultados.replaceChildren();
            if (!termo) {
                resultados.hidden = true;
                busca.setAttribute("aria-expanded", "false");
                return;
            }
            const pacientes = typeof window.NutriqDados?.listarPacientes === "function"
                ? window.NutriqDados.listarPacientes()
                : [];
            const digitos = valor => String(valor || "").replace(/\D/g, "");
            const numeroTermo = digitos(termo);
            const correspondentes = pacientes.filter(paciente => {
                const dados = normalizarBusca([
                    paciente.nome,
                    paciente.email,
                    paciente.cpf,
                    paciente.telefone
                ].join(" "));
                const identificadores = digitos([paciente.cpf, paciente.telefone].join(" "));
                return dados.includes(termo) || Boolean(numeroTermo && identificadores.includes(numeroTermo));
            }).slice(0, 8);

            if (!correspondentes.length) {
                const vazio = document.createElement("p");
                vazio.className = "dashboard-search-empty";
                vazio.textContent = "Nenhum paciente encontrado.";
                resultados.appendChild(vazio);
            } else {
                correspondentes.forEach(paciente => {
                    const link = document.createElement("a");
                    link.className = "dashboard-search-result";
                    link.href = "pacientes.html?ficha=" + encodeURIComponent(paciente.id);
                    const nome = document.createElement("strong");
                    nome.textContent = paciente.nome || "Paciente sem nome";
                    const detalhe = document.createElement("small");
                    detalhe.textContent = paciente.email || paciente.telefone || paciente.cpf || "Abrir ficha do paciente";
                    link.append(nome, detalhe);
                    resultados.appendChild(link);
                });
            }
            resultados.hidden = false;
            busca.setAttribute("aria-expanded", "true");
        }

        busca.addEventListener("input", atualizarBusca);
        busca.addEventListener("keydown", evento => {
            if (evento.key === "Escape" && !resultados.hidden) {
                resultados.hidden = true;
                busca.setAttribute("aria-expanded", "false");
            }
        });
        formularioBusca.addEventListener("submit", evento => evento.preventDefault());
        document.addEventListener("click", evento => {
            if (!formularioBusca.contains(evento.target)) {
                resultados.hidden = true;
                busca.setAttribute("aria-expanded", "false");
            }
        });
        window.addEventListener("nutriqDadosAtualizados", atualizarBusca);
        window.addEventListener("storage", atualizarBusca);
    }

    const botaoNotificacoes = document.getElementById("btnNotificacoes");
    if (botaoNotificacoes) {
        const wrapper = document.createElement("div");
        wrapper.className = "dashboard-notification-wrap";
        botaoNotificacoes.parentNode.insertBefore(wrapper, botaoNotificacoes);
        wrapper.appendChild(botaoNotificacoes);

        const badge = document.createElement("span");
        badge.className = "dashboard-notification-badge";
        badge.hidden = true;
        badge.setAttribute("aria-hidden", "true");
        botaoNotificacoes.appendChild(badge);

        const painel = document.createElement("section");
        painel.id = "dashboardNotificationsPanel";
        painel.className = "dashboard-notification-panel";
        painel.setAttribute("role", "dialog");
        painel.setAttribute("aria-labelledby", "dashboardNotificationsTitle");
        painel.tabIndex = -1;
        painel.hidden = true;
        painel.innerHTML = '<header class="dashboard-notification-head"><h2 id="dashboardNotificationsTitle">Notificações</h2><button type="button" class="dashboard-notification-read">Marcar todas como lidas</button></header><div class="dashboard-notification-list" aria-live="polite"></div>';
        wrapper.appendChild(painel);
        botaoNotificacoes.setAttribute("aria-controls", painel.id);
        botaoNotificacoes.setAttribute("aria-haspopup", "dialog");
        botaoNotificacoes.setAttribute("aria-expanded", "false");

        const listaAvisos = painel.querySelector(".dashboard-notification-list");
        const marcarLidas = painel.querySelector(".dashboard-notification-read");
        let avisosAtuais = [];
        let lidasServidor = new Set();

        function lidasSalvas() {
            return new Set(lidasServidor);
        }

        function gravarLidas(lidas) {
            const novas = Array.from(lidas).filter(chave => !lidasServidor.has(chave));
            if (novas.length && window.NutriqApi?.marcarNotificacoes(novas)) {
                novas.forEach(chave => lidasServidor.add(chave));
            }
        }

        function consultarAgendamentos() {
            const resposta = window.NutriqApi ? window.NutriqApi.notificacoes() : { itens: [] };
            lidasServidor = new Set(resposta.itens.filter(item => item.lida).map(item => item.chave));
            avisosAtuais = resposta.itens.map(item => {
                const [ano, mes, dia] = item.consulta.data.split("-").map(Number);
                const [hora, minuto] = item.consulta.hora.split(":").map(Number);
                return { consulta: item.consulta, chave: item.chave, instante: new Date(ano, mes - 1, dia, hora, minuto) };
            });
        }

        function renderizarNotificacoes() {
            consultarAgendamentos();
            const lidas = lidasSalvas();
            const naoLidas = avisosAtuais.filter(item => !lidas.has(item.chave));
            badge.textContent = naoLidas.length > 9 ? "9+" : String(naoLidas.length);
            badge.hidden = naoLidas.length === 0;
            botaoNotificacoes.setAttribute("aria-label", naoLidas.length
                ? "Notificações, " + naoLidas.length + " não lidas"
                : "Notificações");
            marcarLidas.disabled = naoLidas.length === 0;
            listaAvisos.replaceChildren();

            if (!avisosAtuais.length) {
                const vazio = document.createElement("p");
                vazio.className = "dashboard-notification-empty";
                vazio.textContent = "Não há consultas próximas nos próximos 7 dias.";
                listaAvisos.appendChild(vazio);
                return;
            }

            avisosAtuais.forEach(item => {
                const consulta = item.consulta;
                const link = document.createElement("a");
                link.className = "dashboard-notification-item" + (lidas.has(item.chave) ? " is-read" : "");
                link.href = "consultas.html?editar=" + encodeURIComponent(consulta.id);
                const nome = document.createElement("strong");
                nome.textContent = consulta.paciente || "Consulta agendada";
                const data = document.createElement("small");
                data.textContent = item.instante.toLocaleString("pt-BR", {
                    weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"
                });
                link.append(nome, data);
                link.addEventListener("click", () => {
                    const atualizadas = lidasSalvas();
                    atualizadas.add(item.chave);
                    gravarLidas(atualizadas);
                });
                listaAvisos.appendChild(link);
            });
        }

        function fecharNotificacoes(devolverFoco) {
            painel.hidden = true;
            botaoNotificacoes.setAttribute("aria-expanded", "false");
            if (devolverFoco) botaoNotificacoes.focus();
        }

        botaoNotificacoes.addEventListener("click", () => {
            const abrir = painel.hidden;
            renderizarNotificacoes();
            painel.hidden = !abrir;
            botaoNotificacoes.setAttribute("aria-expanded", String(abrir));
            if (abrir) (marcarLidas.disabled ? listaAvisos.querySelector("a") || painel : marcarLidas).focus();
        });
        marcarLidas.addEventListener("click", () => {
            const lidas = lidasSalvas();
            avisosAtuais.forEach(item => lidas.add(item.chave));
            gravarLidas(lidas);
            renderizarNotificacoes();
            marcarLidas.focus();
        });
        document.addEventListener("click", evento => {
            if (!wrapper.contains(evento.target) && !painel.hidden) fecharNotificacoes(false);
        });
        document.addEventListener("keydown", evento => {
            if (evento.key === "Escape" && !painel.hidden) fecharNotificacoes(true);
        });
        window.addEventListener("nutriqDadosAtualizados", renderizarNotificacoes);
        window.addEventListener("storage", renderizarNotificacoes);
        setInterval(renderizarNotificacoes, 60000);
        renderizarNotificacoes();
    }

    function sincronizarPerfilDoPainel() {
        const perfil = window.NutriqApi ? window.NutriqApi.perfil() : {};
        const nome = document.getElementById("professionalName");
        if (nome) nome.textContent = perfil.nome || "Meu perfil";
        const avatar = document.querySelector(".dashboard-avatar-professional");
        if (!avatar) return;
        avatar.replaceChildren();
        if (perfil.foto) {
            const imagem = document.createElement("img");
            imagem.src = perfil.foto;
            imagem.alt = "";
            imagem.className = "dashboard-profile-photo";
            imagem.addEventListener("error", () => {
                avatar.textContent = (perfil.nome || "N").trim().charAt(0).toUpperCase();
            }, { once: true });
            avatar.appendChild(imagem);
        } else {
            avatar.textContent = (perfil.nome || "N").trim().charAt(0).toUpperCase();
        }
    }

    sincronizarPerfilDoPainel();
    window.addEventListener("nutriqPerfilAtualizado", sincronizarPerfilDoPainel);

    console.log(
        "NUTRIQ: dashboard.js carregado com barras dinâmicas."
    );
});

(() => {
    const botao = document.getElementById("btnVerPlanos");
    const modal = document.getElementById("modalPlanos");
    const fechar = document.getElementById("fecharModalPlanos");

    if (!botao || !modal || !fechar) {
        console.warn(
            "Verifique se btnVerPlanos, modalPlanos e fecharModalPlanos existem no HTML."
        );
        return;
    }

    let elementoAnterior = null;
    let overflowAnterior = "";

    function abrir() {
        elementoAnterior = document.activeElement;
        overflowAnterior = document.body.style.overflow;

        modal.classList.add("is-open");
        modal.setAttribute("aria-hidden", "false");

        document.body.style.overflow = "hidden";

        fechar.focus();
    }

    function fecharModal() {
        modal.classList.remove("is-open");
        modal.setAttribute("aria-hidden", "true");

        document.body.style.overflow = overflowAnterior;

        if (elementoAnterior) {
            elementoAnterior.focus();
        }
    }

    botao.addEventListener("click", abrir);
    fechar.addEventListener("click", fecharModal);

    modal.addEventListener("click", evento => {
        if (evento.target === modal) {
            fecharModal();
        }
    });

    document.addEventListener("keydown", evento => {
        if (
            evento.key === "Escape" &&
            modal.classList.contains("is-open")
        ) {
            fecharModal();
        }
    });
})();

(() => {
  const botao = document.getElementById("alternarBarraLateral");
  const pagina = document.querySelector(".dashboard-page");
  const chave = "nutriqBarraLateralOculta";
    const mobileMenu = window.matchMedia("(max-width: 1051px)");

  if (!botao || !pagina) return;

  function atualizarBotao(oculta) {
    botao.setAttribute("aria-expanded", String(!oculta));
    botao.setAttribute(
      "aria-label",
      oculta ? "Mostrar barra lateral" : "Esconder barra lateral"
    );
    botao.title = oculta ? "Mostrar barra lateral" : "Esconder barra lateral";
  }

    function sincronizar() {
        const desktop = !mobileMenu.matches;
        botao.hidden = !desktop;
        botao.setAttribute("aria-hidden", String(!desktop));
        botao.tabIndex = desktop ? 0 : -1;
        let oculta = false;
        try { oculta = desktop && localStorage.getItem(chave) === "true"; } catch {}
        pagina.classList.toggle("sidebar-collapsed", oculta);
        atualizarBotao(oculta);
    }

    sincronizar();
    mobileMenu.addEventListener("change", sincronizar);

  botao.addEventListener("click", () => {
        if (mobileMenu.matches) return;
        const oculta = !pagina.classList.contains("sidebar-collapsed");

    pagina.classList.toggle("sidebar-collapsed", oculta);
    atualizarBotao(oculta);

    try {
      localStorage.setItem(chave, String(oculta));
    } catch {}
  });
})();
