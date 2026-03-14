import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse } from 'yaml'
import { parse as parseDotenv } from 'dotenv'
import type { AppConfig, FullConfig, OSSConfig, ProjectConfig } from '@/types/config'

const DEFAULT_CONFIG_PATH = 'config.yml'
const DEFAULT_ENV_PATH = '.env'
const PLACEHOLDER_PATTERN = /(?<!\\)\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g

/**
 * 配置加载器
 * 负责加载 .env、解析 config.yml、展开占位符并校验统一配置对象
 */
export class ConfigLoader {
    private configPath: string
    private envPath: string

    constructor(configPath?: string, envPath?: string) {
        this.configPath = resolve(configPath || process.env.CONFIG_PATH || DEFAULT_CONFIG_PATH)
        this.envPath = resolve(envPath || process.env.ENV_PATH || DEFAULT_ENV_PATH)
    }

    /**
     * 加载完整配置
     */
    load(): FullConfig {
        const envSource = this.loadEnvSource()
        const config = this.parseConfig(envSource)
        this.validate(config)
        return config
    }

    /**
     * 加载应用配置并展开占位符
     */
    loadAppConfig(): FullConfig {
        const envSource = this.loadEnvSource()
        return this.parseConfig(envSource)
    }

    /**
     * 加载环境变量源
     */
    loadEnvConfig(): Record<string, string | undefined> {
        return this.loadEnvSource()
    }

    /**
     * 解析配置文件
     */
    private parseConfig(envSource: Record<string, string | undefined>): FullConfig {
        if (!existsSync(this.configPath)) {
            throw new Error(`配置文件不存在: ${this.configPath}`)
        }

        const content = readFileSync(this.configPath, 'utf-8')
        const rawConfig = parse(content) as AppConfig

        if (!rawConfig.projects || !Array.isArray(rawConfig.projects)) {
            throw new Error('配置文件格式错误: 缺少 projects 字段或格式不正确')
        }

        return this.resolvePlaceholders(rawConfig, envSource) as FullConfig
    }

    /**
     * 加载环境变量
     */
    private loadEnvSource(): Record<string, string | undefined> {
        let fileEnv: Record<string, string> = {}

        if (existsSync(this.envPath)) {
            const content = readFileSync(this.envPath, 'utf-8')
            fileEnv = parseDotenv(content)
        }

        return {
            ...fileEnv,
            ...process.env,
        }
    }

    /**
     * 校验配置有效性
     */
    private validate(config: FullConfig): void {
        // 校验项目配置
        for (const project of config.projects) {
            this.validateProject(project)
        }

        // 校验是否有启用远程备份的项目，如果有则校验 OSS 配置
        const hasRemoteBackup = config.projects.some((p) => p.options.remoteEnabled)
        if (hasRemoteBackup) {
            this.validateOSSConfig(config.oss)
        }

        const hasEncryptedBackup = config.projects.some((p) => p.compress.password)
        if (hasEncryptedBackup && !config.security?.backupPassword) {
            throw new Error('安全配置错误: 启用了密码加密但缺少 security.backupPassword')
        }
    }

    /**
     * 校验项目配置
     */
    private validateProject(project: ProjectConfig): void {
        if (!project.name) {
            throw new Error('项目配置错误: 缺少 name 字段')
        }
        if (!project.backupSchedule) {
            throw new Error(`项目 "${project.name}" 配置错误: 缺少 backupSchedule 字段`)
        }
        if (project.compress.password && !project.compress.enabled) {
            throw new Error(`项目 "${project.name}" 配置错误: 启用密码加密时必须同时启用压缩`)
        }

        // 校验 cron 表达式格式（基本校验）
        const cronParts = project.backupSchedule.split(' ')
        if (cronParts.length < 5 || cronParts.length > 6) {
            throw new Error(
                `项目 "${project.name}" 配置错误: backupSchedule 不是有效的 Cron 表达式`,
            )
        }

        switch (project.dbType) {
            case 'sqlite':
                if (!project.dbPath) {
                    throw new Error(`项目 "${project.name}" 配置错误: SQLite 缺少 dbPath 字段`)
                }
                break
            case 'mongodb':
                if (!project.connection?.uri) {
                    throw new Error(`项目 "${project.name}" 配置错误: MongoDB 缺少 connection.uri 字段`)
                }
                if (project.dumpOptions?.archive === false) {
                    throw new Error(`项目 "${project.name}" 配置错误: 当前仅支持 mongodump archive 模式`)
                }
                if (project.dumpOptions?.gzip && project.compress.enabled) {
                    throw new Error(`项目 "${project.name}" 配置错误: dumpOptions.gzip 与 compress.enabled 不能同时启用`)
                }
                break
            default:
                break
        }
    }

    /**
     * 校验 OSS 配置
     */
    private validateOSSConfig(oss?: OSSConfig): void {
        if (!oss) {
            throw new Error('OSS 配置错误: 缺少 oss 配置')
        }

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

    /**
     * 展开配置中的占位符
     */
    private resolvePlaceholders(
        value: unknown,
        envSource: Record<string, string | undefined>,
        fieldPath = '',
    ): unknown {
        if (typeof value === 'string') {
            return this.resolveStringValue(value, envSource, fieldPath)
        }

        if (Array.isArray(value)) {
            return value.map((item, index) => this.resolvePlaceholders(item, envSource, `${fieldPath}[${index}]`))
        }

        if (value && typeof value === 'object') {
            const result: Record<string, unknown> = {}

            for (const [key, item] of Object.entries(value)) {
                const nextPath = fieldPath ? `${fieldPath}.${key}` : key
                result[key] = this.resolvePlaceholders(item, envSource, nextPath)
            }

            return result
        }

        return value
    }

    /**
     * 解析单个字符串值中的占位符
     */
    private resolveStringValue(
        value: string,
        envSource: Record<string, string | undefined>,
        fieldPath: string,
    ): string {
        const resolved = value.replace(PLACEHOLDER_PATTERN, (_, variableName: string, defaultValue?: string) => {
            if (Object.prototype.hasOwnProperty.call(envSource, variableName) && envSource[variableName] !== undefined) {
                return envSource[variableName]
            }

            if (defaultValue !== undefined) {
                return defaultValue
            }

            throw new Error(`配置字段 "${fieldPath}" 引用了未定义的环境变量 "${variableName}"`)
        })

        return resolved.replace(/\\\$\{/g, '${')
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
