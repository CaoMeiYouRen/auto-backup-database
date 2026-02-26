import { basename } from 'node:path'
import { existsSync, createWriteStream, readdirSync, statSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import archiver from 'archiver'

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
 * 通用的压缩执行逻辑（使用 archiver）
 */
async function runArchiver(
    sourceSpecs: { path: string, name: string, type: 'file' | 'dir' }[],
    outputPath: string,
): Promise<void> {
    return new Promise((resolve, reject) => {
        const output = createWriteStream(outputPath)
        const archive = archiver('tar', {
            gzip: true,
            gzipOptions: {
                level: 9,
            },
        })

        output.on('close', () => resolve())
        archive.on('error', (err) => reject(err))

        archive.pipe(output)

        for (const spec of sourceSpecs) {
            if (spec.type === 'file') {
                archive.file(spec.path, { name: spec.name })
            } else {
                archive.directory(spec.path, spec.name)
            }
        }

        archive.finalize().catch((err: unknown) => {
            reject(err instanceof Error ? err : new Error('Archiver finalize failed'))
        })
    })
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

    const sourceName = basename(sourcePath)
    const finalOutputPath = outputPath || sourcePath
    const compressedFile = `${finalOutputPath}.tar.gz`

    try {
        const stats = await stat(sourcePath)
        const isDir = stats.isDirectory()
        const originalSize = isDir ? getDirectorySize(sourcePath) : stats.size

        // 执行压缩
        await runArchiver(
            [{ path: sourcePath, name: sourceName, type: isDir ? 'dir' : 'file' }],
            compressedFile,
        )

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

    const compressedFile = `${outputFile}.tar.gz`

    try {
        let originalSize = 0
        const specs: { path: string, name: string, type: 'file' | 'dir' }[] = []

        for (const path of filePaths) {
            if (!existsSync(path)) {
                throw new Error(`文件不存在: ${path}`)
            }
            const stats = await stat(path)
            originalSize += stats.size
            specs.push({ path, name: basename(path), type: 'file' })
        }

        // 执行压缩
        await runArchiver(specs, compressedFile)

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
        const originalSize = getDirectorySize(dirPath)

        // 执行压缩
        await runArchiver(
            [{ path: dirPath, name: basename(dirPath), type: 'dir' }],
            compressedFile,
        )

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
function getDirectorySize(dirPath: string): number {
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
