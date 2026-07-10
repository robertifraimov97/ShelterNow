import { API_BASE_URL } from '../constants/api';

export type ShelterVisitSession = {
  id: number;
  user_id: number;
  shelter_id: number;
  shelter_source: string;
  route_started_at: string;
  feedback_prompted: boolean;
  feedback_submitted: boolean;
  feedback_prompted_at?: string | null;
  feedback_submitted_at?: string | null;
  created_at: string;
};

type SubmitFeedbackPayload = {
  was_open: 'yes' | 'partial' | 'no';
  was_accessible: 'yes' | 'partial' | 'no' | 'unknown';
  condition_rating: 'good' | 'okay' | 'poor';
};

function buildAuthHeaders(token: string) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

export async function createShelterVisitSession(
  token: string,
  shelterId: number,
  shelterSource: string
): Promise<ShelterVisitSession> {
  // Create a visit session when the user starts route navigation.
  const response = await fetch(`${API_BASE_URL}/shelter-feedback/visit-sessions`, {
    method: 'POST',
    headers: buildAuthHeaders(token),
    body: JSON.stringify({
      shelter_id: shelterId,
      shelter_source: shelterSource.toLowerCase(),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Failed to create shelter visit session');
  }

  return response.json();
}

export async function getPendingShelterFeedbackSession(
  token: string
): Promise<ShelterVisitSession | null> {
  // Ask the backend whether there is a visit session ready for feedback.
  const response = await fetch(`${API_BASE_URL}/shelter-feedback/visit-sessions/pending`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Failed to load pending shelter feedback session');
  }

  return response.json();
}

export async function submitShelterFeedback(
  token: string,
  visitSessionId: number,
  payload: SubmitFeedbackPayload
) {
  // Submit the user's shelter feedback answers.
  const response = await fetch(
    `${API_BASE_URL}/shelter-feedback/visit-sessions/${visitSessionId}/submit`,
    {
      method: 'POST',
      headers: buildAuthHeaders(token),
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Failed to submit shelter feedback');
  }

  return response.json();
}
