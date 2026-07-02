# Requirement: Agent Reach Source Harness for PolaNews

Date: 2026-07-02
Risk: P2, external source/RSS/fulltext diagnostics with network and provider availability implications.

## Original Request

用户在调研 `Panniantong/Agent-Reach` 后，要求“直接实现这些代码”，并按 `pola-a2a-usage` 方式把对应项目的 PRD、SDD、SPEC 写入目录，然后整体干完。

## Goal

为 PolaNews 落地 Agent Reach 风格的 source capability harness，让系统能用统一的 doctor 输出检查 RSS、全文抽取、Jina Reader、GitHub/Exa/OpenCLI 等外部信息源能力，并把能力结果暴露给 API、CLI 和 MCP，后续可作为 Digest 背景增强、跨源验证和外部信号雷达的基础。

## Users

- PolaNews 维护者：在本地或服务器上运行 doctor，判断外部源是否可用。
- PolaNews 自动化 Agent：通过 API/CLI/MCP 读取 capability 状态，决定是否启用某个外部信号源。
- 内容运营/编辑：间接受益于更稳定的全文抽取和来源可观测性。

## Scope

- 新增无数据库副作用的 source reach doctor 核心模块。
- 新增 `/api/source-reach/doctor` API。
- 新增 CLI 命令 `polanews source-reach doctor`。
- 新增 MCP tool `source_reach_doctor`。
- 为文章全文抽取增加 Jina Reader fallback，但仅在原有 Readability 失败时使用。
- 输出 A2A delivery ledger、测试矩阵和回归证据。

## Non-Goals

- 不把 Agent-Reach 作为生产强依赖。
- 不接入登录态社媒抓取，不抓取 Twitter/Reddit/小红书等需要账号或高风险的内容。
- 不新增数据库表，不改变已有 RSS 抓取队列、Digest 生成、广播和分享数据结构。
- 不执行部署、服务重启、push 或生产配置修改。

## Assumptions

- `app/` 子项目是 PolaNews 当前生产实现目录。
- Doctor 默认只做轻量本地/配置探测；如需要真实外网探测，必须显式传入 `live=true`。
- Jina Reader 是可选 fallback，失败时返回原有失败结果，不阻断主流程。

## Acceptance Criteria

- A1 文档：需求、PRD、SPEC、SDD、devlog 和 delivery JSON 已写入 `docs/pola/project-knowledge/`。
- A2 API：`GET /api/source-reach/doctor` 返回稳定 JSON，包含每个 channel 的 status、backends、active_backend、risk_tier 和 hint。
- A3 CLI/MCP：`polanews source-reach doctor` 和 MCP `source_reach_doctor` 能读取同一套 doctor 结果。
- A4 Fulltext：原有 Readability 失败时可尝试 Jina Reader fallback；Jina 失败不影响旧接口的错误处理语义。
- A5 安全：doctor 不输出 token/cookie/API key，不发起下载、不写数据库、不启用登录态抓取。
- A6 测试：新增逻辑有最小自动化验证或构建/lint 证据，并生成 `function_test_cases.json`。
- A7 兼容：旧 RSS 抓取、全文接口、Digest、MCP 现有工具和 CLI 现有命令保持兼容。

## Stability and Security Gate

- Risk level: P2.
- Network: default no live probe; explicit live mode only for lightweight availability checks.
- Secrets: environment variables are reported as configured/missing only, never printed.
- Performance: no background loops, no bulk fetch, no database writes in doctor.
- Rollback: remove the new source-reach files, route, CLI branch and MCP tool; old paths continue to work.
