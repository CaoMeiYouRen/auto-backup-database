import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { LocalStorage } from '@/storage/local'
import type { RetentionConfig } from '@/types/config'

describe('LocalStorage', () => {
    let tempDir: string
    let storageDir: string
    let retention: RetentionConfig

    beforeEach(() => {
        tempDir = join(tmpdir(), `backup-storage-test-${Date.now()}`)
        storageDir = join(tempDir, 'backups')
        mkdirSync(storageDir, { recursive: true })
        retention = {
            days: 7,
            maxSize: '100MB',
        }
    })

    afterEach(() => {
        if (existsSync(tempDir)) {
            rmSync(tempDir, { recursive: true, force: true })
        }
    })

    describe('ensureDir', () => {
        it('应该创建不存在的目录', async () => {
            const newDir = join(tempDir, 'new-storage')
            const storage = new LocalStorage(newDir, retention)

            await storage.ensureDir()

            expect(existsSync(newDir)).toBe(true)
        })

        it('不应该对已存在的目录报错', async () => {
            const storage = new LocalStorage(storageDir, retention)

            await expect(storage.ensureDir()).resolves.not.toThrow()
        })
    })

    describe('getBackupFiles', () => {
        it('应该返回空数组如果目录不存在', async () => {
            const storage = new LocalStorage(join(tempDir, 'nonexistent'), retention)
            const files = await storage.getBackupFiles()

            expect(files).toHaveLength(0)
        })

        it('应该返回空数组如果目录为空', async () => {
            const storage = new LocalStorage(storageDir, retention)
            const files = await storage.getBackupFiles()

            expect(files).toHaveLength(0)
        })

        it('应该返回目录中的文件列表', async () => {
            // 创建测试文件
            writeFileSync(join(storageDir, 'backup1.tar.gz'), 'content1')
            writeFileSync(join(storageDir, 'backup2.tar.gz'), 'content2')

            const storage = new LocalStorage(storageDir, retention)
            const files = await storage.getBackupFiles()

            expect(files).toHaveLength(2)
            expect(files.map((f) => f.name)).toContain('backup1.tar.gz')
            expect(files.map((f) => f.name)).toContain('backup2.tar.gz')
        })

        it('应该按创建时间排序（旧的在前）', async () => {
            // 创建测试文件
            writeFileSync(join(storageDir, 'old.tar.gz'), 'old')
            await new Promise((r) => setTimeout(r, 10))
            writeFileSync(join(storageDir, 'new.tar.gz'), 'new')

            const storage = new LocalStorage(storageDir, retention)
            const files = await storage.getBackupFiles()

            expect(files[0].name).toBe('old.tar.gz')
            expect(files[1].name).toBe('new.tar.gz')
        })
    })

    describe('getStats', () => {
        it('应该返回正确的统计信息', async () => {
            writeFileSync(join(storageDir, 'file1.tar.gz'), 'a'.repeat(100))
            writeFileSync(join(storageDir, 'file2.tar.gz'), 'b'.repeat(200))

            const storage = new LocalStorage(storageDir, retention)
            const stats = await storage.getStats()

            expect(stats.totalFiles).toBe(2)
            expect(stats.totalSize).toBe(300)
        })
    })

    describe('cleanup', () => {
        it('应该成功执行清理操作', async () => {
            // 创建测试文件
            writeFileSync(join(storageDir, 'file1.tar.gz'), 'content1')
            writeFileSync(join(storageDir, 'file2.tar.gz'), 'content2')

            const storage = new LocalStorage(storageDir, retention)
            const result = await storage.cleanup()

            expect(result.success).toBe(true)
            expect(result.deletedFiles).toBeDefined()
            expect(typeof result.freedSpace).toBe('number')
        })

        it('应该按大小清理文件', async () => {
            // 创建大文件（超过 maxSize）
            const smallRetention: RetentionConfig = {
                days: 30,
                maxSize: '10B', // 非常小的限制
            }

            writeFileSync(join(storageDir, 'file1.tar.gz'), 'a'.repeat(100))
            writeFileSync(join(storageDir, 'file2.tar.gz'), 'b'.repeat(100))

            const storage = new LocalStorage(storageDir, smallRetention)
            const result = await storage.cleanup()

            expect(result.success).toBe(true)
            expect(result.deletedFiles.length).toBeGreaterThan(0)
        })
    })

    describe('needsCleanup', () => {
        it('应该返回 false 如果不需要清理', async () => {
            writeFileSync(join(storageDir, 'file.tar.gz'), 'small')

            const storage = new LocalStorage(storageDir, retention)
            const needs = await storage.needsCleanup()

            expect(needs).toBe(false)
        })
    })
})
