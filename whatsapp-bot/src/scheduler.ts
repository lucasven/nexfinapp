/**
 * Centralized Cron Scheduler
 *
 * Runs scheduled jobs within the main bot process.
 * - Jobs that need the WhatsApp socket run IN-PROCESS (engagement jobs)
 * - Jobs that don't need the socket run as CHILD PROCESSES
 *
 * This replaces the railway.cron.yml which Railway doesn't support as a config file.
 */

import cron from 'node-cron'
import { spawn } from 'child_process'
import { logger } from './services/monitoring/logger.js'
import { runDailyEngagementJob } from './services/scheduler/daily-engagement-job.js'
import { runWeeklyReviewJob } from './services/scheduler/weekly-review-job.js'
import { runAutoPaymentsJob } from './services/scheduler/auto-payments-job.js'
import { runPaymentRemindersJob } from './services/scheduler/payment-reminders-job.js'
import { runStatementRemindersJob } from './services/scheduler/statement-reminders-job.js'
import { runCreditCardPaymentRemindersJob } from './services/scheduler/credit-card-payment-reminders-job.js'
import { processAutoPaymentTransactions } from './services/scheduler/auto-payment-transactions-job.js'

interface ScheduledJob {
  name: string
  schedule: string
  command?: string  // For child process jobs
  handler?: () => Promise<unknown>  // For in-process jobs
  description: string
}

const jobs: ScheduledJob[] = [
  {
    name: 'data-retention-cleanup',
    schedule: '0 2 * * *', // Daily at 2 AM UTC
    command: 'npm run data-retention-cleanup',
    description: 'Daily data retention cleanup',
  },
  {
    name: 'generate-recurring-payments',
    schedule: '0 0 1 * *', // Monthly on the 1st at midnight UTC
    command: 'npm run cron:generate-payments',
    description: 'Monthly generation of recurring payment entries',
  },
  {
    name: 'engagement-daily',
    schedule: '0 6 * * *', // Daily at 6 AM UTC
    handler: runDailyEngagementJob,  // Run in-process to share WhatsApp connection
    description: 'Daily engagement: inactivity, timeouts, remind-later expiration',
  },
  {
    name: 'engagement-weekly',
    schedule: '0 9 * * 1', // Weekly on Monday at 9 AM UTC
    handler: runWeeklyReviewJob,  // Run in-process to share WhatsApp connection
    description: 'Weekly review: celebratory messages to active users',
  },
  {
    name: 'execute-auto-payments',
    schedule: '0 6 * * *', // Daily at 6 AM UTC
    handler: runAutoPaymentsJob,  // Run in-process to share WhatsApp connection
    description: 'Daily execution of auto-pay recurring payments',
  },
  {
    name: 'send-payment-reminders',
    schedule: '0 8 * * *', // Daily at 8 AM UTC
    handler: runPaymentRemindersJob,  // Run in-process to share WhatsApp connection
    description: 'Daily WhatsApp reminders for upcoming payments',
  },
  {
    name: 'send-statement-reminders',
    schedule: '0 12 * * *', // Daily at 9 AM Brazil time (12:00 UTC)
    handler: runStatementRemindersJob,  // Run in-process to share WhatsApp connection
    description: 'Daily statement closing reminders (3 days before closing)',
  },
  {
    name: 'send-credit-card-payment-reminders',
    schedule: '0 12 * * *', // Daily at 9 AM Brazil time (12:00 UTC)
    handler: runCreditCardPaymentRemindersJob,  // Run in-process to share WhatsApp connection
    description: 'Daily credit card payment reminders (2 days before due date)',
  },
  {
    name: 'auto-payment-transactions',
    schedule: '0 4 * * *', // Daily at 1 AM Brazil time (4:00 UTC)
    handler: processAutoPaymentTransactions,  // Run in-process (doesn't need socket but follows pattern)
    description: 'Daily auto-payment transaction creation (statements closed yesterday)',
  },
]

/**
 * Run a command as a child process
 */
function runCommand(command: string): Promise<{ exitCode: number; output: string }> {
  return new Promise((resolve) => {
    let output = ''

    const [cmd, ...args] = command.split(' ')
    const child = spawn(cmd, args, {
      shell: true,
      cwd: process.cwd(),
      env: process.env,
    })

    child.stdout?.on('data', (data) => {
      output += data.toString()
    })

    child.stderr?.on('data', (data) => {
      output += data.toString()
    })

    child.on('close', (code) => {
      resolve({ exitCode: code ?? 1, output })
    })

    child.on('error', (error) => {
      output += `Error: ${error.message}`
      resolve({ exitCode: 1, output })
    })
  })
}

/**
 * Run an in-process handler function
 */
async function runHandler(handler: () => Promise<unknown>): Promise<{ success: boolean; error?: string }> {
  try {
    await handler()
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Start all scheduled jobs
 */
export function startScheduler(): void {
  logger.info('Starting cron scheduler', { jobCount: jobs.length })

  for (const job of jobs) {
    if (!cron.validate(job.schedule)) {
      logger.error(`Invalid cron schedule for job: ${job.name}`, { schedule: job.schedule })
      continue
    }

    cron.schedule(job.schedule, async () => {
      const startTime = Date.now()
      const isInProcess = !!job.handler

      logger.info(`Starting scheduled job: ${job.name}`, {
        description: job.description,
        mode: isInProcess ? 'in-process' : 'child-process',
      })

      try {
        if (job.handler) {
          // Run in-process (for jobs that need the WhatsApp socket)
          const result = await runHandler(job.handler)
          const duration = Date.now() - startTime

          if (result.success) {
            logger.info(`Completed scheduled job: ${job.name}`, { durationMs: duration })
          } else {
            logger.error(`Failed scheduled job: ${job.name}`, {
              durationMs: duration,
              error: result.error,
            })
          }
        } else if (job.command) {
          // Run as child process
          const { exitCode, output } = await runCommand(job.command)
          const duration = Date.now() - startTime

          if (exitCode === 0) {
            logger.info(`Completed scheduled job: ${job.name}`, { durationMs: duration })
          } else {
            logger.error(`Failed scheduled job: ${job.name}`, {
              durationMs: duration,
              exitCode,
              output: output.slice(-1000), // Last 1000 chars of output
            })
          }
        }
      } catch (error) {
        const duration = Date.now() - startTime
        logger.error(`Failed scheduled job: ${job.name}`, { durationMs: duration }, error as Error)
      }
    })

    logger.info(`Registered cron job: ${job.name}`, {
      schedule: job.schedule,
      description: job.description,
    })
  }

  logger.info('Cron scheduler started successfully')
}

/**
 * Stop all scheduled jobs (for graceful shutdown)
 */
export function stopScheduler(): void {
  cron.getTasks().forEach((task) => task.stop())
  logger.info('Cron scheduler stopped')
}
