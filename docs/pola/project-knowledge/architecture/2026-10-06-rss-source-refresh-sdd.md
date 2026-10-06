# RSS 抓取传输修复 SDD
日期：2026-10-06
状态：实现与本地验证完成，待生产验证

## 数据流与边界
既有fetch_all/feed_ids/fetch_only入口→有界抓取传输→rss-parser.parseString→现有文章事务与feed状态更新。源地址更新按UUID与旧URL双重条件执行，并保留快照。
现有问题：rss-parser.parseURL外层10秒timer仅拒绝Promise，未终止底层请求；慢DNS和并发可能累积并影响正常源。

## 实施约束
用原生http/https有界请求取得RSS正文再解析；每次下载20秒总超时覆盖DNS/重定向/响应读取，超时销毁请求与响应，非2xx及跳转明确清理。TLS验证保持启用并拒绝HTTPS降级；不使用代理或绕过上游访问控制。单轮fetchAllFeeds并发缩小至3，每响应上限4MiB，重定向最多3次。请求identity编码，非identity响应明确拒绝，避免压缩内容绕过字节上限。
每次下载有独立dns.Resolver({timeout:2000,tries:2})，沿用服务器DNS顺序，通过异步c-ares避免占用libuv getaddrinfo线程池，结束后取消仅本次DNS。实测首DNS 100.100.100.100超时，223.5.5.5约2ms，默认getaddrinfo耗时5–10秒；未修改主机DNS、全局网络或其他服务。
Anthropic官方新闻fallback保持既有行为，每次下载分别受20秒和4MiB约束，原RSS失败后再取官方新闻页面，最坏两次约40秒；输入格式和文章映射保持不变。

## 验证与发布
针对超时资源释放、过大响应、跳转边界、错误后健康请求正常，以及并发上限提供针对性测试。复用前次状态退避/维护测试，执行类型检查、目标lint、生产构建。单实例维护发布避免bootstrap重叠；备份旧构建及配置，失败恢复旧构建。发布后真实逐源检查、DB/API对照和首页健康验证。

## 官方地址更新
按UUID与旧URL双条件实际更新3行：36kr.com/feed→www.36kr.com/feed；OpenAI /blog/rss.xml→/news/rss.xml；Google AI /technology/ai/rss/→/innovation-and-ai/technology/ai/rss/。三者服务器200且rss-parser解析成功，分别30/1247/20条。OpenAI与Google新路径也同步到预置源。Reuters旧地址404，官方Best内容范围有差异，仅记录候选，未擅自替换。

## Review残余风险
独立review无P0/P1；单轮并发3不是进程全局锁，手动fetch_only与scheduler同时触发仍可叠加。本次发布核验期间停用scheduler后顺序分批刷新，完成后恢复；不声称实现跨入口全局并发上限。
