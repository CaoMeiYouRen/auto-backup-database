# auto-backup-database

# [1.1.0](https://github.com/CaoMeiYouRen/auto-backup-database/compare/v1.0.0...v1.1.0) (2026-02-24)


### ✨ 新功能

* 优化备份服务的加密逻辑，增强错误处理和日志记录 ([d3bde9d](https://github.com/CaoMeiYouRen/auto-backup-database/commit/d3bde9d))
* 添加文件工具以获取 MIME 类型并在 OSS 存储中使用 ([30e579e](https://github.com/CaoMeiYouRen/auto-backup-database/commit/30e579e))


### 📦 代码重构

* 优化备份服务，移除不必要的动态导入 ([0aa8303](https://github.com/CaoMeiYouRen/auto-backup-database/commit/0aa8303))
* 优化配置加载器和压缩功能，简化文件路径处理 ([a70b6e3](https://github.com/CaoMeiYouRen/auto-backup-database/commit/a70b6e3))

# 1.0.0 (2026-02-24)


### ✨ 新功能

* 实现备份服务和调度服务，支持定时任务和手动触发备份 ([501df10](https://github.com/CaoMeiYouRen/auto-backup-database/commit/501df10))
* 实现数据库备份功能，支持 SQLite 提供者及文件压缩和加密 ([e4b9dac](https://github.com/CaoMeiYouRen/auto-backup-database/commit/e4b9dac))
* 实现本地存储管理和 OSS 存储模块，支持备份文件的上传和清理 ([8a0ea5a](https://github.com/CaoMeiYouRen/auto-backup-database/commit/8a0ea5a))
* 新增配置加载器，支持从 config.yml 和 .env 加载配置 ([75b89e7](https://github.com/CaoMeiYouRen/auto-backup-database/commit/75b89e7))
* 添加 Docker 工作流以支持自动构建和发布 Docker 镜像 ([467dbce](https://github.com/CaoMeiYouRen/auto-backup-database/commit/467dbce))
* 添加 Dockerfile 和 docker-compose.yml 支持容器化部署 ([0ca0259](https://github.com/CaoMeiYouRen/auto-backup-database/commit/0ca0259))
* 添加通知配置支持，启用 Dingtalk 推送功能 ([663103f](https://github.com/CaoMeiYouRen/auto-backup-database/commit/663103f))


### 🐛 Bug 修复

* 优化 minify-docker.mjs 中的代码格式和逻辑结构 ([dcf67fb](https://github.com/CaoMeiYouRen/auto-backup-database/commit/dcf67fb))
* 修正 dependabot.yml 中时间格式，统一为字符串格式；更新 package.json 中数据库名称 ([0041de4](https://github.com/CaoMeiYouRen/auto-backup-database/commit/0041de4))
* 更新 package.json 和 tsdown.config.ts，调整输出格式和入口配置 ([79f21f3](https://github.com/CaoMeiYouRen/auto-backup-database/commit/79f21f3))
