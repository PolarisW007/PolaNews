# 一念三千 - 全球资讯AI聚合阅读平台 产品需求文档

> 版本：v1.3 | 日期：2026-03-06 | 更新：图文阅读、科技绿色视觉规范、智能播报、中英日三语、小红书/朋友圈分享

---

## 一、产品概述

### 1.1 产品定位

**一念三千** 是一款面向信息工作者和深度阅读者的 **全球资讯 RSS 智能聚合阅读平台**。平台通过订阅全球主流新闻 RSS 源，结合 **MCP（Model Context Protocol）** 实现 AI Agent 驱动的新闻获取与分类，并利用大语言模型（LLM）每日自动生成新闻摘要与重点提炼，帮助用户在信息洪流中快速获取高价值资讯。

### 1.2 核心价值

| 价值维度 | 描述 |
|----------|------|
| 全球视野 | 一站式订阅覆盖全球 200+ 新闻源，涵盖中英文主流媒体 |
| AI 分类 | 基于 MCP 协议的 AI Agent 自动对新闻进行多维度分类 |
| 智能摘要 | LLM 每日汇总新闻，提炼重点，生成结构化 Daily Digest |
| 降噪阅读 | 去重、评分、过滤，只展示高信噪比内容 |
| 语音播报 | 一键智能播报，AI 生成口语化新闻快讯，解放双眼 |
| 开放协议 | 基于 MCP 标准协议，可扩展接入任意 AI 工具链 |

### 1.3 目标用户

- 需要跟踪全球时事的信息工作者
- 科技/金融/地缘等垂直领域的深度阅读者
- 希望用 AI 提效阅读的效率极客
- RSS 爱好者与信息管理者

---

## 二、技术架构

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────┐
│                    用户浏览器                         │
│              Next.js 前端（SSR + CSR）                │
└───────────────┬─────────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────────┐
│                  API Gateway（Next.js API Routes）    │
├─────────────────────────────────────────────────────┤
│                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │ RSS 采集引擎  │  │ MCP Server   │  │ LLM 摘要    │ │
│  │ (Feedparser  │  │ (RSS Agent   │  │ 引擎        │ │
│  │  + RSSHub)   │  │  + 分类Agent) │  │ (Qwen/GPT) │ │
│  └──────┬───────┘  └──────┬───────┘  └─────┬──────┘ │
│         │                 │                │         │
│  ┌──────▼─────────────────▼────────────────▼──────┐ │
│  │              PostgreSQL + pgvector              │ │
│  │         (新闻存储 + 语义向量 + 用户数据)          │ │
│  └────────────────────────────────────────────────┘ │
│                                                      │
│  ┌────────────────┐  ┌─────────────────────────┐    │
│  │  Redis          │  │  定时任务调度器            │    │
│  │  (缓存 + 队列)  │  │  (node-cron / BullMQ)    │    │
│  └────────────────┘  └─────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

### 2.2 推荐技术栈

| 层级 | 技术选型 | 说明 |
|------|----------|------|
| 前端框架 | Next.js 15 + React 19 + TypeScript | SSR 优化 SEO，支持流式渲染 |
| UI 组件 | Tailwind CSS + Shadcn/UI | 现代化设计系统，原生深色模式 |
| 后端运行时 | Node.js 22（Next.js API Routes） | 统一前后端技术栈 |
| RSS 解析 | feedparser / rss-parser + RSSHub | 自托管 RSSHub 扩展源覆盖 |
| MCP 服务 | @modelcontextprotocol/sdk | MCP 标准协议实现 AI Agent |
| LLM 服务 | 阿里云 DashScope（Qwen Plus） / OpenAI GPT-4o | 新闻摘要与分类 |
| 向量数据库 | PostgreSQL + pgvector | 新闻语义搜索与去重 |
| 主数据库 | PostgreSQL 16 | 用户、订阅、新闻存储 |
| 缓存 | Redis 7 | Feed 缓存、API 限流、任务队列 |
| 任务调度 | BullMQ + node-cron | 定时抓取、定时摘要生成 |
| 认证 | NextAuth.js v5 + JWT | 多种登录方式 |
| 部署 | Docker Compose + Vercel/阿里云 ECS | 容器化部署 |

---

## 三、功能需求

### 3.1 RSS 源管理模块

#### 3.1.1 预置全球新闻源

- **FR-RSS-001**：系统预置全球主流新闻 RSS 源，覆盖以下分类：

| 分类 | 代表源 |
|------|--------|
| 国际综合 | BBC World、CNN、Al Jazeera、France 24、AP News、Reuters |
| 中文综合 | 联合早报、新华网、人民网、凤凰网、澎湃新闻 |
| 科技 | TechCrunch、The Verge、Ars Technica、Hacker News、36Kr |
| 财经 | Bloomberg、Financial Times、华尔街日报、财新 |
| 地缘政治 | Foreign Affairs、The Economist、BBC Politics |
| AI / 机器学习 | MIT Technology Review、OpenAI Blog、Google AI Blog |
| 开发者 | GitHub Blog、Dev.to、InfoQ、掘金 |
| 产品设计 | Product Hunt、Designer News、少数派 |

- **FR-RSS-002**：支持用户自定义添加 RSS/Atom Feed URL
- **FR-RSS-003**：支持 OPML 文件批量导入/导出订阅源
- **FR-RSS-004**：支持通过 RSSHub 路由为无 RSS 的网站生成订阅源
- **FR-RSS-005**：订阅源健康状态监控（可用性、延迟、更新频率）
- **FR-RSS-006**：支持对订阅源设置自定义标签和分组

#### 3.1.2 Feed 抓取引擎

- **FR-RSS-007**：定时自动抓取所有订阅源（默认每 30 分钟一次，可配置）
- **FR-RSS-008**：支持 RSS 2.0、Atom 1.0、JSON Feed 三种格式解析
- **FR-RSS-009**：增量抓取，基于 ETag / Last-Modified 避免重复拉取
- **FR-RSS-010**：Feed 内容标准化处理（编码统一、HTML 清洗、图片代理）
- **FR-RSS-011**：抓取失败自动重试（指数退避，最多 3 次）
- **FR-RSS-012**：支持全文抓取（对仅提供摘要的 Feed，通过 Readability 提取原文）

---

### 3.2 MCP 智能分类模块

#### 3.2.1 MCP Server 架构

- **FR-MCP-001**：实现标准 MCP Server，提供以下 Tools：

