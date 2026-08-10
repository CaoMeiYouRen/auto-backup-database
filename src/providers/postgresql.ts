import { execFile as execFileCallback } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { inspect, promisify } from 'node:util'
import dayjs from 'dayjs'
import { DatabaseProvider, type BackupResult } from './database'
import type { PostgresDumpFormat, PostgreSQLProjectConfig } from '@/types/config'

const execFile = promisify(execFileCallback)

/**
 * PostgreSQL 数据库提供者
 * 基于官方 pg_dump 工具生成单文件备份产物
 */
export class PostgreSQLProvider extends DatabaseProvider<PostgreSQLProjectConfig> {
    readonly type = 'postgresql' as const

    /**
     * 验证连接配置和 pg_dump / pg_dumpall 是否可用
     */
    async validatePath(): Promise<boolean> {
        if (!this.config.connection?.uri) {
            return false
        }

        try {
            await this.ensureExecutableAvailable()
            return true
        } catch {
            return false
        }
    }

    /**
     * PostgreSQL 不存在本地源文件列表，返回空数组以保持接口兼容
     */
    getDatabaseFiles(): Promise<string[]> {
        return Promise.resolve([])
    }

    /**
     * 执行 PostgreSQL 备份
     */
    async backup(outputDir: string): Promise<BackupResult> {
        const timestamp = new Date()
        const timestampStr = dayjs(timestamp).format('YYYY-MM-DD_HH-mm-ss')

        try {
            await this.ensureExecutableAvailable()

            const projectOutputDir = join(outputDir, this.config.name, timestampStr)
            if (!existsSync(projectOutputDir)) {
                await mkdir(projectOutputDir, { recursive: true })
            }

            const executable = this.getExecutable()
            const extension = this.getOutputExtension()
            const outputPath = join(projectOutputDir, `${this.config.name}-${timestampStr}.${extension}`)
            const args = this.dumpAll
                ? this.buildDumpAllArgs(outputPath)
                : this.buildDumpArgs(outputPath)

            await execFile(executable, args, {
                encoding: 'utf8',
                windowsHide: true,
                maxBuffer: 10 * 1024 * 1024,
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
     * 是否启用全库备份（pg_dumpall）
     */
    private get dumpAll(): boolean {
        return this.config.dumpOptions?.allDatabases === true
    }

    /**
     * 获取当前模式对应的可执行文件名
     */
    private getExecutable(): 'pg_dump' | 'pg_dumpall' {
        return this.dumpAll ? 'pg_dumpall' : 'pg_dump'
    }

    /**
     * 获取备份产物后缀
     */
    private getOutputExtension(): string {
        if (this.dumpAll) {
            return 'sql'
        }

        return this.getFileExtension(this.config.dumpOptions?.format ?? 'custom')
    }

    /**
     * 检查当前模式对应的命令行工具是否可用
     */
    private async ensureExecutableAvailable(): Promise<void> {
        const executable = this.getExecutable()

        try {
            await execFile(executable, ['--version'], {
                encoding: 'utf8',
                windowsHide: true,
            })
        } catch {
            const toolName = executable === 'pg_dumpall' ? 'pg_dumpall' : 'pg_dump'
            throw new Error(`未找到 ${toolName}，请安装 PostgreSQL 客户端工具，并确保 ${toolName} 已加入 PATH`)
        }
    }

    /**
     * 构造 pg_dump 参数
     */
    private buildDumpArgs(outputPath: string): string[] {
        const format = this.config.dumpOptions?.format ?? 'custom'
        const compression = this.resolveCompressionLevel(format)
        const connectionString = this.resolveConnectionString()

        const args = [
            `--dbname=${connectionString}`,
            `--file=${outputPath}`,
            `--format=${format}`,
            `--compress=${compression}`,
        ]

        if (this.config.dumpOptions?.schemaOnly) {
            args.push('--schema-only')
        }

        if (this.config.dumpOptions?.dataOnly) {
            args.push('--data-only')
        }

        if (this.config.dumpOptions?.clean) {
            args.push('--clean')
        }

        if (this.config.dumpOptions?.create) {
            args.push('--create')
        }

        if (this.config.dumpOptions?.noOwner) {
            args.push('--no-owner')
        }

        if (this.config.dumpOptions?.extraArgs?.length) {
            args.push(...this.config.dumpOptions.extraArgs)
        }

        return args
    }

    /**
     * 构造 pg_dumpall 参数（全库备份）
     * pg_dumpall 仅支持 plain SQL 脚本输出，且不区分单个数据库，
     * 连接串中的数据库名会被忽略，由 pg_dumpall 自动发现集群内全部数据库
     */
    private buildDumpAllArgs(outputPath: string): string[] {
        const args = [
            `--dbname=${this.config.connection.uri}`,
            `--file=${outputPath}`,
        ]

        if (this.config.dumpOptions?.schemaOnly) {
            args.push('--schema-only')
        }

        if (this.config.dumpOptions?.dataOnly) {
            args.push('--data-only')
        }

        if (this.config.dumpOptions?.clean) {
            args.push('--clean')
        }

        if (this.config.dumpOptions?.noOwner) {
            args.push('--no-owner')
        }

        if (this.config.dumpOptions?.extraArgs?.length) {
            args.push(...this.config.dumpOptions.extraArgs)
        }

        return args
    }

    /**
     * 根据格式确定输出文件后缀
     */
    private getFileExtension(format: PostgresDumpFormat): string {
        switch (format) {
            case 'plain':
                return 'sql'
            case 'tar':
                return 'tar'
            case 'custom':
            default:
                return 'dump'
        }
    }

    /**
     * 解析 pg_dump 内置压缩级别
     */
    private resolveCompressionLevel(format: PostgresDumpFormat): number {
        const configuredCompression = this.config.dumpOptions?.compression

        if (configuredCompression !== undefined) {
            return configuredCompression
        }

        if (format === 'tar') {
            return 0
        }

        return this.config.compress.enabled ? 0 : 6
    }

    /**
     * 补全连接串中的数据库名
     */
    private resolveConnectionString(): string {
        const { uri, database } = this.config.connection

        if (!database) {
            return uri
        }

        try {
            const parsed = new URL(uri)
            if (!parsed.pathname || parsed.pathname === '/') {
                parsed.pathname = `/${database}`
            }
            return parsed.toString()
        } catch {
            return uri
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
