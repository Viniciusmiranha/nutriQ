# NUTRIQ — Relatório do Back-end

## 1. O que foi feito

O NUTRIQ deixou de guardar os dados no navegador (localStorage) e passou a ter um servidor próprio com banco de dados MySQL. Toda a regra de negócio — cadastro, login, senhas, pacientes, avaliações, planos, consultas, cálculos, relatórios e envio de e-mails — agora fica no back-end. O front-end continua com o mesmo visual e as mesmas telas; ele apenas envia o que o usuário digitou e mostra o que o servidor devolve.

Resumo das entregas:

| Área | Situação |
|---|---|
| Cadastro e autenticação | Cadastro de nutricionistas, login, logout, "manter conectado", troca de senha e recuperação de senha por e-mail |
| Pacientes | Cadastrar, listar, pesquisar, editar e excluir, sempre ligados ao nutricionista responsável |
| Avaliações físicas | Registrar, consultar histórico, editar e excluir; cálculo de IMC no servidor |
| Planos alimentares | Criar, consultar, editar, concluir/reabrir, excluir e enviar por e-mail |
| Consultas e agenda | Agendar, editar, concluir, cancelar, listar futuras e anteriores, bloqueio de conflito de horário |
| Perfil | Dados profissionais, foto, preferências (modo escuro, e-mails, lembretes) |
| Dashboard | Totais, metas, taxa de adesão, pacientes recentes e próximos atendimentos |
| Relatórios | Dados prontos para o relatório individual e envio por e-mail |
| E-mails | Relatório, resultado de avaliação, plano alimentar, lembrete de consulta e recuperação de senha |
| Notificações | Consultas dos próximos 7 dias, controle de lidas/não lidas |
| Segurança | Senhas com hash, sessões por cookie protegido, isolamento entre nutricionistas, consultas parametrizadas |
| Execução | Arquivo `iniciar.bat` instala as dependências, sobe o banco e abre o site em `http://localhost:3000` |

---

## 2. Back-end (funcionamento interno)

### Como está sendo desenvolvido o back-end?

O back-end é uma API REST feita com **Node.js** e **Express**, ligada a um banco **MySQL**. Ao iniciar, o servidor:

1. lê as configurações do arquivo `.env`;
2. conecta ao MySQL (se não houver um servidor configurado em `MYSQL_HOST`, o próprio NUTRIQ inicia o MySQL instalado no computador usando a pasta `servidor/dados/mysql`);
3. cria as tabelas que ainda não existem, a partir de `servidor/banco/schema.sql`;
4. publica a API em `/api` e os arquivos do site (HTML, CSS, JS e imagens);
5. inicia a rotina de lembretes de consulta, que roda a cada 10 minutos.

Isso permite que o projeto rode em qualquer computador com Node.js apenas com dois cliques no `iniciar.bat`, e que o responsável pelo banco aponte para o MySQL oficial da equipe só preenchendo `MYSQL_HOST`, `MYSQL_USUARIO` e `MYSQL_SENHA`.

### Qual linguagem está sendo utilizada?

**JavaScript** nos dois lados:

- **Back-end:** Node.js (versão 21 ou superior) com as bibliotecas `express` (rotas e servidor HTTP), `mysql2` (conexão com o MySQL) e `nodemailer` (envio de e-mails).
- **Banco de dados:** SQL (MySQL 8, compatível também com MariaDB/XAMPP).
- **Front-end:** HTML, CSS e JavaScript puro, sem framework.

### Como os dados serão recebidos e processados?

Todo dado chega ao servidor como **JSON** através de requisições HTTP. O caminho de uma requisição é sempre o mesmo:

1. **Recebimento** — o Express lê o corpo JSON (limite de 3 MB, por causa da foto de perfil).
2. **Verificação de origem** — pedidos que alteram dados (POST, PUT, DELETE) só são aceitos se vierem do próprio site.
3. **Sessão** — o cookie `nutriq_sessao` é lido, o token é transformado em hash e procurado na tabela `sessoes`. Se a sessão for válida, o nutricionista logado fica disponível para a rota; se não, a resposta é `401`.
4. **Validação** — o serviço da área (pacientes, consultas etc.) limpa os textos, converte números e datas e confere todas as regras. Se algo estiver errado, devolve `400` com a mensagem e o campo do formulário com problema.
5. **Regra de negócio** — por exemplo, conferir conflito de horário, calcular calorias pelos macronutrientes, verificar se o CPF já existe.
6. **Banco de dados** — o comando SQL é executado com parâmetros (`?`), sempre filtrando pelo `nutricionista_id` de quem está logado. Operações com mais de uma etapa usam transação (`BEGIN`/`COMMIT`/`ROLLBACK`).
7. **Resposta** — o resultado volta em JSON. Erros seguem sempre o mesmo formato:

