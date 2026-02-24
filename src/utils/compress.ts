import { basename, dirname } from 'node:path'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { $ } from 'zx'

$.verbose = false

/**
 * 压缩结果
 */
export interface CompressResult {
    /** 压缩文件路径 */
    compressedFile: string
    /** 原始大小（字节） */
    originalSize: number
    /** 压缩后大小（字节） */
    compressedSize: number
    /** 是否成功 */
    success: boolean
    /** 错误信息 */
    error?: string
}

/**
 * 压缩文件或目录
 * @param sourcePath 源文件或目录路径
 * @param outputPath 输出文件路径（不含扩展名）
 * @returns 压缩结果
 */
export async function compress(sourcePath: string, outputPath?: string): Promise<CompressResult> {
    if (!existsSync(sourcePath)) {
        return {
            compressedFile: '',
            originalSize: 0,
            compressedSize: 0,
            success: false,
            error: `源路径不存在: ${sourcePath}`,
        }
    }

    const sourceDir = dirname(sourcePath)
    const sourceName = basename(sourcePath)
    const finalOutputPath = outputPath || sourcePath
    const compressedFile = `${finalOutputPath}.tar.gz`

    try {
        // 获取原始大小
        const originalSize = await getDirectorySize(sourcePath)

        // 执行压缩
        // 使用 tar -czf 压缩，-C 切换目录
        await $`tar -czf ${compressedFile} -C ${sourceDir} ${sourceName}`

        // 获取压缩后大小
        const compressedSize = await getFileSize(compressedFile)

        return {
            compressedFile,
            originalSize,
            compressedSize,
            success: true,
        }
    } catch (error) {
        return {
            compressedFile: '',
            originalSize: 0,
            compressedSize: 0,
            success: false,
            error: error instanceof Error ? error.message : String(error),
        }
    }
}

/**
 * 压缩多个文件
 * @param filePaths 文件路径列表
 * @param outputFile 输出文件路径（不含扩展名）
 * @returns 压缩结果
 */
export async function compressMultiple(
    filePaths: string[],
    outputFile: string,
): Promise<CompressResult> {
    if (filePaths.length === 0) {
        return {
            compressedFile: '',
            originalSize: 0,
            compressedSize: 0,
            success: false,
            error: '文件列表为空',
        }
    }

    // 检查所有文件是否存在
    for (const file of filePaths) {
        if (!existsSync(file)) {
            return {
                compressedFile: '',
                originalSize: 0,
                compressedSize: 0,
                success: false,
                error: `文件不存在: ${file}`,
            }
        }
    }

    const compressedFile = `${outputFile}.tar.gz`

    try {
        // 计算原始总大小
        let originalSize = 0
        for (const file of filePaths) {
            originalSize += await getFileSize(file)
        }

        // 获取公共父目录
        const commonDir = dirname(filePaths[0])

        // 获取相对文件名列表
        const fileNames = filePaths.map((f) => basename(f))

        // 执行压缩
        await $`tar -czf ${compressedFile} -C ${commonDir} ${fileNames}`

        // 获取压缩后大小
        const compressedSize = await getFileSize(compressedFile)

        return {
            compressedFile,
            originalSize,
            compressedSize,
            success: true,
        }
    } catch (error) {
        return {
            compressedFile: '',
            originalSize: 0,
            compressedSize: 0,
            success: false,
            error: error instanceof Error ? error.message : String(error),
        }
    }
}

/**
 * 压缩目录
 * @param dirPath 目录路径
 * @param outputFile 输出文件路径（不含扩展名）
 * @returns 压缩结果
 */
export async function compressDirectory(
    dirPath: string,
    outputFile: string,
): Promise<CompressResult> {
    if (!existsSync(dirPath)) {
        return {
            compressedFile: '',
            originalSize: 0,
            compressedSize: 0,
            success: false,
            error: `目录不存在: ${dirPath}`,
        }
    }

    const compressedFile = `${outputFile}.tar.gz`

    try {
        // 获取目录大小
        const originalSize = await getDirectorySize(dirPath)

        // 获取目录名和父目录
        const parentDir = dirname(dirPath)
        const dirName = basename(dirPath)

        // 执行压缩
        await $`tar -czf ${compressedFile} -C ${parentDir} ${dirName}`

        // 获取压缩后大小
        const compressedSize = await getFileSize(compressedFile)

        return {
            compressedFile,
            originalSize,
            compressedSize,
            success: true,
        }
    } catch (error) {
        return {
            compressedFile: '',
            originalSize: 0,
            compressedSize: 0,
            success: false,
            error: error instanceof Error ? error.message : String(error),
        }
    }
}

/**
 * 获取文件大小
 */
async function getFileSize(filePath: string): Promise<number> {
    try {
        const stats = await stat(filePath)
        return stats.size
    } catch {
        return 0
    }
}

/**
 * 获取目录大小
 */
async function getDirectorySize(dirPath: string): Promise<number> {
    let size = 0

    function walkSync(currentPath: string) {
        const stats = statSync(currentPath)
        if (stats.isFile()) {
            size += stats.size
        } else if (stats.isDirectory()) {
            const files = readdirSync(currentPath)
            for (const file of files) {
                const filePath = `${currentPath}/${file}`
                walkSync(filePath)
            }
        }
    }

    try {
        walkSync(dirPath)
        return size
    } catch {
        return 0
    }
}
