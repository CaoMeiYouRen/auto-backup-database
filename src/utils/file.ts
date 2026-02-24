import { extname } from 'node:path'

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
