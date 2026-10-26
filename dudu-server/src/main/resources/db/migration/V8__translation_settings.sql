CREATE TABLE translation_setting (
    company_id BIGINT NOT NULL COMMENT '企业隔离',
    revision BIGINT NOT NULL DEFAULT 1 COMMENT '配置修订，保存时递增',
    default_service VARCHAR(64) NULL COMMENT '默认服务实例标识',
    configuration MEDIUMTEXT NOT NULL COMMENT 'AES-GCM 加密的服务配置',
    PRIMARY KEY (company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='企业翻译服务配置';

CREATE TABLE translation_preference (
    user_id BIGINT NOT NULL COMMENT '员工稳定标识',
    company_id BIGINT NOT NULL COMMENT '企业隔离',
    automatic BOOLEAN NOT NULL DEFAULT FALSE COMMENT '自动翻译默认关闭',
    target_language VARCHAR(16) NOT NULL DEFAULT 'zh' COMMENT '阅读目标语言',
    PRIMARY KEY (user_id),
    KEY idx_translation_preference_company (company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='坐席翻译阅读偏好';
