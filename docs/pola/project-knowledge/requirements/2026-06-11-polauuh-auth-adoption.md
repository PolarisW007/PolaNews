# Requirement: PolaNews 接入 PolaUUH 统一注册登录

日期：2026-06-11

## 目标

将 PolaNews 的注册、登录入口统一切到 PolaUUH。PolaNews 保留本地用户表、JWT、收藏、订阅和设置等业务数据，但用户创建和登录默认来自 PolaUUH SSO。

## 范围

- 登录页默认显示 PolaUUH 统一账号入口。
- 注册入口跳转 PolaUUH 注册页。
- 回跳 `?sso=1` 后调用本地 `/api/auth/sso/polauuh` 换取 PolaNews JWT。
- 旧 `/api/auth/sso/aipd` 保留兼容。
- 本地 `/api/auth/login`、`/api/auth/register` 默认禁用，仅在 `POLANEWS_LOCAL_AUTH_ENABLED=true` 时作为开发 fallback。

## 验收

- A1 文档：PRD/SDD/devlog/test report 存在。
- A2 登录：登录页主按钮跳转 PolaUUH。
- A3 注册：注册页或注册链接跳转 PolaUUH register。
- A4 SSO：`/api/auth/sso/polauuh` 服务端调用 PolaUUH SSO check，并映射本地用户。
- A5 安全：本地账号 API 默认禁用，不打印 cookie/token。
