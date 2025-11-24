import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit(), basicSsl()],
    server: {
        proxy: {
            '/api': 'http://192.168.1.249:8000',
            '/auth': 'http://192.168.1.249:8000',
            '/users': 'http://192.168.1.249:8000',
            '/servers': 'http://192.168.1.249:8000',
            '/channels': 'http://192.168.1.249:8000',
            '/ws': {
                target: 'ws://192.168.1.249:8000',
                ws: true
            }
        }
    }
});
