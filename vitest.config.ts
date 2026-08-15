// vitest 单元测试配置（独立于 vite.config.ts，避免类型冲突）
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts']
  }
})