| Tool 名称 | 功能 | 输入 | 输出 |
|-----------|------|------|------|
| `fetch_feeds` | 获取指定源的最新文章 | feedUrls, limit | Article[] |
| `classify_article` | 对文章进行多标签分类 | article | categories[] |
| `search_articles` | 语义搜索历史文章 | query, filters | Article[] |
| `get_daily_digest` | 获取当日新闻摘要 | date, categories | DailyDigest |
| `get_trending` | 获取热门话题 | timeRange | Topic[] |
| `generate_broadcast` | 生成智能播报音频 | date, categories, voice | Broadcast |
| `generate_share` | 生成社交分享图文 | platform, digestId/articleId, lang | ShareResult |
| `manage_subscription` | 管理用户订阅 | action, feedUrl | Result |

- **FR-MCP-002**：MCP Server 支持 stdio 和 HTTP Streaming 两种传输方式
- **FR-MCP-003**：MCP Server 提供 Resources 暴露订阅源列表和分类体系
- **FR-MCP-004**：MCP Server 支持 MCP Apps 扩展，可返回交互式 UI 组件

#### 3.2.2 AI 自动分类

- **FR-MCP-005**：每篇新闻入库时自动触发 AI 分类，分类维度：

| 维度 | 分类项 |
|------|--------|
| 主题 | 政治、经济、科技、军事、社会、文化、体育、健康、环境、教育 |
| 地区 | 中国、美国、欧洲、中东、亚太、非洲、拉美、全球 |
| 重要性 | 突发(Breaking)、重要(Important)、一般(Normal)、低优(Low) |
| 情感 | 正面(Positive)、中性(Neutral)、负面(Negative) |

- **FR-MCP-006**：分类采用两级策略 — 轻量模型（embedding + 规则）快速预分类 + LLM 精确分类
- **FR-MCP-007**：支持用户自定义分类标签，AI 根据用户标签学习分类偏好
- **FR-MCP-008**：分类结果附带置信度分数，低置信度文章标记待人工审核

#### 3.2.3 智能去重

- **FR-MCP-009**：基于标题 + 摘要的语义相似度去重（余弦相似度阈值 0.85）
- **FR-MCP-010**：URL 规范化去重（去除 UTM 参数、统一协议）
- **FR-MCP-011**：同一事件多源报道合并，展示信源列表

---

### 3.3 LLM 每日新闻摘要模块

#### 3.3.1 Daily Digest 生成

- **FR-LLM-001**：每日定时（默认早 8:00、晚 20:00）自动生成新闻摘要
- **FR-LLM-002**：摘要内容结构：

```
📰 WorldOverview Daily Digest — 2026年3月6日

🔥 今日头条（Top 3）
  1. [标题] — 摘要（100字以内）
  2. ...

🌍 分类速览
  【科技】3 条重要新闻
    - 新闻标题 — 一句话摘要
  【财经】2 条重要新闻
    - ...
  【地缘】1 条突发新闻
    - ...

📊 今日数据
  - 共收录 XXX 条新闻
  - 覆盖 XX 个信源
  - 热门关键词：AI、贸易、...

🔗 完整阅读：[链接]
```

- **FR-LLM-003**：摘要生成时按重要性加权选取新闻（Breaking > Important > Normal）
- **FR-LLM-004**：支持按用户订阅偏好生成个性化 Digest
- **FR-LLM-005**：摘要支持中文/英文/日文三语版本切换，用户可在 Digest 页面顶部一键切换语言
- **FR-LLM-005a**：三语摘要均由 LLM 独立生成（非机翻），确保每种语言的表达自然地道
- **FR-LLM-005b**：Digest 生成时默认生成用户首选语言版本，其余语言版本按需延迟生成（首次切换时触发）

#### 3.3.2 单篇文章 AI 分析

- **FR-LLM-006**：对任意文章一键生成 AI 摘要（200 字以内），支持中/英/日三语输出
- **FR-LLM-007**：提取文章关键要点（3-5 条 bullet points），支持中/英/日三语输出
- **FR-LLM-008**：生成文章关键词标签
- **FR-LLM-009**：关联推荐相关历史文章（基于语义相似度）
- **FR-LLM-010**：支持对文章进行 AI 追问（基于文章上下文的 Q&A）

#### 3.3.3 趋势分析

- **FR-LLM-011**：周度/月度趋势报告自动生成
- **FR-LLM-012**：热门话题追踪：识别连续多日的新闻事件线索
- **FR-LLM-013**：舆情情感趋势图（某话题随时间的正负面变化）

---

### 3.4 阅读体验模块

#### 3.4.1 新闻信息流

- **FR-UI-001**：首页展示智能排序的新闻信息流（综合时间、重要性、用户偏好）
- **FR-UI-002**：卡片式布局，包含：标题、来源、时间、摘要、分类标签、封面图
- **FR-UI-003**：支持列表/卡片/杂志三种布局模式切换
- **FR-UI-004**：无限滚动加载 + 下拉刷新
- **FR-UI-005**：新闻已读/未读状态管理

#### 3.4.2 分类导航

- **FR-UI-006**：顶部 Tab 导航按主题分类切换（全部/科技/财经/政治/...）
- **FR-UI-007**：侧边栏按信源分组导航
- **FR-UI-008**：支持按地区维度筛选
- **FR-UI-009**：支持按时间范围筛选（今天/本周/本月/自定义）
- **FR-UI-010**：支持按重要性/情感筛选

#### 3.4.3 文章详情页

- **FR-UI-011**：沉浸式图文阅读视图，完整保留原文中的图片、视频、表格等富媒体元素：
  - 图片：自动代理并缓存原文图片，支持点击放大、图集浏览、alt 文字展示
  - 视频：内嵌 iframe / HTML5 播放器渲染原文视频（YouTube / Bilibili 等）
  - 表格：保留原文表格结构，支持横向滚动适配小屏
  - 代码块：语法高亮渲染（技术类文章）
  - 排版：保留原文标题层级、列表、引用块等结构化排版
