import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import dotenv from 'dotenv';
dotenv.config();

export default defineConfig({
	plugins: [tailwindcss(), sveltekit(), basicSsl()],
	server: {
		proxy: {
			'/api': `http://${process.env.LOCAL_IP}:8000`,
			'/auth': `http://${process.env.LOCAL_IP}:8000`,
			'/users': `http://${process.env.LOCAL_IP}:8000`,
			'/servers': `http://${process.env.LOCAL_IP}:8000`,
			'/channels': `http://${process.env.LOCAL_IP}:8000`,
			'/invites': `http://${process.env.LOCAL_IP}:8000`,
			'/ws': {
				target: `ws://${process.env.LOCAL_IP}:8000`,
				ws: true
			}
		}
	}
});
