import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FileProvider } from '@/providers/file'
import type { FileProjectConfig } from '@/types/config'

describe('FileProvider', () => {
    let tempDir: string
    let sourceDir: string
    let outputDir: string
    let project: FileProjectConfig

    beforeEach(() => {
        tempDir = join(tmpdir(), `backup-file-provider-test-${Date.now()}`)
        sourceDir = join(tempDir, 'source')
        outputDir = join(tempDir, 'output')
        mkdirSync(sourceDir, { recursive: true })
        mkdirSync(outputDir, { recursive: true })

        project = {
            name: 'file-backup',
            dbType: 'file',
            paths: [],
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

    it('应该在没有匹配路径时返回 false', async () => {
        project.paths = [`${sourceDir.replace(/\\/g, '/')}/nonexistent/*.zip`]
        const provider = new FileProvider(project)

        await expect(provider.validatePath()).resolves.toBe(false)
    })

    it('应该复制所有匹配的文件并保留文件名', async () => {
        writeFileSync(join(sourceDir, 'app.zip'), 'zip-data')
        writeFileSync(join(sourceDir, 'notes.txt'), 'notes-data')
        project.paths = [`${sourceDir.replace(/\\/g, '/')}/*`]

        const provider = new FileProvider(project)
        const result = await provider.backup(outputDir)

        expect(result.success).toBe(true)
        expect(result.backupFiles).toHaveLength(2)
        expect(result.backupFiles.every((filePath) => existsSync(filePath))).toBe(true)
        expect(result.backupFiles.some((filePath) => filePath.endsWith('app.zip'))).toBe(true)
        expect(result.backupFiles.some((filePath) => filePath.endsWith('notes.txt'))).toBe(true)
    })

    it('应该递归复制目录并保留目录名与结构', async () => {
        const configDir = join(sourceDir, 'config')
        mkdirSync(join(configDir, 'nested'), { recursive: true })
        writeFileSync(join(configDir, 'settings.json'), '{}')
        writeFileSync(join(configDir, 'nested', 'inner.txt'), 'inner-data')
        project.paths = [configDir]

        const provider = new FileProvider(project)
        const result = await provider.backup(outputDir)

        expect(result.success).toBe(true)
        expect(result.backupFiles).toHaveLength(1)
        const backupDir = result.backupFiles[0]
        expect(existsSync(join(backupDir, 'settings.json'))).toBe(true)
        expect(existsSync(join(backupDir, 'nested', 'inner.txt'))).toBe(true)
    })

    it('应该支持文件与目录混合，重名文件追加序号避免覆盖', async () => {
        const dirA = join(sourceDir, 'a')
        const dirB = join(sourceDir, 'b')
        mkdirSync(dirA, { recursive: true })
        mkdirSync(dirB, { recursive: true })
        writeFileSync(join(dirA, 'same.zip'), 'data-a')
        writeFileSync(join(dirB, 'same.zip'), 'data-b')
        project.paths = [`${dirA.replace(/\\/g, '/')}/*.zip`, `${dirB.replace(/\\/g, '/')}/*.zip`]

        const provider = new FileProvider(project)
        const result = await provider.backup(outputDir)

        expect(result.success).toBe(true)
        expect(result.backupFiles).toHaveLength(2)
        const files = result.backupFiles.map((filePath) => filePath.split(/[\\/]/).pop())
        expect(files).toContain('same.zip')
        expect(files.some((name) => name?.startsWith('same-') && name.endsWith('.zip'))).toBe(true)
    })

    it('应该在路径重复时去重', async () => {
        writeFileSync(join(sourceDir, 'app.zip'), 'zip-data')
        const pattern = `${sourceDir.replace(/\\/g, '/')}/*.zip`
        project.paths = [pattern, pattern]

        const provider = new FileProvider(project)
        const result = await provider.backup(outputDir)

        expect(result.success).toBe(true)
        expect(result.backupFiles).toHaveLength(1)
    })

    it('应该在匹配为空时返回失败结果', async () => {
        project.paths = [`${sourceDir.replace(/\\/g, '/')}/nonexistent/*.zip`]

        const provider = new FileProvider(project)
        const result = await provider.backup(outputDir)

        expect(result.success).toBe(false)
        expect(result.backupFiles).toHaveLength(0)
        expect(result.error).toContain('未找到匹配')
    })
})
