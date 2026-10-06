# dudu-server 时间约定：服务器本地时间

业务时间（createTime/updateTime 及后续时间字段）统一取服务器本地时间（部署在中国即北京时间），代码直接 `LocalDateTime.now()`，不引入时区参数。存储与 HTTP 输出同形：`uuuu-MM-dd HH:mm:ss`（到秒，无时区标记），前端拿到的即展示文本，直接显示。

2026-10-06 决策，取代首版的全链路 UTC 方案（存储 UTC、前端换算本地时区）。
