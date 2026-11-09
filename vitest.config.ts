import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Tes unit merender komponen server apa adanya, jadi alias `@/` harus sama dengan tsconfig.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: { environment: 'node' },
});
