import type { NotifyConfig } from '@/notify'

/**
 * 数据库类型
 */
export type DatabaseType = 'sqlite' | 'mysql' | 'postgresql' | 'mongodb'

/**
 * 保留策略配置
 */
export interface RetentionConfig {
    /** 保留天数 */
    days: number
    /** 最大占用空间（如 "2GB", "100MB"） */
    maxSize: string
}

/**
 * 压缩配置
 */
export interface CompressConfig {
    /** 是否启用压缩 */
    enabled: boolean
    /** 是否使用密码加密（从环境变量读取） */
    password?: boolean
}

/**
 * 存储选项
 */
export interface StorageOptions {
    /** 是否启用本地备份 */
    localEnabled: boolean
    /** 是否启用远程备份 */
    remoteEnabled: boolean
}

/**
 * OSS 配置
 */
export interface OSSConfig {
    /** OSS 区域 */
    region: string
    /** Access Key ID */
    accessKeyId: string
    /** Access Key Secret */
    accessKeySecret: string
    /** 存储桶名称 */
    bucket: string
    /** 端点地址 */
    endpoint: string
}

/**
 * 安全配置
 */
export interface SecurityConfig {
    /** 备份加密密码 */
    backupPassword?: string
}

/**
 * 通用数据库连接配置
 */
export interface DatabaseConnectionConfig {
    /** 连接 URI */
    uri: string
    /** 数据库名称（可选） */
    database?: string
}

/**
 * MongoDB dump 选项
 */
export interface MongoDumpOptions {
    /** 是否启用 archive 模式，当前仅支持 true */
    archive?: boolean
    /** 是否启用 gzip */
    gzip?: boolean
    /** 认证数据库 */
    authenticationDatabase?: string
    /** 读偏好 */
    readPreference?: string
    /** 额外参数 */
    extraArgs?: string[]
}

/**
 * 基础项目配置
 */
export interface BaseProjectConfig {
    /** 项目名称 */
    name: string
    /** 数据库类型 */
    dbType: DatabaseType
    /** 备份周期（Cron 表达式） */
    backupSchedule: string
    /** 压缩配置 */
    compress: CompressConfig
    /** 保留策略 */
    retention: {
        local: RetentionConfig
        remote: RetentionConfig
    }
    /** 存储选项 */
    options: StorageOptions
}

/**
 * SQLite 项目配置
 */
export interface SQLiteProjectConfig extends BaseProjectConfig {
    /** 数据库类型 */
    dbType: 'sqlite'
    /** 数据库路径（支持 Glob 语法） */
    dbPath: string
}

/**
 * MongoDB 项目配置
 */
export interface MongoDBProjectConfig extends BaseProjectConfig {
    /** 数据库类型 */
    dbType: 'mongodb'
    /** 连接配置 */
    connection: DatabaseConnectionConfig
    /** dump 选项 */
    dumpOptions?: MongoDumpOptions
}

/**
 * 预留的连接型数据库配置
 */
export interface ConnectionProjectConfig extends BaseProjectConfig {
    /** 数据库类型 */
    dbType: 'mysql' | 'postgresql'
    /** 连接配置 */
    connection?: DatabaseConnectionConfig
    /** 扩展选项 */
    dumpOptions?: Record<string, unknown>
    /** 兼容旧字段 */
    dbPath?: string
}

/**
 * 项目配置
 */
export type ProjectConfig = SQLiteProjectConfig | MongoDBProjectConfig | ConnectionProjectConfig

/**
 * 应用配置（展开后的统一配置对象）
 */
export interface AppConfig {
    /** OSS 配置 */
    oss?: OSSConfig
    /** 安全配置 */
    security?: SecurityConfig
    /** 项目列表 */
    projects: ProjectConfig[]
    /** 通知配置 */
    notify?: NotifyConfig
}

/**
 * 完整配置
 */
export type FullConfig = AppConfig
