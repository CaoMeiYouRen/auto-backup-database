import { execFile as execFileCallback } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { inspect, promisify } from 'node:util'
import dayjs from 'dayjs'
import { DatabaseProvider, type BackupResult } from './database'
import type { MySQLProjectConfig } from '@/types/config'

const execFile = promisify(execFileCallback)

interface MySQLConnectionInfo {
    args: string[]
    env: NodeJS.ProcessEnv
}

type QueryBoolean = boolean | null

/**
 * MySQL 数据库提供者
 * 基于官方 mysqldump 工具生成 SQL 备份文件
 */
export class MySQLProvider extends DatabaseProvider<MySQLProjectConfig> {
    readonly type = 'mysql' as const

    /**
     * 验证连接配置和 mysqldump 是否可用
     */
    async validatePath(): Promise<boolean> {
        if (!this.config.connection?.uri) {
            return false
        }

        try {
            await this.ensureMysqldumpAvailable()
            return true
        } catch {
            return false
        }
    }

    /**
     * MySQL 不存在本地源文件列表，返回空数组以保持接口兼容
     */
    getDatabaseFiles(): Promise<string[]> {
        return Promise.resolve([])
    }

    /**
     * 执行 MySQL 备份
     */
    async backup(outputDir: string): Promise<BackupResult> {
        const timestamp = new Date()
        const timestampStr = dayjs(timestamp).format('YYYY-MM-DD_HH-mm-ss')

        try {
            const executable = await this.ensureMysqldumpAvailable()

            const projectOutputDir = join(outputDir, this.config.name, timestampStr)
            if (!existsSync(projectOutputDir)) {
                await mkdir(projectOutputDir, { recursive: true })
            }

            const outputPath = join(projectOutputDir, `${this.config.name}-${timestampStr}.sql`)
            const { args, env } = this.buildDumpCommand(outputPath)

            await execFile(executable, args, {
                encoding: 'utf8',
                windowsHide: true,
                maxBuffer: 10 * 1024 * 1024,
                env,
            })

            return {
                projectName: this.config.name,
                backupFiles: [outputPath],
                timestamp,
                success: true,
            }
        } catch (error) {
            return {
                projectName: this.config.name,
                backupFiles: [],
                timestamp,
                success: false,
                error: this.extractErrorMessage(error),
            }
        }
    }

    /**
     * 检查 mysqldump 是否可用，兼容 Alpine 下的 mariadb-dump
     */
    private async ensureMysqldumpAvailable(): Promise<string> {
        const candidates = ['mysqldump', 'mariadb-dump']

        for (const executable of candidates) {
            try {
                await execFile(executable, ['--version'], {
                    encoding: 'utf8',
                    windowsHide: true,
                })
                return executable
            } catch {
                continue
            }
        }

        throw new Error('未找到 mysqldump 或 mariadb-dump，请安装 MySQL Client Tools，并确保其已加入 PATH')
    }

    /**
     * 构造 mysqldump 执行参数
     */
    private buildDumpCommand(outputPath: string): MySQLConnectionInfo {
        const { args: connectionArgs, env } = this.buildConnectionArgs()
        const args = [...connectionArgs, `--result-file=${outputPath}`]
        const dumpOptions = this.config.dumpOptions
        const targetDatabases = this.resolveTargetDatabases()

        if (dumpOptions?.singleTransaction) {
            args.push('--single-transaction')
        }

        if (dumpOptions?.quick) {
            args.push('--quick')
        }

        if (dumpOptions?.routines) {
            args.push('--routines')
        }

        if (dumpOptions?.events) {
            args.push('--events')
        }

        if (dumpOptions?.triggers === false) {
            args.push('--skip-triggers')
        }

        if (dumpOptions?.skipLockTables) {
            args.push('--skip-lock-tables')
        }

        if (dumpOptions?.hexBlob) {
            args.push('--hex-blob')
        }

        if (dumpOptions?.noData) {
            args.push('--no-data')
        }

        if (dumpOptions?.noCreateInfo) {
            args.push('--no-create-info')
        }

        if (dumpOptions?.defaultCharacterSet) {
            args.push(`--default-character-set=${dumpOptions.defaultCharacterSet}`)
        }

        if (dumpOptions?.setGtidPurged) {
            args.push(`--set-gtid-purged=${dumpOptions.setGtidPurged}`)
        }

        if (dumpOptions?.allDatabases) {
            args.push('--all-databases')
        } else {
            args.push('--databases', ...targetDatabases)
        }

        if (dumpOptions?.tables?.length) {
            args.push('--tables', ...dumpOptions.tables)
        }

        if (dumpOptions?.extraArgs?.length) {
            args.push(...dumpOptions.extraArgs)
        }

        return { args, env }
    }

    /**
     * 解析连接参数，优先从 URI 拆出可安全传递的选项
     */
    private buildConnectionArgs(): MySQLConnectionInfo {
        const { uri } = this.config.connection

        try {
            const parsed = new URL(uri)
            const args: string[] = []
            const env: NodeJS.ProcessEnv = { ...process.env }

            if (parsed.hostname) {
                args.push(`--host=${parsed.hostname}`)
            }

            if (parsed.port) {
                args.push(`--port=${parsed.port}`)
            }

            if (parsed.username) {
                args.push(`--user=${this.decodeUrlComponent(parsed.username)}`)
            }

            if (parsed.password) {
                env.MYSQL_PWD = this.decodeUrlComponent(parsed.password)
            }

            args.push(...this.buildQueryArgs(parsed.searchParams))

            return { args, env }
        } catch {
            throw new Error('MySQL connection.uri 必须是有效的 mysql:// 连接串')
        }
    }

