import type { DatabaseType, ProjectConfig } from '@/types/config'

/**
 * 备份结果
 */
export interface BackupResult {
    /** 项目名称 */
    projectName: string
    /** 备份文件路径列表 */
    backupFiles: string[]
    /** 备份时间 */
    timestamp: Date
    /** 是否成功 */
    success: boolean
    /** 错误信息 */
    error?: string
}

/**
 * 数据库提供者抽象类
 * 定义数据库备份的标准接口
 */
export abstract class DatabaseProvider {
    protected config: ProjectConfig

    constructor(config: ProjectConfig) {
        this.config = config
    }

    /**
     * 获取数据库类型
     */
    abstract get type(): DatabaseType

    /**
     * 执行备份
     * @param outputDir 输出目录
     * @returns 备份结果
     */
    abstract backup(outputDir: string): Promise<BackupResult>

    /**
     * 验证数据库路径是否有效
     */
    abstract validatePath(): Promise<boolean>

    /**
     * 获取匹配的数据库文件列表
     */
    abstract getDatabaseFiles(): Promise<string[]>
}
