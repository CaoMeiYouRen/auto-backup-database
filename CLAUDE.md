# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

服务器数据库自动备份方案，支持本地备份和异地备份（OSS/S3），提供灵活的生命周期管理策略。目前处于早期开发阶段，仅有项目脚手架。

## 常用命令

```bash
# 开发
pnpm run dev           # 使用 tsx watch 模式运行
pnpm run dev:tsdown    # 使用 tsdown watch 模式构建

# 构建
pnpm run build         # 生产环境构建（输出到 dist/）

# 运行
pnpm run start         # 运行编译后的代码
pnpm run start:tsx     # 使用 tsx 直接运行源码

# 质量检查
pnpm run lint          # ESLint 检查并自动修复
pnpm run test          # 运行 vitest 测试
pnpm run test:coverage # 运行测试并生成覆盖率报告
pnpm run typecheck     # 进行 TypeScript 类型检查

# Git
pnpm run commit        # 使用 commitizen 交互式提交
pnpm run release       # 语义化发布
```

## 架构设计

项目采用模块化的 Provider 架构（详见 `docs/design.md`）：

- **ConfigLoader**: 解析 `config.yml`（项目配置）和 `.env`（敏感信息如 OSS 密钥）
- **DatabaseProvider**: 抽象类，定义 `backup()` 方法。计划实现：`SQLiteProvider`、MySQL、PostgreSQL、MongoDB
- **BackupService**: 核心编排逻辑 - 触发备份、压缩/加密、本地保存、OSS 上传、清理旧备份
- **StorageProvider**: `LocalStorage`（文件系统）和 `RemoteStorage`（S3 兼容的 OSS）
- **NotifyService**: 通过 `push-all-in-one` 实现多渠道消息推送

### 配置结构

项目配置使用 YAML 格式，支持：
- Glob 语法匹配数据库文件
- Cron 表达式定义备份周期
- 独立的本地/远程保留策略（天数 + 最大大小）
- 可选的备份加密

## 核心依赖

- `tsdown`: 构建工具（输出 ESM 和 CJS 双格式）
- `zx`: 执行 Shell 命令进行备份操作
- `cron`: 定时任务调度
- `@aws-sdk/client-s3`: S3 兼容对象存储（阿里云、腾讯云、AWS 等）
- `push-all-in-one`: 消息推送（微信、钉钉、飞书等）
- `better-bytes`: 人类可读的大小解析（`2GB`、`100MB`）

## 开发规范

- 路径别名：`@/*` 映射到 `./src/*`
- 提交信息遵循 Conventional Commits（由 commitlint-config-cmyr 强制）
- Pre-commit 钩子对 `.js` 和 `.ts` 文件执行 lint-staged
- ESLint 使用 `eslint-config-cmyr` 预设