- **FR-UI-011a**：Reader Mode（纯净模式）可切换：去除广告和无关元素，保留正文图文内容，优化排版与字体
- **FR-UI-011b**：图片懒加载 + 渐进式加载占位（skeleton / blur-up），避免图片密集文章卡顿
- **FR-UI-011c**：图文内容离线缓存，支持弱网/离线环境下阅读已加载文章
- **FR-UI-011d**：英文文章中英对照翻译功能：
  - 一键开启"中英对照"模式，英文原文与中文译文逐段并排展示（左原文右译文，或上下交替）
  - 翻译由 LLM 生成，保证译文质量与上下文连贯
  - 对照模式下图文同步保留，图片不重复显示
  - 支持单击原文段落查看该段译文（hover 气泡模式，适合快速查词场景）
  - 对照翻译结果缓存，同一文章不重复调用 LLM
- **FR-UI-012**：文章右侧展示 AI 摘要面板（可折叠），摘要支持中/英/日三语切换
- **FR-UI-013**：关联文章推荐列表
- **FR-UI-014**：一键跳转原文链接
- **FR-UI-015**：收藏、稍后阅读、分享功能

#### 3.4.4 搜索

- **FR-UI-016**：全局关键词搜索（全文索引）
- **FR-UI-017**：AI 语义搜索（自然语言描述查找相关新闻）
- **FR-UI-018**：搜索结果高亮与筛选
- **FR-UI-019**：搜索历史记录

#### 3.4.5 Daily Digest 页面

- **FR-UI-020**：独立的 Daily Digest 展示页，卡片式展示每日摘要
- **FR-UI-021**：Digest 历史归档，支持按日期浏览
- **FR-UI-022**：Digest 内新闻可点击展开详情
- **FR-UI-023**：支持 Digest 导出为 PDF/Markdown

---

### 3.5 用户系统模块

#### 3.5.1 认证

- **FR-USER-001**：邮箱 + 密码注册/登录
- **FR-USER-002**：GitHub / Google OAuth 第三方登录
- **FR-USER-003**：JWT Token 认证，支持 Refresh Token 续期

#### 3.5.2 个性化设置

- **FR-USER-004**：自定义关注分类与订阅源
- **FR-USER-005**：设置 Digest 推送时间与频率
- **FR-USER-006**：阅读偏好设置（字体大小、行距、主题色）
- **FR-USER-007**：关键词屏蔽/过滤规则
- **FR-USER-008**：语言偏好设置（中文/英文/日文），支持设置：
  - 界面语言：UI 元素的显示语言
  - 摘要首选语言：Digest 和 AI 摘要的默认生成语言
  - 对照翻译默认开关：英文文章是否默认开启中英对照

#### 3.5.3 数据管理

- **FR-USER-009**：收藏夹管理（支持文件夹分类收藏）
- **FR-USER-010**：阅读历史记录
- **FR-USER-011**：OPML 导入/导出用户订阅
- **FR-USER-012**：账号数据导出（GDPR 合规）

---

### 3.6 通知与推送模块

---

### 3.7 智能播报模块

#### 3.7.1 一键智能播报

- **FR-CAST-001**：在 Daily Digest 页面和首页提供"一键智能播报"按钮，点击后自动将 AI 生成的新闻摘要转化为语音播报
- **FR-CAST-002**：播报内容结构化组织：

```
🎙️ WorldOverview 智能播报 — 2026年3月6日 早间版

[开场白] "早上好，以下是今日全球资讯速览..."

[头条播报] 3 条最重要新闻，每条包含：
  - 新闻标题朗读
  - AI 摘要播报（100 字以内）
  - 简短点评过渡语

[分类快讯] 按分类播报要点：
  "科技方面，今天有 3 条值得关注的消息..."
  "财经领域，..."

[结尾] "以上是今日的全球资讯速览，祝您阅读愉快。"
```

- **FR-CAST-003**：播报内容由 LLM 基于 Daily Digest 二次加工生成，将书面摘要改写为口语化播报稿
- **FR-CAST-004**：支持 TTS 语音合成引擎：
  - 阿里云 CosyVoice（主选）：多音色、高自然度
  - 备选：Edge TTS / OpenAI TTS
- **FR-CAST-005**：支持多种音色选择（男声/女声/新闻主播风格），用户可在设置中配置默认音色

#### 3.7.2 播放控制

- **FR-CAST-006**：内嵌播放器 UI（底部悬浮栏），支持：
  - 播放 / 暂停
  - 进度条拖拽 & 时间显示
  - 上一条 / 下一条新闻跳转
  - 播放速度调节（0.75x / 1x / 1.25x / 1.5x / 2x）
  - 音量控制
- **FR-CAST-007**：播报时高亮当前播放的新闻条目（文字同步滚动跟随）
- **FR-CAST-008**：支持后台播放（切换页面不中断播放）
- **FR-CAST-009**：播放器展示当前播报新闻的标题，点击可跳转文章详情

#### 3.7.3 播报生成与缓存

- **FR-CAST-010**：Daily Digest 生成后自动触发播报音频预生成（后台异步）
- **FR-CAST-011**：播报音频按段落分片（每条新闻一个音频片段），支持独立缓存与跳转
- **FR-CAST-012**：音频缓存至服务端（`/data/broadcast/`），避免重复合成
- **FR-CAST-013**：支持用户手动触发对任意文章的单篇播报（一键朗读）

#### 3.7.4 个性化播报

- **FR-CAST-014**：用户可配置播报时段偏好（早报 / 午报 / 晚报）
- **FR-CAST-015**：播报内容根据用户订阅偏好个性化裁剪（只播用户关注的分类）
- **FR-CAST-016**：播报语言设置（中文 / 英文 / 日文 / 多语轮播）

---

### 3.8 社交分享模块

#### 3.8.1 小红书图文分享

- **FR-SHARE-001**：在 Daily Digest 页面提供"一键分享到小红书"按钮，将新闻汇总内容生成小红书风格图文
- **FR-SHARE-002**：LLM 自动将新闻摘要改写为小红书风格文案：
  - 吸引眼球的标题（含 emoji、疑问句/感叹句）
  - 分点提炼重点（每点 1-2 句，配 emoji 标记）
  - 话题标签自动生成（#全球资讯 #科技前沿 #每日必读 等）
  - 互动引导结尾（"你怎么看？评论区聊聊"）
- **FR-SHARE-003**：AI 自动生成小红书封面图：
  - 通义万象 / DALL·E 根据当日头条关键词生成封面
  - 封面叠加标题文字、日期水印、品牌 Logo
  - 支持多种封面模板选择（资讯速递/科技前沿/财经快报等）
