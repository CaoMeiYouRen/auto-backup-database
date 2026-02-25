import { runPushAllInOne, type PushType, type MetaPushConfig } from 'push-all-in-one'
import { format } from 'better-bytes'
import Debug from 'debug'
import type { BackupResult } from '@/providers/database'
import type { CleanupResult } from '@/storage/local'
import type { BackupTaskResult } from '@/types/backup'

const debug = Debug('backup:notify')
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
    option?: MetaPushConfig['option']
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
            debug('通知服务未启用，跳过发送')
            return { success: true }
        }

        try {
            debug('正在通过 %s 发送通知: %s', this.config.type, title)
            const pushConfig: MetaPushConfig = {
                type: this.config.type,
                config: this.config.config,
                option: this.config.option,
            }

            const res = await runPushAllInOne(title, content, pushConfig) as any
            debug('通知发送结果: status=%s, data=%o', res?.status, res?.data)

            return { success: true }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            debug('通知发送失败: %s', errorMessage)
            return {
                success: false,
                error: errorMessage,
            }
        }
    }

    /**
     * 发送备份成功通知
     */
    async notifyBackupSuccess(result: BackupTaskResult): Promise<NotifyResult> {
        const title = `[备份成功] ${result.projectName}`
        const content = this.formatBackupTaskResult(result)

        return this.send(title, content)
    }

    /**
     * 发送备份失败通知
     */
    async notifyBackupFailed(result: BackupTaskResult): Promise<NotifyResult> {
        const title = `[备份失败] ${result.projectName}`
        const content = this.formatBackupTaskResult(result)

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
     * 格式化备份任务结果
     */
    private formatBackupTaskResult(result: BackupTaskResult): string {
        const lines: string[] = [
            `**项目名称**: ${result.projectName}`,
            `**备份时间**: ${result.backup.timestamp.toLocaleString('zh-CN')}`,
            `**总体状态**: ${result.overallSuccess ? '✅ 成功' : '❌ 失败'}`,
        ]

        // 数据库备份详情
        lines.push(`---`)
        lines.push(`**1. 数据库导出**: ${result.backup.success ? '✅' : '❌'}`)
        if (result.backup.error) { lines.push(`   - 错误: ${result.backup.error}`) }

        // 压缩详情
        if (result.compress) {
            lines.push(`**2. 压缩**: ${result.compress.success ? '✅' : '❌'}`)
            if (result.compress.error) { lines.push(`   - 错误: ${result.compress.error}`) }
        }

        // 加密详情
        if (result.encrypt) {
            lines.push(`**3. 加密**: ${result.encrypt.success ? '✅' : '❌'}`)
            if (result.encrypt.error) { lines.push(`   - 错误: ${result.encrypt.error}`) }
        }

        // 存储详情
        lines.push(`**4. 存储**:`)
        if (result.localUpload) {
            lines.push(`   - 本地: ${result.localUpload.success ? '✅' : '❌'}`)
            if (result.localUpload.error) { lines.push(`     - 错误: ${result.localUpload.error}`) }
        }
        if (result.remoteUpload) {
            lines.push(`   - 远程: ${result.remoteUpload.success ? '✅' : '❌'}`)
            if (result.remoteUpload.error) { lines.push(`     - 错误: ${result.remoteUpload.error}`) }
        }

        // 清理详情
        if (result.localCleanup || result.remoteCleanup) {
            lines.push(`**5. 清理**:`)
            if (result.localCleanup) {
                lines.push(`   - 本地清理: ${result.localCleanup.success ? '✅' : '❌'} (删除 ${result.localCleanup.deletedFiles.length} 个文件, 释放 ${format(result.localCleanup.freedSpace)})`)
            }
            if (result.remoteCleanup) {
                lines.push(`   - 远程清理: ${result.remoteCleanup.success ? '✅' : '❌'} (删除 ${result.remoteCleanup.deletedFiles.length} 个文件, 释放 ${format(result.remoteCleanup.freedSpace)})`)
            }
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
