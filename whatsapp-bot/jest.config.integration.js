export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: [
    '**/__tests__/engagement/30-day-journey.test.ts',
    '**/__tests__/engagement/daily-job.test.ts',
    '**/__tests__/engagement/idempotency.test.ts',
    '**/__tests__/engagement/weekly-job.test.ts',
    '**/__tests__/engagement/state-machine.test.ts',
    '**/__tests__/engagement/example.test.ts',
    '**/__tests__/handlers/engagement/destination-handler.integration.test.ts'
  ],
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/integration-setup.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: 'tsconfig.test.json',
      },
    ],
  },
  testTimeout: 30000, // 30 second timeout for integration tests
}