- **FR-SHARE-004**：生成多图轮播内容（Slides）：
  - 第 1 张：封面（标题 + 日期 + 主题关键词）
  - 第 2-N 张：每张对应一条重点新闻（标题 + 配图 + 摘要）
  - 最后 1 张：关注引导 + 品牌信息
  - 每张图片自动排版，符合小红书 3:4 / 1:1 比例
- **FR-SHARE-005**：支持对单篇文章生成小红书图文（文章详情页入口）
- **FR-SHARE-006**：生成结果预览 → 用户可编辑文案和调整图片 → 确认后一键复制文案 + 下载图片
- **FR-SHARE-007**：小红书图文历史记录管理（查看/删除/重新生成）

#### 3.8.2 微信朋友圈图文分享

- **FR-SHARE-008**：在 Daily Digest 页面提供"一键分享到朋友圈"按钮
- **FR-SHARE-009**：LLM 自动将新闻摘要改写为朋友圈风格文案：
  - 简洁知性的开头（1-2 句总领当日资讯）
  - 精选 3-5 条核心新闻，每条一句话概括
  - 适度的个人观点/情绪表达（区别于小红书的活泼风格）
  - 结尾可加话题 emoji 或签名
- **FR-SHARE-010**：生成朋友圈配图（最多 9 张）：
  - 图 1：当日新闻要点汇总图（信息图/长图）
  - 图 2-N：各分类重点新闻配图（从原文提取或 AI 生成）
  - 配图自动适配朋友圈 1:1 方形比例
  - 统一视觉风格（科技绿色系 + 品牌水印）
- **FR-SHARE-011**：支持对单篇文章生成朋友圈图文
- **FR-SHARE-012**：生成结果预览 → 文案一键复制到剪贴板 + 图片一键打包下载（ZIP）
- **FR-SHARE-013**：朋友圈图文历史记录管理

#### 3.8.3 通用分享能力

- **FR-SHARE-014**：分享内容支持中/英/日三语版本生成
- **FR-SHARE-015**：分享图片生成队列化处理（后台异步），生成进度实时反馈
- **FR-SHARE-016**：分享模板管理：预设多种风格模板，用户可选择或自定义
- **FR-SHARE-017**：分享频率统计（周报/月报中展示"本周分享 N 次"）

---

### 3.9 通知与推送模块

- **FR-PUSH-001**：浏览器 Web Push 突发新闻推送
- **FR-PUSH-002**：每日 Digest 邮件推送（可配置）
- **FR-PUSH-003**：自定义关键词告警（匹配关键词时即时推送）
- **FR-PUSH-004**：推送免打扰时段设置

---

## 四、MCP 集成架构详细设计

### 4.1 MCP Server 设计

```
WorldOverview MCP Server
├── Transport Layer
│   ├── stdio（本地 IDE / Claude Desktop 集成）
│   └── HTTP Streaming（Web 应用调用）
│
├── Tools（AI Agent 可调用的工具）
│   ├── fetch_feeds          — 拉取指定源最新内容
│   ├── classify_article     — 对文章进行多标签分类
│   ├── summarize_article    — 生成单篇摘要
│   ├── generate_digest      — 生成 Daily Digest
│   ├── search_articles      — 语义搜索历史文章
│   ├── get_trending_topics  — 获取热门话题
│   ├── translate_article    — 文章翻译（中↔英↔日）
│   ├── generate_broadcast   — 生成智能播报音频
│   ├── generate_share       — 生成小红书/朋友圈分享图文
│   └── manage_subscription  — 管理订阅源
│
├── Resources（AI Agent 可读取的上下文）
│   ├── subscription://list         — 当前订阅源列表
│   ├── categories://taxonomy       — 分类体系定义
│   ├── digest://latest             — 最新 Digest
│   └── articles://recent?limit=50  — 最近 50 条文章
│
└── Prompts（预定义的提示模板）
    ├── daily-digest      — Digest 生成提示词
    ├── article-summary   — 文章摘要提示词
    ├── classify          — 分类提示词
    └── trend-analysis    — 趋势分析提示词
```

### 4.2 MCP 调用流程

```
用户/AI Client（Claude / ChatGPT / Cursor）
    │
    ▼
MCP Client 发起 Tool Call
    │
    ▼
WorldOverview MCP Server 接收请求
    │
    ├── fetch_feeds → RSS 采集引擎 → 返回标准化文章
    ├── classify_article → LLM 分类 → 返回分类结果
    ├── generate_digest → 聚合当日新闻 → LLM 生成摘要 → 返回 Digest
    └── search_articles → pgvector 语义检索 → 返回相关文章
```

### 4.3 外部 MCP Client 集成场景

| 场景 | 描述 |
|------|------|
| Claude Desktop | 用户在 Claude 中直接问"今天有什么科技新闻"，Claude 通过 MCP 调用 WorldOverview |
| Cursor IDE | 开发者在 IDE 中查看当日技术动态，不离开编辑器 |
| ChatGPT Plugins | 通过 HTTP Streaming 接入，作为 ChatGPT 的新闻工具 |
| 自动化工作流 | n8n / Zapier 通过 MCP HTTP 端点触发 Digest 生成并推送 |

---

## 五、非功能需求

### 5.1 性能

| 指标 | 要求 |
|------|------|
| **NFR-PERF-001** Feed 抓取 | 200+ 源并行抓取，单轮完成时间 < 5 分钟 |
| **NFR-PERF-002** 页面加载 | 首屏加载 < 2 秒（SSR + 增量 hydration） |
| **NFR-PERF-003** 搜索响应 | 关键词搜索 < 500ms，语义搜索 < 2 秒 |
| **NFR-PERF-004** Digest 生成 | 单次 Daily Digest 生成 < 3 分钟 |
| **NFR-PERF-005** 分类延迟 | 新文章入库到分类完成 < 30 秒 |

### 5.2 可靠性

| 指标 | 要求 |
|------|------|
| **NFR-REL-001** 服务可用性 | 99.5% uptime（月度） |
| **NFR-REL-002** 数据持久性 | 新闻数据保留 90 天，收藏永久保留 |
| **NFR-REL-003** 容错 | 单个 Feed 抓取失败不影响其他源 |
| **NFR-REL-004** 降级 | LLM 服务不可用时回退到规则分类 |

### 5.3 安全

| 指标 | 要求 |
|------|------|
| **NFR-SEC-001** 认证 | JWT + Refresh Token，Token 有效期 7 天 |
| **NFR-SEC-002** 传输 | 全站 HTTPS |
| **NFR-SEC-003** 输入校验 | RSS URL 白名单 + 内容 XSS 过滤 |
| **NFR-SEC-004** API 限流 | 每用户 100 请求/分钟 |

