import { lstat, readdir, rmdir, unlink } from 'node:fs/promises'
import { extname, join } from 'node:path'

/**
 * 根据文件名或路径获取 MIME 类型
 * @param filePath 文件名或路径
 * @returns MIME 类型
 */
export function getMimeType(filePath: string): string {
    const ext = extname(filePath).toLowerCase()

    const mimeMap: Record<string, string> = {
        '.gz': 'application/gzip',
        '.tgz': 'application/gzip',
        '.tar': 'application/x-tar',
        '.zip': 'application/zip',
        '.sqlite': 'application/x-sqlite3',
        '.db': 'application/x-sqlite3',
        '.sql': 'application/sql',
        '.json': 'application/json',
        '.txt': 'text/plain',
        '.log': 'text/plain',
        '.enc': 'application/octet-stream',
    }

    // 处理 .tar.gz 这种双后缀
    if (filePath.toLowerCase().endsWith('.tar.gz')) {
        return 'application/gzip'
    }

    return mimeMap[ext] || 'application/octet-stream'
}

/**
 * 递归删除文件或目录（逐个删除文件后自底向上删除目录，不依赖 shell 命令）
 * @param targetPath 目标文件或目录路径，不存在时静默返回
 */
export async function removeRecursive(targetPath: string): Promise<void> {
    let stats
    try {
        stats = await lstat(targetPath)
    } catch {
        return
    }

    if (stats.isDirectory()) {
        const entries = await readdir(targetPath)
        for (const entry of entries) {
            await removeRecursive(join(targetPath, entry))
        }
        await rmdir(targetPath)
        return
    }

    await unlink(targetPath)
}

/**
 * 清空目录内容但保留目录本身
 * @param dirPath 目录路径，不存在时静默返回
 */
export async function cleanDirectory(dirPath: string): Promise<void> {
    let entries: string[]
    try {
        entries = await readdir(dirPath)
    } catch {
        return
    }

    for (const entry of entries) {
        await removeRecursive(join(dirPath, entry))
    }
}
