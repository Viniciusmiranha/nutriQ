
"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const $ = (id) => document.getElementById(id);

  const form = $("perfilForm");
  const feedback = $("perfilFeedback");
  const api = window.NutriqApi;

  const campos = [
    "nome",
    "email",
    "telefone",
    "cidade",
    "estado",
    "crn",
    "especialidade",
    "apresentacao"
  ];

  const preferencias = [
    "notificacoesEmail",
    "lembretesConsulta",
    "modoEscuro"
  ];

  let dadosOriginais = {};
  let preferenciasOriginais = {};
  let fotoTemporaria = null;

  function perfilSalvo() {
    return api ? api.perfil() : {};
  }

  function mostrarFeedback(mensagem, erro = false) {
    feedback.textContent = mensagem;
    feedback.style.color = erro ? "#c0392b" : "var(--perfil-primary)";
  }

  function lerCampo(id) {
    return $(id).value.trim();
  }

  function coletarDados() {
    return Object.fromEntries(
      campos.map((campo) => [campo, lerCampo(campo)])
    );
  }

  function coletarPreferencias() {
    return Object.fromEntries(
      preferencias.map((id) => [id, $(id).checked])
    );
  }

  function renderizarPerfil(dados) {
    $("nomeExibicao").textContent = dados.nome || "Meu perfil";
    $("cargoExibicao").textContent = dados.crn
      ? `Nutricionista · ${dados.crn}`
      : "Nutricionista";

    $("emailExibicao").textContent = dados.email || "Adicione seu e-mail";

    const local = [dados.cidade, dados.estado]
      .filter(Boolean)
      .join(", ");

    $("cidadeExibicao").textContent = local || "Adicione sua cidade";

    $("avatarInitial").textContent =
      (dados.nome || "N").trim().charAt(0).toUpperCase();
  }

  function preencherCampos(dados) {
    campos.forEach((campo) => {
      $(campo).value = dados[campo] || "";
    });

    renderizarPerfil(dados);
    atualizarContador();
  }

  function atualizarContador() {
    $("contadorApresentacao").textContent =
      $("apresentacao").value.length;
  }

  function aplicarPreferencias(dados) {
    preferencias.forEach((id) => {
      $(id).checked = Boolean(dados[id]);
    });

    document.body.classList.toggle(
      "dark-mode",
      Boolean(dados.modoEscuro)
    );

    window.dispatchEvent(new CustomEvent("nutriqTemaAlterado", {
      detail: { modoEscuro: Boolean(dados.modoEscuro) }
    }));
  }

  function salvarPreferencias() {
    const dados = coletarPreferencias();
    const resultado = api.salvarPerfil({ preferencias: dados });

    if (!resultado.ok) {
      aplicarPreferencias(preferenciasOriginais);
      return false;
    }

    preferenciasOriginais = { ...dados };
    aplicarPreferencias(dados);
    return true;
  }

  function restaurarDados() {
    const dados = perfilSalvo();
    const prefs = Object.assign({
      notificacoesEmail: true,
      lembretesConsulta: true,
      modoEscuro: false
    }, dados.preferencias || {});

    preencherCampos(dados);
    aplicarPreferencias(prefs);

    dadosOriginais = coletarDados();
    preferenciasOriginais = coletarPreferencias();

    if (dados.foto) {
      mostrarFoto(dados.foto);
    } else {
      $("removerFoto").hidden = true;
    }
  }

  function mostrarFoto(src) {
    const avatar = $("avatarPreview");
    avatar.replaceChildren();

    const img = document.createElement("img");
    img.src = src;
    img.alt = "Foto do perfil";

    img.addEventListener("error", () => {
      avatar.replaceChildren();
      $("avatarInitial").textContent =
        (lerCampo("nome") || "N").charAt(0).toUpperCase();
      avatar.appendChild($("avatarInitial"));
    }, { once: true });

    avatar.appendChild(img);
    $("removerFoto").hidden = false;
  }

  const seletorFoto = document.querySelector(".avatar-edit");
  seletorFoto.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      $("fotoPerfil").click();
    }
  });

  $("fotoPerfil").addEventListener("change", (event) => {
    const arquivo = event.target.files[0];

    if (!arquivo) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(arquivo.type)) {
      mostrarFeedback("Escolha uma imagem JPG, PNG ou WEBP.", true);
      event.target.value = "";
      return;
    }

    if (arquivo.size > 2 * 1024 * 1024) {
      mostrarFeedback("A foto deve ter no máximo 2 MB.", true);
      event.target.value = "";
      return;
    }

    const leitor = new FileReader();
    leitor.onload = () => {
      const imagem = new Image();
      imagem.onload = () => {
        if (imagem.width * imagem.height > 30000000) {
          mostrarFeedback("A imagem tem resolução excessiva. Escolha uma imagem menor.", true);
          return;
        }

        const escala = Math.min(1, 600 / Math.max(imagem.width, imagem.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(imagem.width * escala));
        canvas.height = Math.max(1, Math.round(imagem.height * escala));
        const contexto = canvas.getContext("2d");
        if (!contexto) {
          mostrarFeedback("Não foi possível processar esta imagem.", true);
          return;
        }
        contexto.fillStyle = "#ffffff";
        contexto.fillRect(0, 0, canvas.width, canvas.height);
        contexto.drawImage(imagem, 0, 0, canvas.width, canvas.height);

        canvas.toBlob((blob) => {
          if (!blob || blob.size > 700 * 1024) {
            mostrarFeedback("Não foi possível reduzir a foto para um tamanho seguro.", true);
            return;
          }
          const leitorCompactado = new FileReader();
          leitorCompactado.onload = () => {
            fotoTemporaria = leitorCompactado.result;
            mostrarFoto(fotoTemporaria);
            mostrarFeedback("Prévia da foto atualizada. Salve o perfil para manter a alteração.");
          };
          leitorCompactado.onerror = () => mostrarFeedback("Não foi possível preparar a foto.", true);
          leitorCompactado.readAsDataURL(blob);
        }, "image/jpeg", 0.82);
      };
      imagem.onerror = () => mostrarFeedback("Não foi possível abrir esta imagem.", true);
      imagem.src = leitor.result;
    };
    leitor.onerror = () => mostrarFeedback("Não foi possível abrir esta imagem.", true);
    leitor.readAsDataURL(arquivo);
  });

  $("removerFoto").addEventListener("click", () => {
    if (!window.confirm("Remover a foto de perfil? Esta ação não pode ser desfeita.")) return;
    const resultado = api.salvarPerfil({ foto: null });
    if (!resultado.ok) {
      mostrarFeedback(resultado.erro, true);
      return;
    }
    fotoTemporaria = null;
    $("fotoPerfil").value = "";
    $("avatarPreview").replaceChildren($("avatarInitial"));
    $("avatarInitial").textContent = (lerCampo("nome") || "N").charAt(0).toUpperCase();
    $("removerFoto").hidden = true;
    mostrarFeedback("Foto removida.");
  });

  form.addEventListener("input", (event) => {
    if (campos.includes(event.target.id)) {
      renderizarPerfil(coletarDados());
    }

    if (event.target.id === "apresentacao") {
      atualizarContador();
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!form.reportValidity()) return;

    const senhaAtual = $("senhaAtual").value;
    const novaSenha = $("novaSenha").value;
    const confirmarSenha = $("confirmarSenha").value;

    if (novaSenha || confirmarSenha || senhaAtual) {
      if (!senhaAtual || !novaSenha || !confirmarSenha) {
        mostrarFeedback(
          "Preencha a senha atual, a nova senha e a confirmação.",
          true
        );
        return;
      }

      if (novaSenha.length < 6) {
        mostrarFeedback(
          "A nova senha deve ter pelo menos 6 caracteres.",
          true
        );
        return;
      }

      if (novaSenha !== confirmarSenha) {
        mostrarFeedback("As senhas novas não coincidem.", true);
        return;
      }

      const troca = await api.alterarSenha(senhaAtual, novaSenha);
      if (!troca.ok) {
        mostrarFeedback(troca.erro, true);
        return;
      }
    }

    const dados = coletarDados();
    const prefs = coletarPreferencias();
    const envio = Object.assign({}, dados, { preferencias: prefs });

    if (fotoTemporaria) {
      envio.foto = fotoTemporaria;
    }

    const resultado = api.salvarPerfil(envio);
    if (!resultado.ok) {
      mostrarFeedback(resultado.erro, true);
      return;
    }

    dadosOriginais = { ...coletarDados() };
    preferenciasOriginais = { ...prefs };
    fotoTemporaria = null;

    $("senhaAtual").value = "";
    $("novaSenha").value = "";
    $("confirmarSenha").value = "";

    aplicarPreferencias(prefs);
    renderizarPerfil(dados);

    mostrarFeedback(novaSenha ? "Perfil e senha atualizados com sucesso." : "Perfil salvo com sucesso.");
  });

  $("descartarAlteracoes").addEventListener("click", () => {
    preencherCampos(dadosOriginais);
    aplicarPreferencias(preferenciasOriginais);

    fotoTemporaria = null;
    $("fotoPerfil").value = "";

    const salvos = perfilSalvo();

    if (salvos.foto) {
      mostrarFoto(salvos.foto);
    } else {
      $("avatarPreview").replaceChildren($("avatarInitial"));
      $("avatarInitial").textContent =
        (dadosOriginais.nome || "N").charAt(0).toUpperCase();
      $("removerFoto").hidden = true;
    }

    $("senhaAtual").value = "";
    $("novaSenha").value = "";
    $("confirmarSenha").value = "";

    mostrarFeedback("Alterações não salvas foram descartadas.");
  });

  preferencias.forEach((id) => {
    $(id).addEventListener("change", () => {
      if (salvarPreferencias()) {
        mostrarFeedback("Preferência atualizada.");
      } else {
        mostrarFeedback("Não foi possível salvar a preferência.", true);
      }
    });
  });

  document.querySelectorAll("[data-edit]").forEach((botao) => {
    botao.addEventListener("click", () => {
      const secao = $(botao.dataset.edit);
      const primeiroCampo = secao.querySelector("input, textarea");

      primeiroCampo?.focus();
    });
  });

  document.querySelectorAll(".perfil-menu-link").forEach((link) => {
    link.addEventListener("click", () => {
      document.querySelectorAll(".perfil-menu-link").forEach((item) => {
        item.classList.remove("active");
      });

      link.classList.add("active");
    });
  });

  $("sairConta")?.addEventListener("click", () => {
    if (window.confirm("Deseja sair da sua conta?")) api.sair();
  });

  restaurarDados();
});