### 5.4 可用性与 UI

| 指标 | 要求 |
|------|------|
| **NFR-UX-001** 深色模式 | 默认深色主题，支持浅色/跟随系统切换 |
| **NFR-UX-002** 配色 | 科技感绿色系（详见 5.5 视觉规范） |
| **NFR-UX-003** 响应式 | 完美适配桌面（1440px）、平板（768px）、手机（375px） |
| **NFR-UX-004** 国际化 | 中/英/日三语 UI 与内容切换 |
| **NFR-UX-005** 无障碍 | WCAG 2.1 AA 级合规 |

### 5.5 视觉风格规范 — 科技感绿色系

#### 5.5.1 设计理念

整体视觉以 **"深空科技感"** 为核心基调，采用深色底色搭配翠绿色系光效，营造信息在暗色宇宙中如数据流般涌动的未来感。设计灵感来源于终端界面（Terminal）、全息投影和太空指挥中心 HUD，传达"全球资讯尽在掌控"的产品气质。

#### 5.5.2 色彩体系

| 色彩角色 | 色值 | 用途 |
|----------|------|------|
| **主背景** | `#0A0F0D` | 页面底色，深邃墨绿黑 |
| **次背景 / 卡片** | `#111A16` | 卡片、面板、侧边栏背景 |
| **悬浮层** | `#162A22` | Hover 状态、弹窗背景 |
| **主强调色** | `#00E676` | 按钮、活跃状态、高亮标签、数据重点（明亮翠绿） |
| **次强调色** | `#69F0AE` | 次要交互、链接 hover、进度条（柔和薄荷绿） |
| **辅助强调** | `#00BFA5` | 图表、徽章、分类标签背景（青绿色） |
| **警告 / 突发** | `#FF5252` | Breaking 新闻标记、错误提示 |
| **信息提示** | `#40C4FF` | 信息类提示、AI 摘要标识 |
| **主文字** | `#E0F2E9` | 正文文字，绿调米白，柔和不刺眼 |
| **次文字** | `#8FA89B` | 时间、来源、辅助信息 |
| **禁用态** | `#3E5248` | 不可用元素、占位符 |
| **边框 / 分割线** | `#1E3A2F` | 卡片边框、列表分割线 |

#### 5.5.3 视觉元素

**光效与氛围**
- 卡片 Hover 时边框呈现 `#00E676` 1px 发光效果（`box-shadow: 0 0 12px rgba(0,230,118,0.15)`）
- 活跃导航项带左侧 `#00E676` 2px 发光指示条
- 页面顶部可选加入微弱的绿色渐变光晕（`radial-gradient`），增强科技氛围
- 关键数据数字使用等宽字体（JetBrains Mono / Fira Code），模拟终端读数感

**图标与插画**
- 图标采用线性（outline）风格，默认 `#8FA89B` 色，交互时变 `#00E676`
- 分类图标可使用单色微发光效果
- 空状态插画使用绿色系线条 + 深色背景几何图形

**字体**
- 中文正文：思源黑体（Noto Sans SC）/ 苹方
- 英文正文：Inter / SF Pro
- 数据 / 代码：JetBrains Mono
- 标题字重 600-700，正文字重 400

**动效**
- 页面切换：淡入淡出（`fade`，200ms ease-out）
- 卡片加载：从下方微滑入（`translateY(8px) → 0`，300ms）
- 数据刷新：数字跳动动画（counter animation）
- 新闻推送：卡片左侧绿色光条闪烁一次标记新内容
- 播报播放时：声波波纹动画（`#00E676` 同心圆扩散）

#### 5.5.4 深色 / 浅色模式对照

| 元素 | 深色模式（默认） | 浅色模式 |
|------|------------------|----------|
| 页面背景 | `#0A0F0D` | `#F5FAF7`（薄荷白） |
| 卡片背景 | `#111A16` | `#FFFFFF` |
| 主强调色 | `#00E676` | `#00C853`（略深以保证对比度） |
| 主文字 | `#E0F2E9` | `#1A2E23` |
| 次文字 | `#8FA89B` | `#5F7A6B` |
| 边框 | `#1E3A2F` | `#D4E8DC` |

---

## 六、数据模型

### 6.1 核心表结构

#### users

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | 用户 ID |
| email | VARCHAR(255) UNIQUE | 邮箱 |
| password_hash | VARCHAR(255) | 加密密码 |
| display_name | VARCHAR(100) | 显示名称 |
| avatar_url | TEXT | 头像 |
| preferences | JSONB | 用户偏好配置 |
| created_at | TIMESTAMPTZ | 注册时间 |
| last_login_at | TIMESTAMPTZ | 最后登录 |

#### feeds（订阅源）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | 源 ID |
| title | VARCHAR(500) | 源名称 |
| url | TEXT UNIQUE | Feed URL |
| site_url | TEXT | 网站 URL |
| description | TEXT | 描述 |
| language | VARCHAR(10) | 语言 |
| category | VARCHAR(50) | 预设分类 |
| favicon_url | TEXT | 图标 |
| last_fetched_at | TIMESTAMPTZ | 最后抓取时间 |
| fetch_interval | INTEGER | 抓取间隔（分钟） |
| etag | VARCHAR(255) | HTTP ETag |
| status | VARCHAR(20) | 状态（active/error/paused） |
| error_count | INTEGER | 连续失败次数 |

#### articles（文章）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | 文章 ID |
| feed_id | UUID FK | 所属源 |
| title | TEXT | 标题 |
| url | TEXT | 原文链接 |
| author | VARCHAR(255) | 作者 |
| content | TEXT | 正文内容 |
| summary | TEXT | 原始摘要 |
| ai_summary | TEXT | AI 生成摘要 |
| ai_key_points | JSONB | AI 提取要点 |
| ai_summary_en | TEXT | AI 英文摘要 |
| ai_summary_ja | TEXT | AI 日文摘要 |
| ai_key_points_en | JSONB | AI 英文要点 |
| ai_key_points_ja | JSONB | AI 日文要点 |
| translation_zh | JSONB | 中英对照翻译缓存：`[{original, translated}]` |
| cover_image | TEXT | 封面图 |
| published_at | TIMESTAMPTZ | 发布时间 |
| categories | JSONB | AI 分类结果 |
| importance | VARCHAR(20) | 重要性等级 |
| sentiment | VARCHAR(20) | 情感倾向 |
| region | VARCHAR(50) | 所属地区 |
| keywords | TEXT[] | 关键词数组 |
| embedding | vector(1536) | 语义向量 |
| is_duplicate | BOOLEAN | 是否重复 |
| duplicate_of | UUID FK | 重复原文 ID |
| created_at | TIMESTAMPTZ | 入库时间 |

