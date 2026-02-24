import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ConfigLoader } from '@/config/loader'

describe('ConfigLoader', () => {
    let tempDir: string
    let configPath: string
    let envPath: string

    beforeEach(() => {
        tempDir = join(tmpdir(), `backup-test-${Date.now()}`)
        mkdirSync(tempDir, { recursive: true })
        configPath = join(tempDir, 'config.yml')
        envPath = join(tempDir, '.env')
    })

    afterEach(() => {
        if (existsSync(tempDir)) {
            rmSync(tempDir, { recursive: true, force: true })
        }
    })

    describe('loadAppConfig', () => {
        it('应该正确加载有效的配置文件', () => {
            const configContent = `
projects:
  - name: test-db
    dbType: sqlite
    dbPath: "/data/test/*.db"
    backupSchedule: "0 2 * * *"
    compress:
      enabled: true
      password: false
    retention:
      local:
        days: 7
        maxSize: 2GB
      remote:
        days: 30
        maxSize: 10GB
    options:
      localEnabled: true
      remoteEnabled: false
`
            writeFileSync(configPath, configContent)

            const loader = new ConfigLoader(configPath, envPath)
            const config = loader.loadAppConfig()

            expect(config.projects).toHaveLength(1)
            expect(config.projects[0].name).toBe('test-db')
            expect(config.projects[0].dbType).toBe('sqlite')
            expect(config.projects[0].backupSchedule).toBe('0 2 * * *')
        })

        it('应该抛出错误如果配置文件不存在', () => {
            const loader = new ConfigLoader('/nonexistent/config.yml', envPath)

            expect(() => loader.loadAppConfig()).toThrow('配置文件不存在')
        })

        it('应该抛出错误如果配置文件格式不正确', () => {
            writeFileSync(configPath, 'invalid: yaml: content:')

            const loader = new ConfigLoader(configPath, envPath)

            expect(() => loader.loadAppConfig()).toThrow()
        })

        it('应该抛出错误如果缺少 projects 字段', () => {
            writeFileSync(configPath, 'other: value')

            const loader = new ConfigLoader(configPath, envPath)

            expect(() => loader.loadAppConfig()).toThrow('缺少 projects 字段')
        })
    })

    describe('loadEnvConfig', () => {
        it('应该正确加载环境变量', () => {
            const envContent = `
OSS_REGION=oss-cn-hangzhou
OSS_ACCESS_KEY_ID=test-key-id
OSS_ACCESS_KEY_SECRET=test-secret
OSS_BUCKET=test-bucket
OSS_ENDPOINT=https://oss-cn-hangzhou.aliyuncs.com
BACKUP_PASSWORD=test-password
`
            writeFileSync(envPath, envContent)

            const loader = new ConfigLoader(configPath, envPath)
            const env = loader.loadEnvConfig()

            expect(env.oss.region).toBe('oss-cn-hangzhou')
            expect(env.oss.accessKeyId).toBe('test-key-id')
            expect(env.oss.accessKeySecret).toBe('test-secret')
            expect(env.oss.bucket).toBe('test-bucket')
            expect(env.oss.endpoint).toBe('https://oss-cn-hangzhou.aliyuncs.com')
            expect(env.backupPassword).toBe('test-password')
        })

        it('应该返回空值如果 .env 文件不存在', () => {
            // 清理可能存在的环境变量
            delete process.env.OSS_REGION
            delete process.env.OSS_ACCESS_KEY_ID
            delete process.env.OSS_ACCESS_KEY_SECRET
            delete process.env.OSS_BUCKET
            delete process.env.OSS_ENDPOINT
            delete process.env.BACKUP_PASSWORD

            const loader = new ConfigLoader(configPath, '/nonexistent/.env')
            const env = loader.loadEnvConfig()

            expect(env.oss.region).toBe('')
            expect(env.oss.accessKeyId).toBe('')
            expect(env.backupPassword).toBeUndefined()
        })
    })

    describe('validate', () => {
        it('应该通过有效配置的校验', () => {
            const configContent = `
projects:
  - name: test-db
    dbType: sqlite
    dbPath: "/data/test/*.db"
    backupSchedule: "0 2 * * *"
    compress:
      enabled: true
    retention:
      local:
        days: 7
        maxSize: 2GB
      remote:
        days: 30
        maxSize: 10GB
    options:
      localEnabled: true
      remoteEnabled: false
`
            writeFileSync(configPath, configContent)
            writeFileSync(envPath, '')

            const loader = new ConfigLoader(configPath, envPath)

            // 不应该抛出错误
            expect(() => loader.load()).not.toThrow()
        })

        it('应该校验 OSS 配置如果启用了远程备份', () => {
            // 清理可能存在的环境变量
            delete process.env.OSS_REGION
            delete process.env.OSS_ACCESS_KEY_ID
            delete process.env.OSS_ACCESS_KEY_SECRET
            delete process.env.OSS_BUCKET
            delete process.env.OSS_ENDPOINT

            const configContent = `
projects:
  - name: test-db
    dbType: sqlite
    dbPath: "/data/test/*.db"
    backupSchedule: "0 2 * * *"
    compress:
      enabled: true
    retention:
      local:
        days: 7
        maxSize: 2GB
      remote:
        days: 30
        maxSize: 10GB
    options:
      localEnabled: true
      remoteEnabled: true
`
            writeFileSync(configPath, configContent)
            writeFileSync(envPath, '')

            const loader = new ConfigLoader(configPath, envPath)

            expect(() => loader.load()).toThrow('OSS 配置错误')
        })

        it('应该校验 Cron 表达式格式', () => {
            const configContent = `
projects:
  - name: test-db
    dbType: sqlite
    dbPath: "/data/test/*.db"
    backupSchedule: "invalid-cron"
    compress:
      enabled: true
    retention:
      local:
        days: 7
        maxSize: 2GB
      remote:
        days: 30
        maxSize: 10GB
    options:
      localEnabled: true
      remoteEnabled: false
`
            writeFileSync(configPath, configContent)
            writeFileSync(envPath, '')

            const loader = new ConfigLoader(configPath, envPath)

            expect(() => loader.load()).toThrow('不是有效的 Cron 表达式')
        })
    })
})
