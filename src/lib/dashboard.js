import { apiFetch } from '../context/AuthContext';

export async function getDashboard(attempt = 0) {
  try {
    const data = await apiFetch('/dashboard');
    return data.dashboard;
  } catch (error) {
    // During a rolling deploy, a new browser bundle can briefly reach an
    // older server instance that does not have this route yet. Retry that
    // one version-mismatch case; real authorization/server errors surface.
    if (error.status === 404 && attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return getDashboard(attempt + 1);
    }
    throw error;
  }
}
