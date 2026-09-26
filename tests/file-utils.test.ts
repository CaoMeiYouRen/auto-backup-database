import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanDirectory, removeRecursive } from '@/utils/file'

describe('file utils', () => {
    let tempDir: string

    beforeEach(() => {
        tempDir = join(tmpdir(), `backup-file-utils-test-${Date.now()}`)
        mkdirSync(tempDir, { recursive: true })
    })

    afterEach(() => {
        if (existsSync(tempDir)) {
            rmSync(tempDir, { recursive: true, force: true })
        }
    })

    describe('removeRecursive', () => {
        it('应该递归删除嵌套目录和文件', async () => {
            const target = join(tempDir, 'target')
            mkdirSync(join(target, 'nested', 'deep'), { recursive: true })
            writeFileSync(join(target, 'a.txt'), 'a')
            writeFileSync(join(target, 'nested', 'b.txt'), 'b')
            writeFileSync(join(target, 'nested', 'deep', 'c.txt'), 'c')

            await removeRecursive(target)

            expect(existsSync(target)).toBe(false)
        })

        it('应该删除单个文件', async () => {
            const target = join(tempDir, 'single.txt')
            writeFileSync(target, 'content')

            await removeRecursive(target)

            expect(existsSync(target)).toBe(false)
        })

        it('路径不存在时应静默返回', async () => {
            await expect(removeRecursive(join(tempDir, 'nonexistent'))).resolves.toBeUndefined()
        })
    })

    describe('cleanDirectory', () => {
        it('应该清空目录内容但保留目录本身', async () => {
            const target = join(tempDir, 'keep')
            mkdirSync(join(target, 'sub'), { recursive: true })
            writeFileSync(join(target, 'a.txt'), 'a')
            writeFileSync(join(target, 'sub', 'b.txt'), 'b')

            await cleanDirectory(target)

            expect(existsSync(target)).toBe(true)
            expect(readdirSync(target)).toHaveLength(0)
        })

        it('目录不存在时应静默返回', async () => {
            await expect(cleanDirectory(join(tempDir, 'nonexistent'))).resolves.toBeUndefined()
        })
    })
})
