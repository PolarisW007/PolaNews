# Pola A2A Skill 迭代升级报告

更新时间：2026-06-19 18:36 CST

## 1. 本次范围

本报告只做调研、诊断和升级设计，不修改 `~/.agents/skills`、`~/.codex/skills`、`~/.qoder/skills` 中的 skill 版本。待确认后再进入升级实施。

本次读取和检查范围：

- 2026 年 5 月、6 月本机 Codex session JSONL 记录。
- 本地 Pola A2A 核心 skill：`~/.agents/skills/pola-*`。
- Codex 安装副本：`~/.codex/skills/pola-*`。
- Qoder 安装副本清单：`~/.qoder/skills/pola-*`。
- 当前 Pola A2A harness：`pola-agent-delivery-framework/scripts/validate_pola_skills.py`。
- A2A artifact 契约和 workflow gate 文档。

## 2. 会话与调用记录结论

5、6 月共读取 94 个 session 文件：

| 月份 | session 数 |
| --- | ---: |
| 2026-05 | 23 |
| 2026-06 | 71 |

主要工作目录分布：

| 项目目录 | session 数 |
| --- | ---: |
| `/Users/wangchang/Desktop/PolaRequermentAutoUpdate` | 30 |
| `/Users/wangchang/Desktop/WSYCursorCode/PolaLuna` | 23 |
| `/Users/wangchang/Desktop/WSYCursorCode/PolaGithubRepoResearch` | 16 |
| `/Users/wangchang/Desktop/王畅的AI工作/工作2026/Oneclub跟进` | 7 |
| `/Users/wangchang/Desktop/WSYCursorCode/PolaZhenJing` | 4 |
| `/Users/wangchang/Desktop/WSYCursorCode/PolaXiaowang` | 3 |
| `/Users/wangchang/Desktop/WSYCursorCode/PolaNews` | 2 |

工具调用摘要：

| 类别 | 调用/命中数 | 说明 |
| --- | ---: | --- |
| `exec_command` | 20212 | 绝大多数真实工作仍依赖 shell 执行 |
| `write_stdin` | 4968 | 长任务、服务、SSH、交互式进程很多 |
| git 操作 | 3479 | commit/push/status/diff 是高频收尾环节 |
| docs/project-knowledge | 2824 | 文档化交付已经形成习惯 |
| deploy/ops | 2782 | SSH、supervisor、systemd、nginx、docker 等线上动作频繁 |
| secret/security scan | 1458 | 密钥、token、diff check 检查出现频繁 |
| harness/browser/playwright | 1348 | 用户已强要求 harness 和浏览器验证 |
| API/curl | 1345 | API 验证较多，但格式不统一 |
| browser/UI | 606 | UI 验证存在，但证据格式不稳定 |
| lint/type/build | 524 | 静态检查和构建有执行，但不是每个需求稳定覆盖 |
| unit test | 347 | 单测命令密度偏低 |

按 session 维度看：

| 类型 | 覆盖 session 数 |
| --- | ---: |
| git 操作 | 74 |
| docs/project-knowledge | 74 |
| secret/security scan | 70 |
| deploy/ops | 62 |
| harness | 42 |
| browser/UI | 35 |
| API/curl | 32 |
| lint/type/build | 23 |
| unit test | 16 |

结论：

- A2A 流程已经在真实工作中被大量触发，尤其是文档、git、部署、harness、浏览器验证。
- 测试门禁存在，但执行深度不稳定：单元测试覆盖 session 数明显低于文档、部署、git 和 harness。
- 线上部署、凭据、SSH、远端服务不可达、旧脏文件隔离，是多次会话中的重复风险。
- 目前记录多为自然语言和命令输出，缺少可机器读取的跨阶段状态文件，导致后续 agent 难以接力和自动判断“是否真的 Ready”。

## 3. 本地 Pola A2A 实现现状

`.agents` 中当前核心 A2A skill 共 12 个：

- `pola-a2a-usage`
- `pola-agent-delivery-framework`
- `pola-project-context-reader`
- `pola-requirement-analyzer`
- `pola-architecture-doc-writer`
- `pola-implementation-runner`
- `pola-code-review-gate`
- `pola-test-gate`
- `pola-integration-regression-gate`
- `pola-deploy-release-gate`
- `pola-devlog-git-finalizer`
- `pola-devlog-writer`

