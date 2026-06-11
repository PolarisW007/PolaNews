# PRD: PolaNews 统一账号入口

日期：2026-06-11

## 用户流程

```mermaid
flowchart TD
  A["用户打开 PolaNews"] --> B{"是否已有 auth_token"}
  B -- "有" --> C["进入资讯应用"]
  B -- "无" --> D["进入 /login"]
  D --> E["跳转 PolaUUH 登录"]
  E --> F["PolaUUH 回跳 /login?sso=1"]
  F --> G["调用 /api/auth/sso/polauuh"]
  G --> H["写入 PolaNews auth_token 和 user"]
  H --> C
```

## 规则

- PolaUUH 是唯一默认注册/登录入口。
- 线上默认路径：
  - 登录：`https://aipd.me/PolaUUH/admin/login`
  - 注册：`https://aipd.me/PolaUUH/admin/register`
  - SSO：`https://aipd.me/PolaUUH/admin/api/sso/check`
- PolaNews 业务偏好仍保留在 PolaNews。
- AIPD 命名接口保留为兼容层，不再作为新代码主路径。
- `next` 回跳必须是站内绝对路径，避免开放跳转。
