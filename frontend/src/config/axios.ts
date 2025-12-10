import axios from 'axios';

// Configure axios defaults
axios.defaults.withCredentials = true;
axios.defaults.baseURL = '';

// Add request interceptor for debugging (optional)
axios.interceptors.request.use(
  (config) => {
    // Ensure withCredentials is always true
    config.withCredentials = true;
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add response interceptor for error handling
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    // If we get a 401, it might mean the session expired
    if (error.response?.status === 401) {
      const currentPath = window.location.pathname;
      // Only redirect to home if not already there
      if (currentPath !== '/' && !currentPath.startsWith('/checkout/')) {
        console.log('Session expired, redirecting to login...');
        window.location.href = '/';
      }
    }
    return Promise.reject(error);
  }
);

export default axios;

