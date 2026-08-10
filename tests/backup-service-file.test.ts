import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { BackupService } from '@/services/backup'
import type { FileProjectConfig } from '@/types/config'

function getOnlyBackupDir(projectDir: string): string {
    const backupDirs = readdirSync(projectDir)
    expect(backupDirs).toHaveLength(1)
    return backupDirs[0]
}

describe('BackupService 通用备份模式', () => {
    let tempRoot: string
    let sourceDir: string
    let localBackupDir: string

    beforeEach(() => {
        tempRoot = join(tmpdir(), `backup-service-file-test-${Date.now()}`)
        sourceDir = join(tempRoot, 'source')
        localBackupDir = join(tempRoot, 'backups')
        mkdirSync(sourceDir, { recursive: true })
        mkdirSync(localBackupDir, { recursive: true })
    })

    afterEach(() => {
        if (existsSync(tempRoot)) {
            rmSync(tempRoot, { recursive: true, force: true })
        }
    })

    function createFileProject(overrides: Partial<FileProjectConfig> = {}): FileProjectConfig {
        return {
            name: 'file-backup',
            dbType: 'file',
            paths: [`${sourceDir.replace(/\\/g, '/')}/*`],
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
            ...overrides,
        }
    }

    it('全部产物已为压缩格式时跳过压缩并原样保存', async () => {
        writeFileSync(join(sourceDir, 'backup-a.zip'), 'zip-a')
        writeFileSync(join(sourceDir, 'backup-b.tar.gz'), 'tar-gz-b')

        const project = createFileProject({ name: 'file-skip-compress' })
        const service = new BackupService({
            project,
            fullConfig: { projects: [project] },
            localBackupDir,
            tempDir: join(tempRoot, 'temp-file-skip-compress'),
        })

        const result = await service.run()

        expect(result.backup.success).toBe(true)
        expect(result.compress?.success).toBe(true)
        expect(result.compress?.skipped).toBe(true)
        expect(result.compress?.compressedFile).toBeUndefined()
        expect(result.encrypt).toBeUndefined()
        expect(result.localUpload?.success).toBe(true)
        expect(result.overallSuccess).toBe(true)
        const projectBackupDir = join(localBackupDir, project.name)
        const backupDir = getOnlyBackupDir(projectBackupDir)
        expect(readdirSync(join(projectBackupDir, backupDir)).sort()).toEqual(['backup-a.zip', 'backup-b.tar.gz'])
    })

    it('存在未压缩产物时整体打包压缩', async () => {
        writeFileSync(join(sourceDir, 'backup.zip'), 'zip-data')
        writeFileSync(join(sourceDir, 'notes.txt'), 'notes-data')

        const project = createFileProject({ name: 'file-compress-mixed' })
        const service = new BackupService({
            project,
            fullConfig: { projects: [project] },
            localBackupDir,
            tempDir: join(tempRoot, 'temp-file-compress-mixed'),
        })

        const result = await service.run()

        expect(result.backup.success).toBe(true)
        expect(result.compress?.success).toBe(true)
        expect(result.compress?.skipped).toBeFalsy()
        expect(result.localUpload?.success).toBe(true)
        expect(result.overallSuccess).toBe(true)
        const projectBackupDir = join(localBackupDir, project.name)
        const backupDir = getOnlyBackupDir(projectBackupDir)
        expect(readdirSync(join(projectBackupDir, backupDir)).some((fileName) => fileName.endsWith('.tar.gz'))).toBe(true)
    })

    it('跳过压缩但配置密码时仍逐个加密产物', async () => {
        writeFileSync(join(sourceDir, 'backup-a.zip'), 'zip-a')
        writeFileSync(join(sourceDir, 'backup-b.zip'), 'zip-b')

        const project = createFileProject({
            name: 'file-encrypt-skipped',
            paths: [`${sourceDir.replace(/\\/g, '/')}/*.zip`],
            compress: {
                enabled: true,
                password: true,
            },
        })
        const service = new BackupService({
            project,
            fullConfig: {
                projects: [project],
                security: { backupPassword: 'test-password' },
            },
            localBackupDir,
            tempDir: join(tempRoot, 'temp-file-encrypt-skipped'),
        })

        const result = await service.run()

        expect(result.backup.success).toBe(true)
        expect(result.compress?.success).toBe(true)
        expect(result.compress?.skipped).toBe(true)
        expect(result.encrypt?.success).toBe(true)
        expect(result.encrypt?.encryptedFiles).toHaveLength(2)
        expect(result.localUpload?.success).toBe(true)
        expect(result.overallSuccess).toBe(true)
        const projectBackupDir = join(localBackupDir, project.name)
        const backupDir = getOnlyBackupDir(projectBackupDir)
        const savedFiles = readdirSync(join(projectBackupDir, backupDir)).sort()
        expect(savedFiles).toHaveLength(2)
        expect(savedFiles.every((fileName) => fileName.endsWith('.enc'))).toBe(true)
    })

    it('自定义 skipExtensions 生效：仅匹配白名单的扩展名跳过压缩', async () => {
        writeFileSync(join(sourceDir, 'backup.7z'), '7z-data')
        writeFileSync(join(sourceDir, 'backup.zip'), 'zip-data')

        const project = createFileProject({
            name: 'file-custom-skip-extensions',
            compress: {
                enabled: true,
                password: false,
                skipExtensions: ['.7z'],
            },
        })
        const service = new BackupService({
            project,
            fullConfig: { projects: [project] },
            localBackupDir,
            tempDir: join(tempRoot, 'temp-file-custom-skip-extensions'),
        })

        const result = await service.run()

        expect(result.backup.success).toBe(true)
        expect(result.compress?.success).toBe(true)
        expect(result.compress?.skipped).toBeFalsy()
        expect(result.overallSuccess).toBe(true)
        const projectBackupDir = join(localBackupDir, project.name)
        const backupDir = getOnlyBackupDir(projectBackupDir)
        expect(readdirSync(join(projectBackupDir, backupDir)).some((fileName) => fileName.endsWith('.tar.gz'))).toBe(true)
    })
})