```json
{ "erro": "Respeite o intervalo mínimo de 30 minutos entre consultas.", "campo": "csHora", "codigo": "CONFLITO" }
```

Ações automáticas (e-mail de resultado de avaliação, relatório ao concluir uma consulta) são disparadas em segundo plano, para não atrasar a resposta da tela.

### Como serão realizados os cálculos de macronutrientes?

Os cálculos ficam em `servidor/servicos/calculos.js` e são acessados pela rota `POST /api/calculos/macros` (também existem `/imc` e `/agua`). A tela de calculadoras apenas envia os dados digitados e exibe o resultado.

Etapas do cálculo de macronutrientes:

1. **Taxa Metabólica Basal (TMB)** — energia gasta em repouso.
2. **Gasto Energético Total (GET)** — TMB multiplicada pelo fator de atividade física.
3. **Meta calórica** — GET ajustado conforme o objetivo:
   - emagrecer: 80% do GET (déficit de 20%);
   - manter peso: 100% do GET;
   - ganhar massa: 110% do GET (superávit de 10%).
4. **Proteínas** — 2,0 g/kg para emagrecer ou ganhar massa; 1,8 g/kg para manter.
5. **Gorduras** — 0,8 g/kg de peso corporal.
6. **Carboidratos** — completam as calorias restantes.
7. **Distribuição percentual** — quanto cada macronutriente representa do total de calorias.

Os planos alimentares também usam o servidor: se o nutricionista informar só os gramas de macronutrientes, a meta calórica é calculada automaticamente.

### Quais fórmulas matemáticas serão utilizadas?

**TMB — equação de Mifflin-St Jeor** (peso em kg, altura em cm, idade em anos):

- Homens: `TMB = 10 × peso + 6,25 × altura − 5 × idade + 5`
- Mulheres: `TMB = 10 × peso + 6,25 × altura − 5 × idade − 161`

**Gasto energético total:** `GET = TMB × fator de atividade`

| Nível de atividade | Fator |
|---|---|
| Sedentário | 1,2 |
| Levemente ativo | 1,375 |
| Moderadamente ativo | 1,55 |
| Muito ativo | 1,725 |
| Extremamente ativo | 1,9 |

**Meta calórica:** `Calorias = GET × fator do objetivo` (0,8 / 1,0 / 1,1)

**Macronutrientes:**

- `Proteínas (g) = peso × g/kg do objetivo`
- `Gorduras (g) = peso × 0,8`
- `Carboidratos (g) = (Calorias − Proteínas × 4 − Gorduras × 9) ÷ 4`

**Valor energético:** 1 g de carboidrato = 4 kcal; 1 g de proteína = 4 kcal; 1 g de gordura = 9 kcal.
`Calorias do plano = carboidratos × 4 + proteínas × 4 + gorduras × 9`

**Percentual de cada macronutriente:** `% = (gramas × kcal por grama) ÷ calorias totais × 100`

**IMC:** `IMC = peso ÷ (altura em metros)²`

| IMC | Classificação |
|---|---|
| menor que 18,5 | Abaixo do peso |
| 18,5 a 24,9 | Peso normal |
| 25 a 29,9 | Sobrepeso |
| 30 a 34,9 | Obesidade grau I |
| 35 a 39,9 | Obesidade grau II |
| 40 ou mais | Obesidade grau III |

**Hidratação:** `Água (mL) = peso × 35 + ajuste de atividade (0, 350 ou 700) + ajuste de clima (0, 300 ou 500)`

**Taxa de adesão:** `Adesão = pacientes ativos acompanhados ÷ pacientes ativos × 100`. Um paciente é considerado acompanhado se teve avaliação ou consulta realizada nos últimos 60 dias, ou se tem consulta agendada no futuro.

### Por que essas fórmulas foram escolhidas?

