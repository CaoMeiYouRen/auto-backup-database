# auto-backup-database

# [1.3.0](https://github.com/CaoMeiYouRen/auto-backup-database/compare/v1.2.2...v1.3.0) (2026-03-14)


### ✨ 新功能

* **backup:** 支持多个备份产物路径的处理与上传 ([fa98ecf](https://github.com/CaoMeiYouRen/auto-backup-database/commit/fa98ecf))
* **database:** 添加 MongoDB 数据库提供者 ([267f051](https://github.com/CaoMeiYouRen/auto-backup-database/commit/267f051))
* **docs:** 添加 MongoDB 支持的相关文档和配置示例 ([267992d](https://github.com/CaoMeiYouRen/auto-backup-database/commit/267992d))


### 🐛 Bug 修复

* **mongodb:** 优化备份参数构建与错误处理 ([3ca6d22](https://github.com/CaoMeiYouRen/auto-backup-database/commit/3ca6d22))

## [1.2.2](https://github.com/CaoMeiYouRen/auto-backup-database/compare/v1.2.1...v1.2.2) (2026-02-27)


### 🐛 Bug 修复

* 注释掉强制使用 path-style 访问的配置 ([125c9f3](https://github.com/CaoMeiYouRen/auto-backup-database/commit/125c9f3))

## [1.2.1](https://github.com/CaoMeiYouRen/auto-backup-database/compare/v1.2.0...v1.2.1) (2026-02-26)


### 🐛 Bug 修复

* 在备份任务结果中添加压缩原始大小和压缩后大小信息 ([f20cc50](https://github.com/CaoMeiYouRen/auto-backup-database/commit/f20cc50))


### 📦 代码重构

* 优化通知服务中的错误处理和压缩结果输出 ([2697e47](https://github.com/CaoMeiYouRen/auto-backup-database/commit/2697e47))

# [1.2.0](https://github.com/CaoMeiYouRen/auto-backup-database/compare/v1.1.1...v1.2.0) (2026-02-25)


### ✨ 新功能

* 引入 BackupTaskResult 类型并优化通知服务的备份结果处理 ([1d891f4](https://github.com/CaoMeiYouRen/auto-backup-database/commit/1d891f4))

## [1.1.1](https://github.com/CaoMeiYouRen/auto-backup-database/compare/v1.1.0...v1.1.1) (2026-02-24)


### 🐛 Bug 修复

* 支持通过环境变量配置备份输出路径和配置文件路径 ([3672969](https://github.com/CaoMeiYouRen/auto-backup-database/commit/3672969))

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
