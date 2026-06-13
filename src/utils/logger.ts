/**
 * 前端日志工具
 * 提供统一的日志格式和分级输出，便于浏览器控制台排查问题
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LOG_PREFIX = '[Finance]'

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: 'color: #8b8b8b',
  info: 'color: #2196f3',
  warn: 'color: #ff9800',
  error: 'color: #f44336; font-weight: bold'
}

function timestamp(): string {
  return new Date().toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 } as any)
}

function formatLog(_level: LogLevel, module: string, message: string): string {
  return `${timestamp()} ${LOG_PREFIX}[${module}] ${message}`
}

export function createLogger(module: string) {
  return {
    debug(message: string, ...args: any[]) {
      console.log(`%c${formatLog('debug', module, message)}`, LEVEL_COLORS.debug, ...args)
    },
    info(message: string, ...args: any[]) {
      console.log(`%c${formatLog('info', module, message)}`, LEVEL_COLORS.info, ...args)
    },
    warn(message: string, ...args: any[]) {
      console.warn(`%c${formatLog('warn', module, message)}`, LEVEL_COLORS.warn, ...args)
    },
    error(message: string, ...args: any[]) {
      console.error(`%c${formatLog('error', module, message)}`, LEVEL_COLORS.error, ...args)
    },
    /**
     * 记录 API 请求耗时
     */
    async withTiming<T>(label: string, fn: () => Promise<T>): Promise<T> {
      const start = performance.now()
      this.debug(`开始: ${label}`)
      try {
        const result = await fn()
        const elapsed = Math.round(performance.now() - start)
        this.debug(`完成: ${label}, 耗时: ${elapsed}ms`)
        return result
      } catch (e: any) {
        const elapsed = Math.round(performance.now() - start)
        this.error(`失败: ${label}, 耗时: ${elapsed}ms, 错误: ${e.message}`, e)
        throw e
      }
    }
  }
}