- **Mifflin-St Jeor** é a equação mais recomendada atualmente para estimar a TMB de adultos saudáveis. Em comparação com a de Harris-Benedict (1919), ela foi criada com uma população mais recente e erra menos, principalmente em pessoas com sobrepeso.
- **Fatores de atividade (1,2 a 1,9)** são os mais usados na prática clínica junto com a Mifflin-St Jeor e são fáceis de o paciente identificar.
- **Déficit de 20% e superávit de 10%** geram perda ou ganho de peso gradual, sem cortes ou excessos bruscos.
- **Proteína de 1,8 a 2,0 g/kg** preserva a massa muscular no emagrecimento e favorece o ganho de massa; **gordura de 0,8 g/kg** mantém a ingestão mínima necessária para funções hormonais. Os carboidratos ficam com o restante da energia, como é comum na montagem de dietas.
- **4/4/9 kcal por grama** são os fatores de Atwater, padrão em rotulagem e tabelas nutricionais.
- **IMC** segue as faixas da Organização Mundial da Saúde para adultos. O sistema avisa que, para menores de 18 anos, devem ser usadas curvas de crescimento.
- **35 mL/kg de água** é uma referência simples e muito usada para adultos, com ajustes para atividade física e calor.

Todos os resultados são estimativas de apoio; a decisão final é sempre do nutricionista.

### Como o back-end se comunica com o front-end?

Por meio de **requisições HTTP com JSON**, no mesmo endereço (`http://localhost:3000`), o que evita problemas de CORS.

- O arquivo `js/api.js` reúne todas as chamadas à API. As páginas não acessam mais o `localStorage` para dados; elas chamam funções como `NutriqApi.pacientes.criar(...)` ou `NutriqApi.relatorio(id)`.
- A autenticação é feita por **cookie de sessão HttpOnly** (`nutriq_sessao`). O JavaScript da página não consegue ler esse cookie, o que protege contra roubo de sessão. Com "Manter conectado" marcado, a sessão dura 30 dias; sem marcar, expira após 12 horas sem uso.
- O modo escuro e as preferências ficam salvos na conta (tabela `preferencias`), então acompanham o nutricionista em qualquer navegador.
- Se a sessão expirar, a API responde `401` e o usuário é levado de volta à tela de login.

Principais rotas:

| Método | Rota | Função |
|---|---|---|
| POST | `/api/auth/cadastro` | Cadastrar nutricionista |
| POST | `/api/auth/entrar` | Login |
| POST | `/api/auth/sair` | Logout |
| GET | `/api/auth/sessao` | Dados do usuário logado |
| PUT | `/api/auth/senha` | Trocar senha |
| POST | `/api/auth/recuperar-senha` | Enviar link de redefinição |
| POST | `/api/auth/redefinir-senha` | Criar nova senha pelo link |
| GET/PUT | `/api/perfil` | Consultar e atualizar perfil e preferências |
| GET/POST | `/api/pacientes` | Listar (com busca) e cadastrar pacientes |
| GET/PUT/DELETE | `/api/pacientes/:id` | Consultar, editar e excluir paciente |
| GET/POST | `/api/pacientes/:id/avaliacoes` | Histórico e nova avaliação |
| PUT/DELETE | `/api/avaliacoes/:id` | Editar e excluir avaliação |
| GET/POST | `/api/planos` | Listar e criar planos |
| GET/PUT/DELETE | `/api/planos/:id` | Consultar, editar e excluir plano |
| POST | `/api/planos/:id/enviar` | Enviar plano por e-mail |
| GET/POST | `/api/consultas` | Listar (futuras/anteriores/período) e agendar |
| PUT/DELETE | `/api/consultas/:id` | Editar e excluir consulta |
| POST | `/api/consultas/:id/concluir` | Concluir consulta |
| POST | `/api/consultas/:id/cancelar` | Cancelar consulta |
| GET | `/api/dashboard` | Indicadores do painel |
| GET | `/api/relatorios/:pacienteId` | Dados do relatório individual |
| POST | `/api/relatorios/:pacienteId/enviar` | Enviar relatório por e-mail |
| GET | `/api/notificacoes` | Consultas dos próximos 7 dias |
| POST | `/api/notificacoes/lidas` | Marcar notificações como lidas |
| POST | `/api/calculos/:tipo` | Calculadoras (`macros`, `imc`, `agua`) |
| GET | `/api/emails` | Histórico de e-mails enviados |

