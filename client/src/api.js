import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  timeout: 15000,
});

export const errorMessage = (error) =>
  error.response?.data?.message ||
  error.message ||
  "Something went wrong";

export default api;