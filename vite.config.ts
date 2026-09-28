import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Content-Security-Policy para el build de producción: solo scripts propios,
 * conexiones únicamente a Supabase. (En desarrollo Vite necesita scripts inline.)
 */
function contentSecurityPolicy(supabaseUrl: string): Plugin {
  const wss = supabaseUrl.replace(/^https:/, 'wss:');
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https:",
    `connect-src 'self' ${supabaseUrl} ${wss}`,
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
  return {
    name: 'webzipe-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`,
      );
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    // Rutas relativas: funciona en GitHub Pages dentro de cualquier subcarpeta.
    base: './',
    plugins: [react(), contentSecurityPolicy(env.VITE_SUPABASE_URL || 'https://*.supabase.co')],
    build: {
      sourcemap: false,
      chunkSizeWarningLimit: 700,
    },
    server: { port: 5173, strictPort: true },
  };
});
