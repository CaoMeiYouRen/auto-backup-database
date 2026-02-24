import { basename, join } from 'node:path'
import { copyFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { glob } from 'glob'
import dayjs from 'dayjs'
import { DatabaseProvider, type BackupResult } from './database'

/**
 * SQLite 数据库提供者
 * 通过文件拷贝实现备份
 */
export class SQLiteProvider extends DatabaseProvider {
    readonly type = 'sqlite' as const

    /**
     * 验证数据库路径是否有效
     */
    async validatePath(): Promise<boolean> {
        const files = await this.getDatabaseFiles()
        return files.length > 0
    }

    /**
     * 获取匹配的数据库文件列表
     */
    async getDatabaseFiles(): Promise<string[]> {
        return glob(this.config.dbPath, {
            nodir: true,
            absolute: true,
        })
    }

    /**
     * 执行备份
     * @param outputDir 输出目录
     */
    async backup(outputDir: string): Promise<BackupResult> {
        const timestamp = new Date()
        const timestampStr = dayjs(timestamp).format('YYYY-MM-DD_HH-mm-ss')

        try {
            // 获取数据库文件列表
            const dbFiles = await this.getDatabaseFiles()

            if (dbFiles.length === 0) {
                return {
                    projectName: this.config.name,
                    backupFiles: [],
                    timestamp,
                    success: false,
                    error: `未找到匹配的数据库文件: ${this.config.dbPath}`,
                }
            }

            // 创建输出目录
            const projectOutputDir = join(outputDir, this.config.name, timestampStr)
            if (!existsSync(projectOutputDir)) {
                await mkdir(projectOutputDir, { recursive: true })
            }

            // 拷贝文件
            const backupFiles: string[] = []
            for (const dbFile of dbFiles) {
                const fileName = basename(dbFile)
                const destPath = join(projectOutputDir, fileName)
                await copyFile(dbFile, destPath)
                backupFiles.push(destPath)
            }

            return {
                projectName: this.config.name,
                backupFiles,
                timestamp,
                success: true,
            }
        } catch (error) {
            return {
                projectName: this.config.name,
                backupFiles: [],
                timestamp,
                success: false,
                error: error instanceof Error ? error.message : String(error),
            }
        }
    }
}
