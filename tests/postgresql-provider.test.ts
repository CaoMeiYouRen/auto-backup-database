import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { execFileMock } = vi.hoisted(() => ({
    execFileMock: vi.fn(),
}))

vi.mock('node:child_process', () => ({
    execFile: execFileMock,
}))

import { PostgreSQLProvider } from '@/providers/postgresql'
import type { PostgreSQLProjectConfig } from '@/types/config'

describe('PostgreSQLProvider', () => {
    let tempDir: string
    let project: PostgreSQLProjectConfig

    beforeEach(() => {
        tempDir = join(tmpdir(), `backup-postgresql-test-${Date.now()}`)
        mkdirSync(tempDir, { recursive: true })
        project = {
            name: 'postgres-db',
            dbType: 'postgresql',
            connection: {
                uri: 'postgresql://postgres:secret@127.0.0.1:5432',
                database: 'app',
            },
            dumpOptions: {
                format: 'custom',
                clean: true,
                noOwner: true,
                extraArgs: ['--verbose'],
            },
            backupSchedule: '0 2 * * *',
            compress: {
                enabled: true,
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
                callback(null, 'pg_dump (PostgreSQL) 18.3', '')
                return
            }

            const outputArg = args.find((arg) => arg.startsWith('--file='))
            const outputPath = outputArg?.slice('--file='.length)
            if (!outputPath) {
                callback(new Error('missing file argument'))
                return
            }

            mkdirSync(dirname(outputPath), { recursive: true })
            writeFileSync(outputPath, 'mock-postgresql-dump')
            callback(null, 'done', '')
        })
    })

    afterEach(() => {
        vi.clearAllMocks()

        if (existsSync(tempDir)) {
            rmSync(tempDir, { recursive: true, force: true })
        }
    })

    it('应该使用参数数组执行 pg_dump 并生成备份文件', async () => {
        const provider = new PostgreSQLProvider(project)

        const result = await provider.backup(tempDir)

        expect(result.success).toBe(true)
        expect(result.backupFiles).toHaveLength(1)
        expect(existsSync(result.backupFiles[0])).toBe(true)
        expect(execFileMock).toHaveBeenCalledWith(
            'pg_dump',
            expect.arrayContaining([
                '--format=custom',
                '--compress=0',
                '--clean',
                '--no-owner',
                '--verbose',
                '--dbname=postgresql://postgres:secret@127.0.0.1:5432/app',
            ]),
            expect.any(Object),
            expect.any(Function),
        )

        const calledArgs = execFileMock.mock.calls.at(-1)?.[1] as string[]
        expect(calledArgs.some((arg) => arg.startsWith('--file='))).toBe(true)
    })

    it('应该在 pg_dump 缺失时返回清晰错误', async () => {
        execFileMock.mockImplementation((_file: string, _args: string[], _options: unknown, callback: (...callbackArgs: unknown[]) => void) => {
            callback(new Error('spawn pg_dump ENOENT'))
        })

        const provider = new PostgreSQLProvider(project)
        const result = await provider.backup(tempDir)

        expect(result.success).toBe(false)
        expect(result.error).toContain('未找到 pg_dump')
    })
})
