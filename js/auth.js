"use strict";

const recoverForm = document.getElementById("recoverForm");
const resetForm = document.getElementById("resetForm");
let tokenRedefinicao = null;

const TELAS_AUTH = {
    login: { form: () => loginForm, titulo: "Entrar no NUTRIQ", descricao: "Acesse sua conta profissional.", foco: "loginEmail" },
    cadastro: { form: () => registerForm, titulo: "Criar conta profissional", descricao: "Comece agora a aproveitar todos os recursos do NUTRIQ.", foco: "registerName" },
    recuperar: { form: () => recoverForm, titulo: "Recuperar senha", descricao: "Informe seu e-mail para receber um link de redefinição.", foco: "recoverEmail" },
    redefinir: { form: () => resetForm, titulo: "Criar nova senha", descricao: "Defina uma nova senha para sua conta.", foco: "resetPassword" }
};

function mostrarTela(nome) {
    if (!loginForm || !registerForm) return;
    const tela = TELAS_AUTH[nome] || TELAS_AUTH.login;

    Object.values(TELAS_AUTH).forEach(item => item.form()?.classList.toggle("hidden", item !== tela));
    document.getElementById("lpTitulo").textContent = tela.titulo;
    document.getElementById("lpCardDescription").textContent = tela.descricao;

    limparErros();
    limparFeedback();
    document.getElementById(tela.foco)?.focus();
}

function atualizarTelaAuth(cadastro) {
    mostrarTela(cadastro ? "cadastro" : "login");
}

showRegister?.addEventListener("click", () => mostrarTela("cadastro"));
backToLogin?.addEventListener("click", () => mostrarTela("login"));
document.getElementById("showRecover")?.addEventListener("click", () => {
    const email = document.getElementById("loginEmail")?.value.trim();
    mostrarTela("recuperar");
    if (email) document.getElementById("recoverEmail").value = email;
});
document.querySelectorAll(".lp-voltar-login").forEach(botao => botao.addEventListener("click", () => mostrarTela("login")));

function feedbackEm(id, tipo, mensagem) {
    const feedback = document.getElementById(id);
    if (!feedback) return;
    feedback.className = "lp-feedback " + tipo;
    feedback.textContent = mensagem;
    feedback.hidden = false;
}

recoverForm?.addEventListener("submit", async event => {
    event.preventDefault();
    limparErros();
    limparFeedback();

    const email = document.getElementById("recoverEmail").value.trim();
    if (!validarEmail(email)) {
        mostrarErro("recoverEmail", "Digite um e-mail válido.");
        return;
    }

    definirEnvio(recoverForm, true);
    const resposta = await NutriqApi.recuperarSenha(email);
    definirEnvio(recoverForm, false);

    if (!resposta.ok) {
        feedbackEm("recoverFeedback", "error", erroDoServidor(resposta, "Não foi possível enviar o link. Tente novamente."));
        return;
    }
    feedbackEm("recoverFeedback", "success", resposta.dados.mensagem);
});

resetForm?.addEventListener("submit", async event => {
    event.preventDefault();
    limparErros();
    limparFeedback();

    const senha = document.getElementById("resetPassword").value;
    const confirmar = document.getElementById("resetConfirmPassword").value;
    if (senha.length < 6) {
        mostrarErro("resetPassword", "A senha deve ter pelo menos 6 caracteres.");
        return;
    }
    if (senha !== confirmar) {
        mostrarErro("resetConfirmPassword", "As senhas não coincidem.");
        return;
    }

    definirEnvio(resetForm, true);
    const resposta = await NutriqApi.redefinirSenha(tokenRedefinicao, senha);
    definirEnvio(resetForm, false);

    if (!resposta.ok) {
        feedbackEm("resetFeedback", "error", erroDoServidor(resposta, "Não foi possível redefinir a senha."));
        return;
    }
    resetForm.reset();
    tokenRedefinicao = null;
    mostrarTela("login");
    mostrarFeedbackLogin("Senha alterada com sucesso. Entre com a nova senha.");
    document.getElementById("loginFeedback").className = "lp-feedback success";
});

(function verificarLinkDeRedefinicao() {
    const parametros = new URLSearchParams(window.location.search);
    const token = parametros.get("redefinir");
    if (!token || !resetForm) {
        if (loginForm) {
            if (NutriqApi.modoDemonstracao()) {
                if (NutriqApi.usuario()) window.location.replace("pagina1.html");
            } else {
                fetch("/api/auth/sessao", { credentials: "same-origin" })
                    .then(resposta => { if (resposta.ok) window.location.replace("pagina1.html"); })
                    .catch(() => {});
            }
        }
        return;
    }
    tokenRedefinicao = token;
    window.history.replaceState(null, "", window.location.pathname);
    mostrarTela("redefinir");
})();

function definirEnvio(form, enviando) {
    const botao = form?.querySelector("button[type='submit']");
    if (botao) botao.disabled = enviando;
}

function erroDoServidor(resposta, padrao) {
    return (resposta.dados && resposta.dados.erro) || padrao;
}