#### user_subscriptions（用户订阅）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | 订阅 ID |
| user_id | UUID FK | 用户 |
| feed_id | UUID FK | 订阅源 |
| custom_label | VARCHAR(100) | 自定义标签 |
| group_name | VARCHAR(100) | 分组名 |
| created_at | TIMESTAMPTZ | 订阅时间 |

#### user_article_states（用户文章状态）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | 状态 ID |
| user_id | UUID FK | 用户 |
| article_id | UUID FK | 文章 |
| is_read | BOOLEAN | 是否已读 |
| is_starred | BOOLEAN | 是否收藏 |
| is_saved | BOOLEAN | 稍后阅读 |
| read_at | TIMESTAMPTZ | 阅读时间 |
| folder | VARCHAR(100) | 收藏夹文件夹 |

#### daily_digests（每日摘要）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | 摘要 ID |
| user_id | UUID FK | 用户（NULL 为公共版） |
| digest_date | DATE | 摘要日期 |
| language | VARCHAR(10) | 语言版本（zh / en / ja） |
| headlines | JSONB | 头条新闻列表 |
| category_summaries | JSONB | 分类速览 |
| statistics | JSONB | 今日数据统计 |
| trending_keywords | TEXT[] | 热门关键词 |
| full_content | TEXT | 完整 Markdown 内容 |
| created_at | TIMESTAMPTZ | 生成时间 |

#### social_shares（社交分享记录）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | 分享 ID |
| user_id | UUID FK | 用户 |
| digest_id | UUID FK | 关联 Digest（可为 NULL） |
| article_id | UUID FK | 关联单篇文章（可为 NULL） |
| platform | VARCHAR(20) | 平台（xiaohongshu / wechat_moments） |
| title | TEXT | 生成的标题 |
| content | TEXT | 生成的文案 |
| cover_url | TEXT | 封面图 URL |
| images | JSONB | 图片列表：`[{url, width, height, order}]` |
| slides | JSONB | 轮播图内容：`[{title, text, image_url}]` |
| template_id | VARCHAR(50) | 使用的模板 ID |
| language | VARCHAR(10) | 语言版本（zh / en / ja） |
| image_status | VARCHAR(20) | 图片生成状态（pending/generating/ready/error） |
| created_at | TIMESTAMPTZ | 创建时间 |

#### broadcasts（智能播报）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | 播报 ID |
| user_id | UUID FK | 用户（NULL 为公共版） |
| digest_id | UUID FK | 关联的 Digest |
| broadcast_date | DATE | 播报日期 |
| period | VARCHAR(10) | 时段（morning/noon/evening） |
| language | VARCHAR(10) | 语言版本 |
| script | TEXT | LLM 生成的播报稿（口语化） |
| segments | JSONB | 分段信息：`[{title, text, audio_url, duration_ms}]` |
| total_duration_ms | INTEGER | 总时长（毫秒） |
| voice_id | VARCHAR(50) | 使用的音色 ID |
| status | VARCHAR(20) | 状态（generating/ready/error） |
| created_at | TIMESTAMPTZ | 生成时间 |

---

## 七、API 接口设计

### 7.1 认证

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/register` | 邮箱注册 |
| POST | `/api/auth/login` | 邮箱登录 |
| POST | `/api/auth/oauth/:provider` | 第三方登录 |
| POST | `/api/auth/refresh` | 刷新 Token |
| GET | `/api/auth/me` | 当前用户信息 |

### 7.2 订阅源管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/feeds` | 获取可用源列表 |
| POST | `/api/feeds` | 添加自定义源 |
| DELETE | `/api/feeds/:id` | 删除源 |
| GET | `/api/feeds/:id/status` | 源健康状态 |
| POST | `/api/subscriptions` | 订阅一个源 |
| DELETE | `/api/subscriptions/:id` | 取消订阅 |
| GET | `/api/subscriptions` | 我的订阅列表 |
| POST | `/api/subscriptions/import` | OPML 导入 |
| GET | `/api/subscriptions/export` | OPML 导出 |

### 7.3 文章

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/articles` | 文章信息流（支持分页/筛选/排序） |
| GET | `/api/articles/:id` | 文章详情 |
| POST | `/api/articles/:id/summarize` | AI 生成单篇摘要（query: `?lang=zh\|en\|ja`） |
| POST | `/api/articles/:id/translate` | 生成中英对照翻译（逐段对照） |
| GET | `/api/articles/:id/translation` | 获取已缓存的对照翻译结果 |
| POST | `/api/articles/:id/read` | 标记已读 |
| POST | `/api/articles/:id/star` | 收藏/取消收藏 |
| POST | `/api/articles/:id/save` | 稍后阅读 |
| GET | `/api/articles/search` | 关键词搜索 |
| GET | `/api/articles/semantic-search` | AI 语义搜索 |

### 7.4 Daily Digest

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/digests` | 历史 Digest 列表 |
| GET | `/api/digests/latest` | 最新 Digest（query: `?lang=zh\|en\|ja`） |
| GET | `/api/digests/:date` | 指定日期 Digest（query: `?lang=zh\|en\|ja`） |
| POST | `/api/digests/generate` | 手动触发生成 |
| GET | `/api/digests/:id/export` | 导出为 PDF/Markdown |

### 7.5 趋势与分析

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/trending` | 热门话题 |
| GET | `/api/trending/:topic/timeline` | 话题时间线 |
| GET | `/api/analytics/sentiment` | 情感趋势 |
| GET | `/api/analytics/category-distribution` | 分类分布统计 |

### 7.6 社交分享

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/share/xiaohongshu/digest/:id` | 基于 Digest 生成小红书图文 |
| POST | `/api/share/xiaohongshu/article/:id` | 基于单篇文章生成小红书图文 |
| POST | `/api/share/moments/digest/:id` | 基于 Digest 生成朋友圈图文 |
| POST | `/api/share/moments/article/:id` | 基于单篇文章生成朋友圈图文 |
| GET | `/api/share/:id` | 获取分享详情（含文案 + 图片） |
| GET | `/api/share/list` | 分享历史列表（支持 platform 筛选） |
| DELETE | `/api/share/:id` | 删除分享记录 |
| POST | `/api/share/:id/regenerate` | 重新生成分享内容 |
| GET | `/api/share/:id/download` | 打包下载图片（ZIP） |
| GET | `/api/share/templates` | 获取可用分享模板列表 |

