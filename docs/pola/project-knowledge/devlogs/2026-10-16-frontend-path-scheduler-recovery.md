# 首页故障与RSS接续
日期：2026-10-16
状态：实施中
使用独立worktree /Users/wangchang/.codex/worktrees/polanews-stability-hotfix/PolaNews，初始HEAD d0537c7；原主工作区不变。

## 诊断
- 生产PID784993运行10天，PostgreSQL正常；正确文章接口200、208585篇。
- 公网HTML两个Logo均为/logo.png；客户端chunks保留NEXT_PUBLIC_BASE_PATH运行时读取，根API/Logo404，正确前缀路径200。
- Supervisor环境已设NEXT_PUBLIC_BASE_PATH=/polanews，但该值需要在构建时内联；上次独立build未提供导致错配。
- POLANEWS_SCHEDULER_DISABLED=1遗留，10月6日后无新文章。
- Chrome控制不可用，内置浏览器打开超时；以真实公网HTML、JS资源、图片与API响应记录界面数据路径证据。

## 变更与验证
- next.config.ts用同一常量设置basePath和env.NEXT_PUBLIC_BASE_PATH，构建无需额外公共环境变量。
- deploy doctor新增构建manifest一致性检查、未内联变量扫描，以及--release静态资源/Logo检查。
- 真实旧构建被新doctor拒绝；未设置NEXT_PUBLIC_BASE_PATH重新构建成功，doctor通过，构建/客户端前缀均为/polanews，残留变量引用0。目标ESLint与diff检查通过，独立review无P0/P1。
- RSS维护核验已从现有修复后API分批运行，待全部结束后再切换前端构建并恢复scheduler，避免中断在途抓取。
- 需求、SPEC、SDD见同日期关联记录。外部消息同步不适用。
