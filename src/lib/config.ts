/** Public game endpoint. The original hosted backend is unsafe and is not a fallback. */
export const serverURL: string = import.meta.env.VITE_SERVER_URL || 'http://127.0.0.1:8080';
