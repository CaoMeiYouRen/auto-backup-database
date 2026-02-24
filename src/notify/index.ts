import { runPushAllInOne, type PushType, type MetaPushConfig } from 'push-all-in-one'
import { format } from 'better-bytes'
import type { BackupResult } from '@/providers/database'
import type { CleanupResult } from '@/storage/local'
/**
 * 通知事件类型
 */
export type NotifyEventType = 'backup_success' | 'backup_failed' | 'cleanup_success' | 'cleanup_failed'

/**
 * 通知配置
 */
export interface NotifyConfig {
    /** 推送类型 */
    type: PushType
    /** 推送配置 */
    config: MetaPushConfig['config']
    /** 推送选项 */
    options?: MetaPushConfig['option']
    /** 是否启用 */
    enabled: boolean
}

/**
 * 通知结果
 */
export interface NotifyResult {
    /** 是否成功 */
    success: boolean
    /** 错误信息 */
    error?: string
}

/**
 * 通知服务
 * 基于 push-all-in-one 实现多渠道消息推送
 */
export class NotifyService {
    private config: NotifyConfig

    constructor(config: NotifyConfig) {
        this.config = config
    }

    /**
     * 发送通知
     */
    async send(title: string, content: string): Promise<NotifyResult> {
        if (!this.config.enabled) {
            return { success: true }
        }

        try {
            const pushConfig: MetaPushConfig = {
                type: this.config.type,
                config: this.config.config,
                option: this.config.options,
            }

            await runPushAllInOne(title, content, pushConfig)

            return { success: true }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
            }
        }
    }

    /**
     * 发送备份成功通知
     */
    async notifyBackupSuccess(result: BackupResult): Promise<NotifyResult> {
        const title = `[备份成功] ${result.projectName}`
        const content = this.formatBackupResult(result)

        return this.send(title, content)
    }

    /**
     * 发送备份失败通知
     */
    async notifyBackupFailed(result: BackupResult): Promise<NotifyResult> {
        const title = `[备份失败] ${result.projectName}`
        const content = this.formatBackupResult(result)

        return this.send(title, content)
    }

    /**
     * 发送清理成功通知
     */
    async notifyCleanupSuccess(
        projectName: string,
        result: CleanupResult,
    ): Promise<NotifyResult> {
        const title = `[清理完成] ${projectName}`
        const content = this.formatCleanupResult(result)

        return this.send(title, content)
    }

    /**
     * 发送清理失败通知
     */
    async notifyCleanupFailed(
        projectName: string,
        result: CleanupResult,
    ): Promise<NotifyResult> {
        const title = `[清理失败] ${projectName}`
        const content = this.formatCleanupResult(result)

        return this.send(title, content)
    }

    /**
     * 格式化备份结果
     */
    private formatBackupResult(result: BackupResult): string {
        const lines: string[] = [
            `**项目名称**: ${result.projectName}`,
            `**备份时间**: ${result.timestamp.toLocaleString('zh-CN')}`,
            `**状态**: ${result.success ? '成功' : '失败'}`,
        ]

        if (result.backupFiles.length > 0) {
            lines.push(`**备份文件数**: ${result.backupFiles.length}`)
            lines.push(`**文件列表**:`)
            result.backupFiles.forEach((file) => {
                lines.push(`  - ${file}`)
            })
        }

        if (result.error) {
            lines.push(`**错误信息**: ${result.error}`)
        }

        return lines.join('\n')
    }

    /**
     * 格式化清理结果
     */
    private formatCleanupResult(result: CleanupResult): string {
        const lines: string[] = [
            `**状态**: ${result.success ? '成功' : '失败'}`,
            `**删除文件数**: ${result.deletedFiles.length}`,
            `**释放空间**: ${format(result.freedSpace)}`,
        ]

        if (result.error) {
            lines.push(`**错误信息**: ${result.error}`)
        }

        if (result.deletedFiles.length > 0 && result.deletedFiles.length <= 10) {
            lines.push(`**已删除文件**:`)
            result.deletedFiles.forEach((file) => {
                lines.push(`  - ${file}`)
            })
        }

        return lines.join('\n')
    }
}

/**
 * 创建通知服务
 */
export function createNotifyService(config: NotifyConfig): NotifyService {
    return new NotifyService(config)
}
