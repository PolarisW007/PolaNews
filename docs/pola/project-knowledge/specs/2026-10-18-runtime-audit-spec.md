# PolaNews 运行修复 SPEC

趋势接口保持 success/data/keywords/categories 结构。首次请求返回从最近 200 篇文章计算的关键词，模型在后台更新；5 分钟内共享结果。过期时继续显示已有关键词，后台刷新成功后更新；模型失败不返回空白、不暴露供应商原始错误。最多保留 4 个时间窗口的缓存。

阅读、搜索、订阅源、登录、Digest 与播报接口不变。无音频的播报仍报告失败，不伪造 ready。部署不在在线 .next 中执行构建。

验收对应 Requirement A1-A4。涉及鉴权/生成的写路径只测试现有 fixtures；生产只做读取和已授权的必要服务切换。

A5：URL 的 q 参数驱动首次搜索及页内导航；useSearchParams 放在 Suspense 内以兼容 Next 静态构建。Header 登录链接指向现有统一账号中心并携带 /polanews 返回路径。
