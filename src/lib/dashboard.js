import { apiFetch } from '../context/AuthContext';

export async function getDashboard(filters = {}, attempt = 0) {
  try {
    const query = new URLSearchParams(filters).toString();
    const data = await apiFetch(`/dashboard${query ? `?${query}` : ''}`);
    return data.dashboard;
  } catch (error) {
    // During a rolling deploy, a new browser bundle can briefly reach an
    // older server instance that does not have this route yet. Retry that
    // one version-mismatch case; real authorization/server errors surface.
    if (error.status === 404 && attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return getDashboard(filters, attempt + 1);
    }
    throw error;
  }
}
