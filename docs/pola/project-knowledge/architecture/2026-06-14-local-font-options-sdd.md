# 2026-06-14 本地字体选项扩展 SDD

## 当前实现

- `app/src/app/settings/page.tsx` 已读取和保存 `font_family`，但没有 UI 控件和实际应用逻辑。
- `app/src/app/layout.tsx` 只初始化主题。
- `app/src/app/globals.css` 直接写死全站字体栈。

## 方案

- 在设置页新增 `FONT_OPTIONS`、`applyFont` 与字体卡片。
- 在 layout 初始化脚本中恢复 `polanews_font`。
- CSS 使用 `--user-font-family` 控制 body 字体。

## 测试策略

- `npm run build`。
- 静态检查新增字体 id 与设置字段一致。

## 回滚

移除 `FONT_OPTIONS` UI 和 `--user-font-family` 初始化即可，已保存的 `font_family` 字段不影响旧逻辑。
