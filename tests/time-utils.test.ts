import { describe, expect, it } from 'vitest'
import { formatDuration } from '@/utils/time'

describe('time utils', () => {
    describe('formatDuration', () => {
        it('小于 1 秒时以毫秒展示', () => {
            expect(formatDuration(0)).toBe('0ms')
            expect(formatDuration(1)).toBe('1ms')
            expect(formatDuration(999)).toBe('999ms')
        })

        it('小于 1 分钟时以秒展示', () => {
            expect(formatDuration(1000)).toBe('1.00s')
            expect(formatDuration(1500)).toBe('1.50s')
            expect(formatDuration(59_999)).toBe('1m0.0s')
        })

        it('小于 1 小时时以分钟和秒展示', () => {
            expect(formatDuration(60_000)).toBe('1m0.0s')
            expect(formatDuration(61_200)).toBe('1m1.2s')
            expect(formatDuration(3_599_000)).toBe('59m59.0s')
        })

        it('超过 1 小时时以小时和分钟展示', () => {
            expect(formatDuration(3_600_000)).toBe('1h0m')
            expect(formatDuration(3_723_000)).toBe('1h2m')
        })

        it('负数或非法值按 0 处理', () => {
            expect(formatDuration(-1)).toBe('0ms')
            expect(formatDuration(Number.NaN)).toBe('0ms')
            expect(formatDuration(Number.POSITIVE_INFINITY)).toBe('0ms')
        })
    })
})
