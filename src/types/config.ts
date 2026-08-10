import type { NotifyConfig } from '@/notify'

/**
 * 数据库类型
 */
export type DatabaseType = 'sqlite' | 'mysql' | 'postgresql' | 'mongodb' | 'file'

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
    /**
     * 已压缩文件的扩展名白名单
     * 备份产物全部命中该列表时跳过压缩（仅对单个文件产物生效，目录不参与判断）
     * 默认使用内置常见压缩格式列表
     */
    skipExtensions?: string[]
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
 * PostgreSQL dump 格式
 */
export type PostgresDumpFormat = 'plain' | 'custom' | 'tar'

/**
 * PostgreSQL dump 选项
 */
export interface PostgresDumpOptions {
    /** 输出格式，默认为 custom */
    format?: PostgresDumpFormat
    /** pg_dump 内置压缩级别，0 表示禁用 */
    compression?: number
    /** 仅导出结构 */
    schemaOnly?: boolean
    /** 仅导出数据 */
    dataOnly?: boolean
    /** 恢复前清理对象 */
    clean?: boolean
    /** 在导出中包含 CREATE DATABASE */
    create?: boolean
    /** 恢复时不设置 owner */
    noOwner?: boolean
    /** 额外参数 */
    extraArgs?: string[]
}

/**
 * MySQL dump 选项
 */
export interface MySQLDumpOptions {
    /** 备份全部数据库 */
    allDatabases?: boolean
    /** 指定要备份的数据库列表 */
    databases?: string[]
    /** 指定要备份的表，仅在单数据库模式下可用 */
    tables?: string[]
    /** 使用一致性快照，适用于 InnoDB */
    singleTransaction?: boolean
    /** 大表场景按行流式读取 */
    quick?: boolean
    /** 导出存储过程和函数 */
    routines?: boolean
    /** 导出事件调度器 */
    events?: boolean
    /** 是否导出触发器，默认导出 */
    triggers?: boolean
    /** 跳过锁表 */
    skipLockTables?: boolean
    /** 以十六进制导出二进制字段 */
    hexBlob?: boolean
    /** 仅导出表结构 */
    noData?: boolean
    /** 仅导出表数据 */
    noCreateInfo?: boolean
    /** 默认字符集 */
    defaultCharacterSet?: string
    /** GTID 导出策略 */
    setGtidPurged?: 'OFF' | 'ON' | 'AUTO' | 'COMMENTED'
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
 * PostgreSQL 项目配置
 */
export interface PostgreSQLProjectConfig extends BaseProjectConfig {
    /** 数据库类型 */
    dbType: 'postgresql'
    /** 连接配置 */
    connection: DatabaseConnectionConfig
    /** dump 选项 */
    dumpOptions?: PostgresDumpOptions
}

/**
 * MySQL 项目配置
 */
export interface MySQLProjectConfig extends BaseProjectConfig {
    /** 数据库类型 */
    dbType: 'mysql'
    /** 连接配置 */
    connection: DatabaseConnectionConfig
    /** dump 选项 */
    dumpOptions?: MySQLDumpOptions
}

/**
 * 通用文件/文件夹备份项目配置
 */
export interface FileProjectConfig extends BaseProjectConfig {
    /** 数据库类型 */
    dbType: 'file'
    /** 要备份的文件或文件夹路径列表（支持 Glob 语法，可混合文件与目录） */
    paths: string[]
}

/**
 * 项目配置
 */
export type ProjectConfig = SQLiteProjectConfig | MongoDBProjectConfig | PostgreSQLProjectConfig | MySQLProjectConfig | FileProjectConfig

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
