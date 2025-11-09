/**
 * Structured logging service for the WhatsApp bot
 * 
 * Provides consistent logging with levels, context, and timing information
 * to improve debugging and monitoring capabilities.
 */

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error'
}

export interface LogContext {
  whatsappNumber?: string
  userId?: string
  action?: string
  strategy?: string
  duration?: number
  confidence?: number
  [key: string]: any
}

export interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
  context?: LogContext
  error?: Error
}

class Logger {
  private minLevel: LogLevel
  private enableConsole: boolean

  constructor() {
    // Read from environment variables
    const envLevel = process.env.LOG_LEVEL?.toLowerCase() || 'info'
    this.minLevel = this.parseLogLevel(envLevel)
    this.enableConsole = process.env.LOG_CONSOLE !== 'false'
  }

  private parseLogLevel(level: string): LogLevel {
    switch (level) {
      case 'debug':
        return LogLevel.DEBUG
      case 'info':
        return LogLevel.INFO
      case 'warn':
        return LogLevel.WARN
      case 'error':
        return LogLevel.ERROR
      default:
        return LogLevel.INFO
    }
  }

  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR]
    const minIndex = levels.indexOf(this.minLevel)
    const currentIndex = levels.indexOf(level)
    return currentIndex >= minIndex
  }

  private formatLogEntry(entry: LogEntry): string {
    const parts = [
      `[${entry.timestamp}]`,
      `[${entry.level.toUpperCase()}]`,
      entry.message
    ]

    if (entry.context && Object.keys(entry.context).length > 0) {
      parts.push(JSON.stringify(entry.context, null, 2))
    }

    if (entry.error) {
      parts.push(`Error: ${entry.error.message}`)
      if (entry.error.stack) {
        parts.push(entry.error.stack)
      }
    }

    return parts.join(' ')
  }

  private log(level: LogLevel, message: string, context?: LogContext, error?: Error): void {
    if (!this.shouldLog(level)) {
      return
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      error
    }

    if (this.enableConsole) {
      const formatted = this.formatLogEntry(entry)
      
      switch (level) {
        case LogLevel.DEBUG:
          console.debug(formatted)
          break
        case LogLevel.INFO:
          console.log(formatted)
          break
        case LogLevel.WARN:
          console.warn(formatted)
          break
        case LogLevel.ERROR:
          console.error(formatted)
          break
      }
    }
  }

  debug(message: string, context?: LogContext): void {
    this.log(LogLevel.DEBUG, message, context)
  }

  info(message: string, context?: LogContext): void {
    this.log(LogLevel.INFO, message, context)
  }

  warn(message: string, context?: LogContext): void {
    this.log(LogLevel.WARN, message, context)
  }

  error(message: string, contextOrError?: LogContext | Error, error?: Error): void {
    let finalContext: LogContext | undefined
    let finalError: Error | undefined

    if (contextOrError instanceof Error) {
      finalError = contextOrError
    } else {
      finalContext = contextOrError
      finalError = error
    }

    this.log(LogLevel.ERROR, message, finalContext, finalError)
  }

  /**
   * Create a child logger with default context
   * Useful for maintaining context across multiple log calls
   */
  child(defaultContext: LogContext): Logger {
    const childLogger = new Logger()
    const originalLog = childLogger.log.bind(childLogger)

    childLogger.log = (level: LogLevel, message: string, context?: LogContext, error?: Error) => {
      const mergedContext = { ...defaultContext, ...context }
      originalLog(level, message, mergedContext, error)
    }

    return childLogger
  }

  /**
   * Measure execution time of a function
   */
  async time<T>(
    label: string,
    fn: () => Promise<T>,
    context?: LogContext
  ): Promise<T> {
    const startTime = Date.now()
    this.debug(`${label} - started`, context)

    try {
      const result = await fn()
      const duration = Date.now() - startTime
      this.info(`${label} - completed`, { ...context, duration })
      return result
    } catch (error) {
      const duration = Date.now() - startTime
      this.error(`${label} - failed`, { ...context, duration }, error as Error)
      throw error
    }
  }

  /**
   * Measure execution time synchronously
   */
  timeSync<T>(
    label: string,
    fn: () => T,
    context?: LogContext
  ): T {
    const startTime = Date.now()
    this.debug(`${label} - started`, context)

    try {
      const result = fn()
      const duration = Date.now() - startTime
      this.info(`${label} - completed`, { ...context, duration })
      return result
    } catch (error) {
      const duration = Date.now() - startTime
      this.error(`${label} - failed`, { ...context, duration }, error as Error)
      throw error
    }
  }
}

// Export singleton instance
export const logger = new Logger()

// Export class for testing
export { Logger }

