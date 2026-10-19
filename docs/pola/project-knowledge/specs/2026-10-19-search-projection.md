# 搜索投影 SPEC

沿用 `/api/articles/search`，返回 success/data/articles/total/page/limit，保留现有正文片段算法和文章字段。结果按 published_at DESC，与原接口一致。

新增 article_search_documents，仅存 id、feed_id、title、content、published_at；文章正文仍从 articles 按当前页 ID 读取。匹配、计数和分页扫描窄表；无投影时兼容旧表查询，便于代码/数据库分别回滚。

参数：q 必填且不超过 2000 字符；page/limit 必须是正的安全整数，limit 最大 100，offset 必须是安全整数。无效输入返回 400。搜索最多两个并发请求，不无界排队；连接等待 1.5 秒，单语句 5 秒。过载/数据库故障返回 503、Retry-After=2，不返回原始错误。

迁移默认只给出计划，显式 --apply 才写入。先安装同步触发器，再每批 500 行回填，每批间隔 25ms，总时长上限 10 分钟。精确校验来源/投影字段和缺失行后才允许切换。旧文章与数据库凭据不写入日志。
