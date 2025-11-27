/**
 * Centralized Cron Scheduler
 *
 * Runs scheduled jobs within the main bot process using child processes.
 * This replaces the railway.cron.yml which Railway doesn't support as a config file.
 */

import cron from 'node-cron'
import { spawn } from 'child_process'
import { logger } from './services/monitoring/logger.js'

interface ScheduledJob {
  name: string
  schedule: string
  command: string
  description: string
}

const jobs: ScheduledJob[] = [
  {
    name: 'cleanup-parsers',
    schedule: '0 3 * * *', // Daily at 3 AM UTC
    command: 'npm run cleanup-parsers',
    description: 'Daily cleanup of learned patterns',
  },
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
    command: 'npx tsx src/cron/run-engagement-daily.ts',
    description: 'Daily engagement: inactivity, timeouts, remind-later expiration',
  },
  {
    name: 'engagement-weekly',
    schedule: '0 9 * * 1', // Weekly on Monday at 9 AM UTC
    command: 'npx tsx src/cron/run-engagement-weekly.ts',
    description: 'Weekly review: celebratory messages to active users',
  },
  {
    name: 'execute-auto-payments',
    schedule: '0 6 * * *', // Daily at 6 AM UTC
    command: 'npm run cron:execute-auto-pay',
    description: 'Daily execution of auto-pay recurring payments',
  },
  {
    name: 'send-payment-reminders',
    schedule: '0 8 * * *', // Daily at 8 AM UTC
    command: 'npm run cron:send-reminders',
    description: 'Daily WhatsApp reminders for upcoming payments',
  },
]

/**
 * Run a command as a child process
 */
function runCommand(job: ScheduledJob): Promise<{ exitCode: number; output: string }> {
  return new Promise((resolve) => {
    const startTime = Date.now()
    let output = ''

    const [cmd, ...args] = job.command.split(' ')
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
      const duration = Date.now() - startTime
      resolve({ exitCode: code ?? 1, output })
    })

    child.on('error', (error) => {
      output += `Error: ${error.message}`
      resolve({ exitCode: 1, output })
    })
  })
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
      logger.info(`Starting scheduled job: ${job.name}`, {
        description: job.description,
        command: job.command,
      })

      try {
        const { exitCode, output } = await runCommand(job)
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
