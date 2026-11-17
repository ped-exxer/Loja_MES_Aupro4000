import { defineConfig } from 'vite';

// Sem plugin do React: o Vite já compila o JSX (lê "jsx": "react-jsx" do tsconfig).
// No desenvolvimento, /api vai para o servidor da Loja (npm run dev:loja).
export default defineConfig({
  server: { port: 5173, proxy: { '/api': 'http://localhost:8080' } },
});
