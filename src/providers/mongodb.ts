import { execFile as execFileCallback } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import dayjs from 'dayjs'
import { DatabaseProvider, type BackupResult } from './database'
import type { MongoDBProjectConfig } from '@/types/config'

const execFile = promisify(execFileCallback)

/**
 * MongoDB 数据库提供者
 * 基于官方 mongodump 工具生成 archive 备份文件
 */
export class MongoDBProvider extends DatabaseProvider<MongoDBProjectConfig> {
    readonly type = 'mongodb' as const

    /**
     * 验证连接配置和 mongodump 是否可用
     */
    async validatePath(): Promise<boolean> {
        if (!this.config.connection?.uri) {
            return false
        }

        try {
            await this.ensureMongodumpAvailable()
            return true
        } catch {
            return false
        }
    }

    /**
     * MongoDB 不存在源文件列表，返回空数组以保持接口兼容
     */
    async getDatabaseFiles(): Promise<string[]> {
        return []
    }

    /**
     * 执行 MongoDB 备份
     */
    async backup(outputDir: string): Promise<BackupResult> {
        const timestamp = new Date()
        const timestampStr = dayjs(timestamp).format('YYYY-MM-DD_HH-mm-ss')

        try {
            await this.ensureMongodumpAvailable()

            const projectOutputDir = join(outputDir, this.config.name, timestampStr)
            if (!existsSync(projectOutputDir)) {
                await mkdir(projectOutputDir, { recursive: true })
            }

            const archiveName = `${this.config.name}-${timestampStr}.archive${this.config.dumpOptions?.gzip ? '.gz' : ''}`
            const archivePath = join(projectOutputDir, archiveName)
            const args = this.buildDumpArgs(archivePath)

            await execFile('mongodump', args, {
                encoding: 'utf8',
                windowsHide: true,
                maxBuffer: 10 * 1024 * 1024,
            })

            return {
                projectName: this.config.name,
                backupFiles: [archivePath],
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
     * 检查 mongodump 是否可用
     */
    private async ensureMongodumpAvailable(): Promise<void> {
        try {
            await execFile('mongodump', ['--version'], {
                encoding: 'utf8',
                windowsHide: true,
            })
        } catch {
            throw new Error('未找到 mongodump，请安装 MongoDB Database Tools，并确保 mongodump 已加入 PATH')
        }
    }

    /**
     * 构造 mongodump 参数
     */
    private buildDumpArgs(archivePath: string): string[] {
        const args = [
            `--uri=${this.config.connection.uri}`,
            `--archive=${archivePath}`,
        ]

        if (this.config.connection.database && !this.hasDatabaseNameInUri(this.config.connection.uri)) {
            args.push(`--db=${this.config.connection.database}`)
        }

        if (this.config.dumpOptions?.authenticationDatabase) {
            args.push(`--authenticationDatabase=${this.config.dumpOptions.authenticationDatabase}`)
        }

        if (this.config.dumpOptions?.readPreference) {
            args.push(`--readPreference=${this.config.dumpOptions.readPreference}`)
        }

        if (this.config.dumpOptions?.gzip) {
            args.push('--gzip')
        }

        if (this.config.dumpOptions?.extraArgs?.length) {
            args.push(...this.config.dumpOptions.extraArgs)
        }

        return args
    }

    /**
     * 检查 URI 中是否已经包含数据库名，避免与 --db 重复传参
     */
    private hasDatabaseNameInUri(uri: string): boolean {
        try {
            const parsed = new URL(uri)
            return parsed.pathname.length > 1
        } catch {
            return false
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

        return String(error)
    }
}
