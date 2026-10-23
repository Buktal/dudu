-- 修正历史注释与实际口径的偏差，只改 COMMENT 不改数据与结构属性：
-- 1. V1 各时间列 COMMENT 声称 UTC，为首版方案遗留；ADR 0012 起业务时间统一服务器本地时间
--    写入 DATETIME(3)，与 V4 及之后各表的注释口径一致；
-- 2. V4 direction 的 system 取值从未实现（MessageDirectionEnum 仅 incoming / outgoing），收敛注释。
-- MODIFY 保持列的原始位置（AFTER）与原属性（NOT NULL、无默认），已提交迁移 V1 / V4 不再改动。

ALTER TABLE company
    MODIFY COLUMN create_time DATETIME(3) NOT NULL COMMENT '创建时间' AFTER init_user_id,
    MODIFY COLUMN update_time DATETIME(3) NOT NULL COMMENT '最后修改时间' AFTER create_time;

ALTER TABLE user
    MODIFY COLUMN create_time DATETIME(3) NOT NULL COMMENT '创建时间' AFTER status,
    MODIFY COLUMN update_time DATETIME(3) NOT NULL COMMENT '最后修改时间' AFTER create_time;

ALTER TABLE operation_log
    MODIFY COLUMN create_time DATETIME(3) NOT NULL COMMENT '操作时间；记录只追加' AFTER summary;

ALTER TABLE user_group
    MODIFY COLUMN create_time DATETIME(3) NOT NULL COMMENT '创建时间' AFTER group_name,
    MODIFY COLUMN update_time DATETIME(3) NOT NULL COMMENT '最后修改时间' AFTER create_time;

ALTER TABLE company_channel
    MODIFY COLUMN create_time DATETIME(3) NOT NULL COMMENT '创建时间' AFTER account_name,
    MODIFY COLUMN update_time DATETIME(3) NOT NULL COMMENT '最后修改时间' AFTER create_time;

ALTER TABLE message
    MODIFY COLUMN direction VARCHAR(16) NOT NULL COMMENT 'incoming / outgoing' AFTER sequence;
