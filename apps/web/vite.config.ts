import { defineConfig } from 'vite';

// Sem plugin do React: o Vite já compila o JSX (lê "jsx": "react-jsx" do tsconfig).
export default defineConfig({
  server: {
    proxy: { '/api': 'http://localhost:3000' },
  },
});
