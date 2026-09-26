import { readdir, stat, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { parse } from 'better-bytes'
import dayjs from 'dayjs'
import { removeRecursive } from '@/utils/file'
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
 * 备份集信息
 * 一次备份任务产生的一组文件（时间戳目录或单个散文件），清理时整体删除
 */
export interface BackupSetInfo {
    /** 备份集路径（目录或单文件） */
    path: string
    /** 备份集名称 */
    name: string
    /** 是否为目录 */
    isDirectory: boolean
    /** 备份集内的文件 */
    files: BackupFileInfo[]
    /** 备份集总大小（字节） */
    size: number
    /** 备份集创建时间 */
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
        const sets = await this.getBackupSets()
        const files = sets.flatMap((set) => set.files)

        // 按创建时间排序（旧的在前）
        return files.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    }

    /**
     * 获取所有备份集列表
     * 一级子目录视为一个备份集，根目录下的散文件各自视为独立备份集
     */
    async getBackupSets(): Promise<BackupSetInfo[]> {
        if (!existsSync(this.basePath)) {
            return []
        }

        const entries = await readdir(this.basePath)
        const sets: BackupSetInfo[] = []

        for (const entry of entries) {
            const entryPath = join(this.basePath, entry)
            const stats = await stat(entryPath)

            if (stats.isDirectory()) {
                const files = await this.collectFiles(entryPath)
                const oldest = files.reduce(
                    (min, file) => (file.createdAt.getTime() < min.getTime() ? file.createdAt : min),
                    files[0]?.createdAt ?? (stats.birthtime || stats.mtime),
                )
                sets.push({
                    path: entryPath,
                    name: entry,
                    isDirectory: true,
                    files,
                    size: files.reduce((sum, file) => sum + file.size, 0),
                    createdAt: oldest,
                })
            } else if (stats.isFile()) {
                const file: BackupFileInfo = {
                    path: entryPath,
                    name: entry,
                    size: stats.size,
                    // 使用 birthtime，如果不可用则使用 mtime
                    createdAt: stats.birthtime || stats.mtime,
                }
                sets.push({
                    path: entryPath,
                    name: entry,
                    isDirectory: false,
                    files: [file],
                    size: stats.size,
                    createdAt: file.createdAt,
                })
            }
        }

        // 按创建时间排序（旧的在前）
        return sets.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    }

    /**
     * 递归收集目录下的所有文件
     */
    private async collectFiles(dirPath: string): Promise<BackupFileInfo[]> {
        const entries = await readdir(dirPath)
        const backupFiles: BackupFileInfo[] = []

        for (const entry of entries) {
            const filePath = join(dirPath, entry)
            const stats = await stat(filePath)

            if (stats.isDirectory()) {
                backupFiles.push(...await this.collectFiles(filePath))
            } else if (stats.isFile()) {
                backupFiles.push({
                    path: filePath,
                    name: entry,
                    size: stats.size,
                    // 使用 birthtime，如果不可用则使用 mtime
                    createdAt: stats.birthtime || stats.mtime,
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
     * 清理过期的备份（按备份集整体删除，目录一并移除）
     */
    async cleanup(): Promise<CleanupResult> {
        try {
            const sets = await this.getBackupSets()
            const now = dayjs()
            const maxAge = this.retention.days
            const maxSizeBytes = this.parseSize(this.retention.maxSize)

            const deletedFiles: string[] = []
            const deletedSetPaths = new Set<string>()
            let freedSpace = 0

            // 0. 清理空的备份目录（不含任何文件，属于历史残留）
            for (const set of sets) {
                if (set.isDirectory && set.files.length === 0) {
                    await this.deleteSet(set)
                    deletedSetPaths.add(set.path)
                }
            }

            // 1. 按天数清理
            for (const set of sets) {
                const setAge = now.diff(dayjs(set.createdAt), 'day')
                if (setAge > maxAge) {
                    await this.deleteSet(set)
                    deletedSetPaths.add(set.path)
                    deletedFiles.push(...set.files.map((file) => file.path))
                    freedSpace += set.size
                }
            }

            // 2. 按大小清理（如果超过最大限制，从最旧的备份集开始整体删除）
            const remainingSets = sets.filter((set) => !deletedSetPaths.has(set.path))
            let currentSize = remainingSets.reduce((sum, set) => sum + set.size, 0)

            for (const set of remainingSets) {
                if (currentSize <= maxSizeBytes) {
                    break
                }

                await this.deleteSet(set)
                deletedSetPaths.add(set.path)
                deletedFiles.push(...set.files.map((file) => file.path))
                freedSpace += set.size
                currentSize -= set.size
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
     * 删除整个备份集（含目录）
     */
    private async deleteSet(set: BackupSetInfo): Promise<void> {
        await removeRecursive(set.path)
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
        const sets = await this.getBackupSets()
        const maxSizeBytes = this.parseSize(this.retention.maxSize)

        // 检查是否超过大小限制
        const totalSize = sets.reduce((sum, set) => sum + set.size, 0)
        if (totalSize > maxSizeBytes) {
            return true
        }

        // 检查是否有过期备份集
        const now = dayjs()
        for (const set of sets) {
            const setAge = now.diff(dayjs(set.createdAt), 'day')
            if (setAge > this.retention.days) {
                return true
            }
        }

        return false
    }
}