    /**
     * 仅将少量已知的 MySQL URI 查询参数转换为 CLI 参数，避免把应用层 DSN 参数错误透传给 dump 工具
     */
    private buildQueryArgs(searchParams: URLSearchParams): string[] {
        const args: string[] = []
        const sslMode = searchParams.get('ssl-mode')?.trim()
        const tlsValue = searchParams.get('tls')?.trim()
        const tlsVersion = searchParams.get('tls-version')?.trim()
        const sslValue = searchParams.get('ssl')?.trim()
        const verifyServerCert = this.parseBooleanQuery(searchParams.get('ssl-verify-server-cert'))

        if (sslMode) {
            args.push(`--ssl-mode=${sslMode}`)
        } else {
            const tlsEnabled = this.parseBooleanQuery(tlsValue)
            const sslEnabled = this.parseBooleanQuery(sslValue)
            const effectiveTls = tlsEnabled ?? sslEnabled

            if (verifyServerCert === true) {
                args.push('--ssl-mode=VERIFY_IDENTITY')
            } else if (effectiveTls === true) {
                args.push('--ssl-mode=REQUIRED')
            } else if (effectiveTls === false) {
                args.push('--ssl-mode=DISABLED')
            } else if (tlsValue) {
                args.push(`--tls-version=${tlsValue}`)
            }
        }

        if (tlsVersion) {
            args.push(`--tls-version=${tlsVersion}`)
        }

        const directMappings: Record<string, string> = {
            'ssl-ca': 'ssl-ca',
            'ssl-cert': 'ssl-cert',
            'ssl-key': 'ssl-key',
            'ssl-cipher': 'ssl-cipher',
            charset: 'default-character-set',
            socket: 'socket',
        }

        for (const [key, optionName] of Object.entries(directMappings)) {
            const value = searchParams.get(key)?.trim()
            if (value) {
                args.push(`--${optionName}=${value}`)
            }
        }

        if (this.parseBooleanQuery(searchParams.get('compress')) === true) {
            args.push('--compress')
        }

        return args
    }

    /**
     * 解析本次备份目标数据库列表
     */
    private resolveTargetDatabases(): string[] {
        const configured = this.config.dumpOptions?.databases?.filter(Boolean)
        if (configured?.length) {
            return configured
        }

        if (this.config.connection.database) {
            return [this.config.connection.database]
        }

        try {
            const parsed = new URL(this.config.connection.uri)
            const pathname = parsed.pathname.replace(/^\//, '')
            if (pathname) {
                return [decodeURIComponent(pathname)]
            }
        } catch {
            // ignore and fall back to validation error path
        }

        return []
    }

    /**
     * 是否忽略某些 URI 查询参数，避免与显式参数重复
     */
    private shouldSkipQueryArg(key: string): boolean {
        return ['password', 'user', 'host', 'port', 'database', 'dbname'].includes(key)
    }

    /**
     * 解析 URI 查询参数中的布尔值
     */
    private parseBooleanQuery(value: string | null | undefined): QueryBoolean {
        if (!value) {
            return null
        }

        const normalized = value.trim().toLowerCase()
        if (['1', 'true', 'yes', 'on'].includes(normalized)) {
            return true
        }

        if (['0', 'false', 'no', 'off'].includes(normalized)) {
            return false
        }

        return null
    }

    /**
     * 处理 URL 中编码过的用户名密码
     */
    private decodeUrlComponent(value: string): string {
        try {
            return decodeURIComponent(value)
        } catch {
            return value
        }
    }

    /**
     * 提取更友好的错误信息
     */
    private extractErrorMessage(error: unknown): string {
        if (error instanceof Error) {
            const execError = error as Error & { stderr?: string, stdout?: string }
            const rawMessage = execError.stderr?.trim() || execError.stdout?.trim() || execError.message
            return this.normalizeErrorMessage(rawMessage)
        }

        return inspect(error)
    }

    /**
     * 清理客户端兼容性噪音，并为 TiDB 配额限制补充更明确的提示
     */
    private normalizeErrorMessage(message: string): string {
        const cleaned = message
            .split(/\r?\n/u)
            .map((line) => line.trim())
            .filter(Boolean)
            .filter((line) => !line.startsWith('mysqldump: Deprecated program name.'))
            .filter((line) => !line.startsWith('Info: Using unique option prefix \'tls\''))
            .filter((line) => !line.startsWith('WARNING: option --ssl-verify-server-cert is disabled'))
            .join('\n')

        if (cleaned.includes('Plugin caching_sha2_password could not be loaded')) {
            return [
                'MySQL 客户端缺少 caching_sha2_password 认证插件，当前无法连接使用 MySQL 8 默认认证方式的实例。',
                '如果你在 Alpine 或 Docker 环境中运行，请额外安装 mariadb-connector-c，确保 /usr/lib/mariadb/plugin/caching_sha2_password.so 存在。',
                '如果你在宿主机运行，请安装完整的 MySQL Client Tools 或 MariaDB Connector C 插件包后重试。',
                cleaned,
            ].filter(Boolean).join('\n')
        }

        if (cleaned.includes('Due to the usage quota being exhausted, access to the cluster has been restricted. Try increasing spending limits to gain full access. For more information, see https://docs.pingcap.com/tidbcloud/serverless-limitations#usage-quota')) {
            return [
                'TiDB 集群访问被限制：当前使用配额已耗尽，备份任务暂时无法连接数据库。',
                '请提升 TiDB Cloud spending limit，或等待配额恢复后再重试。',
                cleaned,
            ].filter(Boolean).join('\n')
        }

        return cleaned || message
    }
}
