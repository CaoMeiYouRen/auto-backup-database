import type { BackupResult } from '@/providers/database'
import type { UploadResult } from '@/storage/oss'
import type { CleanupResult } from '@/storage/local'

/**
 * 备份任务结果
 */
export interface BackupTaskResult {
    /** 项目名称 */
    projectName: string
    /** 备份结果 */
    backup: BackupResult
    /** 压缩结果 */
    compress?: {
        success: boolean
        /** 是否跳过压缩（备份产物已全部是压缩格式） */
        skipped?: boolean
        compressedFile?: string
        originalSize?: number
        compressedSize?: number
        error?: string
    }
    /** 加密结果 */
    encrypt?: {
        success: boolean
        /** 加密后的文件路径列表 */
        encryptedFiles?: string[]
        error?: string
    }
    /** 本地上传结果 */
    localUpload?: {
        success: boolean
        error?: string
    }
    /** 远程上传结果 */
    remoteUpload?: {
        success: boolean
        results?: UploadResult[]
        error?: string
    }
    /** 本地清理结果 */
    localCleanup?: CleanupResult
    /** 远程清理结果 */
    remoteCleanup?: CleanupResult
    /** 整体是否成功 */
    overallSuccess: boolean
}
