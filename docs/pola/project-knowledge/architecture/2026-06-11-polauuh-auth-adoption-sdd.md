# SDD: PolaNews 接入 PolaUUH SSO

日期：2026-06-11

## 方案

- `app/src/lib/aipd-sso.ts` 升级为 PolaUUH canonical 配置，并保留 AIPD alias。
- PolaUUH 默认生产路径使用 `/PolaUUH/admin/login`、`/PolaUUH/admin/register`、`/PolaUUH/admin/api/sso/check`。
- 新增 `/api/auth/sso/urls` 返回 login/register 跳转地址。
- 新增 `/api/auth/sso/polauuh` 作为 canonical token exchange endpoint。
- 修改登录/注册页面，默认跳转 PolaUUH。
- 修改本地 login/register API，默认禁用，显式 `POLANEWS_LOCAL_AUTH_ENABLED=true` 才允许使用。

## 回滚

- 设置 `POLANEWS_LOCAL_AUTH_ENABLED=true` 临时恢复本地账号 API。
- 前端可回退到旧登录页 commit。
- SSO 兼容路径 `/api/auth/sso/aipd` 保留。

## 不影响功能使用

- PolaNews 本地 `users`、订阅、收藏、设置和 digest 数据模型不变。
- 业务请求继续使用 PolaNews 自己的 JWT；PolaUUH cookie 只用于登录交换。
- 旧 `/api/auth/sso/aipd` 继续委托到 PolaUUH 校验，减少旧客户端回归风险。
