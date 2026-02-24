import { join } from 'node:path'
import { CronJob } from 'cron'
import Debug from 'debug'
import { BackupService, type BackupTaskResult } from './backup'
import type { ProjectConfig, EnvConfig } from '@/types/config'
import type { NotifyService } from '@/notify'

const debug = Debug('backup:scheduler')

/**
 * 调度任务状态
 */
export interface ScheduleStatus {
    /** 项目名称 */
    projectName: string
    /** 是否正在运行 */
    isRunning: boolean
    /** 下次执行时间 */
    nextRunTime?: Date
    /** 上次执行时间 */
    lastRunTime?: Date
    /** 上次执行结果 */
    lastResult?: BackupTaskResult
}

/**
 * 调度器配置
 */
export interface SchedulerConfig {
    /** 项目配置列表 */
    projects: ProjectConfig[]
    /** 环境变量配置 */
    env: EnvConfig
    /** 本地备份根目录 */
    localBackupDir: string
    /** 临时目录 */
    tempDir: string
    /** 通知服务（可选） */
    notifyService?: NotifyService
}

/**
 * 调度器服务
 * 基于 cron 实现定时任务调度
 */
export class SchedulerService {
    private config: SchedulerConfig
    private jobs = new Map<string, CronJob>()
    private statuses = new Map<string, ScheduleStatus>()
    private notifyService?: NotifyService

    constructor(config: SchedulerConfig) {
        this.config = config
        this.notifyService = config.notifyService
    }

    /**
     * 启动所有调度任务
     */
    start(): void {
        debug('启动调度器')

        for (const project of this.config.projects) {
            this.scheduleProject(project)
        }

        debug(`已启动 ${this.jobs.size} 个调度任务`)
    }

    /**
     * 停止所有调度任务
     */
    stop(): void {
        debug('停止调度器')

        for (const [name, job] of this.jobs) {
            void job.stop()
            debug(`已停止任务: ${name}`)
        }

        this.jobs.clear()
    }

    /**
     * 调度单个项目
     */
    private scheduleProject(project: ProjectConfig): void {
        const { cronExpression } = this.parseCronExpression(project.backupSchedule)

        const status: ScheduleStatus = {
            projectName: project.name,
            isRunning: false,
        }
        this.statuses.set(project.name, status)

        const job = new CronJob(
            cronExpression,
            async () => {
                await this.runBackup(project)
            },
            undefined,
            true, // 立即启动
        )

        this.jobs.set(project.name, job)
        status.nextRunTime = job.nextDate()?.toJSDate()

        debug(`已调度任务: ${project.name}, cron: ${cronExpression}, 下次执行: ${status.nextRunTime?.toISOString()}`)
    }

    /**
     * 解析 cron 表达式
     * 支持标准 5 字段和 6 字段（带秒）格式
     */
    private parseCronExpression(expression: string): { cronExpression: string } {
        const parts = expression.trim().split(/\s+/)

        // 如果是 5 字段，添加秒字段（0）
        if (parts.length === 5) {
            return { cronExpression: `0 ${expression}` }
        }

        return { cronExpression: expression }
    }

    /**
     * 执行备份任务
     */
    private async runBackup(project: ProjectConfig): Promise<void> {
        const status = this.statuses.get(project.name)
        if (!status) {
            return
        }

        // 防止并发执行
        if (status.isRunning) {
            debug(`任务 ${project.name} 正在运行，跳过本次执行`)
            return
        }

        status.isRunning = true
        debug(`开始执行备份任务: ${project.name}`)

        try {
            const backupService = new BackupService({
                project,
                env: this.config.env,
                localBackupDir: this.config.localBackupDir,
                tempDir: this.getTempDir(project.name),
                notifyService: this.notifyService,
            })

            const result = await backupService.run()

            status.lastRunTime = new Date()
            status.lastResult = result

            debug(`备份任务完成: ${project.name}, 成功: ${result.overallSuccess}`)
        } catch (error) {
            debug(`备份任务异常: ${project.name}, 错误: ${error}`)
            status.lastRunTime = new Date()
        } finally {
            status.isRunning = false
            // 更新下次执行时间
            const job = this.jobs.get(project.name)
            if (job) {
                status.nextRunTime = job.nextDate()?.toJSDate()
            }
        }
    }

    /**
     * 获取临时目录
     */
    private getTempDir(projectName: string): string {
        const timestamp = Date.now()
        return join(this.config.tempDir, `${projectName}-${timestamp}`)
    }

    /**
     * 手动触发备份
     */
    async triggerBackup(projectName: string): Promise<BackupTaskResult | null> {
        const project = this.config.projects.find((p) => p.name === projectName)
        if (!project) {
            debug(`未找到项目: ${projectName}`)
            return null
        }

        await this.runBackup(project)

        const status = this.statuses.get(projectName)
        return status?.lastResult || null
    }

    /**
     * 获取所有任务状态
     */
    getStatuses(): ScheduleStatus[] {
        return Array.from(this.statuses.values())
    }

    /**
     * 获取单个任务状态
     */
    getStatus(projectName: string): ScheduleStatus | undefined {
        return this.statuses.get(projectName)
    }

    /**
     * 重新加载配置
     */
    reload(config: SchedulerConfig): void {
        debug('重新加载调度器配置')

        // 停止现有任务
        this.stop()

        // 更新配置
        this.config = config
        this.notifyService = config.notifyService

        // 重新启动
        this.start()
    }
}
