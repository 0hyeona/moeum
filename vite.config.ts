import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'VITE_');

  return {
    plugins: [react()],
    server: {
      proxy: {
        // 브라우저는 로컬 Vite 서버에 요청하고, Vite가 백엔드로 전달합니다.
        '/backend': {
          target: env.VITE_API_BASE_URL,
          changeOrigin: true,
          cookiePathRewrite: '/',
          rewrite: (path) => path.replace(/^\/backend/, ''),
        },
      },
    },
  };
});