`.codex` 中包含同样 12 个核心 skill，并额外包含：

- `pola-daily-requirement-manager`
- `pola-requirement-delivery`
- `pola-requirements-management`
- `pola-wechat-record-export`

`.qoder` 中也包含上述需求管理类 skill，并额外包含一些非 A2A Pola skill。

核心 12 个 skill 在 `.agents` 与 `.codex` 的内容基本一致，唯一 diff 是 `__pycache__` 中的 Python 编译缓存。建议后续升级时不要同步 `__pycache__`，并把缓存文件加入 skill 发布忽略规则。

当前 harness 结果：

```text
PASS: Pola skill harness found no issues.
```

这说明现有 skill 文件结构、章节、artifact 名称和脚本语法通过了静态检查；但不代表真实交付行为已被验证。

## 4. 关键问题诊断

### 4.1 A2A 是“文档驱动”，还不是“状态机驱动”

现有 `pola-agent-delivery-framework` 已定义 Phase 0 到 Phase 8、artifact contract 和 workflow gates，但主要以 `SKILL.md` 文本约束 agent 行为。真实会话中，agent 仍需要手动记住：

- 当前处于哪个阶段。
- 上一阶段 artifact 是否完整。
- 哪些验收项已经有测试证据。
- 哪些 blocker 已解除。
- 哪些文件是用户已有改动，不能提交。

建议升级为状态机式 A2A：

- 每次需求创建 `docs/pola/project-knowledge/delivery/<slug>/delivery_state.json`。
- 记录阶段状态、输入 artifact、输出 artifact、证据、阻塞项、下一步。
- 每个 skill 更新同一个 evidence ledger，而不是只在聊天里输出。
- harness 可以读取 `delivery_state.json` 判断流程是否断档。

### 4.2 测试门禁有命令发现，但缺少“验收项到测试”的硬映射

`pola-test-gate` 已有矩阵模板和 `run_quality_gates.sh`，脚本会发现 `package.json`、`pytest`、`go test`、`cargo test` 等常见命令。但 5、6 月记录显示，unit test session 覆盖只有 16/94，远低于 docs/git/deploy。

主要缺口：

- 未强制生成 `acceptance_id -> risk -> test_type -> command -> result`。
- 没有从 `git diff` 自动推导应该跑哪些测试。
- 缺少“没有测试命令时如何生成最小 smoke/fixture 验证”的标准。
- 失败分类仍靠人工总结，无法自动聚合历史失败。
- 测试证据没有稳定 JSON 产物，后续 release gate 难以自动引用。

建议 `pola-test-gate v0.3` 增加：

- `test_matrix.json`：验收项、风险、命令、结果、覆盖缺口。
- `run_quality_gates.sh --json`：输出结构化结果。
- `diff_to_tests.py`：读取 changed files，匹配 package scripts、测试目录、CI 命令。
- `known_failures.json`：标记历史失败、环境失败、本次引入失败。
- fixture 项目 harness：Next、Python、CLI、纯 skill 文档四类最小项目。

### 4.3 集成回归门禁要求正确，但缺少可复用执行器

`pola-integration-regression-gate` 已覆盖 UI、API、数据、副作用、异步任务、部署后回归。但真实执行仍分散在 curl、浏览器、ssh、日志命令里。

建议 `pola-integration-regression-gate v0.3` 增加：

- `regression_plan.yaml`：按验收项定义 URL、API、操作、期望、证据类型。
- `regression_evidence.json`：记录 URL、视口、截图、console/network、API 状态码、数据库或日志核对。
- Browser harness 规范：桌面/移动视口、console error、network fail、截图路径必须统一。
- API harness 规范：成功、缺参、鉴权失败、404/非法参数至少按风险选择覆盖。
- 异步任务 harness：提交参数、job id、状态流转、最终结果、失败补偿。

### 4.4 发布门禁频繁触发，但缺少环境和版本事实自动核对

5、6 月 deploy/ops 命中很高，说明生产/服务器操作是 A2A 真实工作的重要组成。当前 `pola-deploy-release-gate` 已要求版本一致性和回滚，但仍依赖人工拼接。

建议 `pola-deploy-release-gate v0.2` 增加：

