// 配置类型
export type {
    DatabaseType,
    RetentionConfig,
    CompressConfig,
    StorageOptions,
    ProjectConfig,
    AppConfig,
    OSSConfig,
    EnvConfig,
    FullConfig,
} from './types/config'

// 配置加载器
export { ConfigLoader, createConfigLoader, loadConfig } from './config/loader'

// 数据库提供者
export { DatabaseProvider } from './providers/database'
export type { BackupResult } from './providers/database'
export { SQLiteProvider } from './providers/sqlite'

// 压缩工具
export { compress, compressMultiple, compressDirectory } from './utils/compress'
export type { CompressResult } from './utils/compress'

// 加密工具
export { encryptFile, decryptFile, encryptAndDelete, checkOpenSSL } from './utils/encrypt'
export type { EncryptResult, DecryptResult } from './utils/encrypt'
