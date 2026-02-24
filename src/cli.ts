import { argv, exit } from 'node:process'
import { join, resolve } from 'node:path'
import { mkdir } from 'node:fs/promises'
import Debug from 'debug'
import { loadConfig } from '@/config/loader'
import { SchedulerService } from '@/services/scheduler'
import { BackupService } from '@/services/backup'
import { NotifyService } from '@/notify'

// 启用 debug 日志
Debug.enable('backup:*')

const debug = Debug('backup:cli')

/**
 * CLI 参数
 */
interface CLIOptions {
    /** 配置文件路径 */
    config?: string
    /** 环境变量文件路径 */
    env?: string
    /** 本地备份目录 */
    output?: string
    /** 运行模式: once (单次) | schedule (调度) */
    mode: 'once' | 'schedule'
    /** 指定项目名称（单次模式） */
    project?: string
}

/**
 * 解析命令行参数
 */
function parseArgs(): CLIOptions {
    const args = argv.slice(2)
    const options: CLIOptions = {
        mode: 'schedule',
    }

    for (let i = 0; i < args.length; i++) {
        const arg = args[i]

        switch (arg) {
            case '-c':
            case '--config':
                options.config = args[++i]
                break
            case '-e':
            case '--env':
                options.env = args[++i]
                break
            case '-o':
            case '--output':
                options.output = args[++i]
                break
            case '-m':
            case '--mode':
                options.mode = args[++i] as 'once' | 'schedule'
                break
            case '-p':
            case '--project':
                options.project = args[++i]
                break
            case '-h':
            case '--help':
                printHelp()
                break
            default:
                console.error(`未知参数: ${arg}`)
                printHelp()
                exit(1)
        }
    }

    return options
}

/**
 * 打印帮助信息
 */
function printHelp(): void {
    console.log(`
数据库自动备份工具

用法: auto-backup-database [选项]

选项:
  -c, --config <path>    配置文件路径 (默认: config.yml)
  -e, --env <path>       环境变量文件路径 (默认: .env)
  -o, --output <path>    本地备份目录 (默认: ./backups)
  -m, --mode <mode>      运行模式: once (单次) | schedule (调度) (默认: schedule)
  -p, --project <name>   指定项目名称 (单次模式)
  -h, --help             显示帮助信息

示例:
  # 启动调度器
  auto-backup-database

  # 单次执行所有项目备份
  auto-backup-database -m once

  # 单次执行指定项目备份
  auto-backup-database -m once -p my-app-db

  # 指定配置文件
  auto-backup-database -c /path/to/config.yml
`)
}

/**
 * 主函数
 */
async function main(): Promise<void> {
    debug('启动数据库备份工具')

    const options = parseArgs()
    debug('CLI 参数: %O', options)

    try {
        // 加载配置
        const config = loadConfig(options.config, options.env)
        debug('配置加载完成，项目数: %d', config.app.projects.length)

        // 设置默认目录
        const localBackupDir = resolve(options.output || './backups')
        const tempDir = resolve('./.temp/backups')

        // 确保目录存在
        await mkdir(localBackupDir, { recursive: true })
        await mkdir(tempDir, { recursive: true })

        // 创建通知服务（如果配置了）
        let notifyService: NotifyService | undefined
        if (config.app.notify?.enabled) {
            notifyService = new NotifyService(config.app.notify)
            debug('通知服务已启用: %s', config.app.notify.type)
        }

        if (options.mode === 'once') {
            // 单次执行模式
            await runOnce(config, localBackupDir, tempDir, options.project, notifyService)
        } else {
            // 调度模式
            runSchedule(config, localBackupDir, tempDir, notifyService)
        }
    } catch (error) {
        console.error('执行失败:', error instanceof Error ? error.message : String(error))
        debug('执行失败: %O', error)
        exit(1)
    }
}

/**
 * 单次执行模式
 */
async function runOnce(
    config: ReturnType<typeof loadConfig>,
    localBackupDir: string,
    tempDir: string,
    projectName?: string,
    notifyService?: NotifyService,
): Promise<void> {
    debug('单次执行模式')

    const projects = projectName
        ? config.app.projects.filter((p) => p.name === projectName)
        : config.app.projects

    if (projects.length === 0) {
        console.error('未找到匹配的项目')
        exit(1)
    }

    debug('待执行项目: %d', projects.length)

    let successCount = 0
    let failCount = 0

    for (const project of projects) {
        console.log(`\n开始备份: ${project.name}`)

        const backupService = new BackupService({
            project,
            env: config.env,
            localBackupDir,
            tempDir: join(tempDir, `${project.name}-${Date.now()}`),
            notifyService,
        })

        const result = await backupService.run()

        if (result.overallSuccess) {
            successCount++
            console.log(`✓ 备份成功: ${project.name}`)
        } else {
            failCount++
            console.error(`✗ 备份失败: ${project.name}`)
            if (result.backup.error) {
                console.error(`  错误: ${result.backup.error}`)
            }
        }
    }

    console.log(`\n执行完成: 成功 ${successCount}, 失败 ${failCount}`)

    if (failCount > 0) {
        exit(1)
    }
}

/**
 * 调度模式
 */
function runSchedule(
    config: ReturnType<typeof loadConfig>,
    localBackupDir: string,
    tempDir: string,
    notifyService?: NotifyService,
): void {
    debug('调度模式')

    const scheduler = new SchedulerService({
        projects: config.app.projects,
        env: config.env,
        localBackupDir,
        tempDir,
        notifyService,
    })

    // 启动调度器
    scheduler.start()

    console.log('调度器已启动')
    console.log('按 Ctrl+C 停止\n')

    // 打印任务状态
    const statuses = scheduler.getStatuses()
    for (const status of statuses) {
        console.log(`项目: ${status.projectName}`)
        console.log(`  下次执行: ${status.nextRunTime?.toLocaleString('zh-CN') || '未知'}`)
    }

    // 处理退出信号
    const shutdown = () => {
        console.log('\n正在停止调度器...')
        scheduler.stop()
        console.log('调度器已停止')
        exit(0)
    }

    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)
}

// 运行主函数
main().catch((error) => {
    console.error('未捕获的异常:', error)
    exit(1)
})
