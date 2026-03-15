# 项目待办事项 (TODO)

## 阶段 1: 基础建设
- [x] 初始化项目结构与 `docs/` 文档
- [x] 配置 `package.json` 中的关键依赖与构建脚本
- [x] 定义核心配置接口 (`src/types/config.ts`)
- [x] 实现配置加载逻辑 (YAML 解析与 `.env` 加载)

## 阶段 2: 数据库备份核心
- [x] 定义 `DatabaseProvider` 抽象接口
- [x] 实现 `SQLiteProvider` (支持 Glob 匹配)
- [x] 实现备份文件的压缩功能 (`tar.gz`)
- [x] 实现备份文件的加密功能 (可选密码保护)

## 阶段 3: 存储与生命周期管理
- [x] 实现本地存储管理（使用 `better-bytes` 处理 `maxSize`，按日期和大小清理旧备份）
- [x] 实现 OSS 上传模块 (基于 `@aws-sdk/client-s3` 实现，兼容 S3 协议)
- [x] 实现远程存储生命周期管理
- [x] 确保 OSS 文件上传权限设为 `private`
- [x] 集成 `push-all-in-one` 实现备份状态通知

## 阶段 4: 调度与 CLI
- [x] 创建 `BackupService` 核心服务（整合数据库备份、压缩、加密、存储、通知）
- [x] 实现基于 `cron` 的定时任务调度 (`SchedulerService`)
- [x] 编写 CLI 入口脚本 (`src/cli.ts`)

## 阶段 5: 部署与测试
- [x] 编写 `Dockerfile`
- [x] 编写 `docker-compose.yml` 示例
- [x] 编写单元测试 (`tests/config.test.ts`, `tests/storage.test.ts`)
- [x] 完善 `README.md` 使用手册

# 阶段 6：添加 MongoDB 支持 和 统一配置入口
- [x] 统一配置入口：以 `config.yml` 为主，`.env` 作为可选变量注入源
- [x] 设计并实现占位符解析，支持 `${VAR}` 与 `${VAR:-default}`
- [x] 在 YAML 解析后的对象树上做变量替换，避免结构注入
- [x] 增加缺失变量、默认值、特殊字符与转义场景测试
- [x] 外部命令执行改为安全参数传递，避免拼接完整 Shell 命令字符串
- [x] 添加 MongoDB 支持
- [x] 设计并实现 `MongoDBProvider`
- [x] 扩展 `ProjectConfig`，支持 MongoDB 连接信息与 `dumpOptions`
- [x] 在配置加载阶段增加按 `dbType` 的条件校验
- [x] 在 `BackupService.createProvider()` 中接入 `mongodb` 分支
- [x] 基于 `mongodump` 实现 BSON 归档导出
- [x] 增加 `mongodump` 可用性检测，并在缺失时给出清晰报错
- [ ] 处理 `mongodump --gzip` 与项目压缩流程的冲突策略
- [x] 为 Docker 运行镜像预装 MongoDB Database Tools
- [x] 在 README 中补充 MongoDB 备份依赖与配置示例
- [x] 为 MongoDBProvider 编写单元测试与集成测试


## 未来扩展 (待定)
- [ ] 添加 MySQL 支持
- [ ] 添加 PostgreSQL 支持
- [ ] 更多 OSS 渠道支持 (S3, 腾讯云, 百度云等)
