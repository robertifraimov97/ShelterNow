import { API_BASE_URL } from '../constants/api';

export type UserPreferences = {
  mobility_status: 'regular' | 'limited';
  prefer_accessible_route: boolean;
};

function buildAuthHeaders(token: string) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

export async function getUserPreferences(token: string): Promise<UserPreferences> {
  const response = await fetch(`${API_BASE_URL}/users/me/preferences`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Failed to load user preferences');
  }

  return response.json();
}

export async function updateUserPreferences(
  token: string,
  payload: UserPreferences
): Promise<UserPreferences> {
  const response = await fetch(`${API_BASE_URL}/users/me/preferences`, {
    method: 'PUT',
    headers: buildAuthHeaders(token),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Failed to update user preferences');
  }

  return response.json();
}
