# 搜索投影发布与回滚

用户已明确批准派生表、同步触发器、分批回填与测试上线。运行代码检查点 53bee32，分批验证修复 a0c4c0a，均已推送独立分支。只读全量校验 212609/212609、字段差异 0；canary 阅读旅程 9/9。

隔离构建 BUILD_ID `mxjTSkOlSRjwwp1MSNAQf`。已于 2026-10-20 00:42:46-00:42:49 CST 仅切换 Supervisor polanews；Nginx、其他应用、规格和 DNS 未改。

## 切换门禁

- 切换前生产 HEAD 为 be1bcb1，已快进至 a0c4c0a；目标配置/搜索源文件切换前校验一致。保留生产既有 feeds/fetch、feeds、首页及 feeds-cache 修改。
- 源码副本与生产差异仅搜索服务/路由；Next 配置仅增加一个 build worker。构建、TypeScript、53 页及 doctor 通过，cgroup 峰值约 695MB。
- 备份旧搜索路由、Next 配置及旧 `.next` 到 `/opt/polanews-search-release-20261019/backup-live`。
- 先保留旧静态哈希至新构建，核对抓取已结束和无 Node 子进程；正常停止/启动该 Supervisor 服务。
- 验证本机/公网搜索、阅读旅程、无新增 chunk/ASGI/池错误；失败立即恢复旧构建。

## 回滚

正常停止 polanews，将失败 `.next` 移至本次隔离目录，恢复 `backup-live/.next`；只恢复本次备份的搜索路由和 Next 配置，然后启动并复核旧入口。新增搜索服务在旧路由下不会被引用，可保留追踪，不执行 git reset 或覆盖用户其他修改。

恢复旧应用后如需撤销派生结构，使用已提交迁移脚本 `--down --apply`，仅删除本次 trigger/function/article_search_documents，原 articles/feeds 保留。源表不回填、不删除、不清理日志；没有新建付费生成任务。

实际回执：`search-deployment.json`。PID 1298 → 199441，停止于 00:42:47.070，启动完成 00:42:48.826，烟测 200、0.816 秒。公网阅读旅程 9/9，全系 102/107，5 OAuth 不通过保留。公网搜索 AI 0.783 秒，较此前约 6.87 秒改善。Canary 已停止，旧备份保留，临时构建/测试副本按精确路径清理，不清理业务日志。
