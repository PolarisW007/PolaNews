# RSS 主动检索与恢复日志
日期：2026-10-06
状态：实施中
用户要求：RSS源主动检索和更新一下状态。

## 基线
生产/opt/polanews，运行提交efc434e，独立热修工作区当前7a63c60；原主工作区含用户改动，继续使用独立工作区。
57源状态快照：/private/tmp/polanews-rss-20261006-before.json。
第一轮57源完成：成功4、失败53、恢复3、新增64；仅fetch_only，不触发模型/音频。
发现36kr bare域返回HTML，www域有效；多源直接请求成功而常驻进程超时，继续诊断并修复抓取生命周期。
正式Requirement、SPEC、SDD已建立，本次不涉及UI调整或外部消息/需求池同步。

## 验证、发布与最终结果
- 根因确认：首选DNS 100.100.100.100无响应，默认getaddrinfo耗时5–10秒；直接fallback DNS解析约2ms。旧rss-parser timeout只reject，遗留请求和线程池排队。
- 实现feed-transport.ts：每请求独立异步Resolver，20秒、4MiB、3跳硬边界；超时销毁请求/响应并取消DNS。engine使用parseString、并发3，Anthropic fallback也受边界约束。
- 三行官方地址更新已在生产执行并保留UUID和原状态，后续真实抓取成功才转active：36kr www域、OpenAI news RSS、Google新AI RSS路径。二者预置路径同步。
- 稳定性25/25通过；TypeScript、目标ESLint、git diff --check通过。首次build因未设置生产音频目录被预期配置校验拦截，使用明确临时绝对路径后生产构建通过。独立review无P0/P1；另一次真实c-ares故障探针验证一个DNS超时取消不影响另一个延迟160ms的请求成功。
- 生产部署与最终57源复核待补录。
