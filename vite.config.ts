import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { calendarApiPlugin } from './server/vite-plugin.ts'

export default defineConfig({
  plugins: [react(), calendarApiPlugin()],
})
