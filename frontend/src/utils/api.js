/*
import axios from 'axios';

const API = axios.create({
  baseURL: 'import.meta.env.VITE_API_URL/api',
});

// Automatically attach token to every request if it exists
API.interceptors.request.use((config) => {
  const token = localStorage.getItem('nepshop_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default API;

*/




/* This is added for vercel deployment by chatgpt*/

import axios from 'axios';

const API = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL}/api`,
});

// Automatically attach token to every request if it exists
API.interceptors.request.use((config) => {
  const token = localStorage.getItem('nepshop_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default API;