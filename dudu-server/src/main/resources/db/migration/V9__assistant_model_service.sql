ALTER TABLE translation_setting
    ADD COLUMN assistant_service VARCHAR(64) NULL COMMENT 'AI 助手使用的模型服务实例标识' AFTER default_service;