### Quais validações estão sendo implementadas para evitar erros?

**Dados pessoais e de contato**
- CPF com verificação dos dígitos verificadores e bloqueio de sequências repetidas (ex.: 111.111.111-11).
- CPF de paciente não pode se repetir para o mesmo nutricionista.
- E-mail no formato válido; e-mail de nutricionista é único no sistema.
- Telefone com DDD, 10 ou 11 dígitos.
- Nome com tamanho mínimo; textos com tamanho máximo para não estourar o banco.

**Datas e números**
- Datas reais (não aceita 31/02, por exemplo).
- Nascimento entre 1900 e hoje; avaliação não pode ter data futura.
- Fim do plano não pode ser antes do início.
- Peso entre 2 e 500 kg, altura entre 50 e 250 cm, calorias entre 500 e 6000 kcal, macronutrientes entre 0 e 1500 g, nota da consulta entre 1 e 5.

**Consultas**
- Intervalo mínimo de 30 minutos entre consultas não canceladas.
- Consulta agendada precisa estar no futuro; consulta realizada não pode estar no futuro.
- Só é possível concluir uma consulta depois do horário marcado.

**Segurança**
- Senhas com no mínimo 6 caracteres, guardadas com **scrypt** e salt aleatório (nunca em texto puro).
- Comparação de senha em tempo constante.
- Tokens de sessão e de recuperação guardados apenas como hash SHA-256.
- Link de recuperação vale 60 minutos e só pode ser usado uma vez; ao redefinir ou trocar a senha, as outras sessões são encerradas.
- Limite de tentativas: 10 logins a cada 15 minutos por e-mail, 5 pedidos de recuperação a cada 30 minutos.
- **Isolamento entre nutricionistas:** toda consulta ao banco filtra pelo `nutricionista_id` da sessão. Um nutricionista que tentar abrir, editar ou excluir o paciente de outro recebe `404`.
- **SQL Injection:** nenhum valor do usuário é concatenado no SQL; tudo é enviado como parâmetro (`?`) para o MySQL.
- O banco também tem suas próprias travas (`CHECK`, `UNIQUE`, chaves estrangeiras com `ON DELETE CASCADE`).
- Arquivos internos (pasta `servidor`, `.env`, `node_modules`, banco) não são acessíveis pelo navegador.

**E-mails**
- O destinatário precisa ter e-mail válido.
- Todo envio é registrado na tabela `emails_enviados` com status `enviado`, `simulado` ou `falhou`, e o motivo da falha quando houver.

### Como estão organizando o código e suas funcionalidades?

O código foi separado em camadas, cada uma com uma responsabilidade:

```
servidor/
├── servidor.js           ponto de entrada: Express, rotas, arquivos do site e tratamento de erros
├── config.js             leitura do .env (porta, banco, SMTP, lembretes)
├── banco/
│   ├── conexao.js        conexão com o MySQL, transações e MySQL local
│   └── schema.sql        criação das tabelas, índices e restrições
├── middlewares/
│   ├── autenticacao.js   leitura do cookie, validação da sessão e proteção das rotas
│   └── seguranca.js      cabeçalhos de segurança, verificação de origem e limite de tentativas
├── rotas/                recebem a requisição e devolvem a resposta (sem regra de negócio)
│   ├── auth.js  perfil.js  pacientes.js  avaliacoes.js  planos.js  consultas.js  geral.js
├── servicos/             regras de negócio e acesso ao banco
│   ├── contas.js         cadastro, login, sessões, senha e perfil
│   ├── senhas.js         hash e conferência de senhas e tokens
│   ├── pacientes.js  avaliacoes.js  planos.js  consultas.js
│   ├── dashboard.js      indicadores e taxa de adesão
│   ├── relatorios.js     dados do relatório e modelos de e-mail
│   ├── calculos.js       fórmulas nutricionais
│   ├── email.js          envio, registro e tratamento de erros de e-mail
│   ├── lembretes.js      rotina de lembretes de consulta
│   └── importacao.js     migração dos dados antigos do navegador
└── utils/
    ├── validacao.js      CPF, e-mail, datas, horários, números
    └── erros.js          padrão de erros da API
```

No front-end, `js/api.js` concentra a comunicação com o servidor, e `js/nutriq-dados.js` e `js/database.js` mantêm os mesmos nomes de funções que as páginas já usavam, agora apenas repassando as chamadas para a API. Por isso as páginas e o CSS praticamente não mudaram.

