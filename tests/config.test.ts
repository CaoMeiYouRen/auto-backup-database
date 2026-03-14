import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfigLoader } from '@/config/loader'
import type { FullConfig } from '@/types/config'

describe('ConfigLoader', () => {
    let tempDir: string
    let configPath: string
    let envPath: string

    beforeEach(() => {
        tempDir = join(tmpdir(), `backup-config-test-${Date.now()}`)
        mkdirSync(tempDir, { recursive: true })
        configPath = join(tempDir, 'config.yml')
        envPath = join(tempDir, '.env')
    })

    afterEach(() => {
        vi.unstubAllEnvs()

        if (existsSync(tempDir)) {
            rmSync(tempDir, { recursive: true, force: true })
        }
    })

    it('应该返回展开后的统一配置对象', () => {
        writeFileSync(configPath, `
oss:
  region: "\${OSS_REGION}"
  accessKeyId: "\${OSS_ACCESS_KEY_ID}"
  accessKeySecret: "\${OSS_ACCESS_KEY_SECRET}"
  bucket: "\${OSS_BUCKET}"
  endpoint: "\${OSS_ENDPOINT}"

security:
  backupPassword: "\${BACKUP_PASSWORD}"

projects:
  - name: test-db
    dbType: sqlite
    dbPath: "\${SQLITE_PATH:-/data/test/*.db}"
    backupSchedule: "0 2 * * *"
    compress:
      enabled: true
      password: true
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
`)

        writeFileSync(envPath, `
OSS_REGION=oss-cn-hangzhou
OSS_ACCESS_KEY_ID=test-key-id
OSS_ACCESS_KEY_SECRET=test-secret
OSS_BUCKET=test-bucket
OSS_ENDPOINT=https://oss-cn-hangzhou.aliyuncs.com
BACKUP_PASSWORD=test-password
`)

        const loader = new ConfigLoader(configPath, envPath)
        const config = loader.load()

        expect(config.oss?.region).toBe('oss-cn-hangzhou')
        expect(config.oss?.accessKeyId).toBe('test-key-id')
        expect(config.security?.backupPassword).toBe('test-password')
        expect(config.projects[0].dbType).toBe('sqlite')
        if (config.projects[0].dbType === 'sqlite') {
            expect(config.projects[0].dbPath).toBe('/data/test/*.db')
        }
    })

    it('应该在缺少必填变量时抛出清晰错误', () => {
        writeFileSync(configPath, `
security:
  backupPassword: "\${MISSING_BACKUP_PASSWORD_FOR_TEST}"

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
`)
        writeFileSync(envPath, '')

        const loader = new ConfigLoader(configPath, envPath)

        expect(() => loader.load()).toThrow('配置字段 "security.backupPassword" 引用了未定义的环境变量 "MISSING_BACKUP_PASSWORD_FOR_TEST"')
    })

    it('应该在变量缺失时使用默认值', () => {
        writeFileSync(configPath, `
security:
  backupPassword: "\${BACKUP_PASSWORD_FOR_DEFAULT_TEST:-default-password}"

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
`)
        writeFileSync(envPath, '')

        const loader = new ConfigLoader(configPath, envPath)
        const config = loader.load()

        expect(config.security?.backupPassword).toBe('default-password')
    })

    it('应该保留特殊字符而不破坏字符串值', () => {
        vi.stubEnv('SPECIAL_BACKUP_PASSWORD', 'p@ss word:#[]?&=value')
        writeFileSync(configPath, `
security:
  backupPassword: "\${SPECIAL_BACKUP_PASSWORD}"

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
`)
        writeFileSync(envPath, '')

        const loader = new ConfigLoader(configPath, envPath)
        const config = loader.load()

        expect(config.security?.backupPassword).toBe('p@ss word:#[]?&=value')
    })

    it('应该支持转义占位符并保留字面量', () => {
        writeFileSync(configPath, `
metadata: '\\\${LITERAL_PLACEHOLDER}'
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
`)
        writeFileSync(envPath, '')

        const loader = new ConfigLoader(configPath, envPath)
        const config = loader.loadAppConfig() as FullConfig & { metadata: string }

        expect(config.metadata).toBe('${LITERAL_PLACEHOLDER}')
    })

    it('应该在启用远程备份时校验 oss 配置', () => {
        writeFileSync(configPath, `
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
      remoteEnabled: true
`)
        writeFileSync(envPath, '')

        const loader = new ConfigLoader(configPath, envPath)

        expect(() => loader.load()).toThrow('OSS 配置错误: 缺少 oss 配置')
    })

    it('应该在启用密码加密时校验 security.backupPassword', () => {
        writeFileSync(configPath, `
projects:
  - name: test-db
    dbType: sqlite
    dbPath: "/data/test/*.db"
    backupSchedule: "0 2 * * *"
    compress:
      enabled: true
      password: true
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
`)
        writeFileSync(envPath, '')

        const loader = new ConfigLoader(configPath, envPath)

        expect(() => loader.load()).toThrow('安全配置错误: 启用了密码加密但缺少 security.backupPassword')
    })

    it('应该校验 MongoDB gzip 与项目压缩冲突', () => {
        writeFileSync(configPath, `
projects:
  - name: mongo-db
    dbType: mongodb
    connection:
      uri: "mongodb://127.0.0.1:27017/app"
    dumpOptions:
      gzip: true
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
`)
        writeFileSync(envPath, '')

        const loader = new ConfigLoader(configPath, envPath)

        expect(() => loader.load()).toThrow('dumpOptions.gzip 与 compress.enabled 不能同时启用')
    })
})
