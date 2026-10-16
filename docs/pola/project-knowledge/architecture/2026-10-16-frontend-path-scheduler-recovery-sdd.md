# 构建前缀与发布验收 SDD
日期：2026-10-16
next.config.ts从同一常量定义basePath与env.NEXT_PUBLIC_BASE_PATH，Next在构建时将其内联到客户端。deploy doctor读取构建的required-server-files.json，核对两者一致，并扫描静态JS拒绝残留客户端前缀变量。发布模式同时要求standalone静态目录与Logo存在。
只改部署配置与检查脚本，不改API契约或数据库。先验证旧构建被拒绝，再重建验证新构建通过，并从公网验证HTML/资源/API。
使用独立服务器构建工作区，切换前备份.next与Supervisor配置；若健康检查失败恢复旧构建和配置。RSS核验期间保持现有维护状态，结束后将禁用值恢复0并重启使cron注册。旧源码和配置保留回滚点。
