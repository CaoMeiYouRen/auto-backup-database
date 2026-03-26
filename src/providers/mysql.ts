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

        throw new Error('未找到 mysqldump，请安装 MySQL Client Tools，并确保 mysqldump 已加入 PATH')
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

            for (const [key, value] of parsed.searchParams.entries()) {
                if (this.shouldSkipQueryArg(key)) {
                    continue
                }

                args.push(`--${key}=${value}`)
            }

            return { args, env }
        } catch {
            throw new Error('MySQL connection.uri 必须是有效的 mysql:// 连接串')
        }
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
            return execError.stderr?.trim() || execError.stdout?.trim() || execError.message
        }

        return inspect(error)
    }
}
