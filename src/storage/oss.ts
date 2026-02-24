import { readFile, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import {
    S3Client,
    PutObjectCommand,
    ListObjectsV2Command,
    DeleteObjectCommand,
} from '@aws-sdk/client-s3'
import { parse } from 'better-bytes'
import dayjs from 'dayjs'
import { getMimeType } from '@/utils/file'
import type { OSSConfig, RetentionConfig } from '@/types/config'

/**
 * OSS 文件信息
 */
export interface OSSFileInfo {
    /** 文件键（路径） */
    key: string
    /** 文件名 */
    name: string
    /** 文件大小（字节） */
    size: number
    /** 最后修改时间 */
    lastModified: Date
}

/**
 * 上传结果
 */
export interface UploadResult {
    /** 文件键 */
    key: string
    /** 是否成功 */
    success: boolean
    /** 错误信息 */
    error?: string
}

/**
 * OSS 清理结果
 */
export interface OSSCleanupResult {
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
 * OSS 存储管理器
 * 兼容 S3 协议，支持阿里云 OSS、腾讯云 COS、AWS S3 等
 */
export class OSSStorage {
    private client: S3Client
    private bucket: string
    private retention: RetentionConfig
    private prefix: string

    constructor(config: OSSConfig, retention: RetentionConfig, prefix: string = 'backups') {
        this.bucket = config.bucket
        this.retention = retention
        this.prefix = prefix

        this.client = new S3Client({
            region: config.region,
            endpoint: config.endpoint,
            credentials: {
                accessKeyId: config.accessKeyId,
                secretAccessKey: config.accessKeySecret,
            },
            // 强制使用 path-style 访问（兼容阿里云 OSS 等）
            forcePathStyle: config.endpoint.includes('aliyuncs'),
        })
    }

    /**
     * 上传文件到 OSS
     * @param filePath 本地文件路径
     * @param remoteKey 远程文件键（可选，默认使用文件名）
     */
    async uploadFile(filePath: string, remoteKey?: string): Promise<UploadResult> {
        const fileName = remoteKey || this.generateRemoteKey(basename(filePath))

        try {
            const fileContent = await readFile(filePath)
            const stats = await stat(filePath)

            await this.client.send(
                new PutObjectCommand({
                    Bucket: this.bucket,
                    Key: fileName,
                    Body: fileContent,
                    ContentLength: stats.size,
                    ContentType: getMimeType(fileName),
                    // 设置为私有权限
                    ACL: 'private',
                }),
            )

            return {
                key: fileName,
                success: true,
            }
        } catch (error) {
            return {
                key: fileName,
                success: false,
                error: error instanceof Error ? error.message : String(error),
            }
        }
    }

    /**
     * 批量上传文件
     */
    async uploadFiles(filePaths: string[], remoteKeys?: string[]): Promise<UploadResult[]> {
        const results: UploadResult[] = []

        for (let i = 0; i < filePaths.length; i++) {
            const result = await this.uploadFile(filePaths[i], remoteKeys?.[i])
            results.push(result)
        }

        return results
    }

    /**
     * 获取所有备份文件列表
     */
    async getBackupFiles(): Promise<OSSFileInfo[]> {
        const files: OSSFileInfo[] = []
        let continuationToken: string | undefined

        do {
            const response = await this.client.send(
                new ListObjectsV2Command({
                    Bucket: this.bucket,
                    Prefix: this.prefix,
                    ContinuationToken: continuationToken,
                }),
            )

            if (response.Contents) {
                for (const object of response.Contents) {
                    if (object.Key && object.Size !== undefined && object.LastModified) {
                        files.push({
                            key: object.Key,
                            name: basename(object.Key),
                            size: object.Size,
                            lastModified: object.LastModified,
                        })
                    }
                }
            }

            continuationToken = response.NextContinuationToken
        } while (continuationToken)

        // 按最后修改时间排序（旧的在前）
        return files.sort((a, b) => a.lastModified.getTime() - b.lastModified.getTime())
    }

    /**
     * 删除文件
     */
    async deleteFile(key: string): Promise<boolean> {
        try {
            await this.client.send(
                new DeleteObjectCommand({
                    Bucket: this.bucket,
                    Key: key,
                }),
            )
            return true
        } catch {
            return false
        }
    }

    /**
     * 清理过期的备份文件
     */
    async cleanup(): Promise<OSSCleanupResult> {
        try {
            const files = await this.getBackupFiles()
            const now = dayjs()
            const maxAge = this.retention.days
            const maxSizeBytes = this.parseSize(this.retention.maxSize)

            const deletedFiles: string[] = []
            let freedSpace = 0

            // 1. 按天数清理
            for (const file of files) {
                const fileAge = now.diff(dayjs(file.lastModified), 'day')
                if (fileAge > maxAge) {
                    await this.deleteFile(file.key)
                    deletedFiles.push(file.key)
                    freedSpace += file.size
                }
            }

            // 2. 按大小清理
            const remainingFiles = files.filter((f) => !deletedFiles.includes(f.key))
            let currentSize = remainingFiles.reduce((sum, f) => sum + f.size, 0)

            // 按时间排序，删除最旧的文件直到满足大小限制
            const sortedFiles = remainingFiles.sort(
                (a, b) => a.lastModified.getTime() - b.lastModified.getTime(),
            )

            for (const file of sortedFiles) {
                if (currentSize <= maxSizeBytes) {
                    break
                }

                await this.deleteFile(file.key)
                deletedFiles.push(file.key)
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
     * 生成远程文件键
     */
    private generateRemoteKey(fileName: string): string {
        const timestamp = dayjs().format('YYYY-MM-DD')
        return join(this.prefix, timestamp, fileName).replace(/\\/g, '/')
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
     * 获取存储统计信息
     */
    async getStats(): Promise<{
        totalFiles: number
        totalSize: number
        oldestBackup?: Date
        newestBackup?: Date
    }> {
        const files = await this.getBackupFiles()

        if (files.length === 0) {
            return {
                totalFiles: 0,
                totalSize: 0,
            }
        }

        const totalSize = files.reduce((sum, file) => sum + file.size, 0)
        const sortedByDate = [...files].sort(
            (a, b) => a.lastModified.getTime() - b.lastModified.getTime(),
        )

        return {
            totalFiles: files.length,
            totalSize,
            oldestBackup: sortedByDate[0].lastModified,
            newestBackup: sortedByDate[sortedByDate.length - 1].lastModified,
        }
    }
}
