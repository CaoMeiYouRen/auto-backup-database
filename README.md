<h1 align="center">auto-backup-database</h1>
<p>
  <img alt="Version" src="https://img.shields.io/github/package-json/v/CaoMeiYouRen/auto-backup-database.svg" />
  <a href="https://github.com/CaoMeiYouRen/auto-backup-database/actions?query=workflow%3ARelease" target="_blank">
    <img alt="GitHub Workflow Status" src="https://img.shields.io/github/actions/workflow/status/CaoMeiYouRen/auto-backup-database/release.yml?branch=master">
  </a>
  <img src="https://img.shields.io/badge/node-%3E%3D20-blue.svg" />
  <a href="https://github.com/CaoMeiYouRen/auto-backup-database#readme" target="_blank">
    <img alt="Documentation" src="https://img.shields.io/badge/documentation-yes-brightgreen.svg" />
  </a>
  <a href="https://github.com/CaoMeiYouRen/auto-backup-database/graphs/commit-activity" target="_blank">
    <img alt="Maintenance" src="https://img.shields.io/badge/Maintained%3F-yes-green.svg" />
  </a>
  <a href="https://github.com/CaoMeiYouRen/auto-backup-database/blob/master/LICENSE" target="_blank">
    <img alt="License: MIT" src="https://img.shields.io/github/license/CaoMeiYouRen/auto-backup-database?color=yellow" />
  </a>
</p>

> 服务器数据库自动备份方案，支持本地备份和异地备份（OSS/S3）

## 功能特性

- **多数据库支持**: SQLite（已实现）、MySQL、PostgreSQL、MongoDB（计划中）
- **Glob 匹配**: 支持 Glob 语法批量匹配数据库文件
- **压缩加密**: 自动压缩备份文件，支持可选的密码加密
- **本地 + 远程存储**: 同时支持本地备份和 OSS/S3 远程备份
- **生命周期管理**: 按天数和总大小自动清理旧备份
- **定时调度**: 基于 Cron 表达式的定时任务调度
- **消息通知**: 支持多种推送渠道（微信、钉钉、飞书等）

## 依赖要求

- Node.js >= 20
- tar（用于压缩）
- openssl（用于加密，可选）

## 安装

```bash
# 使用 pnpm
pnpm install

# 使用 npm
npm install
```

## 配置

### 1. 创建配置文件 `config.yml`

```yaml
projects:
  - name: my-app-db
    dbType: sqlite
    dbPath: "/data/apps/my-app/*.db" # 支持 Glob 语法
    backupSchedule: "0 2 * * *" # 每天凌晨 2 点
    compress:
      enabled: true
      password: true # 使用环境变量中的 BACKUP_PASSWORD 加密
    retention:
      local:
        days: 7
        maxSize: 2GB
      remote:
        days: 30
        maxSize: 10GB
    options:
      localEnabled: true
      remoteEnabled: true

# 通知配置（可选）
notify:
  enabled: true
  type: Dingtalk # 支持多种推送方式，详见 push-all-in-one
  config:
    DINGTALK_ACCESS_TOKEN: your-token
    DINGTALK_SECRET: your-secret
```

### 2. 创建环境变量文件 `.env`

```env
# OSS 配置（支持阿里云 OSS、腾讯云 COS、AWS S3 等）
OSS_REGION=oss-cn-hangzhou
OSS_ACCESS_KEY_ID=your-access-key-id
OSS_ACCESS_KEY_SECRET=your-access-key-secret
OSS_BUCKET=your-bucket-name
OSS_ENDPOINT=https://oss-cn-hangzhou.aliyuncs.com

# 备份加密密码（可选）
BACKUP_PASSWORD=your-secure-password
```

## 使用

### 命令行

```bash
# 启动调度器（默认模式）
pnpm run start

# 单次执行所有项目备份
pnpm run start -- -m once

# 单次执行指定项目备份
pnpm run start -- -m once -p my-app-db

# 指定配置文件
pnpm run start -- -c /path/to/config.yml -e /path/to/.env
```

### 命令行参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `-c, --config <path>` | 配置文件路径 | `config.yml` |
| `-e, --env <path>` | 环境变量文件路径 | `.env` |
| `-o, --output <path>` | 本地备份目录 | `./backups` |
| `-m, --mode <mode>` | 运行模式: `once` 或 `schedule` | `schedule` |
| `-p, --project <name>` | 指定项目名称（单次模式） | - |
| `-h, --help` | 显示帮助信息 | - |

## Docker 部署

### 使用 docker-compose

```bash
# 构建并启动
docker-compose up -d

# 查看日志
docker-compose logs -f
```

### 手动构建

```bash
# 构建镜像
docker build -t auto-backup-database .

# 运行容器
docker run -d \
  --name auto-backup-database \
  -v $(pwd)/config:/app/config:ro \
  -v $(pwd)/backups:/app/backups \
  -v /path/to/databases:/app/data:ro \
  auto-backup-database
```

## 开发

```bash
# 开发模式
pnpm run dev

# 构建
pnpm run build

# 代码检查
pnpm run lint

# 运行测试
pnpm run test

# 提交代码
pnpm run commit
```

## 项目结构

```
src/
├── cli.ts              # CLI 入口
├── index.ts            # 模块导出
├── config/
│   └── loader.ts       # 配置加载器
├── providers/
│   ├── database.ts     # 数据库提供者抽象类
│   └── sqlite.ts       # SQLite 提供者
├── services/
│   ├── backup.ts       # 备份服务
│   └── scheduler.ts    # 调度服务
├── storage/
│   ├── local.ts        # 本地存储
│   └── oss.ts          # OSS 存储
├── notify/
│   └── index.ts        # 通知服务
├── types/
│   └── config.ts       # 配置类型定义
└── utils/
    ├── compress.ts     # 压缩工具
    └── encrypt.ts      # 加密工具
```

## 作者

**CaoMeiYouRen**

* GitHub: [@CaoMeiYouRen](https://github.com/CaoMeiYouRen)

## 贡献

欢迎贡献、提问或提出新功能！请查看 [issues page](https://github.com/CaoMeiYouRen/auto-backup-database/issues) 或 [contributing guide](https://github.com/CaoMeiYouRen/auto-backup-database/blob/master/CONTRIBUTING.md)。

## 支持

如果觉得这个项目有用的话请给一颗⭐️，非常感谢

<a href="https://afdian.com/@CaoMeiYouRen">
  <img src="https://oss.cmyr.dev/images/202306192324870.png" width="312px" height="78px" alt="在爱发电支持我">
</a>

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=CaoMeiYouRen/auto-backup-database&type=Date)](https://star-history.com/#CaoMeiYouRen/auto-backup-database&Date)


## License

Copyright © 2026 [CaoMeiYouRen](https://github.com/CaoMeiYouRen).<br />
This project is [MIT](https://github.com/CaoMeiYouRen/auto-backup-database/blob/master/LICENSE) licensed.

***
_This README was generated with ❤️ by [cmyr-template-cli](https://github.com/CaoMeiYouRen/cmyr-template-cli)_