- `release_manifest.json`：本地 HEAD、远端 HEAD、生产 commit、服务名、部署路径、回滚点。
- `environment_probe.sh`：只读探测 systemd/supervisor/nginx/docker/pm2/进程端口。
- `deploy_blocker_classifier.py`：把 SSH 超时、GitHub 凭据失败、服务健康失败、测试失败区分为环境 blocker 或代码 blocker。
- 高危命令必须记录 `requires_confirmation: true`，避免 agent 串联执行。

### 4.5 收尾和 git 已有规则，但缺少“无关改动隔离账本”

真实会话和记忆中多次出现“本次改动与用户已有脏文件并存”的情况。现有 `pola-implementation-runner` 和 `pola-devlog-git-finalizer` 已提醒不要覆盖用户改动，但缺少结构化记录。

建议增加：

- `dirty_worktree_ledger.json`：记录文件、来源判断、是否本次相关、是否允许 stage。
- commit 前 harness 校验：只允许 stage ledger 中 `include_in_commit=true` 的文件。
- finalizer 输出“未提交的用户改动保留清单”，避免误报 clean。

### 4.6 需求管理类 skill 与 A2A 核心集需要统一边界

`.codex` 和 `.qoder` 有 `pola-requirements-management`、`pola-requirement-delivery`、`pola-daily-requirement-manager`，但 `.agents` 核心集没有。真实记忆和会话显示这些 skill 已被用于需求池、DingTalk AI 表、需求交付流。

建议二选一：

- 方案 A：把三者纳入 A2A 标准集，`.agents/.codex/.qoder` 三端保持一致。
- 方案 B：明确它们是“需求运营扩展包”，A2A usage skill 只引用，不作为核心 harness 必检项。

推荐方案 A。原因是用户已经把需求池、PRD、A2A 交付、harness、上线验证视为一个闭环；需求管理不应漂在核心链路外。

## 5. Skill 逐项升级建议

| Skill | 建议版本 | 升级重点 | 可验证产物 |
| --- | --- | --- | --- |
| `pola-a2a-usage` | v0.2 | 明确标准集、扩展集、三端安装路径、确认后升级流程 | `A2A_USAGE_CHECKLIST.md` |
| `pola-agent-delivery-framework` | v0.2 | 状态机、delivery_state、evidence ledger、阶段 replay | `delivery_state.schema.json` |
| `pola-project-context-reader` | v0.2 | monorepo 子项目画像缓存、脏文件分类、部署面探测、命令来源权重 | `project_context.json` |
| `pola-requirement-analyzer` | v0.2 | 验收项强制带验证类型、风险等级、对应真实链路 | `acceptance_criteria.json` |
| `pola-architecture-doc-writer` | v0.2 | 测试矩阵、回滚、观测、数据/权限/AI 风险成为必填 | `architecture_plan.json` |
| `pola-implementation-runner` | v0.2 | 实现步骤映射验收项、dirty ledger、patch 归属记录 | `implementation_ledger.json` |
| `pola-code-review-gate` | v0.2 | diff-driven rubric、P0-P3 JSON findings、测试缺口反推 test gate | `review_findings.json` |
| `pola-test-gate` | v0.3 | diff-to-test、JSON 结果、fixture harness、失败分类 | `test_matrix.json` |
| `pola-integration-regression-gate` | v0.3 | browser/API/任务/数据副作用场景 DSL、截图和日志证据规范 | `regression_evidence.json` |
| `pola-deploy-release-gate` | v0.2 | 环境探测、版本一致性自动核对、部署 blocker 分类、回滚 runbook | `release_manifest.json` |
| `pola-devlog-git-finalizer` | v0.2 | 文档-diff 一致性、stage 白名单、secret scan、commit evidence ledger | `finalization.json` |
| `pola-devlog-writer` | v0.2 | 从 evidence ledger 自动生成开发日志条目，避免手写漂移 | `devlog_entry.json` |
| `pola-requirements-management` | v0.2 | 与 A2A 状态机绑定，需求池字段映射到 artifact | `requirement_record.schema.json` |
| `pola-requirement-delivery` | v0.2 | 作为单需求交付总控，直接读写 delivery_state | `delivery_run.json` |
| `pola-daily-requirement-manager` | v0.2 | 每日扫描后生成可排队的 A2A run plan | `daily_requirement_plan.json` |

## 6. Harness 升级设计

当前 `validate_pola_skills.py` 保留，定位为静态结构 harness。建议新增行为 harness：

### 6.1 Static Harness

继续检查：

