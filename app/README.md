# PolaNews - 全球资讯 AI 聚合阅读平台

PolaNews（一念三千）是一个基于 AI 驱动的全球新闻 RSS 聚合阅读平台，支持多语言翻译、智能摘要、每日播报等功能。

## 功能特性

- **RSS 聚合**：内置 38+ 全球优质新闻源（BBC、CNN、TechCrunch、Hacker News 等），支持自定义添加、OPML 导入/导出
- **AI 智能摘要**：基于 LLM 对文章进行自动摘要，支持中/英/日三语
- **多语言翻译**：文章标题/摘要自动翻译，全文中英对照阅读
- **AI 自动分类**：自动识别文章话题、地区、重要性、情感倾向
- **每日 Digest**：AI 生成每日新闻摘要，定时推送（08:00 / 20:00）
- **新闻播报**：AI 生成口语化播报脚本
- **社交分享**：一键生成小红书/朋友圈风格文案
- **个人管理**：收藏、稍后阅读、阅读历史、订阅管理
- **用户系统**：注册登录、JWT 认证、个性化偏好设置

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Next.js 16, React 19, TypeScript, Tailwind CSS |
| 后端 | Next.js API Routes (App Router) |
| 数据库 | SQLite (better-sqlite3, WAL mode) |
| 认证 | bcryptjs + JWT |
| RSS | rss-parser |
| AI | OpenAI 兼容 API (gpt-4o-mini) |
| 定时任务 | node-cron |
| 部署 | Docker (standalone output) |

## 快速开始

### 环境要求

- Node.js >= 18
- npm >= 9

### 安装

```bash
git clone https://github.com/PolarisW007/PolaNews.git
cd PolaNews
npm install
```

### 配置

创建 `.env.local` 文件：

```env
# LLM API 配置（可选，不配置则使用 Mock 模式）
LLM_API_KEY=your-api-key
LLM_API_BASE=https://api.openai.com/v1
LLM_MODEL=gpt-4o-mini

# JWT 密钥（生产环境请修改）
JWT_SECRET=your-secret-key
```

### 运行

```bash
# 开发模式
npm run dev

# 构建生产版本
npm run build
npm start
```

访问 http://localhost:3000

### Docker 部署

```bash
docker build -t polanews .
docker run -p 3000:3000 -v $(pwd)/data:/app/data polanews
```

## 项目结构

```
src/
├── app/                    # Next.js App Router
│   ├── api/               # REST API 路由
│   │   ├── auth/          # 认证（登录/注册）
│   │   ├── articles/      # 文章 CRUD / 搜索 / AI 摘要 / 翻译
│   │   ├── feeds/         # RSS 源管理
│   │   ├── subscriptions/ # 用户订阅（含 OPML 导入/导出）
│   │   ├── digests/       # 每日摘要
│   │   ├── broadcast/     # 新闻播报
│   │   ├── share/         # 社交分享
│   │   └── ...
│   ├── article/[id]/      # 文章详情页
│   ├── digest/            # 摘要页
│   ├── broadcast/         # 播报页
│   └── ...                # 其他页面
├── components/
│   ├── layout/            # 布局组件
│   └── ui/                # UI 组件（Toast 等）
├── lib/
│   ├── ai/llm.ts          # LLM 调用封装
│   ├── db/schema.ts       # 数据库 Schema
│   ├── db/helpers.ts      # 查询辅助函数
│   ├── rss/engine.ts      # RSS 抓取引擎
│   ├── rss/scheduler.ts   # 定时任务
│   ├── rss/presets.ts     # 预置 RSS 源
│   ├── services/digest.ts # Digest 生成服务
│   ├── auth.ts            # 认证工具
│   ├── api-client.ts      # 前端 API 客户端
│   └── types.ts           # TypeScript 类型定义
└── instrumentation.ts     # Next.js Instrumentation（启动定时任务）
```

## License

MIT
