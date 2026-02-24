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
 * 项目配置
 */
export interface ProjectConfig {
    /** 项目名称 */
    name: string
    /** 数据库类型 */
    dbType: DatabaseType
    /** 数据库路径（支持 Glob 语法） */
    dbPath: string
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
 * 应用配置（config.yml 结构）
 */
export interface AppConfig {
    /** 项目列表 */
    projects: ProjectConfig[]
}

/**
 * OSS 配置（从环境变量加载）
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
 * 环境变量配置（.env 结构）
 */
export interface EnvConfig {
    /** OSS 配置 */
    oss: OSSConfig
    /** 备份加密密码 */
    backupPassword?: string
}

/**
 * 完整配置（合并后的配置对象）
 */
export interface FullConfig {
    /** 应用配置 */
    app: AppConfig
    /** 环境变量配置 */
    env: EnvConfig
}
