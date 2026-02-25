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
        compressedFile?: string
        error?: string
    }
    /** 加密结果 */
    encrypt?: {
        success: boolean
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
