CREATE TABLE IF NOT EXISTS nutricionistas (
    id              CHAR(36)     NOT NULL PRIMARY KEY,
    nome            VARCHAR(120) NOT NULL,
    email           VARCHAR(200) NOT NULL,
    cpf             VARCHAR(14)  NOT NULL,
    crn             VARCHAR(40)  NOT NULL,
    senha_hash      VARCHAR(255) NOT NULL,
    telefone        VARCHAR(20)  NOT NULL DEFAULT '',
    cidade          VARCHAR(80)  NOT NULL DEFAULT '',
    estado          VARCHAR(40)  NOT NULL DEFAULT '',
    especialidade   VARCHAR(120) NOT NULL DEFAULT '',
    apresentacao    VARCHAR(600) NOT NULL DEFAULT '',
    foto            MEDIUMTEXT   NULL,
    criado_em       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_nutricionistas_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS preferencias (
    nutricionista_id    CHAR(36)   NOT NULL PRIMARY KEY,
    notificacoes_email  TINYINT(1) NOT NULL DEFAULT 1,
    lembretes_consulta  TINYINT(1) NOT NULL DEFAULT 1,
    modo_escuro         TINYINT(1) NOT NULL DEFAULT 0,
    atualizado_em       DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_preferencias_nutricionista FOREIGN KEY (nutricionista_id) REFERENCES nutricionistas(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sessoes (
    token_hash        CHAR(64)     NOT NULL PRIMARY KEY,
    nutricionista_id  CHAR(36)     NOT NULL,
    persistente       TINYINT(1)   NOT NULL DEFAULT 0,
    user_agent        VARCHAR(300) NOT NULL DEFAULT '',
    criado_em         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expira_em         DATETIME     NOT NULL,
    KEY idx_sessoes_nutricionista (nutricionista_id),
    KEY idx_sessoes_expira (expira_em),
    CONSTRAINT fk_sessoes_nutricionista FOREIGN KEY (nutricionista_id) REFERENCES nutricionistas(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS recuperacoes_senha (
    token_hash        CHAR(64) NOT NULL PRIMARY KEY,
    nutricionista_id  CHAR(36) NOT NULL,
    criado_em         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expira_em         DATETIME NOT NULL,
    usado_em          DATETIME NULL,
    CONSTRAINT fk_recuperacoes_nutricionista FOREIGN KEY (nutricionista_id) REFERENCES nutricionistas(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pacientes (
    id                CHAR(36)     NOT NULL PRIMARY KEY,
    nutricionista_id  CHAR(36)     NOT NULL,
    nome              VARCHAR(160) NOT NULL,
    email             VARCHAR(200) NOT NULL DEFAULT '',
    telefone          VARCHAR(20)  NOT NULL DEFAULT '',
    cpf               VARCHAR(14)  NOT NULL DEFAULT '',
    cpf_unico         VARCHAR(14)  GENERATED ALWAYS AS (NULLIF(cpf, '')) STORED,
    data_nascimento   DATE         NULL,
    genero            VARCHAR(20)  NULL,
    altura_cm         DECIMAL(5,1) NULL,
    status            VARCHAR(10)  NOT NULL DEFAULT 'ativo',
    objetivo          VARCHAR(120) NOT NULL DEFAULT '',
    observacoes       TEXT         NOT NULL DEFAULT (''),
    criado_em         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_pacientes_nutricionista (nutricionista_id),
    UNIQUE KEY uq_pacientes_cpf (nutricionista_id, cpf_unico),
    CONSTRAINT ck_pacientes_status CHECK (status IN ('ativo', 'inativo', 'alta')),
    CONSTRAINT fk_pacientes_nutricionista FOREIGN KEY (nutricionista_id) REFERENCES nutricionistas(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS avaliacoes (
    id                CHAR(36)     NOT NULL PRIMARY KEY,
    nutricionista_id  CHAR(36)     NOT NULL,
    paciente_id       CHAR(36)     NOT NULL,
    data              DATE         NOT NULL,
    peso_kg           DECIMAL(5,1) NOT NULL,
    altura_cm         DECIMAL(5,1) NULL,
    observacoes       TEXT         NOT NULL DEFAULT (''),
    criado_em         DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    KEY idx_avaliacoes_paciente (paciente_id, data),
    CONSTRAINT ck_avaliacoes_peso CHECK (peso_kg BETWEEN 2 AND 500),
    CONSTRAINT ck_avaliacoes_altura CHECK (altura_cm IS NULL OR altura_cm BETWEEN 50 AND 250),
    CONSTRAINT fk_avaliacoes_nutricionista FOREIGN KEY (nutricionista_id) REFERENCES nutricionistas(id) ON DELETE CASCADE,
    CONSTRAINT fk_avaliacoes_paciente FOREIGN KEY (paciente_id) REFERENCES pacientes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS planos_alimentares (
    id                CHAR(36)     NOT NULL PRIMARY KEY,
    nutricionista_id  CHAR(36)     NOT NULL,
    paciente_id       CHAR(36)     NOT NULL,
    nome              VARCHAR(160) NOT NULL,
    objetivo          VARCHAR(120) NOT NULL DEFAULT '',
    data_inicio       DATE         NOT NULL,
    data_fim          DATE         NULL,
    calorias          INT          NULL,
    macros_tipo       VARCHAR(2)   NOT NULL DEFAULT 'g',
    carboidratos_g    DECIMAL(6,1) NULL,
    proteinas_g       DECIMAL(6,1) NULL,
    gorduras_g        DECIMAL(6,1) NULL,
    observacoes       TEXT         NOT NULL DEFAULT (''),
    status            VARCHAR(10)  NOT NULL DEFAULT 'ativo',
    criado_em         DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    atualizado_em     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_planos_paciente (paciente_id),
    KEY idx_planos_nutricionista (nutricionista_id),
    CONSTRAINT ck_planos_calorias CHECK (calorias IS NULL OR calorias BETWEEN 500 AND 6000),
    CONSTRAINT ck_planos_tipo CHECK (macros_tipo IN ('g', '%')),
    CONSTRAINT ck_planos_status CHECK (status IN ('ativo', 'concluido')),
    CONSTRAINT ck_planos_periodo CHECK (data_fim IS NULL OR data_fim >= data_inicio),
    CONSTRAINT fk_planos_nutricionista FOREIGN KEY (nutricionista_id) REFERENCES nutricionistas(id) ON DELETE CASCADE,
    CONSTRAINT fk_planos_paciente FOREIGN KEY (paciente_id) REFERENCES pacientes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS consultas (
    id                  CHAR(36)    NOT NULL PRIMARY KEY,
    nutricionista_id    CHAR(36)    NOT NULL,
    paciente_id         CHAR(36)    NOT NULL,
    data                DATE        NOT NULL,
    horario             TIME        NOT NULL,
    tipo                VARCHAR(80) NOT NULL DEFAULT 'Consulta',
    status              VARCHAR(10) NOT NULL DEFAULT 'agendada',
    avaliacao           TINYINT     NULL,
    observacoes         TEXT        NOT NULL DEFAULT (''),
    lembrete_enviado_em DATETIME    NULL,
    criado_em           DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    atualizado_em       DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_consultas_agenda (nutricionista_id, data, horario),
    KEY idx_consultas_paciente (paciente_id),
    CONSTRAINT ck_consultas_status CHECK (status IN ('agendada', 'realizada', 'cancelada')),
    CONSTRAINT ck_consultas_avaliacao CHECK (avaliacao IS NULL OR avaliacao BETWEEN 1 AND 5),
    CONSTRAINT fk_consultas_nutricionista FOREIGN KEY (nutricionista_id) REFERENCES nutricionistas(id) ON DELETE CASCADE,
    CONSTRAINT fk_consultas_paciente FOREIGN KEY (paciente_id) REFERENCES pacientes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notificacoes_lidas (
    nutricionista_id  CHAR(36)     NOT NULL,
    chave             VARCHAR(200) NOT NULL,
    lida_em           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (nutricionista_id, chave),
    CONSTRAINT fk_notificacoes_nutricionista FOREIGN KEY (nutricionista_id) REFERENCES nutricionistas(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS emails_enviados (
    id                CHAR(36)     NOT NULL PRIMARY KEY,
    nutricionista_id  CHAR(36)     NULL,
    paciente_id       CHAR(36)     NULL,
    tipo              VARCHAR(30)  NOT NULL,
    destinatario      VARCHAR(200) NOT NULL,
    assunto           VARCHAR(200) NOT NULL,
    status            VARCHAR(12)  NOT NULL,
    erro              TEXT         NULL,
    criado_em         DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    KEY idx_emails_nutricionista (nutricionista_id, criado_em),
    CONSTRAINT ck_emails_status CHECK (status IN ('enviado', 'simulado', 'falhou')),
    CONSTRAINT fk_emails_nutricionista FOREIGN KEY (nutricionista_id) REFERENCES nutricionistas(id) ON DELETE CASCADE,
    CONSTRAINT fk_emails_paciente FOREIGN KEY (paciente_id) REFERENCES pacientes(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
