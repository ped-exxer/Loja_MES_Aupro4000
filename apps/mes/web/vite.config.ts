import { defineConfig } from 'vite';

// Sem plugin do React: o Vite já compila o JSX (lê "jsx": "react-jsx" do tsconfig).
// No desenvolvimento, /api vai para o servidor do MES (npm run dev:mes).
export default defineConfig({
  server: { port: 5174, proxy: { '/api': 'http://localhost:8081' } },
});
