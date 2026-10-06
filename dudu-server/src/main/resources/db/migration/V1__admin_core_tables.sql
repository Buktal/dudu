-- DuduAdmin 首版核心表：企业、用户、平台操作记录，以及真实资源汇总所需的接待组、渠道接入账号。
-- 约定：表名不加产品前缀；列名下划线；时间统一 UTC 写入 DATETIME(3)；企业 ID 为显式主键，创建后固定。
-- 登录名唯一性覆盖企业与平台两种作用域：函数唯一索引 COALESCE(company_id, 0) + username，
-- 0 只是平台作用域的索引取值，平台行的真实 company_id 仍为 NULL。

CREATE TABLE company
(
    company_id            BIGINT       NOT NULL COMMENT '企业 ID：100000-999999，创建前选定，创建后固定',
    company_name          VARCHAR(100) NOT NULL COMMENT '企业名称，允许同名',
    contact_name          VARCHAR(100) NULL COMMENT '联系人，未填写为 NULL',
    contact_info          VARCHAR(200) NULL COMMENT '联系方式，文本表达',
    remark                VARCHAR(1000) NULL COMMENT '运营备注',
    status                TINYINT      NOT NULL DEFAULT 1 COMMENT '1 启用 / 0 停用（见 EnableStatus）',
    disable_reason        VARCHAR(500) NULL COMMENT '最近一次停用原因，恢复时清空',
    init_user_id         BIGINT NULL COMMENT '创建事务写入的初始企业管理员（Console 账号）ID，稳定定位重置目标',
    create_time           DATETIME(3)   NOT NULL COMMENT '创建时间（UTC）',
    update_time           DATETIME(3)   NOT NULL COMMENT '最后修改时间（UTC）',
    PRIMARY KEY (company_id),
    KEY                   idx_company_status_create (status, create_time, company_id)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci COMMENT = '企业';

CREATE TABLE user
(
    user_id       BIGINT       NOT NULL AUTO_INCREMENT COMMENT '用户稳定身份',
    company_id    BIGINT NULL COMMENT '企业员工所属企业；平台用户为空',
    username      VARCHAR(64)  NOT NULL COMMENT '登录名：企业内唯一（大小写不敏感），平台作用域内唯一',
    name          VARCHAR(100) NOT NULL COMMENT '显示名称，未填写时取登录名',
    password_hash VARCHAR(255) NOT NULL COMMENT 'BCrypt 哈希，仅后端持有',
    role          VARCHAR(32)  NOT NULL COMMENT 'admin/console/user（见 UserRole）',
    status        TINYINT      NOT NULL DEFAULT 1 COMMENT '1 启用 / 0 停用（见 EnableStatus）',
    create_time   DATETIME(3)  NOT NULL COMMENT '创建时间（UTC）',
    update_time   DATETIME(3)  NOT NULL COMMENT '最后修改时间（UTC）',
    PRIMARY KEY (user_id),
    UNIQUE KEY uk_user_scope_username ((COALESCE (company_id, 0)), username),
    KEY           idx_user_company (company_id),
    CONSTRAINT fk_user_company FOREIGN KEY (company_id) REFERENCES company (company_id)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci COMMENT = '平台人员与企业员工';

CREATE TABLE operation_log
(
    operation_log_id BIGINT      NOT NULL AUTO_INCREMENT COMMENT '记录标识',
    operator_user_id BIGINT      NOT NULL COMMENT '已认证的实际操作者',
    company_id       BIGINT NULL COMMENT '企业操作的目标；个人账号操作为空',
    action           VARCHAR(64) NOT NULL COMMENT '操作代码，见 OperationAction',
    target_type      VARCHAR(32) NOT NULL COMMENT 'company/user',
    target_id        BIGINT NULL COMMENT '目标标识',
    result           VARCHAR(16) NOT NULL COMMENT 'success/failure',
    summary          VARCHAR(1000) NULL COMMENT '可展示的非敏感结果说明',
    create_time      DATETIME(3)   NOT NULL COMMENT '操作时间（UTC）；记录只追加',
    PRIMARY KEY (operation_log_id),
    KEY              idx_oplog_company_time (company_id, create_time, operation_log_id),
    KEY              idx_oplog_time (create_time, operation_log_id)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci COMMENT = '平台操作记录，只追加';

CREATE TABLE reception_group
(
    group_id    BIGINT       NOT NULL AUTO_INCREMENT COMMENT '接待组标识',
    company_id  BIGINT       NOT NULL COMMENT '所属企业',
    group_name  VARCHAR(100) NOT NULL COMMENT '组名，企业内平级',
    create_time DATETIME(3)  NOT NULL COMMENT '创建时间（UTC）',
    update_time DATETIME(3)  NOT NULL COMMENT '最后修改时间（UTC）',
    PRIMARY KEY (group_id),
    UNIQUE KEY uk_group_company_group (company_id, group_id),
    KEY         idx_group_company (company_id)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci COMMENT = '企业内平级接待组，本轮仅供资源汇总';

CREATE TABLE channel_account
(
    channel_account_id  BIGINT       NOT NULL AUTO_INCREMENT COMMENT '渠道接入账号标识',
    company_id          BIGINT       NOT NULL COMMENT '所属企业',
    group_id            BIGINT       NOT NULL COMMENT '唯一负责的接待组',
    channel             VARCHAR(32)  NOT NULL COMMENT '渠道类型（微信/支付宝等）',
    account_name        VARCHAR(100) NOT NULL COMMENT '账号展示名称',
    external_account_id VARCHAR(128) NULL COMMENT '渠道侧外部账号标识',
    create_time         DATETIME(3)  NOT NULL COMMENT '创建时间（UTC）',
    update_time         DATETIME(3)  NOT NULL COMMENT '最后修改时间（UTC）',
    PRIMARY KEY (channel_account_id),
    KEY                 idx_channel_account_company (company_id),
    CONSTRAINT fk_channel_account_group FOREIGN KEY (company_id, group_id)
        REFERENCES reception_group (company_id, group_id)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci COMMENT = '渠道接入账号，本轮仅供资源汇总';