### 7.7 智能播报

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/broadcast/generate` | 生成播报音频（基于 Digest 或自定义文章列表） |
| GET | `/api/broadcast/latest` | 获取最新一期播报 |
| GET | `/api/broadcast/:id` | 获取指定播报详情 |
| GET | `/api/broadcast/:id/audio/:segment` | 获取播报分段音频文件 |
| GET | `/api/broadcast/list` | 历史播报列表 |
| POST | `/api/broadcast/article/:id` | 单篇文章一键朗读 |
| GET | `/api/tts/voices` | 可用音色列表 |

### 7.8 MCP 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/mcp/sse` | MCP HTTP Streaming 端点 |
| GET | `/mcp/health` | MCP Server 健康检查 |

### 7.9 用户设置

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/settings` | 获取用户设置 |
| PUT | `/api/settings` | 更新用户设置 |
| GET | `/api/history` | 阅读历史 |
| GET | `/api/starred` | 收藏列表 |
| GET | `/api/saved` | 稍后阅读列表 |

---

## 八、页面路由

| 路由 | 页面 | 说明 |
|------|------|------|
| `/` | Home | 首页 — 智能信息流 |
| `/login` | Login | 登录 |
| `/register` | Register | 注册 |
| `/category/:name` | Category | 分类新闻列表 |
| `/article/:id` | ArticleDetail | 文章详情阅读 |
| `/digest` | DigestList | Daily Digest 列表 |
| `/digest/:date` | DigestDetail | Digest 详情 |
| `/broadcast` | BroadcastList | 智能播报列表 |
| `/broadcast/:id` | BroadcastPlayer | 播报播放页 |
| `/search` | Search | 搜索结果页 |
| `/trending` | Trending | 热门趋势 |
| `/subscriptions` | Subscriptions | 订阅源管理 |
| `/share` | ShareHistory | 分享历史管理 |
| `/share/:id/preview` | SharePreview | 分享预览与编辑 |
| `/starred` | Starred | 收藏夹 |
| `/saved` | SavedForLater | 稍后阅读 |
| `/settings` | Settings | 个人设置 |

---

## 九、核心业务流程

### 9.1 新闻采集与入库流程

```
定时触发（每 30 分钟）
    ↓
并行抓取 200+ RSS 源（检查 ETag/Last-Modified）
    ↓
Feed 解析 & 内容标准化（编码/HTML清洗/图片代理）
    ↓
URL 规范化去重（过滤已存在文章）
    ↓
语义去重（embedding 相似度 > 0.85 标记为重复）
    ↓
AI 分类（主题 + 地区 + 重要性 + 情感）
    ↓
生成 embedding 向量存入 pgvector
    ↓
入库 PostgreSQL → 触发 WebSocket 实时推送
```

### 9.2 Daily Digest 生成流程

```
定时触发（早 8:00 / 晚 20:00）
    ↓
查询过去 12 小时内的非重复文章
    ↓
按重要性加权排序 → 选出 Top N 文章
    ↓
按分类聚合分组
    ↓
LLM 生成摘要：
  - 头条概述（Top 3 Breaking/Important 新闻）
  - 分类速览（每类 3-5 条一句话摘要）
  - 关键词提取 & 数据统计
    ↓
存入 daily_digests 表
    ↓
触发邮件/Web Push 推送
```

### 9.3 智能播报生成流程

```
Daily Digest 生成完成（或用户手动触发）
    ↓
LLM 将书面摘要改写为口语化播报稿
    ↓
按新闻条目分段，每段生成独立播报文本
    ↓
TTS 引擎（CosyVoice）逐段合成音频（2 并发）
    ↓
音频分段缓存至 /data/broadcast/{id}/
    ↓
更新 broadcasts 表（segments、status → ready）
    ↓
前端播放器加载分段音频 → 流式播放 + 文字同步高亮
```

### 9.4 社交分享生成流程

```
用户点击"一键分享到小红书/朋友圈"
    ↓
选择平台 & 语言 & 模板风格
    ↓
LLM 将 Digest/文章摘要改写为平台风格文案
  - 小红书：活泼、emoji、话题标签、互动引导
  - 朋友圈：简洁知性、精选要点、轻观点
    ↓
AI 图像生成引擎生成封面/配图（后台异步）
  - 小红书：封面 + 多张轮播 Slides（3:4 / 1:1）
  - 朋友圈：汇总信息图 + 分类配图（1:1，最多 9 张）
    ↓
统一叠加品牌水印 + 科技绿色系视觉风格
    ↓
存入 social_shares 表（image_status 跟踪进度）
    ↓
用户预览 → 编辑文案 → 一键复制文案 + 下载图片
```

### 9.5 MCP 调用流程

```
外部 AI Client（Claude / ChatGPT / Cursor）
    ↓
发起 MCP Tool Call（如 get_daily_digest）
    ↓
WorldOverview MCP Server 鉴权 & 解析请求
    ↓
调用内部服务（数据库查询 / LLM 生成）
    ↓
返回结构化结果（JSON / MCP Apps UI）
    ↓
AI Client 整合回答展示给用户
```

---

## 十、预置全球 RSS 源清单

### 10.1 国际综合新闻

| 源名称 | Feed URL | 语言 |
|--------|----------|------|
| BBC World News | `http://feeds.bbci.co.uk/news/world/rss.xml` | EN |
| CNN International | `http://rss.cnn.com/rss/edition.rss` | EN |
| Al Jazeera | `https://www.aljazeera.com/xml/rss/all.xml` | EN |
| Reuters | `https://www.reutersagency.com/feed/` | EN |
| AP News | `https://apnews.com/index.rss` | EN |
| France 24 | `https://www.france24.com/en/rss` | EN |
| NBC News | `http://feeds.nbcnews.com/nbcnews/public/news` | EN |
| The Guardian | `https://www.theguardian.com/world/rss` | EN |
| ABC News | `https://abcnews.go.com/abcnews/internationalheadlines` | EN |

### 10.2 中文新闻

