// eslint.config.js
import { defineConfig } from 'eslint/config'
import cmyr from 'eslint-config-cmyr'

export default defineConfig([
    cmyr,
    // CLI 入口与构建脚本以 console 输出日志为职责，放行 log
    {
        files: ['src/cli.ts', 'scripts/**/*.mjs'],
        rules: {
            'no-console': ['warn', { allow: ['log', 'warn', 'error', 'info'] }],
        },
    },
])
