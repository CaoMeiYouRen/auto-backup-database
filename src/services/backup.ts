import { join, basename } from 'node:path'
import { rm, copyFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import Debug from 'debug'
import type { FullConfig, ProjectConfig } from '@/types/config'
import { DatabaseProvider } from '@/providers/database'
import { MongoDBProvider } from '@/providers/mongodb'
import { SQLiteProvider } from '@/providers/sqlite'
import { compressDirectory } from '@/utils/compress'
import { encryptAndDelete } from '@/utils/encrypt'
import { LocalStorage } from '@/storage/local'
import { OSSStorage, type UploadResult } from '@/storage/oss'
import { NotifyService } from '@/notify'
import type { BackupTaskResult } from '@/types/backup'

const debug = Debug('backup:service')

/**
 * 备份服务配置
 */
export interface BackupServiceConfig {
    /** 项目配置 */
    project: ProjectConfig
    /** 完整配置 */
    fullConfig: FullConfig
    /** 本地备份根目录 */
    localBackupDir: string
    /** 临时目录 */
    tempDir: string
    /** 通知服务（可选） */
    notifyService?: NotifyService
}

/**
 * 备份服务
 * 整合数据库备份、压缩、加密、存储、通知等功能
 */
export class BackupService {
    private config: BackupServiceConfig
    private notifyService?: NotifyService

    constructor(config: BackupServiceConfig) {
        this.config = config
        this.notifyService = config.notifyService
    }

    /**
     * 执行完整的备份流程
     */
    async run(): Promise<BackupTaskResult> {
        const { project, fullConfig, localBackupDir, tempDir } = this.config
        debug(`开始备份项目: ${project.name}`)

        const result: BackupTaskResult = {
            projectName: project.name,
            backup: {
                projectName: project.name,
                backupFiles: [],
                timestamp: new Date(),
                success: false,
            },
            overallSuccess: false,
        }

        try {
            // 1. 创建数据库提供者并执行备份
            const provider = this.createProvider(project)
            const backupResult = await provider.backup(tempDir)
            result.backup = backupResult

            if (!backupResult.success) {
                debug(`备份失败: ${backupResult.error}`)
                await this.notifyFailed(result)
                return result
            }

            debug(`数据库备份完成，文件数: ${backupResult.backupFiles.length}`)

            // 2. 压缩备份文件
            if (project.compress.enabled) {
                const backupDir = join(tempDir, project.name)
                const compressResult = await compressDirectory(backupDir, join(tempDir, `${project.name}-backup`))

                result.compress = {
                    success: compressResult.success,
                    compressedFile: compressResult.compressedFile,
                    originalSize: compressResult.originalSize,
                    compressedSize: compressResult.compressedSize,
                    error: compressResult.error,
                }

                if (!compressResult.success) {
                    debug(`压缩失败: ${compressResult.error}`)
                    await this.notifyFailed(result)
                    return result
                }

                debug(`压缩完成: ${compressResult.compressedFile}`)

                // 3. 加密（如果配置了密码）
                if (project.compress.password) {
                    if (!fullConfig.security?.backupPassword) {
                        debug('加密失败: 配置了密码加密但未在配置中设置 security.backupPassword')
                        result.encrypt = {
                            success: false,
                            error: '未设置 security.backupPassword',
                        }
                    } else {
                        const encryptResult = await encryptAndDelete(
                            compressResult.compressedFile,
                            fullConfig.security.backupPassword,
                        )

                        result.encrypt = {
                            success: encryptResult.success,
                            error: encryptResult.error,
                        }

                        if (!encryptResult.success) {
                            debug(`加密失败: ${encryptResult.error}`)
                        } else {
                            debug(`加密完成: ${encryptResult.encryptedFile}`)
                            // 更新压缩文件路径为加密后的文件
                            result.compress.compressedFile = encryptResult.encryptedFile
                        }
                    }

                    if (!result.encrypt.success) {
                        await this.notifyFailed(result)
                        return result
                    }
                }
            }

            // 4. 本地存储
            if (project.options.localEnabled) {
                const localResult = await this.saveToLocal(result, localBackupDir)
                result.localUpload = localResult

                if (!localResult.success) {
                    debug(`本地存储失败: ${localResult.error}`)
                } else {
                    debug(`本地存储完成`)
                }
            }

            // 5. 远程上传
            if (project.options.remoteEnabled) {
                const remoteResult = await this.uploadToRemote(result)
                result.remoteUpload = remoteResult

                if (!remoteResult.success) {
                    debug(`远程上传失败: ${remoteResult.error}`)
                } else {
                    debug(`远程上传完成`)
                }
            }

            // 6. 清理旧备份
            await this.cleanupOldBackups(result, localBackupDir)

            // 7. 清理临时文件
            await this.cleanupTempFiles(tempDir)

            // 判断整体成功
            result.overallSuccess = this.evaluateSuccess(result)

            // 发送成功通知
            if (result.overallSuccess) {
                await this.notifySuccess(result)
            } else {
                await this.notifyFailed(result)
            }

            debug(`备份完成: ${project.name}, 成功: ${result.overallSuccess}`)
            return result
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            debug(`备份异常: ${errorMessage}`)
            result.backup.error = errorMessage
            await this.notifyFailed(result)
            return result
        }
    }

    /**
     * 创建数据库提供者
     */
    private createProvider(project: ProjectConfig): DatabaseProvider {
        switch (project.dbType) {
            case 'sqlite':
                return new SQLiteProvider(project)
            case 'mongodb':
                return new MongoDBProvider(project)
            default:
                throw new Error(`不支持的数据库类型: ${project.dbType}`)
        }
    }

    /**
     * 保存到本地存储
     */
    private async saveToLocal(
        result: BackupTaskResult,
        localBackupDir: string,
    ): Promise<{ success: boolean, error?: string }> {
        try {
            const { project } = this.config
            const artifactPaths = this.getTransferSourcePaths(result)

            if (artifactPaths.length === 0) {
                return { success: false, error: '备份产物不存在' }
            }

            const missingArtifact = artifactPaths.find((artifactPath) => !existsSync(artifactPath))
            if (missingArtifact) {
                return { success: false, error: `备份产物不存在: ${missingArtifact}` }
            }

            const localStorage = new LocalStorage(
                join(localBackupDir, project.name),
                project.retention.local,
            )

            await localStorage.ensureDir()

            // 这里需要将压缩文件移动到本地存储目录
            // 由于 LocalStorage 主要管理目录，我们直接复制文件
            const destDir = join(localBackupDir, project.name)
            if (!existsSync(destDir)) {
                await mkdir(destDir, { recursive: true })
            }

            for (const artifactPath of artifactPaths) {
                const destFile = join(destDir, basename(artifactPath))
                await copyFile(artifactPath, destFile)
            }

            return { success: true }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
            }
        }
    }

    /**
     * 上传到远程存储
     */
    private async uploadToRemote(
        result: BackupTaskResult,
    ): Promise<{ success: boolean, results?: UploadResult[], error?: string }> {
        try {
            const { project, fullConfig } = this.config
            const artifactPaths = this.getTransferSourcePaths(result)

            if (artifactPaths.length === 0) {
                return { success: false, error: '备份产物不存在' }
            }

            const missingArtifact = artifactPaths.find((artifactPath) => !existsSync(artifactPath))
            if (missingArtifact) {
                return { success: false, error: `备份产物不存在: ${missingArtifact}` }
            }

            if (!fullConfig.oss) {
                return { success: false, error: '缺少 oss 配置' }
            }

            const ossStorage = new OSSStorage(fullConfig.oss, project.retention.remote, `backups/${project.name}`)

            const uploadResults = await ossStorage.uploadFiles(artifactPaths)
            const failedResults = uploadResults.filter((uploadResult) => !uploadResult.success)

            return {
                success: failedResults.length === 0,
                results: uploadResults,
                error: failedResults.length > 0
                    ? failedResults.map((uploadResult) => uploadResult.error || uploadResult.key).join('; ')
                    : undefined,
            }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
            }
        }
    }

    /**
     * 清理旧备份
     */
    private async cleanupOldBackups(
        result: BackupTaskResult,
        localBackupDir: string,
    ): Promise<void> {
        const { project, fullConfig } = this.config

        // 清理本地
        if (project.options.localEnabled) {
            try {
                const localStorage = new LocalStorage(
                    join(localBackupDir, project.name),
                    project.retention.local,
                )
                const cleanupResult = await localStorage.cleanup()
                result.localCleanup = cleanupResult
                debug(`本地清理完成，删除 ${cleanupResult.deletedFiles.length} 个文件`)
            } catch (error) {
                debug(`本地清理失败: ${error}`)
            }
        }

        // 清理远程
        if (project.options.remoteEnabled) {
            try {
                if (!fullConfig.oss) {
                    debug('远程清理跳过: 缺少 oss 配置')
                    return
                }

                const ossStorage = new OSSStorage(fullConfig.oss, project.retention.remote, `backups/${project.name}`)
                const cleanupResult = await ossStorage.cleanup()
                result.remoteCleanup = {
                    deletedFiles: cleanupResult.deletedFiles,
                    freedSpace: cleanupResult.freedSpace,
                    success: cleanupResult.success,
                    error: cleanupResult.error,
                }
                debug(`远程清理完成，删除 ${cleanupResult.deletedFiles.length} 个文件`)
            } catch (error) {
                debug(`远程清理失败: ${error}`)
            }
        }
    }

    /**
     * 清理临时文件
     */
    private async cleanupTempFiles(tempDir: string): Promise<void> {
        try {
            if (existsSync(tempDir)) {
                await rm(tempDir, { recursive: true, force: true })
            }
        } catch (error) {
            debug(`清理临时文件失败: ${error}`)
        }
    }

    /**
     * 评估整体成功
     */
    private evaluateSuccess(result: BackupTaskResult): boolean {
        // 备份必须成功
        if (!result.backup.success) {
            return false
        }

        // 如果启用压缩，压缩必须成功
        if (this.config.project.compress.enabled && !result.compress?.success) {
            return false
        }

        // 如果启用加密，加密必须成功
        if (this.config.project.compress.password && !result.encrypt?.success) {
            return false
        }

        // 至少有一个存储成功
        const localSuccess = !this.config.project.options.localEnabled || result.localUpload?.success === true
        const remoteSuccess = !this.config.project.options.remoteEnabled || result.remoteUpload?.success === true

        return localSuccess || remoteSuccess
    }

    /**
     * 获取可用于传输的备份产物路径
     */
    private getTransferSourcePaths(result: BackupTaskResult): string[] {
        if (result.compress?.compressedFile) {
            return [result.compress.compressedFile]
        }

        return result.backup.backupFiles
    }

    /**
     * 发送成功通知
     */
    private async notifySuccess(result: BackupTaskResult): Promise<void> {
        if (this.notifyService) {
            await this.notifyService.notifyBackupSuccess(result)
        }
    }

    /**
     * 发送失败通知
     */
    private async notifyFailed(result: BackupTaskResult): Promise<void> {
        if (this.notifyService) {
            await this.notifyService.notifyBackupFailed(result)
        }
    }
}
