/**
 * Frontend API base URL.
 * - Local CRA: leave unset and use package.json "proxy"
 * - Vercel: set REACT_APP_API_URL to the Render API origin (no trailing slash)
 */
import axios from 'axios';

const raw = (process.env.REACT_APP_API_URL || '').trim().replace(/\/$/, '');

export const API_BASE_URL = raw;

export function configureApiClient() {
  if (API_BASE_URL) {
    axios.defaults.baseURL = API_BASE_URL;
  }
}

export default configureApiClient;
