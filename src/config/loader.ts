import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse } from 'yaml'
import { config as loadDotenv } from 'dotenv'
import { readFileSync } from 'fs-extra'
import type { AppConfig, EnvConfig, FullConfig, OSSConfig } from '@/types/config'

const DEFAULT_CONFIG_PATH = 'config.yml'
const DEFAULT_ENV_PATH = '.env'

/**
 * 配置加载器
 * 负责加载并校验 config.yml 与 .env
 */
export class ConfigLoader {
    private configPath: string
    private envPath: string

    constructor(configPath?: string, envPath?: string) {
        this.configPath = resolve(configPath || DEFAULT_CONFIG_PATH)
        this.envPath = resolve(envPath || DEFAULT_ENV_PATH)
    }

    /**
     * 加载完整配置
     */
    load(): FullConfig {
        const app = this.loadAppConfig()
        const env = this.loadEnvConfig()
        this.validate(app, env)
        return { app, env }
    }

    /**
     * 加载应用配置（config.yml）
     */
    loadAppConfig(): AppConfig {
        if (!existsSync(this.configPath)) {
            throw new Error(`配置文件不存在: ${this.configPath}`)
        }

        const content = readFileSync(this.configPath, 'utf-8')
        const config = parse(content) as AppConfig

        if (!config.projects || !Array.isArray(config.projects)) {
            throw new Error('配置文件格式错误: 缺少 projects 字段或格式不正确')
        }

        return config
    }

    /**
     * 加载环境变量配置（.env）
     */
    loadEnvConfig(): EnvConfig {
        // 加载 .env 文件（如果存在）
        if (existsSync(this.envPath)) {
            loadDotenv({ path: this.envPath })
        }

        const oss: OSSConfig = {
            region: process.env.OSS_REGION || '',
            accessKeyId: process.env.OSS_ACCESS_KEY_ID || '',
            accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET || '',
            bucket: process.env.OSS_BUCKET || '',
            endpoint: process.env.OSS_ENDPOINT || '',
        }

        return {
            oss,
            backupPassword: process.env.BACKUP_PASSWORD,
        }
    }

    /**
     * 校验配置有效性
     */
    private validate(app: AppConfig, env: EnvConfig): void {
        // 校验项目配置
        for (const project of app.projects) {
            this.validateProject(project)
        }

        // 校验是否有启用远程备份的项目，如果有则校验 OSS 配置
        const hasRemoteBackup = app.projects.some((p) => p.options.remoteEnabled)
        if (hasRemoteBackup) {
            this.validateOSSConfig(env.oss)
        }
    }

    /**
     * 校验项目配置
     */
    private validateProject(project: AppConfig['projects'][0]): void {
        if (!project.name) {
            throw new Error('项目配置错误: 缺少 name 字段')
        }
        if (!project.dbType) {
            throw new Error(`项目 "${project.name}" 配置错误: 缺少 dbType 字段`)
        }
        if (!project.dbPath) {
            throw new Error(`项目 "${project.name}" 配置错误: 缺少 dbPath 字段`)
        }
        if (!project.backupSchedule) {
            throw new Error(`项目 "${project.name}" 配置错误: 缺少 backupSchedule 字段`)
        }

        // 校验 cron 表达式格式（基本校验）
        const cronParts = project.backupSchedule.split(' ')
        if (cronParts.length < 5 || cronParts.length > 6) {
            throw new Error(
                `项目 "${project.name}" 配置错误: backupSchedule 不是有效的 Cron 表达式`,
            )
        }
    }

    /**
     * 校验 OSS 配置
     */
    private validateOSSConfig(oss: OSSConfig): void {
        const requiredFields: (keyof OSSConfig)[] = [
            'region',
            'accessKeyId',
            'accessKeySecret',
            'bucket',
            'endpoint',
        ]

        for (const field of requiredFields) {
            if (!oss[field]) {
                throw new Error(`OSS 配置错误: 缺少 ${field} 字段`)
            }
        }
    }
}

/**
 * 创建配置加载器实例
 */
export function createConfigLoader(configPath?: string, envPath?: string): ConfigLoader {
    return new ConfigLoader(configPath, envPath)
}

/**
 * 加载配置的快捷方法
 */
export function loadConfig(configPath?: string, envPath?: string): FullConfig {
    return createConfigLoader(configPath, envPath).load()
}
