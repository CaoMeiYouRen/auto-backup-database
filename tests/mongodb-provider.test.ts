import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const execFileMock = vi.fn()

vi.mock('node:child_process', () => ({
    execFile: execFileMock,
}))

import { MongoDBProvider } from '@/providers/mongodb'
import type { MongoDBProjectConfig } from '@/types/config'

describe('MongoDBProvider', () => {
    let tempDir: string
    let project: MongoDBProjectConfig

    beforeEach(() => {
        tempDir = join(tmpdir(), `backup-mongodb-test-${Date.now()}`)
        mkdirSync(tempDir, { recursive: true })
        project = {
            name: 'mongo-db',
            dbType: 'mongodb',
            connection: {
                uri: 'mongodb://127.0.0.1:27017/app?authSource=admin',
                database: 'app',
            },
            dumpOptions: {
                archive: true,
                authenticationDatabase: 'admin',
                extraArgs: ['--numParallelCollections=1'],
            },
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

        execFileMock.mockImplementation((_file: string, args: string[], _options: unknown, callback: (...callbackArgs: unknown[]) => void) => {
            if (args.includes('--version')) {
                callback(null, 'mongodump version 100.14.0', '')
                return
            }

            const archiveIndex = args.indexOf('--archive')
            const archivePath = args[archiveIndex + 1]
            mkdirSync(dirname(archivePath), { recursive: true })
            writeFileSync(archivePath, 'mock-archive-content')
            callback(null, 'done', '')
        })
    })

    afterEach(() => {
        vi.clearAllMocks()

        if (existsSync(tempDir)) {
            rmSync(tempDir, { recursive: true, force: true })
        }
    })

    it('应该使用参数数组执行 mongodump 并生成备份文件', async () => {
        const provider = new MongoDBProvider(project)

        const result = await provider.backup(tempDir)

        expect(result.success).toBe(true)
        expect(result.backupFiles).toHaveLength(1)
        expect(existsSync(result.backupFiles[0])).toBe(true)
        expect(execFileMock).toHaveBeenCalledWith(
            'mongodump',
            expect.arrayContaining([
                '--uri',
                project.connection.uri,
                '--db',
                'app',
                '--authenticationDatabase',
                'admin',
                '--numParallelCollections=1',
            ]),
            expect.any(Object),
            expect.any(Function),
        )
    })

    it('应该在 mongodump 缺失时返回清晰错误', async () => {
        execFileMock.mockImplementation((_file: string, _args: string[], _options: unknown, callback: (...callbackArgs: unknown[]) => void) => {
            callback(new Error('spawn mongodump ENOENT'))
        })

        const provider = new MongoDBProvider(project)
        const result = await provider.backup(tempDir)

        expect(result.success).toBe(false)
        expect(result.error).toContain('未找到 mongodump')
    })
})
