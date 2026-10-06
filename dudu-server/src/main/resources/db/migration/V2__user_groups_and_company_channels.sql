-- 保留 V1 历史；分组与账号改名，成员关系纳入持久化。
RENAME TABLE reception_group TO user_group, channel_account TO company_channel;

ALTER TABLE company_channel
    RENAME COLUMN channel_account_id TO company_channel_id;

ALTER TABLE company_channel ADD COLUMN channel_info JSON NULL COMMENT '渠道信息，按查询需求提取字段';
-- 保留已有外部标识到 JSON，删除列不丢失旧数据。
UPDATE company_channel
SET channel_info = JSON_OBJECT('externalAccountId', external_account_id)
WHERE external_account_id IS NOT NULL;
ALTER TABLE company_channel DROP COLUMN external_account_id;

ALTER TABLE operation_log DROP COLUMN result;

ALTER TABLE user
    ADD UNIQUE KEY uk_user_company_user (company_id, user_id);
ALTER TABLE user_group
    ADD CONSTRAINT fk_user_group_company FOREIGN KEY (company_id) REFERENCES company (company_id);
ALTER TABLE company
    ADD CONSTRAINT fk_company_initial_user FOREIGN KEY (company_id, init_user_id)
        REFERENCES user (company_id, user_id);

CREATE TABLE user_group_member
(
    member_id BIGINT NOT NULL AUTO_INCREMENT COMMENT '成员关联标识',
    company_id BIGINT NOT NULL COMMENT '所属企业',
    user_id BIGINT NOT NULL COMMENT '企业用户',
    group_id BIGINT NOT NULL COMMENT '用户分组',
    PRIMARY KEY (member_id),
    UNIQUE KEY uk_user_group_member (company_id, user_id, group_id),
    CONSTRAINT fk_member_user FOREIGN KEY (company_id, user_id) REFERENCES user (company_id, user_id),
    CONSTRAINT fk_member_group FOREIGN KEY (company_id, group_id) REFERENCES user_group (company_id, group_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci
  COMMENT = '企业内用户与组的多对多关系；初始管理员无需逐组加入';
