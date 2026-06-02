# 需求记录：Digest 与分享海报可信度回归

日期：2026-06-02
需求池记录：`pglBTXPyFe`

## 用户原始需求

PolaNews 曾修复 Digest Mock/general 噪音和分享海报结构化，但当前工作区仍有 digest 页面改动，且旧测试报告提到 profile 404，需要做一次内容可信度和账号链路回归。

## 目标

- 确认指定日期 Digest 不含 Mock/general/RSS 噪音和公众号尾巴。
- 确保分享生成使用结构化精选，不直接搬运整段 `full_content`。
- 增加 `/api/user/profile` 兼容接口，避免旧客户端或测试报告里的 profile 404。
- 保留 `no-store` 指定日期 Digest API 行为。
- 形成 harness/build/browser 证据。

## 边界

- 不重写现有 Digest UI 大改动；根目录 `src/app/digest/[date]/page.tsx` 的既有脏改动不纳入本次提交。
- 不修复全项目历史 lint 债。
- 不改变 RSS 抓取、LLM 生成和分享图片生成 provider。

## 非目标

- 不重新生成线上历史 Digest 数据。
- 不新增登录/注册产品流程。
- 不部署生产。

## 验收标准

- A1 指定日期 Digest 不含 Mock/general/RSS 噪音和公众号尾巴。
- A2 分享海报只展示结构化精选，不搬运 full_content。
- A3 `/api/user/profile` 或当前等价用户信息接口不再 404。
- A4 `npm run build` 与 `harness:digest` 通过。
- A5 线上或本地 `/polanews` 指定日期 no-store 行为验证。
