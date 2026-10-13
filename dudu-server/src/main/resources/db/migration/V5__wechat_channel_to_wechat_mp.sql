-- 公众号渠道码值对齐 ADR-0013 微信三分：存量宽值 wechat 改为 wechat-mp；
-- 该码值只出现在 company_channel.channel 一列，visitor/message 经 company_channel 关联，无冗余码值列。
UPDATE company_channel SET channel = 'wechat-mp' WHERE channel = 'wechat';