| 源名称 | Feed URL | 语言 |
|--------|----------|------|
| 联合早报 | `https://www.zaobao.com/rss` | ZH |
| 澎湃新闻 | RSSHub: `/thepaper/newsDetail` | ZH |
| 新华网 | `http://news.xinhuanet.com/rss/news.xml` | ZH |
| 凤凰网 | `https://www.ifeng.com/rss/news.xml` | ZH |
| 36氪 | RSSHub: `/36kr/news/latest` | ZH |

### 10.3 科技

| 源名称 | Feed URL | 语言 |
|--------|----------|------|
| TechCrunch | `https://techcrunch.com/feed/` | EN |
| The Verge | `https://www.theverge.com/rss/index.xml` | EN |
| Ars Technica | `https://feeds.arstechnica.com/arstechnica/index` | EN |
| Hacker News | `https://hnrss.org/frontpage` | EN |
| MIT Tech Review | `https://www.technologyreview.com/feed/` | EN |
| 少数派 | `https://sspai.com/feed` | ZH |
| InfoQ | `https://www.infoq.com/feed/` | EN |

### 10.4 财经

| 源名称 | Feed URL | 语言 |
|--------|----------|------|
| Bloomberg | `https://www.bloomberg.com/feed/` | EN |
| Financial Times | `https://www.ft.com/?format=rss` | EN |
| 财新 | RSSHub: `/caixin/latest` | ZH |
| WSJ | `https://feeds.a.dj.com/rss/RSSWorldNews.xml` | EN |

### 10.5 AI / 开发者

| 源名称 | Feed URL | 语言 |
|--------|----------|------|
| OpenAI Blog | `https://openai.com/blog/rss.xml` | EN |
| Google AI Blog | `https://blog.google/technology/ai/rss/` | EN |
| GitHub Blog | `https://github.blog/feed/` | EN |
| Dev.to | `https://dev.to/feed/` | EN |
| 掘金 | RSSHub: `/juejin/trending/all/daily` | ZH |

---

## 十一、部署架构

```
                    CDN（静态资源加速）
                         │
                    Nginx / Caddy
                    ├── / → Next.js SSR
                    └── /api → Next.js API Routes
                              │
            ┌─────────────────┼──────────────────┐
            │                 │                  │
     PostgreSQL + pgvector   Redis          RSSHub
     (主存储 + 向量索引)    (缓存+队列)    (Feed 生成)
                              │
                        BullMQ Workers
                    ├── Feed 抓取 Worker
                    ├── AI 分类 Worker
                    ├── Digest 生成 Worker
                    └── 推送 Worker
                              │
                    阿里云 DashScope / OpenAI API
```

### 容器化部署（Docker Compose）

| 服务 | 端口 | 说明 |
|------|------|------|
| next-app | 3000 | Next.js 应用（前端 + API） |
| postgres | 5432 | 数据库 |
| redis | 6379 | 缓存与消息队列 |
| rsshub | 1200 | 自托管 RSSHub 实例 |
| mcp-server | 8080 | MCP HTTP Streaming 端口 |
| worker | — | BullMQ 后台任务处理 |

---

## 十二、第三方依赖

### 前端 / 全栈

| 依赖 | 用途 |
|------|------|
| next | 全栈框架 |
| react / react-dom | UI 库 |
| tailwindcss | 样式框架 |
| @shadcn/ui | 组件库 |
| next-auth | 认证 |
| swr / tanstack-query | 数据请求 |
| zustand | 全局状态管理 |
| date-fns | 日期处理 |
| lucide-react | 图标库 |
| next-themes | 主题切换 |
| react-markdown | Markdown 渲染 |

### 后端

| 依赖 | 用途 |
|------|------|
| rss-parser | RSS/Atom 解析 |
| @modelcontextprotocol/sdk | MCP 协议实现 |
| openai / dashscope SDK | LLM 调用 |
| pg / drizzle-orm | PostgreSQL ORM |
| pgvector | 向量存储 |
| bullmq | 任务队列 |
| node-cron | 定时调度 |
| ioredis | Redis 客户端 |
| @mozilla/readability | 全文提取 |
| web-push | 浏览器推送 |
| nodemailer | 邮件发送 |
| bcryptjs | 密码加密 |
| jsonwebtoken | JWT |
| dashscope TTS SDK | CosyVoice 语音合成 |
| edge-tts | 备选 TTS 引擎（微软） |
| fluent-ffmpeg | 音频拼接与格式转换 |
| sharp | 图片处理（裁剪/水印/拼接） |
| archiver | ZIP 打包下载 |
| dashscope 图像 SDK | 通义万象封面图生成 |

---

## 十三、项目里程碑

| 阶段 | 周期 | 交付内容 |
|------|------|----------|
| **M1 — 基础框架** | 第 1-2 周 | 项目脚手架、数据库设计、用户认证、基础 UI 框架 |
| **M2 — RSS 引擎** | 第 3-4 周 | Feed 管理、抓取引擎、去重、OPML 导入导出 |
| **M3 — AI 分类** | 第 5-6 周 | MCP Server、AI 自动分类、语义搜索 |
| **M4 — 阅读体验** | 第 7-8 周 | 信息流、文章详情、搜索、收藏/稍后阅读 |
| **M5 — Daily Digest** | 第 9-10 周 | LLM 摘要生成、Digest 页面、历史归档、导出 |
| **M6 — 智能播报** | 第 11-12 周 | 播报稿生成、TTS 合成、播放器 UI、播报缓存 |
| **M7 — 社交分享** | 第 13-14 周 | 小红书/朋友圈图文生成、封面图 AI 生成、模板系统、预览编辑 |
| **M8 — 推送与优化** | 第 15-16 周 | 通知推送、个性化推荐、性能优化、部署上线 |

---

## 十四、已知风险与应对

| 风险 | 影响 | 应对措施 |
|------|------|----------|
| LLM API 调用成本高 | 财务压力 | 两级策略：轻量模型预处理 + LLM 精处理；缓存摘要结果 |
| RSS 源不稳定 | 内容缺失 | 多源冗余覆盖 + 故障自动切换 + 健康监控告警 |
| 分类准确率不足 | 用户体验 | 用户反馈机制 + 分类模型持续迭代 |
| 新闻版权问题 | 法律风险 | 仅展示摘要 + 跳转原文；遵守 robots.txt |
| 数据量增长快 | 存储成本 | 90 天自动归档 + 冷热数据分层 |
