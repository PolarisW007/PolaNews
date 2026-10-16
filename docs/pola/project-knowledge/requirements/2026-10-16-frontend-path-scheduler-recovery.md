# 首页加载故障与调度恢复
日期：2026-10-16
状态：修复中
用户要求：检查 https://aipd.me/polanews 为什么报错及解决办法；接续此前已授权的服务修复和RSS状态刷新。

## 已证实问题
运行提交d0537c7，服务/数据库正常，/polanews/api/articles返回200、总数208585。线上HTML logo指向/logo.png，客户端JS仍含未注入的NEXT_PUBLIC_BASE_PATH；根/api/articles与/logo.png均404，正确/polanews路径均200。构建时漏配前缀，运行时设置不能修复客户端。
上次发布中断后POLANEWS_SCHEDULER_DISABLED仍为1，最新文章停于10月6日。

## 范围与验收
修正前缀构建单一来源，部署检查拒绝漏配构建，重建发布并完成RSS状态刷新/恢复正常调度。保留模型、密钥、原数据和订阅。
验收：公开首页logo及客户端API地址包含/polanews；文章/源/摘要接口可读；57源有真实刷新结果；scheduler恢复并出现新入库内容；备份旧构建和配置。
