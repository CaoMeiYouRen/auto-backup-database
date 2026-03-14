import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { execFileMock } = vi.hoisted(() => ({
    execFileMock: vi.fn(),
}))

vi.mock('node:child_process', () => ({
    execFile: execFileMock,
}))

import { BackupService } from '@/services/backup'
import { OSSStorage } from '@/storage/oss'
import type { FullConfig, MongoDBProjectConfig, SQLiteProjectConfig } from '@/types/config'

describe('BackupService', () => {
    let tempRoot: string
    let sourceDir: string
    let localBackupDir: string

    beforeEach(() => {
        tempRoot = join(tmpdir(), `backup-service-test-${Date.now()}`)
        sourceDir = join(tempRoot, 'source')
        localBackupDir = join(tempRoot, 'backups')
        mkdirSync(sourceDir, { recursive: true })
        mkdirSync(localBackupDir, { recursive: true })

        execFileMock.mockReset()
        execFileMock.mockImplementation((_file: string, args: string[], _options: unknown, callback: (...callbackArgs: unknown[]) => void) => {
            if (args.includes('--version')) {
                callback(null, 'mongodump version 100.14.0', '')
                return
            }

            const archiveArg = args.find((arg) => arg.startsWith('--archive='))
            const archivePath = archiveArg?.slice('--archive='.length)
            if (!archivePath) {
                callback(new Error('missing archive argument'))
                return
            }

            mkdirSync(dirname(archivePath), { recursive: true })
            writeFileSync(archivePath, 'mock-archive-content')
            callback(null, 'done', '')
        })
    })

    afterEach(() => {
        vi.restoreAllMocks()
        vi.clearAllMocks()

        if (existsSync(tempRoot)) {
            rmSync(tempRoot, { recursive: true, force: true })
        }
    })

    it('应该在 SQLite 未压缩场景下复制所有备份文件到本地目录', async () => {
        writeFileSync(join(sourceDir, 'app.db'), 'app-data')
        writeFileSync(join(sourceDir, 'cache.db'), 'cache-data')

        const project: SQLiteProjectConfig = {
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
                    days: 30,
                    maxSize: '10GB',
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

        const tempDir = join(tempRoot, 'temp-sqlite')
        const fullConfig: FullConfig = {
            projects: [project],
        }

        const service = new BackupService({
            project,
            fullConfig,
            localBackupDir,
            tempDir,
        })

        const result = await service.run()

        expect(result.overallSuccess).toBe(true)
        expect(result.backup.success).toBe(true)
        expect(result.localUpload?.success).toBe(true)
        expect(readdirSync(join(localBackupDir, project.name)).sort()).toEqual(['app.db', 'cache.db'])
        expect(existsSync(tempDir)).toBe(false)
    })

    it('应该在本地成功但远程上传失败时仍判定整体成功', async () => {
        writeFileSync(join(sourceDir, 'app.db'), 'app-data')

        const project: SQLiteProjectConfig = {
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
                    days: 30,
                    maxSize: '10GB',
                },
                remote: {
                    days: 30,
                    maxSize: '10GB',
                },
            },
            options: {
                localEnabled: true,
                remoteEnabled: true,
            },
        }

        const fullConfig: FullConfig = {
            projects: [project],
            oss: {
                region: 'oss-cn-hangzhou',
                accessKeyId: 'test-key-id',
                accessKeySecret: 'test-secret',
                bucket: 'test-bucket',
                endpoint: 'https://oss-cn-hangzhou.aliyuncs.com',
            },
        }

        vi.spyOn(OSSStorage.prototype, 'uploadFiles').mockResolvedValue([
            { key: 'backups/sqlite-db/app.db', success: false, error: 'upload failed' },
        ])
        vi.spyOn(OSSStorage.prototype, 'cleanup').mockResolvedValue({
            deletedFiles: [],
            freedSpace: 0,
            success: true,
        })

        const service = new BackupService({
            project,
            fullConfig,
            localBackupDir,
            tempDir: join(tempRoot, 'temp-sqlite-remote'),
        })

        const result = await service.run()

        expect(result.localUpload?.success).toBe(true)
        expect(result.remoteUpload?.success).toBe(false)
        expect(result.overallSuccess).toBe(true)
    })

    it('应该完成 MongoDB 本地备份、压缩并清理临时目录', async () => {
        const project: MongoDBProjectConfig = {
            name: 'mongo-db',
            dbType: 'mongodb',
            connection: {
                uri: 'mongodb://127.0.0.1:27017/app?authSource=admin',
                database: 'app',
            },
            dumpOptions: {
                archive: true,
                authenticationDatabase: 'admin',
            },
            backupSchedule: '0 2 * * *',
            compress: {
                enabled: true,
                password: false,
            },
            retention: {
                local: {
                    days: 30,
                    maxSize: '10GB',
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

        const tempDir = join(tempRoot, 'temp-mongo-local')
        const fullConfig: FullConfig = {
            projects: [project],
            security: {
                backupPassword: 'test-password',
            },
        }

        const service = new BackupService({
            project,
            fullConfig,
            localBackupDir,
            tempDir,
        })

        const result = await service.run()

        expect(result.backup.success).toBe(true)
        expect(result.compress?.success).toBe(true)
        expect(result.localUpload?.success).toBe(true)
        expect(result.overallSuccess).toBe(true)
        expect(readdirSync(join(localBackupDir, project.name)).some((fileName) => fileName.endsWith('.tar.gz'))).toBe(true)
        expect(existsSync(tempDir)).toBe(false)
    })

    it('应该在缺少加密密码时终止 MongoDB 备份流程', async () => {
        const project: MongoDBProjectConfig = {
            name: 'mongo-db',
            dbType: 'mongodb',
            connection: {
                uri: 'mongodb://127.0.0.1:27017/app?authSource=admin',
                database: 'app',
            },
            dumpOptions: {
                archive: true,
                authenticationDatabase: 'admin',
            },
            backupSchedule: '0 2 * * *',
            compress: {
                enabled: true,
                password: true,
            },
            retention: {
                local: {
                    days: 30,
                    maxSize: '10GB',
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

        const fullConfig: FullConfig = {
            projects: [project],
        }

        const service = new BackupService({
            project,
            fullConfig,
            localBackupDir,
            tempDir: join(tempRoot, 'temp-mongo-encrypt-fail'),
        })

        const result = await service.run()

        expect(result.backup.success).toBe(true)
        expect(result.compress?.success).toBe(true)
        expect(result.encrypt?.success).toBe(false)
        expect(result.localUpload).toBeUndefined()
        expect(result.overallSuccess).toBe(false)
    })

    it('应该完成 MongoDB 远程上传集成流程', async () => {
        const project: MongoDBProjectConfig = {
            name: 'mongo-remote',
            dbType: 'mongodb',
            connection: {
                uri: 'mongodb://127.0.0.1:27017/app?authSource=admin',
                database: 'app',
            },
            dumpOptions: {
                archive: true,
                authenticationDatabase: 'admin',
            },
            backupSchedule: '0 2 * * *',
            compress: {
                enabled: false,
                password: false,
            },
            retention: {
                local: {
                    days: 30,
                    maxSize: '10GB',
                },
                remote: {
                    days: 30,
                    maxSize: '10GB',
                },
            },
            options: {
                localEnabled: false,
                remoteEnabled: true,
            },
        }

        const fullConfig: FullConfig = {
            projects: [project],
            oss: {
                region: 'oss-cn-hangzhou',
                accessKeyId: 'test-key-id',
                accessKeySecret: 'test-secret',
                bucket: 'test-bucket',
                endpoint: 'https://oss-cn-hangzhou.aliyuncs.com',
            },
        }

        vi.spyOn(OSSStorage.prototype, 'uploadFiles').mockResolvedValue([
            { key: 'backups/mongo-remote/mock.archive', success: true },
        ])
        vi.spyOn(OSSStorage.prototype, 'cleanup').mockResolvedValue({
            deletedFiles: [],
            freedSpace: 0,
            success: true,
        })

        const service = new BackupService({
            project,
            fullConfig,
            localBackupDir,
            tempDir: join(tempRoot, 'temp-mongo-remote'),
        })

        const result = await service.run()

        expect(result.backup.success).toBe(true)
        expect(result.remoteUpload?.success).toBe(true)
        expect(result.overallSuccess).toBe(true)
        expect(OSSStorage.prototype.uploadFiles).toHaveBeenCalledTimes(1)
    })
})
