# 服务器数据库自动备份方案设计文档

## 1. 项目背景与目标
旨在为服务器提供一套轻量、可靠、易扩展的数据库自动备份解决方案。支持本地持久化与异地对象存储（OSS）备份，并提供灵活的生命周期管理功能（天数及文件大小限制）。

## 2. 技术栈
- **运行时**: Node.js (>=20)
- **开发语言**: TypeScript
- **构建工具**: [tsdown](https://github.com/egoist/tsdown)
- **命令行工具**: [zx](https://github.com/google/zx) (用于方便地调用 shell 命令)
- **配置文件**: YAML (配置项目列表), `.env` (管理敏感信息如 OSS 密钥、数据库密码)
- **核心依赖**:
    - `yaml`: 解析配置文件
    - `dotenv`: 加载环境变量
    - `cron`: 处理定时任务调度
    - `fs-extra`: 增强型文件系统操作
    - `glob`: 匹配数据库路径
    - `dayjs`: 时间处理
    - `better-bytes`: 处理字节大小换算（如 `2GB`, `100MB`）
    - `push-all-in-one`: 提供多渠道消息推送功能
    - `@aws-sdk/client-s3`: 实现 OSS/S3 兼容的一站式上传（支持阿里云、腾讯云、S3 等）

## 3. 核心功能
- **多数据库支持**:
    - 采用插件式/抽象类设计，默认实现 **SQLite**。
    - 预留接口支持 **MySQL**, **PostgreSQL**, **MongoDB** 等。
- **灵活备份策略**:
    - 支持 Glob 语法批量匹配数据库文件。
    - 自定义备份周期 (Cron 表达式)。
    - 本地与远程备份独立开关。
- **文件管理与安全**:
    - 备份文件强制压缩。
    - 支持可选的备份包加密（增加密码保护）。
    - OSS 上传自动设置为 **Private** 权限。
- **生命周期管理**:
    - 支持按 **天数** 保留备份。
    - 支持按 **总大小上限** 清理旧备份（本地及远程均支持）。
- **部署方式**:
    - 支持单机直接部署。
    - 官方提供 Docker 镜像。

## 4. 系统架构
### 4.1 配置文件结构 (config.yml)
```yaml
projects:
  - name: my-app-db
    dbType: sqlite
    dbPath: "/data/apps/my-app/*.db" # 支持 Glob
    backupSchedule: "0 2 * * *"     # 每天凌晨 2 点
    compress:
      enabled: true
      password: true                # 是否使用环境变量中的密码加密
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
```

### 4.2 环境变量 (.env)
```env
# OSS 配置
OSS_REGION=oss-cn-hangzhou
OSS_ACCESS_KEY_ID=your-id
OSS_ACCESS_KEY_SECRET=your-secret
OSS_BUCKET=your-bucket
OSS_ENDPOINT=your-endpoint

# 加密密码
BACKUP_PASSWORD=your-secure-password
```

### 4.3 核心模块设计
- **`ConfigLoader`**: 加载并校验 `config.yml` 与 `.env`。
- **`DatabaseProvider`**: 抽象类，定义 `backup()` 方法。
    - `SQLiteProvider`: 实现文件直接拷贝备份。
- **`BackupService`**: 核心逻辑流。
    1. 触发备份。
    2. 压缩/加密。
    3. 执行本地保存。
    4. 执行远程上传至 OSS。
    5. 清理本地/远程旧文件。
- **`StorageProvider`**:
    - `LocalStorage`: 文件系统清理。
    - `RemoteStorage`: OSS 上传与清理。
- **`NotifyService`**:
    - 基于 `push-all-in-one` 实现，负责备份成功、失败、清理等事件的消息推送。

## 5. 部署说明
- **Docker**:
    - 挂载 `config.yml` 和 `.env` 到 `/app/config/`。
    - 挂载需要备份的数据库文件夹到容器内。
    - 挂载本地备份输出路径。

## 6. 后续扩展性
- **消息通知**: 备份成功/失败发送到 Webhook (通知、企业微信、飞书等)。
- **监控**: 对接 Prometheus 展示备份状态。
