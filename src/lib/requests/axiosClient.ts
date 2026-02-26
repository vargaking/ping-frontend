import { PUBLIC_BASE_URL } from '$env/static/public';
import axios from 'axios';

export const axiosClient = axios.create({
	baseURL: PUBLIC_BASE_URL,
	timeout: 5000,
	withCredentials: true,
	headers: {
		'Content-Type': 'application/json',
		'ngrok-skip-browser-warning': 'true'
	}
});
