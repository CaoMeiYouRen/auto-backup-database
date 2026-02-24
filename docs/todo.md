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
- [ ] 使用 `zx` 编写核心入口脚本
- [ ] 实现基于 `cron` 的定时任务调度
- [ ] 优化日志输出与错误捕获

## 阶段 5: 部署与测试
- [ ] 编写 `Dockerfile`
- [ ] 编写 `docker-compose.yml` 示例
- [ ] 编写单元测试与集成测试
- [ ] 完善 `README.md` 使用手册

## 阶段 6: 扩展 (待定)
- [ ] 添加 MySQL 支持
- [ ] 添加 PostgreSQL 支持
- [ ] 更多 OSS 渠道支持 (S3, 腾讯云, 百度云等)
