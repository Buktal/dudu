-- 表间关联一律不设外键：关联完整性由应用层维护，跨企业隔离以应用层判定为准（如 canAccessGroup 按 user 与 group 的企业归属比对）。
ALTER TABLE user DROP FOREIGN KEY fk_user_company;
ALTER TABLE company_channel DROP FOREIGN KEY fk_channel_account_group;
ALTER TABLE user_group DROP FOREIGN KEY fk_user_group_company;
ALTER TABLE company DROP FOREIGN KEY fk_company_initial_user;
ALTER TABLE user_group_member DROP FOREIGN KEY fk_member_user;
ALTER TABLE user_group_member DROP FOREIGN KEY fk_member_group;
