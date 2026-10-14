-- 渠道重推幂等收敛到数据库唯一键（at-least-once 重发下的并发竞态）：
-- 同访客同渠道消息标识 (visitor_id, external_message_id) 唯一，计数先行的事务在
-- 插入冲突时整体回滚，不再产生重复计数；external_message_id 可空（未提供标识的
-- 信件与 outgoing 方向不判重），MySQL 唯一索引允许多个 NULL，不影响这些行。
-- 表间无外键约定不变：本迁移只加唯一索引。
ALTER TABLE message
    ADD UNIQUE INDEX uk_message_external (visitor_id, external_message_id);
