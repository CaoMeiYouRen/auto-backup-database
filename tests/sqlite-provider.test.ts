import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SQLiteProvider } from '@/providers/sqlite'
import type { SQLiteProjectConfig } from '@/types/config'

describe('SQLiteProvider', () => {
    let tempDir: string
    let sourceDir: string
    let outputDir: string
    let project: SQLiteProjectConfig

    beforeEach(() => {
        tempDir = join(tmpdir(), `backup-sqlite-provider-test-${Date.now()}`)
        sourceDir = join(tempDir, 'source')
        outputDir = join(tempDir, 'output')
        mkdirSync(sourceDir, { recursive: true })
        mkdirSync(outputDir, { recursive: true })

        project = {
            name: 'sqlite-db',
            dbType: 'sqlite',
            dbPath: `${sourceDir.replace(/\\/g, '/')}/*.db`,
            backupSchedule: '0 2 * * *',
            compress: {
                enabled: false,
                password: false,
            },
            retention: {
                local: {
                    days: 7,
                    maxSize: '2GB',
                },
                remote: {
                    days: 30,
                    maxSize: '10GB',
                },
            },
            options: {
                localEnabled: true,
                remoteEnabled: false,
            },
        }
    })

    afterEach(() => {
        if (existsSync(tempDir)) {
            rmSync(tempDir, { recursive: true, force: true })
        }
    })

    it('应该在没有匹配文件时返回 false', async () => {
        const provider = new SQLiteProvider(project)

        await expect(provider.validatePath()).resolves.toBe(false)
    })

    it('应该复制所有匹配的数据库文件', async () => {
        writeFileSync(join(sourceDir, 'app.db'), 'app-data')
        writeFileSync(join(sourceDir, 'cache.db'), 'cache-data')

        const provider = new SQLiteProvider(project)
        const result = await provider.backup(outputDir)

        expect(result.success).toBe(true)
        expect(result.backupFiles).toHaveLength(2)
        expect(result.backupFiles.every((filePath) => existsSync(filePath))).toBe(true)
        expect(result.backupFiles.some((filePath) => filePath.endsWith('app.db'))).toBe(true)
        expect(result.backupFiles.some((filePath) => filePath.endsWith('cache.db'))).toBe(true)
    })
})
