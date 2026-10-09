<h1 align="center">InterviewManager · 面试记录管理器</h1>

<p align="center">
  <a href="https://github.com/jovanzhang6/interview-manager/actions/workflows/ci.yml"><img src="https://github.com/jovanzhang6/interview-manager/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-1c1917.svg" alt="License: MIT" /></a>
  <img src="https://img.shields.io/badge/node%20%3E%3D-22.13-339933" alt="Node" />
  <img src="https://img.shields.io/badge/Vue-3-42b883" alt="Vue 3" />
  <img src="https://img.shields.io/badge/TypeScript-5.7-3178c6" alt="TypeScript" />
</p>

<p align="center"><strong>轻量级求职面试进度追踪工具 —— 多公司、多岗位，一张时间线看清每一步</strong></p>

<p align="center">
  一台 1 核 1G 的服务器、或一台装有 Node.js 的电脑即可运行。<br />
  数据 100% 归你所有：SQLite 单文件存储，备份就是复制一个文件。
</p>

<p align="center">
  <img src="assets/demo.gif" alt="操作演示" width="100%" />
</p>

<p align="center">
  <a href="https://github.com/jovanzhang6/interview-manager/releases/latest"><strong>▶ 高清版演示视频（MP4）</strong></a>
</p>

## ✨ 功能特性

- **白天／夜间模式** — 首页和页面顶栏一键切换，全站配色同步，刷新后保留选择
- **自定义阶段时间线** — 新增面试时默认使用原有十阶段流程，可添加、删除、修改阶段，并通过拖动或上下移动按钮调整顺序；每个岗位独立配置。新增与编辑使用同一流程编辑窗口，类别以不同底色区分。所有阶段都可自由编辑，包括已通过、已跳过、未通过和已拒绝的阶段；未删除阶段保留已有结果，未完成阶段按新顺序接续。点击当前阶段即可标记通过 / 未通过 / 拒绝 / 跳过，流程自动流转
- **阶段类别与进度** — 流程编辑时可指定投递、面试、录用或其他类别，统计按类别识别，进度按完成比例排序；名称可自由修改，首阶段为投递时自动通过
- **公司聚合视图** — 同公司多部门、多岗位归并为一张卡片，进度独立互不干扰
- **求职统计看板** — 投递总数、进行中、Offer、已挂、已拒、面试转化率
- **访问追踪** — 为公司保存投递记录页面链接，一次点击打开页面并把全公司岗位标记为已访问；访问新鲜度四档提醒（绿 / 黄 / 橙 / 红），不再错过跟进时机
- **智能排序** — 按进度 / 最近访问 / 投递时间 / 公司名排序；已挂流程自动沉底不再刷屏，重点公司一键置顶
- **搜索过滤** — 按公司名或职位名即时过滤
- **多用户** — 注册登录（JWT 认证）、数据按用户隔离、内置管理员后台
- **数据自主** — JSON 导入导出，标准格式无锁定

## 🚀 快速开始

二选一：个人使用推荐**本地部署**，多人多设备使用**服务器部署**。

### 方式一：本地部署（Node.js）

前置要求：[Node.js](https://nodejs.org/) ≥ 22.13

```bash
git clone https://github.com/jovanzhang6/interview-manager.git
cd interview-manager
corepack enable && pnpm install
pnpm build && pnpm start
```

访问 **http://localhost:3001**，注册账号即可使用。

### 方式二：服务器部署（Docker Compose）

前置要求：服务器安装 Docker（1 核 1G 足够）

```bash
git clone https://github.com/jovanzhang6/interview-manager.git
cd interview-manager

# 生成配置（JWT_SECRET 缺失时容器会拒绝启动）
cat > .env << EOF
JWT_SECRET=$(openssl rand -hex 32)
HTTP_PORT=80
EOF

docker compose up -d --build
```

访问 `http://服务器IP`。首次启动自动创建管理员 **admin / admin123**，请立即修改密码。

## 💾 数据与备份

| 部署方式 | 数据位置 | 备份方式 |
|---------|---------|---------|
| 本地部署 | `data/` 目录（SQLite 单文件） | 复制目录即可 |
| Docker 部署 | volume `web_app-data` | 见下方命令 |

```bash
# Docker 部署的数据备份
docker run --rm -v web_app-data:/data -v $(pwd):/backup alpine tar czf /backup/app-data-backup.tar.gz -C /data .
```

- 更新版本：`git pull && docker compose up -d --build`，数据不受影响
- 旧版 Windows 桌面版用户：在桌面版导出 JSON，登录后使用「导入」即可迁移，格式直接兼容

## 🛠 技术栈与结构

Vue 3 · TypeScript · Vite · Express · better-sqlite3 · Docker

```
server/             # Express 后端（认证 / 面试记录 / 管理员接口）
src/                # Vue3 前端（视图 / 组件 / 分组排序逻辑）
tests/              # 测试（后端接口集成 + 前端排序分组单测）
Dockerfile          # 多阶段构建（产物自检、非 root 运行、自动修数据卷属主）
docker-compose.yml  # 服务器部署编排（app + nginx 反代）
```

## 🧪 测试

```bash
pnpm test
```

包含两类测试：后端 HTTP 接口集成测试（认证、数据隔离、阶段流转、导入导出等真实 HTTP 请求），前端公司分组与排序纯函数单测。提交代码前请确保全部通过。

## 🤝 参与贡献

欢迎任何形式的贡献！请阅读 [CONTRIBUTING.md](CONTRIBUTING.md) 了解提交规范，通过 [Issue](https://github.com/jovanzhang6/interview-manager/issues) 报告问题或提出建议。

## 📄 License

[MIT](LICENSE)