- frontmatter。
- 必需章节。
- artifact 字段。
- reference 文件。
- shell/python 脚本语法。

新增检查：

- 禁止 `__pycache__`、`.DS_Store`、临时截图进入 skill 包。
- 检查 `.agents/.codex/.qoder` 安装 parity。
- 检查 usage skill 是否列出当前标准集和扩展集。

### 6.2 Scenario Replay Harness

从 5、6 月 session 中抽样回放，不读取敏感原文，只检查流程模式：

- 是否先 project context 再 requirement/architecture。
- 是否有 implementation 到 review/test/regression/finalization 的证据链。
- 是否存在“直接部署但无测试证据”的风险路径。
- 是否存在“commit/push 但未记录 dirty worktree”的风险路径。

输出：

```text
pola-a2a-harness replay --months 2026-05,2026-06 --report reports/a2a-replay.json
```

### 6.3 Fixture Project Harness

准备 4 个最小 fixture：

- `fixture-next-app`：前端页面、lint/type/build、browser smoke。
- `fixture-python-api`：pytest、API curl、错误码。
- `fixture-cli-tool`：CLI 参数、输出文件、失败返回码。
- `fixture-skill-doc`：SKILL.md、引用文件、脚本语法。

每个 fixture 都有预期：

- project context 能识别命令。
- requirement 能生成可验证验收项。
- test gate 能选出最小相关测试。
- integration gate 能生成真实链路计划。

### 6.4 Regression Evidence Harness

统一浏览器和 API 证据：

- 浏览器：URL、viewport、screenshot、console errors、network failures。
- API：method、URL、status、schema check、关键字段。
- 数据副作用：读取接口或 DB 查询摘要。
- 异步任务：job id、状态流转、最终结果。

### 6.5 Release Dry-run Harness

用 mock 输出模拟：

- SSH timeout。
- supervisor service stopped。
- nginx config invalid。
- GitHub push credential failure。
- local HEAD 与 production commit 不一致。

目标是让 deploy gate 自动输出 `Blocked` 或 `Not ready`，而不是继续执行。

## 7. 建议实施顺序

### Phase 1：无破坏性 schema 与文档升级

- 增加 `delivery_state.schema.json`、`test_matrix.schema.json`、`regression_evidence.schema.json`。
- 更新 usage 和 agent-delivery-framework，明确核心集/扩展集。
- 不改变现有 skill 触发方式。

### Phase 2：脚本和 harness 升级

- 改造 `validate_pola_skills.py`，增加 parity 和包卫生检查。
- 新增 `pola-a2a-harness` 命令入口。
- 给 test gate 增加 JSON 输出。

### Phase 3：fixture 与会话回放

- 建立 fixture 项目。
- 抽样 5、6 月 session 做 replay 检查。
- 输出第一份 `a2a-replay-report.json/md`。

### Phase 4：三端同步

- 同步 `.agents/.codex/.qoder`。
- 明确是否把 `pola-requirements-management`、`pola-requirement-delivery`、`pola-daily-requirement-manager` 纳入标准集。
- 跑 static harness、fixture harness、replay harness。

## 8. 验收标准

确认升级后，建议按以下标准验收：

- A1 静态 harness：核心 skill 和扩展 skill 全部通过，且三端安装 parity 通过。
- A2 测试门禁：fixture 项目能生成 `test_matrix.json`，且正确选择 unit/lint/build/browser/API。
- A3 集成回归：fixture Next/API 项目能生成截图/API 证据，并记录 console/network/status。
- A4 发布门禁：mock 部署失败能被分类为 blocker，不会误报 Ready。
- A5 脏文件保护：模拟 unrelated dirty file 时，finalizer 不会 stage。
- A6 会话回放：抽样 session 能输出阶段缺口报告。
- A7 文档产物：每次 A2A run 至少生成或更新 `delivery_state.json` 和 evidence ledger。

## 9. 需要确认的问题

1. 是否把 `pola-requirements-management`、`pola-requirement-delivery`、`pola-daily-requirement-manager` 纳入 A2A 标准集，并同步到 `.agents`？
2. 是否接受以 `.agents/skills` 作为本轮升级的源头，再同步到 `.codex/.qoder`？
3. 是否同意新增 fixture harness 和 session replay harness，作为后续 skill 版本升级的硬门槛？

建议确认以上 3 点后开工升级。
