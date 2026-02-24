import { readdir, stat, unlink, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { parse } from 'better-bytes'
import dayjs from 'dayjs'
import type { RetentionConfig } from '@/types/config'

/**
 * 备份文件信息
 */
export interface BackupFileInfo {
    /** 文件路径 */
    path: string
    /** 文件名 */
    name: string
    /** 文件大小（字节） */
    size: number
    /** 创建时间 */
    createdAt: Date
}

/**
 * 清理结果
 */
export interface CleanupResult {
    /** 已删除的文件列表 */
    deletedFiles: string[]
    /** 释放的空间（字节） */
    freedSpace: number
    /** 是否成功 */
    success: boolean
    /** 错误信息 */
    error?: string
}

/**
 * 存储统计信息
 */
export interface StorageStats {
    /** 总文件数 */
    totalFiles: number
    /** 总占用空间（字节） */
    totalSize: number
    /** 最旧的备份时间 */
    oldestBackup?: Date
    /** 最新的备份时间 */
    newestBackup?: Date
}

/**
 * 本地存储管理器
 */
export class LocalStorage {
    private basePath: string
    private retention: RetentionConfig

    constructor(basePath: string, retention: RetentionConfig) {
        this.basePath = basePath
        this.retention = retention
    }

    /**
     * 确保存储目录存在
     */
    async ensureDir(): Promise<void> {
        if (!existsSync(this.basePath)) {
            await mkdir(this.basePath, { recursive: true })
        }
    }

    /**
     * 获取所有备份文件列表
     */
    async getBackupFiles(): Promise<BackupFileInfo[]> {
        if (!existsSync(this.basePath)) {
            return []
        }

        const files = await readdir(this.basePath)
        const backupFiles: BackupFileInfo[] = []

        for (const file of files) {
            const filePath = join(this.basePath, file)
            const stats = await stat(filePath)

            if (stats.isDirectory()) {
                // 如果是目录，获取目录下的所有备份文件
                const subFiles = await this.getBackupFilesInDir(filePath)
                backupFiles.push(...subFiles)
            } else if (stats.isFile()) {
                backupFiles.push({
                    path: filePath,
                    name: file,
                    size: stats.size,
                    createdAt: stats.birthtime,
                })
            }
        }

        // 按创建时间排序（旧的在前）
        return backupFiles.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    }

    /**
     * 获取目录下的备份文件
     */
    private async getBackupFilesInDir(dirPath: string): Promise<BackupFileInfo[]> {
        const files = await readdir(dirPath)
        const backupFiles: BackupFileInfo[] = []

        for (const file of files) {
            const filePath = join(dirPath, file)
            const stats = await stat(filePath)

            if (stats.isFile()) {
                backupFiles.push({
                    path: filePath,
                    name: file,
                    size: stats.size,
                    createdAt: stats.birthtime,
                })
            }
        }

        return backupFiles
    }

    /**
     * 获取存储统计信息
     */
    async getStats(): Promise<StorageStats> {
        const files = await this.getBackupFiles()

        if (files.length === 0) {
            return {
                totalFiles: 0,
                totalSize: 0,
            }
        }

        const totalSize = files.reduce((sum, file) => sum + file.size, 0)
        const sortedByDate = [...files].sort(
            (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
        )

        return {
            totalFiles: files.length,
            totalSize,
            oldestBackup: sortedByDate[0].createdAt,
            newestBackup: sortedByDate[sortedByDate.length - 1].createdAt,
        }
    }

    /**
     * 清理过期的备份文件
     */
    async cleanup(): Promise<CleanupResult> {
        try {
            const files = await this.getBackupFiles()
            const now = dayjs()
            const maxAge = this.retention.days
            const maxSizeBytes = this.parseSize(this.retention.maxSize)

            const deletedFiles: string[] = []
            let freedSpace = 0

            // 1. 按天数清理
            for (const file of files) {
                const fileAge = now.diff(dayjs(file.createdAt), 'day')
                if (fileAge > maxAge) {
                    await unlink(file.path)
                    deletedFiles.push(file.path)
                    freedSpace += file.size
                }
            }

            // 2. 按大小清理（如果超过最大限制）
            const remainingFiles = files.filter((f) => !deletedFiles.includes(f.path))
            let currentSize = remainingFiles.reduce((sum, f) => sum + f.size, 0)

            // 按时间排序，删除最旧的文件直到满足大小限制
            const sortedFiles = remainingFiles.sort(
                (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
            )

            for (const file of sortedFiles) {
                if (currentSize <= maxSizeBytes) {
                    break
                }

                await unlink(file.path)
                deletedFiles.push(file.path)
                freedSpace += file.size
                currentSize -= file.size
            }

            return {
                deletedFiles,
                freedSpace,
                success: true,
            }
        } catch (error) {
            return {
                deletedFiles: [],
                freedSpace: 0,
                success: false,
                error: error instanceof Error ? error.message : String(error),
            }
        }
    }

    /**
     * 解析大小字符串为字节数
     */
    private parseSize(sizeStr: string): number {
        const result = parse(sizeStr)
        if (result === null) {
            throw new Error(`无法解析大小字符串: ${sizeStr}`)
        }
        return typeof result === 'bigint' ? Number(result) : result
    }

    /**
     * 检查是否需要清理
     */
    async needsCleanup(): Promise<boolean> {
        const stats = await this.getStats()
        const maxSizeBytes = this.parseSize(this.retention.maxSize)

        // 检查是否超过大小限制
        if (stats.totalSize > maxSizeBytes) {
            return true
        }

        // 检查是否有过期文件
        const files = await this.getBackupFiles()
        const now = dayjs()
        for (const file of files) {
            const fileAge = now.diff(dayjs(file.createdAt), 'day')
            if (fileAge > this.retention.days) {
                return true
            }
        }

        return false
    }
}
