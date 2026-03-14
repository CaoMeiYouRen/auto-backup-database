# 服务器数据库自动备份方案设计文档

## 1. 项目背景与目标
旨在为服务器提供一套轻量、可靠、易扩展的数据库自动备份解决方案。支持本地持久化与异地对象存储（OSS）备份，并提供灵活的生命周期管理功能（天数及文件大小限制）。

## 2. 技术栈
- **运行时**: Node.js (>=20)
- **开发语言**: TypeScript
- **构建工具**: [tsdown](https://github.com/egoist/tsdown)
- **命令行工具**: [zx](https://github.com/google/zx) (用于方便地调用 shell 命令)
- **数据库备份工具**:
    - SQLite: 基于文件系统直接复制
    - MongoDB: 基于 [MongoDB Database Tools](https://www.mongodb.com/zh-cn/docs/database-tools/) 的 `mongodump`
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
    - MongoDB 通过 `mongodump` 导出 BSON 归档，优先支持副本集/单节点场景。
    - 预留接口继续支持 **MySQL**, **PostgreSQL** 等。
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

## 4. 配置管理设计

### 4.1 设计目标
- `config.yml` 作为唯一的业务配置入口，承载完整配置结构。
- `.env` 仅作为变量值来源，用于注入敏感信息或不同环境下的差异化值，而不是第二套平级配置体系。
- 用户应优先在一处理解和维护配置结构，避免同时在多个文件中来回切换。

### 4.2 配置来源与优先级
- CLI 参数只负责指定配置文件路径与环境变量文件路径，不承载业务配置。
- 程序启动后先加载 `.env`，再读取 `config.yml`。
- `config.yml` 中支持变量占位符引用环境变量。
- 最终只生成一份“展开后的统一配置对象”供后续校验和运行使用。

建议支持的占位符语法：

```yaml
oss:
    region: "${OSS_REGION}"
    accessKeyId: "${OSS_ACCESS_KEY_ID}"
    accessKeySecret: "${OSS_ACCESS_KEY_SECRET}"
    bucket: "${OSS_BUCKET}"
    endpoint: "${OSS_ENDPOINT:-https://oss-cn-hangzhou.aliyuncs.com}"

security:
    backupPassword: "${BACKUP_PASSWORD}"
```

约束如下：
- 支持 `${VAR}` 形式，表示变量必填。
- 支持 `${VAR:-default}` 形式，表示变量缺失时使用默认值。
- 不支持 Shell 表达式、命令替换、函数调用、模板脚本等动态能力。
- 不支持从环境变量直接注入对象、数组或 YAML 片段。

### 4.3 解析流程与转义策略
为避免变量替换破坏 YAML 结构，解析流程应遵循以下顺序：

1. 加载 `.env` 与当前进程环境变量。
2. 读取并解析 `config.yml`，先得到原始对象结构。
3. 递归遍历对象中的字符串字段，仅对字符串值做占位符解析。
4. 生成最终配置对象并执行统一校验。

该策略有几个关键收益：
- 环境变量只会替换字符串值，不会改变 YAML 的层级结构。
- 即使变量值中包含 `:`、`#`、空格、引号、`&`、`?` 等特殊字符，也不会在替换阶段重新参与 YAML 解析。
- 可以避免通过环境变量注入新的键、数组元素或额外配置块。

实现约束建议如下：
- 占位符替换在解析后的对象树上完成，而不是对原始 YAML 文本做全局字符串替换。
- 如果某个字段需要保留字面量 `${...}`，后续可约定显式转义语法，例如 `\${VAR}`，但第一阶段可以先不支持，保持规则简单。
- 对于 URI、密码、Access Key、Webhook 等敏感字段，日志中只允许输出“字段存在”或脱敏后的摘要。

### 4.4 命令执行安全边界
虽然项目可以假定使用者整体可信，但仍应避免把配置值直接拼接进 Shell 命令字符串。

设计要求如下：
- 执行外部命令时，必须优先使用参数数组或 `spawn`/`execFile` 这类不经过 Shell 插值的方式。
- 禁止将用户配置、环境变量、数据库连接串直接拼接成完整命令行字符串后再交给 Shell 执行。
- 对 `mongodump`、`tar`、`openssl` 等命令，应按参数粒度传递，例如 `['--uri', uri, '--db', database]`。
- 如果后续继续使用 `zx`，也应确保最终落到安全参数传递模型，而不是手工拼接整段命令。

这条边界的目的不是防御恶意用户，而是避免因为空格、引号、特殊字符、URI 查询参数等内容造成命令解析错误。

### 4.5 校验策略
- 统一配置对象生成后，再按数据库类型和功能开关执行条件校验。
- 如果占位符引用的必填环境变量缺失，应在启动阶段直接失败，并明确指出缺失的变量名和对应配置字段。
- 如果提供了默认值，则校验逻辑只检查默认值展开后的最终结果。
- 对远程备份、加密、MongoDB 等功能，只有在相关功能启用时才校验对应字段。

## 5. MongoDB 备份设计

### 5.1 方案选择
- 使用 MongoDB 官方 `mongodump` 作为备份引擎，而不是通过 Node.js 驱动自行遍历集合导出。
- 选择 `mongodump` 的原因：
    - 官方工具，兼容性和稳定性更高。
    - 可以直接生成 BSON 备份，便于后续使用 `mongorestore` 恢复。
    - 支持认证、副本集、TLS、只导出指定数据库等常见生产场景。
- 当前阶段不直接实现恢复能力，但备份产物格式需保证未来可被 `mongorestore` 消费。

### 5.2 运行时依赖策略
- **Docker 环境**: 在运行镜像中预装 MongoDB Database Tools，开箱即用。
- **非 Docker 环境**: 不在 npm 依赖中打包数据库工具，要求用户自行安装 `mongodump` 并加入系统 `PATH`。
- 程序启动或任务执行前需要检测 `mongodump` 是否可用；若不可用，应返回明确错误并提示安装方式。

### 5.3 配置模型扩展
为了兼容文件型数据库与连接型数据库，项目配置建议从单一 `dbPath` 扩展为按数据库类型区分的连接信息。SQLite 继续保留 `dbPath`，MongoDB 新增 `connection` 与 `dumpOptions`。MongoDB 相关敏感值优先通过占位符引用环境变量，而不是写死在配置文件中。

```yaml
projects:
    - name: mongo-prod
        dbType: mongodb
        connection:
            uri: "${MONGODB_URI}"
            database: "${MONGODB_DATABASE:-app}"
        dumpOptions:
            archive: true
            gzip: false
            authenticationDatabase: "${MONGODB_AUTH_DB:-admin}"
            readPreference: secondaryPreferred
            extraArgs: []
        backupSchedule: "0 3 * * *"
        compress:
            enabled: true
            password: true
        retention:
            local:
                days: 7
                maxSize: 5GB
            remote:
                days: 30
                maxSize: 20GB
        options:
            localEnabled: true
            remoteEnabled: true
```

建议的数据结构调整如下：
- `ProjectConfig` 增加可选的 `connection` 字段，用于 MongoDB、MySQL、PostgreSQL 这类连接型数据库。
- `ProjectConfig` 增加可选的 `dumpOptions` 字段，用于传递数据库工具参数。
- `dbPath` 调整为“仅 SQLite 必填”，并在配置校验阶段根据 `dbType` 做条件校验。
- 敏感信息优先通过占位符从 `.env` 注入，例如 `MONGODB_URI`、`MONGODB_USERNAME`、`MONGODB_PASSWORD`。

### 5.4 MongoDBProvider 设计
- 新增 `MongoDBProvider`，继承 `DatabaseProvider`。
- `validatePath()` 对 MongoDB 语义上应调整为校验连接配置和 `mongodump` 可执行文件可用性。
- `getDatabaseFiles()` 对 MongoDB 不再表示源数据库文件列表，可改为返回待打包产物路径，或者在抽象层重命名为更通用的资源枚举接口。
- `backup(outputDir)` 的核心流程：
    1. 构造本次备份输出目录。
    2. 组装 `mongodump` 参数。
    3. 以参数数组方式执行 `mongodump --archive=<file>`，必要时追加 `--db`、`--uri`、`--authenticationDatabase` 等参数。
    4. 输出单个 `.archive` 或 `.archive.gz` 文件。
    5. 复用现有压缩、加密、本地存储、OSS 上传、生命周期清理流程。

建议默认命令形态：

```bash
mongodump \
    --uri="$MONGODB_URI" \
    --db="app" \
    --archive="/tmp/backup/mongo-prod/2026-03-14_03-00-00.dump"
```

### 5.5 与现有备份流水线的集成
- `BackupService.createProvider()` 增加 `mongodb` 分支。
- 压缩层保持不变：MongoDB 备份结果仍作为普通文件进入现有 `compressDirectory` 或后续统一压缩接口。
- 为避免双重压缩，若未来启用 `mongodump --gzip`，需要与项目级 `compress.enabled` 明确互斥或定义优先级。
- 清理策略继续复用 `LocalStorage` 与 `OSSStorage`，无需为 MongoDB 单独实现。

### 5.6 异常处理与可观测性
- 以下场景需要给出明确错误信息：
    - `mongodump` 未安装或不在 `PATH` 中。
    - URI 无法连接、认证失败、权限不足。
    - 指定数据库不存在。
    - 容器内未挂载目标网络或 TLS 证书。
- 日志中应记录最终执行的参数摘要，但必须脱敏 URI 中的用户名、密码等敏感信息。
- 通知消息应能区分“数据库备份失败”和“后续上传失败”。

## 6. 系统架构
### 6.1 配置文件结构 (config.yml)
```yaml
oss:
    region: "${OSS_REGION}"
    accessKeyId: "${OSS_ACCESS_KEY_ID}"
    accessKeySecret: "${OSS_ACCESS_KEY_SECRET}"
    bucket: "${OSS_BUCKET}"
    endpoint: "${OSS_ENDPOINT}"

security:
    backupPassword: "${BACKUP_PASSWORD}"

projects:
    - name: my-app-db
        dbType: sqlite
        dbPath: "/data/apps/my-app/*.db"
        backupSchedule: "0 2 * * *"
        compress:
            enabled: true
            password: true
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

    - name: mongo-prod
        dbType: mongodb
        connection:
            uri: "${MONGODB_URI}"
            database: "${MONGODB_DATABASE:-app}"
        dumpOptions:
            archive: true
            authenticationDatabase: "${MONGODB_AUTH_DB:-admin}"
            extraArgs: []
        backupSchedule: "0 3 * * *"
        compress:
            enabled: true
            password: true
        retention:
            local:
                days: 7
                maxSize: 5GB
            remote:
                days: 30
                maxSize: 20GB
        options:
            localEnabled: true
            remoteEnabled: true

notify:
    enabled: true
    type: Dingtalk
    config:
        DINGTALK_ACCESS_TOKEN: "${DINGTALK_ACCESS_TOKEN}"
        DINGTALK_SECRET: "${DINGTALK_SECRET}"
    option:
        msgtype: markdown
```

### 6.2 环境变量 (.env)
```env
# OSS 配置
OSS_REGION=oss-cn-hangzhou
OSS_ACCESS_KEY_ID=your-id
OSS_ACCESS_KEY_SECRET=your-secret
OSS_BUCKET=your-bucket
OSS_ENDPOINT=your-endpoint

# 加密密码
BACKUP_PASSWORD=your-secure-password

# MongoDB 配置
MONGODB_URI=mongodb://username:password@127.0.0.1:27017/app?authSource=admin
MONGODB_DATABASE=app
MONGODB_AUTH_DB=admin
```

### 6.3 核心模块设计
- **`ConfigLoader`**: 加载 `.env`，解析 `config.yml`，展开占位符，产出统一配置对象并执行校验。
- **`DatabaseProvider`**: 抽象类，定义 `backup()` 方法。
    - `SQLiteProvider`: 实现文件直接拷贝备份。
    - `MongoDBProvider`: 调用 `mongodump` 生成归档文件。
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

## 7. 部署说明
- **Docker**:
    - 挂载 `config.yml` 和 `.env` 到 `/app/config/`。
    - 挂载需要备份的数据库文件夹到容器内。
    - 挂载本地备份输出路径。
    - 运行镜像内预装 `mongodump`，可直接执行 MongoDB 备份。
- **非 Docker**:
    - 需要用户自行安装 MongoDB Database Tools。
    - 需要确保 `mongodump --version` 可以在终端直接执行。

## 8. 后续扩展性
- **消息通知**: 备份成功/失败发送到 Webhook (通知、企业微信、飞书等)。
- **监控**: 对接 Prometheus 展示备份状态。
- **恢复能力**: 后续可补充 `mongorestore` 驱动的恢复命令与演练文档。
