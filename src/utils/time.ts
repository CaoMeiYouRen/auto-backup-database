/**
 * 将毫秒耗时格式化为便于阅读的字符串
 * @param milliseconds 耗时（毫秒）
 * @returns 形如 120ms、1.50s、2m3.4s、1h2m 的字符串
 */
export function formatDuration(milliseconds: number): string {
    if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
        return '0ms'
    }

    if (milliseconds < 1000) {
        return `${Math.round(milliseconds)}ms`
    }

    // 先按 0.01s 精度取整，避免 59.999s 被格式化成 "60.00s"
    const seconds = Number((milliseconds / 1000).toFixed(2))
    if (seconds < 60) {
        return `${seconds.toFixed(2)}s`
    }

    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) {
        const remainingSeconds = seconds - minutes * 60
        return `${minutes}m${remainingSeconds.toFixed(1)}s`
    }

    const hours = Math.floor(minutes / 60)
    const remainingMinutes = minutes % 60
    return `${hours}h${remainingMinutes}m`
}
