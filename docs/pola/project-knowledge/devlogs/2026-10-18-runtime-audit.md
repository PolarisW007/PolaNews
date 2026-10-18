# PolaNews 线上运行检查开发日志

日期：2026-10-18。状态：进行中。

独立工作树基于生产 HEAD 929b768，分支 codex/runtime-audit-20261018。主工作区用户已有改动保持不变。生产 feeds 路由、抓取鉴权及页面已有修复不覆盖，也不混入本次提交。

发现：10 月 17 日构建因非法 route 导出失败，现有生产修复已抽取 feeds-cache；Supervisor 记录 23:53:54 至次日 02:36:34 停服。当前 doctor 通过。热门趋势 16.4 秒；TTS Edge 7.2.7 返回 403，付费语音 Key 未配置，已向用户询问受保护配置位置。

计划变更：trending.ts 缓存和后台刷新、自动化回归脚本、工程记录。部署、测试和回滚证据待回填；汇总报告保存在 PolaUUH 本次 delivery 目录。

新增真实浏览器发现：首页搜索跳转后搜索页未读 q，未显示结果；登录链接丢失 next。已针对 SearchContent 与 Header 补修复，重新隔离构建。首次构建因缺少 Supervisor 提供的音频目录变量而中止，在线产物未受影响；复用受保护的运行环境后构建成功。

发布前验证：三文件 ESLint 通过；缓存 12 项断言通过；TypeScript 与 53 页生产构建通过；deploy doctor --release 通过；仅 loopback 的 canary 浏览器旅程 9/9 通过，包括搜索 20→40 条分页、真实详情 4583 字符、手机无溢出和登录 next。保留旧 .next 与三个源文件备份后定向切换，不在在线目录执行构建。发布详细记录在 PolaUUH/docs/pola/project-knowledge/release/2026-10-18-pola-runtime-audit.md。
