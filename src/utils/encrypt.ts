import { existsSync, unlinkSync, createReadStream, createWriteStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Buffer } from 'node:buffer'
import { randomBytes, pbkdf2Sync, createCipheriv, createDecipheriv } from 'node:crypto'

/**
 * 加密结果
 */
export interface EncryptResult {
    /** 加密文件路径 */
    encryptedFile: string
    /** 原始大小（字节） */
    originalSize: number
    /** 加密后大小（字节） */
    encryptedSize: number
    /** 是否成功 */
    success: boolean
    /** 错误信息 */
    error?: string
}

/**
 * 解密结果
 */
export interface DecryptResult {
    /** 解密文件路径 */
    decryptedFile: string
    /** 是否成功 */
    success: boolean
    /** 错误信息 */
    error?: string
}

/**
 * 加密文件 (兼容 OpenSSL 'Salted__' 格式)
 * @param filePath 要加密的文件路径
 * @param password 加密密码
 * @param outputPath 输出文件路径（可选，默认在原文件名后加 .enc）
 * @returns 加密结果
 */
export async function encryptFile(
    filePath: string,
    password: string,
    outputPath?: string,
): Promise<EncryptResult> {
    if (!existsSync(filePath)) {
        return {
            encryptedFile: '',
            originalSize: 0,
            encryptedSize: 0,
            success: false,
            error: `文件不存在: ${filePath}`,
        }
    }

    if (!password) {
        return {
            encryptedFile: '',
            originalSize: 0,
            encryptedSize: 0,
            success: false,
            error: '密码不能为空',
        }
    }

    const encryptedFile = outputPath || `${filePath}.enc`

    try {
        const originalStats = await stat(filePath)
        const originalSize = originalStats.size

        // 生成 8 字节随机盐值
        const salt = randomBytes(8)

        // 使用 PBKDF2 派生密钥和 IV (兼容 OpenSSL)
        // AES-256-CBC 需要 32 字节密钥和 16 字节 IV
        const keyAndIv = pbkdf2Sync(password, salt, 100000, 32 + 16, 'sha256')
        const key = keyAndIv.subarray(0, 32)
        const iv = keyAndIv.subarray(32, 48)

        const cipher = createCipheriv('aes-256-cbc', key, iv)

        const input = createReadStream(filePath)
        const output = createWriteStream(encryptedFile)

        // 写入 OpenSSL 格式文件头: 'Salted__' + salt
        output.write(Buffer.from('Salted__'))
        output.write(salt)

        await new Promise<void>((resolve, reject) => {
            input.on('error', reject)
            output.on('error', reject)
            output.on('finish', resolve)
            input.pipe(cipher).pipe(output)
        })

        const encryptedStats = await stat(encryptedFile)
        const encryptedSize = encryptedStats.size

        return {
            encryptedFile,
            originalSize,
            encryptedSize,
            success: true,
        }
    } catch (error) {
        return {
            encryptedFile: '',
            originalSize: 0,
            encryptedSize: 0,
            success: false,
            error: error instanceof Error ? error.message : String(error),
        }
    }
}

/**
 * 解密文件 (从 OpenSSL 'Salted__' 格式)
 */
export async function decryptFile(
    filePath: string,
    password: string,
    outputPath?: string,
): Promise<DecryptResult> {
    if (!existsSync(filePath)) {
        return { decryptedFile: '', success: false, error: `文件不存在: ${filePath}` }
    }

    const decryptedFile = outputPath || (filePath.endsWith('.enc') ? filePath.slice(0, -4) : `${filePath}.dec`)

    try {
        const input = createReadStream(filePath)

        // 读取 16 字节头部 ('Salted__' + 8 字节 salt)
        const header = await new Promise<Buffer>((resolve, reject) => {
            const stream = createReadStream(filePath, { start: 0, end: 15 })
            const chunks: Buffer[] = []
            stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
            stream.on('error', reject)
            stream.on('end', () => resolve(Buffer.concat(chunks)))
        })

        if (header.subarray(0, 8).toString() !== 'Salted__') {
            throw new Error('无效的加过密文件头')
        }

        const salt = header.subarray(8, 16)
        const keyAndIv = pbkdf2Sync(password, salt, 100000, 32 + 16, 'sha256')
        const key = keyAndIv.subarray(0, 32)
        const iv = keyAndIv.subarray(32, 48)

        const decipher = createDecipheriv('aes-256-cbc', key, iv)
        const output = createWriteStream(decryptedFile)

        // 跳过头部读取剩余内容
        const inputContent = createReadStream(filePath, { start: 16 })

        await new Promise<void>((resolve, reject) => {
            inputContent.on('error', reject)
            output.on('error', reject)
            output.on('finish', resolve)
            inputContent.pipe(decipher).pipe(output)
        })

        return { decryptedFile, success: true }
    } catch (error) {
        return {
            decryptedFile: '',
            success: false,
            error: error instanceof Error ? error.message : String(error),
        }
    }
}

/**
 * 加密并删除原文件
 */
export async function encryptAndDelete(
    filePath: string,
    password: string,
    outputPath?: string,
): Promise<EncryptResult> {
    const result = await encryptFile(filePath, password, outputPath)
    if (result.success) {
        try { unlinkSync(filePath) } catch {}
    }
    return result
}

/**
 * 检查环境 (由于改为原生 crypto，默认总是可用)
 */
export async function checkOpenSSL(): Promise<boolean> {
    return true
}
