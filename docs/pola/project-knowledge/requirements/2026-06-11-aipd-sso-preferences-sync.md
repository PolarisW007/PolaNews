# PolaNews AIPD SSO 与偏好同步需求记录

## 原始需求

用户要求“继续处理”。当前上下文中，本地代码和线上服务器已经完成 RSS 源同步，但服务器 `/opt/polanews` 仍存在未提交的线上热修：AIPD 统一账号 SSO、Header 自动登录、Settings 偏好同步。需要把线上热修工程化带回本地仓库，保持本地、GitHub、服务器代码一致，并保留既有无关脏文件。

## 目标

- 未登录用户访问 PolaNews 时，如果已经在 AIPD/织梦空间登录且有 `polanews.use` 权限，应自动换取 PolaNews 本地 JWT。
- 登录后右上角应持续显示统一账号昵称或邮箱。
- 设置页读取和保存主题、字体、缩放、密度偏好时，优先与 AIPD 统一偏好同步。
- 本地仓库记录线上 SSO 热修，避免服务器长期保留未提交改动。

## 非目标

- 不改登录页交互和注册流程。
- 不改 PolaNews 用户表 schema。
- 不改 AIPD 统一账号服务。
- 不处理旧根目录 `src/app/digest/[date]/page.tsx` 的历史脏改动。
- 不提交服务器 `.env.local.bak-*` 备份文件。

## 验收标准

- A1 新增 `/api/auth/sso/aipd`，可通过 AIPD cookie 校验权限并返回 PolaNews JWT。
- A2 Header 在未登录时静默调用 SSO route，成功后写入 `auth_token` 和 `user`。
- A3 Settings GET 优先返回 AIPD 统一偏好中的 `theme/font_family/font_scale/density`。
- A4 Settings PUT 将上述偏好同步给 AIPD，并继续保存 PolaNews 本地语言、Digest 时间、分类等偏好。
- A5 AIPD 内部地址、app id、权限名支持环境变量覆盖。
- A6 本地类型检查、相关 route lint、生产 deploy doctor 和服务器 smoke 均通过。
- A7 保留并说明本地旧 `src/app/digest/[date]/page.tsx` 未提交改动，不混入本次提交。

## 风险

- R1 AIPD 内部服务不可达时，SSO 和统一偏好会降级为未登录/本地偏好，不应影响普通 JWT 登录。
- R2 线上当前已有热修代码，部署时需先 stash 服务器未提交改动，再 fast-forward 到正式 commit。
- R3 统一偏好字段目前只在 API 层同步，设置页暂未提供字体/密度可视化控件。
