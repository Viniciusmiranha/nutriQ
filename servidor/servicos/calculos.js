"use strict";

const { numero, noIntervalo, Validador, dataValida, normalizarData } = require("../utils/validacao");

const FATORES_ATIVIDADE = {
    "1.2": "Sedentário",
    "1.375": "Levemente ativo",
    "1.55": "Moderadamente ativo",
    "1.725": "Muito ativo",
    "1.9": "Extremamente ativo"
};

const OBJETIVOS = {
    emagrecer: { rotulo: "Emagrecer", fatorCalorico: 0.8, proteinaPorKg: 2 },
    manter: { rotulo: "Manter peso", fatorCalorico: 1, proteinaPorKg: 1.8 },
    ganhar: { rotulo: "Ganhar massa muscular", fatorCalorico: 1.1, proteinaPorKg: 2 }
};

const GORDURA_POR_KG = 0.8;
const KCAL_POR_GRAMA = { carboidratos: 4, proteinas: 4, gorduras: 9 };

const ADICIONAL_AGUA_ATIVIDADE = [0, 350, 700];
const ADICIONAL_AGUA_CLIMA = [0, 300, 500];
const AGUA_ML_POR_KG = 35;

function arredondar(valor, casas = 0) {
    const fator = 10 ** casas;
    return Math.round(valor * fator) / fator;
}

function taxaMetabolicaBasal({ sexo, peso, altura, idade }) {
    return 10 * peso + 6.25 * altura - 5 * idade + (sexo === "masculino" ? 5 : -161);
}

function calcularMacros(dados) {
    const v = new Validador();
    const sexo = String(dados.sexo || "");
    const idade = numero(dados.idade);
    const peso = numero(dados.peso);
    const altura = numero(dados.altura);
    const fator = String(dados.atividade || "");
    const objetivo = OBJETIVOS[dados.objetivo];

    if (!["masculino", "feminino"].includes(sexo)) v.falha("sexo", "Selecione o sexo.");
    if (!noIntervalo(idade, 18, 120)) v.falha("idade", "Informe uma idade entre 18 e 120 anos.");
    if (!noIntervalo(peso, 1, 500)) v.falha("peso", "Informe um peso entre 1 e 500 kg.");
    if (!noIntervalo(altura, 50, 250)) v.falha("altura", "Informe uma altura entre 50 e 250 cm.");
    if (!FATORES_ATIVIDADE[fator]) v.falha("atividade", "Selecione o nível de atividade física.");
    if (!objetivo) v.falha("objetivo", "Selecione o objetivo.");
    v.verificar();

    const tmb = taxaMetabolicaBasal({ sexo, peso, altura, idade });
    const gasto = tmb * Number(fator);
    const calorias = gasto * objetivo.fatorCalorico;
    const proteinas = peso * objetivo.proteinaPorKg;
    const gorduras = peso * GORDURA_POR_KG;
    const carboidratos = Math.max(0, (calorias - proteinas * KCAL_POR_GRAMA.proteinas - gorduras * KCAL_POR_GRAMA.gorduras) / KCAL_POR_GRAMA.carboidratos);

    const percentual = (gramas, nutriente) => calorias > 0 ? (gramas * KCAL_POR_GRAMA[nutriente] / calorias) * 100 : 0;

    return {
        tmb: arredondar(tmb),
        gasto: arredondar(gasto),
        calorias: arredondar(calorias),
        proteinas: arredondar(proteinas),
        carboidratos: arredondar(carboidratos),
        gorduras: arredondar(gorduras),
        percentuais: {
            proteinas: arredondar(percentual(proteinas, "proteinas")),
            carboidratos: arredondar(percentual(carboidratos, "carboidratos")),
            gorduras: arredondar(percentual(gorduras, "gorduras"))
        },
        atividade: FATORES_ATIVIDADE[fator],
        objetivo: objetivo.rotulo
    };
}

function imc(peso, alturaCm) {
    const p = Number(peso);
    const a = Number(alturaCm);
    if (!(p > 0) || !(a > 0)) return null;
    const metros = a > 3 ? a / 100 : a;
    return arredondar(p / (metros * metros), 1);
}

function classificarImc(valor, detalhado = false) {
    if (valor == null) return "";
    if (valor < 18.5) return "Abaixo do peso";
    if (valor < 25) return "Peso normal";
    if (valor < 30) return "Sobrepeso";
    if (!detalhado) return "Obesidade";
    if (valor < 35) return "Obesidade grau I";
    if (valor < 40) return "Obesidade grau II";
    return "Obesidade grau III";
}

function calcularImc(dados) {
    const v = new Validador();
    const peso = numero(dados.peso);
    const altura = numero(dados.altura);
    if (!noIntervalo(peso, 1, 500)) v.falha("peso", "Informe um peso entre 1 e 500 kg.");
    if (!noIntervalo(altura, 50, 250)) v.falha("altura", "Informe uma altura entre 50 e 250 cm.");
    v.verificar();

    const valor = imc(peso, altura);
    return { imc: valor, classificacao: classificarImc(valor, true), peso, altura };
}

function calcularAgua(dados) {
    const v = new Validador();
    const peso = numero(dados.peso);
    const atividade = numero(dados.atividadeAgua);
    const clima = numero(dados.clima);
    if (!noIntervalo(peso, 1, 500)) v.falha("peso", "Informe um peso entre 1 e 500 kg.");
    if (!ADICIONAL_AGUA_ATIVIDADE.includes(atividade)) v.falha("atividadeAgua", "Selecione o nível de atividade física.");
    if (!ADICIONAL_AGUA_CLIMA.includes(clima)) v.falha("clima", "Selecione a condição climática.");
    v.verificar();

    const baseMl = peso * AGUA_ML_POR_KG;
    const totalMl = baseMl + atividade + clima;
    return {
        baseMl: arredondar(baseMl),
        totalMl: arredondar(totalMl),
        litros: arredondar(totalMl / 1000, 2),
        ajusteMl: atividade + clima,
        peso
    };
}

function kcalDosMacros(carboidratos, proteinas, gorduras) {
    return Math.round((carboidratos || 0) * KCAL_POR_GRAMA.carboidratos +
        (proteinas || 0) * KCAL_POR_GRAMA.proteinas +
        (gorduras || 0) * KCAL_POR_GRAMA.gorduras);
}

function distribuicaoMacros(plano) {
    if (!plano || !plano.macros) return null;
    const c = Number(plano.macros.carboidratos) || 0;
    const p = Number(plano.macros.proteinas) || 0;
    const g = Number(plano.macros.gorduras) || 0;
    const energia = plano.macrosTipo === "%" ? [c, p, g] : [c * 4, p * 4, g * 9];
    const total = energia[0] + energia[1] + energia[2];
    if (!total) return null;
    return {
        carboidratos: Math.round(energia[0] / total * 100),
        proteinas: Math.round(energia[1] / total * 100),
        gorduras: Math.round(energia[2] / total * 100)
    };
}

function idade(dataNascimento) {
    if (!dataValida(dataNascimento)) return null;
    const [ano, mes, dia] = normalizarData(dataNascimento).split("-").map(Number);
    const hoje = new Date();
    let anos = hoje.getFullYear() - ano;
    if (hoje.getMonth() + 1 < mes || (hoje.getMonth() + 1 === mes && hoje.getDate() < dia)) anos--;
    return anos >= 0 ? anos : null;
}

module.exports = {
    calcularMacros,
    calcularImc,
    calcularAgua,
    imc,
    classificarImc,
    kcalDosMacros,
    distribuicaoMacros,
    idade,
    taxaMetabolicaBasal
};
