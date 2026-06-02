# PRD：Digest 与分享海报可信度回归

日期：2026-06-02

## 背景

PolaNews 的 Digest 清洗能力已沉淀在 `digest-clean.ts` 和 `scripts/harness-digest-clean.mjs`。本次需求要求把历史修复回归到可验收状态，并补齐旧报告中的 profile 404 兼容入口。

## 用户流程

### Digest 页面

1. 用户打开 `/digest/:date`。
2. 前端请求 `/api/digests/latest?lang=zh&date=:date`。
3. API 返回清洗后的 `headlines`、`structured_digest`、`full_content`。
4. 指定日期响应 header 使用 `Cache-Control: no-store`。

### 分享生成

1. 用户在分享页选择 Digest。
2. 分享 API 读取 `daily_digests.statistics.structured_digest`。
3. 如果 structured digest 存在，使用标题、lead、top_stories、quick_reads 生成 source brief。
4. 如果 structured digest 缺失，只取清洗后的前 8 行摘要，不搬运完整 `full_content`。

### 用户信息兼容接口

1. 旧客户端或测试访问 `/api/user/profile`。
2. 未登录返回 401，不再 404。
3. 已登录返回 display_name、email、language、digest_language、theme、digest_times、followed_categories。

## 异常分支

- Digest 不存在：API 返回 `{ success: true, data: null }`，页面进入空态。
- 分享输入缺失 digest/article：返回 400。
- lint 失败：记录为既有项目 lint 债；本次以 build 和 harness 作为主验收。

## 权限

- `/api/user/profile` 只返回当前登录用户的基本设置，不暴露 token。
- Digest/share 清洗不输出原始 RSS 抓取全文。
