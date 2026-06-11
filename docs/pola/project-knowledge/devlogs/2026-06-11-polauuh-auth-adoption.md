# Devlog: PolaNews 接入 PolaUUH

日期：2026-06-11

## 目标

将 PolaNews 注册登录入口统一到 PolaUUH，同时保留本地业务用户映射和 JWT。

## 变更

- `app/src/lib/aipd-sso.ts` 新增 PolaUUH canonical 配置、admin 生产路径、SSO check、偏好读取/更新兼容函数。
- 新增 `app/src/app/api/auth/sso/urls/route.ts` 返回 PolaUUH 登录/注册 URL。
- 新增 `app/src/app/api/auth/sso/polauuh/route.ts`，使用 PolaUUH cookie 换取 PolaNews JWT，并按邮箱创建/更新本地用户。
- `app/src/app/api/auth/sso/aipd/route.ts` 改为委托 PolaUUH session check。
- `app/src/app/api/auth/login/route.ts`、`app/src/app/api/auth/register/route.ts` 默认 403，只有 `POLANEWS_LOCAL_AUTH_ENABLED=true` 时允许本地 fallback。
- `app/src/app/login/page.tsx` 改为 PolaUUH 登录/注册入口，`?sso=1` 自动换 token。
- `app/src/app/register/page.tsx` 改为自动跳转 PolaUUH 注册。
- `app/src/components/layout/Header.tsx` silent SSO 改用 `/api/auth/sso/polauuh`。

## 验证

- 已执行：`npm --prefix app run lint` 触发现有非本次页面 lint 错误；本次修改文件定向 eslint 通过。
- 已执行：SSO URL route smoke，`/polanews/login` 返回 200 并加载 SSO URL。
- 线上路径 smoke 已完成：`/PolaUUH/admin/login` 200，`/PolaUUH/admin/api/sso/check` 未登录 401。
- 已完成：本次修改文件定向 eslint 通过。
- 已完成：`npm exec tsc -- --noEmit --pretty false` 通过。
- 已完成：`npm --prefix app run build` 通过。
- 已完成：Chrome headless 截图确认登录页显示 PolaUUH 登录/注册入口。