loginForm?.addEventListener(
    "submit",
    async event => {
        event.preventDefault();

        limparErros();
        limparFeedback();

        const email =
            document
                .getElementById("loginEmail")
                .value
                .trim();

        const senha =
            document
                .getElementById("loginPassword")
                .value;

        if (!validarEmail(email)) {
            mostrarErro(
                "loginEmail",
                "Digite um e-mail válido."
            );
            return;
        }

        if (senha.length < 6) {
            mostrarErro(
                "loginPassword",
                "A senha deve ter pelo menos 6 caracteres."
            );
            return;
        }

        definirEnvio(loginForm, true);
        const lembrar = document.getElementById("loginLembrar")?.checked !== false;
        const resposta = await NutriqApi.entrar(email, senha, lembrar);
        definirEnvio(loginForm, false);

        if (!resposta.ok) {
            mostrarFeedbackLogin(erroDoServidor(resposta, "Não foi possível entrar. Tente novamente."));
            return;
        }

        if (!NutriqApi.modoDemonstracao()) {
            sessionStorage.setItem("usuarioLogado", "true");
            sessionStorage.setItem("perfilUsuario", resposta.dados.usuario.perfil);
            if (resposta.dados.perfil?.preferencias) {
                try {
                    localStorage.setItem("nutriqPreferencias", JSON.stringify(resposta.dados.perfil.preferencias));
                } catch {}
            }
        }
        window.location.href = "pagina1.html";
    }
);

registerForm?.addEventListener(
    "submit",
    async event => {
        event.preventDefault();

        limparErros();
        limparFeedback();

        const nome =
            document
                .getElementById("registerName")
                .value
                .trim();

        const email =
            document
                .getElementById("registerEmail")
                .value
                .trim();
        const cpf =
            document
                .getElementById("registerCPF")
                .value
                .trim();
        const crn =
            document
                .getElementById("registerCRN")
                .value
                .trim();

        const senha =
            document
                .getElementById("registerPassword")
                .value;

        const confirmar =
            document
                .getElementById("registerConfirmPassword")
                .value;

        if (nome.length < 3) {
            mostrarErro("registerName", "Informe seu nome completo.");
            return;
        }

        if (!validarEmail(email)) {
            mostrarErro("registerEmail", "Digite um e-mail válido.");
            return;
        }

        if (!NutriqValidacao.validarCPF(cpf)) {
            mostrarErro("registerCPF", "Digite um CPF válido.");
            return;
        }

        if (crn.length < 4) {
            mostrarErro("registerCRN", "Informe seu número de CRN.");
            return;
        }

        if (senha.length < 6) {
            mostrarErro("registerPassword", "A senha deve ter pelo menos 6 caracteres.");
            return;
        }

        if (senha !== confirmar) {
            mostrarErro("registerConfirmPassword", "As senhas não coincidem.");
            return;
        }

        definirEnvio(registerForm, true);
        const resposta = await NutriqApi.cadastrar({ nome, email, cpf, crn, senha });
        definirEnvio(registerForm, false);

        if (!resposta.ok) {
            const campo = resposta.dados?.campo;
            const mensagem = erroDoServidor(resposta, "Não foi possível criar a conta. Tente novamente.");
            if (campo && document.getElementById(campo)) {
                mostrarErro(campo, mensagem);
            } else {
                mostrarFeedback("error", mensagem);
            }
            return;
        }

        registerForm.reset();
        atualizarTelaAuth(false);
        document.getElementById("loginEmail").value = resposta.dados.usuario.email;
        document.getElementById("loginPassword").focus();
        mostrarFeedback("success", "Conta criada com sucesso. Entre com seu e-mail e senha.");
    }
);

function validarEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        .test(email);
}
function mostrarErro(
    inputId,
    mensagem
) {
    const input =
        document.getElementById(inputId);

    if (!input) {
        return;
    }

    input.classList.add("input-error");

    const grupo =
        input.closest(".form-group");

    if (!grupo) {
        return;
    }

    const erro =
        grupo.querySelector(".error-message");

    if (erro) {
        erro.textContent = mensagem;
    }
}

function limparErros() {
    document
        .querySelectorAll(".input-error")
        .forEach(
            input => {
                input.classList.remove("input-error");
            }
        );

    document
        .querySelectorAll(".error-message")
        .forEach(
            erro => {
                erro.textContent = "";
            }
        );
}

function mostrarFeedback(
    tipo,
    mensagem
) {
    const feedback = document.getElementById("lpFeedback");
    if (!feedback) return;

    feedback.className = "lp-feedback";
    feedback.classList.add(tipo);
    feedback.textContent = mensagem;
    feedback.hidden = false;
}

function mostrarFeedbackLogin(mensagem) {
    const feedback = document.getElementById("loginFeedback");
    if (!feedback) return;

    feedback.className = "lp-feedback error";
    feedback.textContent = mensagem;
    feedback.hidden = false;
}

function limparFeedback() {
    const feedback = document.getElementById("lpFeedback");
    if (feedback) {
        feedback.textContent = "";
        feedback.hidden = true;
    }

    ["loginFeedback", "recoverFeedback", "resetFeedback"].forEach(id => {
        const item = document.getElementById(id);
        if (item) {
            item.textContent = "";
            item.hidden = true;
        }
    });
}
