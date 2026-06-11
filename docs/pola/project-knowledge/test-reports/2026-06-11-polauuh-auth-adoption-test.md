# Test Report: PolaNews PolaUUH 接入

日期：2026-06-11

## 本地验证

- `npm exec eslint -- <本次修改文件>`：通过。
- `npm exec tsc -- --noEmit --pretty false`：通过。
- `npm --prefix app run build`：通过。
- `curl -I http://localhost:3101/polanews/login`：200。
- `curl -I http://localhost:3101/login`：404，符合当前 `basePath=/polanews` 配置。

## 已完成线上路径验证

- `GET https://aipd.me/PolaUUH/admin/login` 返回 200。
- `GET https://aipd.me/PolaUUH/login` 返回 404。
- 匿名 `POST https://aipd.me/PolaUUH/admin/api/sso/check` 返回 401。
- 匿名 `POST https://aipd.me/PolaUUH/api/sso/check` 返回 404。

结论：PolaNews 默认 SSO 路径必须使用 `/PolaUUH/admin/*`。

## UI 截图

- 总控记录：`/Users/wangchang/Desktop/PolaRequermentAutoUpdate/docs/pola/project-knowledge/test-reports/screenshots/2026-06-11-polanews-polauuh-login.png`
- 页面显示“使用 PolaUUH 登录”和“注册统一账号”。

## 备注

- 全量 `npm --prefix app run lint` 仍会被既有非本次页面问题挡住；本次修改文件的定向 eslint、TypeScript 和 production build 均通过。
