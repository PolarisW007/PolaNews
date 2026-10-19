# 搜索投影 SDD

选择 PostgreSQL 原生派生表，不引入新搜索引擎。临时表实测证明宽行隔离有效；pg_trgm 不能被假定能解决 `%AI%` 两字符通配查询，因此本次不安装扩展。

article_search_documents 以文章 id 为主键和 ON DELETE CASCADE 外键。AFTER INSERT / UPDATE OF 搜索字段的触发器在同一事务 upsert；不相关 AI/语音更新不触发。回填用源行 KEY SHARE 防止删除竞争，ON CONFLICT DO NOTHING 避免覆盖触发器已经同步的新值。死锁/锁超时有限重试，所有参数绑定。

应用使用独立最大 2 连接池，拒绝超过 2 个活动搜索，不积压等待队列。每个请求一个 REPEATABLE READ READ ONLY 事务，禁用该事务并行 worker，5 秒 statement_timeout、6.5 秒客户端 query_timeout。错误连接销毁以回滚未完成事务，避免污染连接池。无计数 TTL 缓存，不引入过期计数。

计数/分页在窄表完成，MATERIALIZED 当前页 ID 后按主键读取文章全文，防止再次扫描宽表。投影不存在时保留相同旧查询语义，但仍受资源边界约束。应用不会在启动时自动做生产迁移。

发布顺序：隔离迁移测试 → 受保护环境构建与 canary → 安装/回填/验证投影 → 切换构建 → 真实搜索和其他应用回归。回滚先恢复旧构建；可删除本次触发器、函数和派生表，不改原 articles/feeds。回滚脚本不使用 CASCADE 删除未知依赖。

构建限制为一个 Next worker；隔离构建使用 512MB Node 堆、900MB cgroup 内存上限和 80% CPU，不在在线目录构建。构建失败不会停止线上进程，不为完成构建解除资源上限。
