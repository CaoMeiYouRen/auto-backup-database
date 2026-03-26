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

import { MySQLProvider } from '@/providers/mysql'
import type { MySQLProjectConfig } from '@/types/config'

describe('MySQLProvider', () => {
    let tempDir: string
    let project: MySQLProjectConfig

    beforeEach(() => {
        tempDir = join(tmpdir(), `backup-mysql-test-${Date.now()}`)
        mkdirSync(tempDir, { recursive: true })
        project = {
            name: 'mysql-db',
            dbType: 'mysql',
            connection: {
                uri: 'mysql://root:secret@127.0.0.1:3306/app?ssl-mode=REQUIRED',
                database: 'app',
            },
            dumpOptions: {
                singleTransaction: true,
                routines: true,
                events: true,
                tables: ['users', 'orders'],
                extraArgs: ['--skip-comments'],
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

        execFileMock.mockImplementation((file: string, args: string[], options: { env?: NodeJS.ProcessEnv }, callback: (...callbackArgs: unknown[]) => void) => {
            if (args.includes('--version')) {
                callback(null, `${file} Ver 8.4.0`, '')
                return
            }

            const outputArg = args.find((arg) => arg.startsWith('--result-file='))
            const outputPath = outputArg?.slice('--result-file='.length)
            if (!outputPath) {
                callback(new Error('missing result-file argument'))
                return
            }

            expect(options.env?.MYSQL_PWD).toBe('secret')
            mkdirSync(dirname(outputPath), { recursive: true })
            writeFileSync(outputPath, 'mock-mysql-dump')
            callback(null, 'done', '')
        })
    })

    afterEach(() => {
        vi.clearAllMocks()

        if (existsSync(tempDir)) {
            rmSync(tempDir, { recursive: true, force: true })
        }
    })

    it('应该使用参数数组执行 mysqldump 并生成备份文件', async () => {
        const provider = new MySQLProvider(project)

        const result = await provider.backup(tempDir)

        expect(result.success).toBe(true)
        expect(result.backupFiles).toHaveLength(1)
        expect(existsSync(result.backupFiles[0])).toBe(true)
        expect(execFileMock).toHaveBeenCalledWith(
            'mysqldump',
            expect.arrayContaining([
                '--host=127.0.0.1',
                '--port=3306',
                '--user=root',
                '--ssl-mode=REQUIRED',
                '--single-transaction',
                '--routines',
                '--events',
                '--databases',
                'app',
                '--tables',
                'users',
                'orders',
                '--skip-comments',
            ]),
            expect.any(Object),
            expect.any(Function),
        )

        const calledArgs = execFileMock.mock.calls.at(-1)?.[1] as string[]
        expect(calledArgs.some((arg) => arg.startsWith('--result-file='))).toBe(true)
    })

    it('应该在 mysqldump 缺失时回退到 mariadb-dump', async () => {
        execFileMock.mockImplementation((file: string, args: string[], options: { env?: NodeJS.ProcessEnv }, callback: (...callbackArgs: unknown[]) => void) => {
            if (args.includes('--version')) {
                if (file === 'mysqldump') {
                    callback(new Error('spawn mysqldump ENOENT'))
                    return
                }

                callback(null, 'mariadb-dump Ver 11.8.2', '')
                return
            }

            const outputArg = args.find((arg) => arg.startsWith('--result-file='))
            const outputPath = outputArg?.slice('--result-file='.length)
            if (!outputPath) {
                callback(new Error('missing result-file argument'))
                return
            }

            mkdirSync(dirname(outputPath), { recursive: true })
            writeFileSync(outputPath, 'mock-mysql-dump')
            callback(null, 'done', '')
        })

        const provider = new MySQLProvider(project)
        const result = await provider.backup(tempDir)

        expect(result.success).toBe(true)
        expect(execFileMock).toHaveBeenCalledWith(
            'mariadb-dump',
            expect.any(Array),
            expect.any(Object),
            expect.any(Function),
        )
    })

    it('应该在 mysqldump 缺失时返回清晰错误', async () => {
        execFileMock.mockImplementation((_file: string, _args: string[], _options: unknown, callback: (...callbackArgs: unknown[]) => void) => {
            callback(new Error('spawn dump tool ENOENT'))
        })

        const provider = new MySQLProvider(project)
        const result = await provider.backup(tempDir)

        expect(result.success).toBe(false)
        expect(result.error).toContain('未找到 mysqldump')
    })
})
