-- DuduDesk 访客会话三表：visitor 保存来源身份与接待摘要，visitor_profile 保存一对一名片，message 保存全部消息与发送结果。
-- 一次建立三表供后续名片与消息功能复用（见 docs/design/dudu-desk/implementation-contract.md 第 1 节）。
-- 约定：时间由服务端按 ADR 0012 以服务器本地时间写入 DATETIME(3)；外部身份与外部消息标识用二进制排序规则保留大小写；
-- 不设 FOREIGN KEY，关联完整性由应用层维护；已提交迁移不可变，本文件只新增。

CREATE TABLE visitor
(
    visitor_id           BIGINT       NOT NULL AUTO_INCREMENT COMMENT '固定访客及会话共用 ID',
    company_id           BIGINT       NOT NULL COMMENT '企业隔离',
    company_channel_id   BIGINT       NOT NULL COMMENT '渠道账号，组权限从账号现有关系查询',
    external_user_id     VARCHAR(255) COLLATE utf8mb4_0900_bin NOT NULL COMMENT '渠道访客身份，保留大小写差异',
    name                 VARCHAR(255) NULL COMMENT '名称；缺失时前端显示外部 ID',
    avatar_url           VARCHAR(2048) NULL COMMENT '渠道头像',
    status               VARCHAR(16)  NOT NULL DEFAULT 'needs-reply' COMMENT 'needs-reply / waiting / closed',
    last_message_id      BIGINT NULL COMMENT '当前最后一条持久消息',
    last_message_preview VARCHAR(500) NOT NULL DEFAULT '' COMMENT '列表和卡片摘要；保存规则与消息生成规则一致，不复制完整正文',
    last_message_time    DATETIME(3) NULL COMMENT '最后消息活动时间，不被名片保存改变',
    waiting_since        DATETIME(3) NULL COMMENT '本轮进入待回复的时间',
    message_count        INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '全部持久消息数量；同时分配会话内 sequence',
    version              INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '对应现有 Conversation.version',
    create_time          DATETIME(3)  NOT NULL COMMENT '创建时间',
    update_time          DATETIME(3)  NOT NULL COMMENT '最后修改时间',
    PRIMARY KEY (visitor_id),
    UNIQUE KEY uk_visitor_source (company_id, company_channel_id, external_user_id),
    KEY idx_visitor_account_status (company_channel_id, status)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci COMMENT = '固定访客及会话';

CREATE TABLE visitor_profile
(
    visitor_id     BIGINT      NOT NULL COMMENT '与 visitor 一对一，不另生成名片 ID',
    channel_fields JSON        NOT NULL COMMENT '右侧只读资料数组，创建时显式写 []',
    tags           JSON        NOT NULL COMMENT '字符串标签数组，创建时显式写 []',
    note           VARCHAR(4000) NOT NULL DEFAULT '' COMMENT '共享备注',
    version        INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '对应现有 VisitorProfile.version',
    create_time    DATETIME(3) NOT NULL COMMENT '创建时间',
    update_time    DATETIME(3) NOT NULL COMMENT '最后修改时间',
    PRIMARY KEY (visitor_id)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci COMMENT = '访客名片，与访客一对一';

CREATE TABLE message
(
    message_id          BIGINT       NOT NULL AUTO_INCREMENT COMMENT '所有查询和通知共用的消息 ID',
    visitor_id          BIGINT       NOT NULL COMMENT '所属固定会话',
    sequence            INT UNSIGNED NOT NULL COMMENT '会话内稳定顺序，新增消息时使用递增后的 message_count',
    direction           VARCHAR(16)  NOT NULL COMMENT 'incoming / outgoing / system',
    sender_user_id      BIGINT NULL COMMENT 'outgoing 必填，来自登录员工；其他方向为空',
    client_request_id   VARCHAR(64) NULL COMMENT 'outgoing 的本地气泡关联标识；不承诺重试幂等协议',
    external_message_id VARCHAR(255) COLLATE utf8mb4_0900_bin NULL COMMENT '渠道已提供的消息标识，保留大小写差异',
    content             JSON         NOT NULL COMMENT '统一消息体',
    send_status         VARCHAR(16) NULL COMMENT 'outgoing 为 sending / sent / failed，其他方向为空',
    failure_reason      VARCHAR(500) NULL COMMENT 'failed 时记录实际发送失败说明，其余为空',
    version             INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '对应现有 InboxMessage.version',
    create_time         DATETIME(3)  NOT NULL COMMENT '消息创建时间',
    update_time         DATETIME(3)  NOT NULL COMMENT '消息结果更新时间',
    PRIMARY KEY (message_id),
    UNIQUE KEY uk_message_sequence (visitor_id, sequence)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci COMMENT = '访客消息，按会话内 sequence 稳定排序';
