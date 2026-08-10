import { basename, extname, join } from 'node:path'
import { copyFile, cp, mkdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { glob } from 'glob'
import dayjs from 'dayjs'
import { DatabaseProvider, type BackupResult } from './database'
import type { FileProjectConfig } from '@/types/config'

/**
 * 生成不冲突的目标路径
 * 若同名文件已存在，在文件名前追加序号（如 app.zip -> app-1.zip）
 */
function uniqueDestPath(dir: string, name: string): string {
    let candidate = join(dir, name)
    let index = 1

    while (existsSync(candidate)) {
        const ext = extname(name)
        const stem = name.slice(0, name.length - ext.length)
        candidate = join(dir, `${stem}-${index}${ext}`)
        index++
    }

    return candidate
}

/**
 * 通用文件/文件夹备份提供者
 * 支持直接备份指定的文件或文件夹，保留源目录结构
 */
export class FileProvider extends DatabaseProvider<FileProjectConfig> {
    readonly type = 'file' as const

    /**
     * 验证路径是否有效
     */
    async validatePath(): Promise<boolean> {
        const files = await this.getDatabaseFiles()
        return files.length > 0
    }

    /**
     * 获取匹配的文件或目录列表
     */
    async getDatabaseFiles(): Promise<string[]> {
        const results: string[] = []

        for (const pattern of this.config.paths) {
            const matches = await glob(pattern, {
                absolute: true,
            })

            for (const match of matches) {
                if (!results.includes(match)) {
                    results.push(match)
                }
            }
        }

        return results
    }

    /**
     * 执行备份
     * @param outputDir 输出目录
     */
    async backup(outputDir: string): Promise<BackupResult> {
        const timestamp = new Date()
        const timestampStr = dayjs(timestamp).format('YYYY-MM-DD_HH-mm-ss')

        try {
            // 获取匹配的文件或目录列表
            const sources = await this.getDatabaseFiles()

            if (sources.length === 0) {
                return {
                    projectName: this.config.name,
                    backupFiles: [],
                    timestamp,
                    success: false,
                    error: `未找到匹配的文件或文件夹: ${this.config.paths.join(', ')}`,
                }
            }

            // 创建输出目录
            const projectOutputDir = join(outputDir, this.config.name, timestampStr)
            await mkdir(projectOutputDir, { recursive: true })

            // 复制文件或目录
            const backupFiles: string[] = []
            for (const source of sources) {
                const sourceStats = await stat(source)

                if (sourceStats.isDirectory()) {
                    // 目录：递归复制，保留目录名，同名目录内容合并
                    const destDir = join(projectOutputDir, basename(source))
                    await cp(source, destDir, { recursive: true })
                    backupFiles.push(destDir)
                } else {
                    // 文件：直接复制，重名时追加序号避免覆盖
                    const destPath = uniqueDestPath(projectOutputDir, basename(source))
                    await copyFile(source, destPath)
                    backupFiles.push(destPath)
                }
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