**Banco de dados (tabelas):**

| Tabela | Conteúdo |
|---|---|
| `nutricionistas` | Conta e perfil profissional (nome, e-mail, CPF, CRN, senha em hash, telefone, cidade, especialidade, foto) |
| `preferencias` | Modo escuro, e-mails automáticos e lembretes |
| `sessoes` | Sessões de login ativas |
| `recuperacoes_senha` | Pedidos de redefinição de senha |
| `pacientes` | Dados pessoais, contato, altura, status e objetivo |
| `avaliacoes` | Peso, altura, data e observações |
| `planos_alimentares` | Período, calorias, macronutrientes e status |
| `consultas` | Data, horário, tipo, status, nota e controle de lembrete |
| `notificacoes_lidas` | Notificações já vistas |
| `emails_enviados` | Histórico e status de cada e-mail |

---

## 3. Envio automático de e-mails

| Quando | O que é enviado |
|---|---|
| Uma avaliação física é registrada | Resultado da avaliação (peso, IMC, diferença em relação à anterior e histórico) |
| Uma consulta é concluída | Relatório nutricional completo do paciente |
| 24 horas antes de uma consulta agendada | Lembrete com data, horário e tipo |
| Botão "Enviar por e-mail" em Relatórios | Relatório nutricional |
| Botão "Enviar" em Planos alimentares | Plano alimentar com calorias e macronutrientes |
| "Esqueci minha senha" | Link para criar nova senha |

Os envios automáticos respeitam as preferências do perfil ("Notificações por e-mail" e "Lembretes de consulta").

**Configuração:** os dados do servidor de e-mail ficam no arquivo `.env` (`SMTP_HOST`, `SMTP_PORTA`, `SMTP_SEGURO`, `SMTP_USUARIO`, `SMTP_SENHA`, `EMAIL_REMETENTE`). Com Gmail, use `smtp.gmail.com`, porta `465`, `SMTP_SEGURO=true` e uma senha de app. Enquanto o SMTP não estiver configurado, o sistema funciona em modo de teste: as mensagens são salvas como arquivos `.eml` na pasta `servidor/emails` e podem ser abertas no Outlook ou em qualquer leitor de e-mail.

---

## 4. Como executar

1. Ter o Node.js (versão 21 ou superior) e o MySQL Server instalados.
2. Dar dois cliques em `iniciar.bat`.
3. Na primeira vez, o arquivo instala as dependências e prepara o banco (leva cerca de um minuto).
4. O navegador abre em `http://localhost:3000`.
5. Para encerrar, fechar a janela do servidor ou pressionar `Ctrl+C`.

Para usar o MySQL da equipe (ou o do XAMPP) em vez do banco local, basta preencher `MYSQL_HOST`, `MYSQL_PORTA`, `MYSQL_USUARIO` e `MYSQL_SENHA` no arquivo `.env`; o banco `nutriq` e as tabelas são criados automaticamente na primeira execução.

Dados que estavam salvos no navegador pela versão anterior são enviados para o banco automaticamente no primeiro login, desde que a conta ainda não tenha pacientes.

---

## 5. Testes realizados

- Cadastro com CPF inválido, e-mail repetido e senha curta (recusados com mensagem no campo certo).
- Login com senha errada, login correto, logout e acesso sem sessão (redireciona para o login).
- Recuperação de senha completa: pedido, e-mail com link, nova senha e login com a senha nova.
- Cadastro, edição, busca e exclusão de pacientes; CPF duplicado bloqueado.
- Avaliações com cálculo de IMC e envio automático do resultado.
- Planos com cálculo automático de calorias pelos macronutrientes e envio por e-mail.
- Consultas: conflito de 30 minutos, horário passado, conclusão e cancelamento; relatório enviado ao concluir.
- Lembrete automático gerado para consulta nas próximas 24 horas.
- Dashboard, notificações (lidas e não lidas), relatórios e calculadoras com os resultados vindos do servidor.
- Perfil, troca de senha e modo escuro salvos na conta.
- Um segundo nutricionista não consegue ver, editar, excluir nem criar planos para pacientes do primeiro.
- Busca com texto de SQL Injection (`' OR 1=1 --`) retorna lista vazia, sem erro.
