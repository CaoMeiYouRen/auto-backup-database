import { existsSync, unlinkSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { $ } from 'zx'

$.verbose = false

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
 * 加密文件
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
        // 获取原始文件大小
        const originalStats = await stat(filePath)
        const originalSize = originalStats.size

        // 使用 openssl 加密
        // -aes-256-cbc: 使用 AES-256-CBC 加密算法
        // -salt: 添加盐值增强安全性
        // -pbkdf2: 使用 PBKDF2 密钥派生函数
        // -iter 100000: 迭代次数
        await $`openssl enc -aes-256-cbc -salt -pbkdf2 -iter 100000 -in ${filePath} -out ${encryptedFile} -pass pass:${password}`

        // 获取加密后文件大小
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
 * 解密文件
 * @param filePath 要解密的文件路径
 * @param password 解密密码
 * @param outputPath 输出文件路径（可选，默认去掉 .enc 后缀）
 * @returns 解密结果
 */
export async function decryptFile(
    filePath: string,
    password: string,
    outputPath?: string,
): Promise<DecryptResult> {
    if (!existsSync(filePath)) {
        return {
            decryptedFile: '',
            success: false,
            error: `文件不存在: ${filePath}`,
        }
    }

    if (!password) {
        return {
            decryptedFile: '',
            success: false,
            error: '密码不能为空',
        }
    }

    // 默认输出路径为去掉 .enc 后缀
    const decryptedFile =
        outputPath || (filePath.endsWith('.enc') ? filePath.slice(0, -4) : `${filePath}.dec`)

    try {
        // 使用 openssl 解密
        await $`openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 -in ${filePath} -out ${decryptedFile} -pass pass:${password}`

        return {
            decryptedFile,
            success: true,
        }
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
 * @param filePath 要加密的文件路径
 * @param password 加密密码
 * @param outputPath 输出文件路径（可选）
 * @returns 加密结果
 */
export async function encryptAndDelete(
    filePath: string,
    password: string,
    outputPath?: string,
): Promise<EncryptResult> {
    const result = await encryptFile(filePath, password, outputPath)

    if (result.success) {
        // 删除原文件
        try {
            unlinkSync(filePath)
        } catch {
            // 忽略删除错误
        }
    }

    return result
}

/**
 * 检查是否安装了 openssl
 */
export async function checkOpenSSL(): Promise<boolean> {
    try {
        await $`openssl version`
        return true
    } catch {
        return false
    }
}
