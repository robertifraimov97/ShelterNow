import { API_BASE_URL } from '../constants/api';

export type ShelterVisitSession = {
  id: number;
  user_id: number;
  shelter_id: number;
  shelter_source: string;
  // Nullable: legacy pre-journey sessions have no journey_id.
  journey_id: number | null;
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
  shelterSource: string,
  // The user's latest available device coordinates. Required (though
  // nullable): the backend derives whether an Emergency Context is active
  // from these, never from currentCity. Pass null — do not fabricate a
  // value — when location is genuinely unavailable; the backend fails
  // closed into normal mode (no Journey, no Community shelters) in that
  // case, exactly as intended.
  latitude: number | null,
  longitude: number | null,
  // Display/backward-compatibility only. NEVER trusted by the backend to
  // gate Emergency Mode, Journey creation, or Community shelter exposure.
  currentCity?: string | null
): Promise<ShelterVisitSession> {
  const requestUrl = `${API_BASE_URL}/shelter-feedback/visit-sessions`;
  const requestBody = {
    shelter_id: shelterId,
    shelter_source: shelterSource.toLowerCase(),
    latitude,
    longitude,
    current_city: currentCity ?? null,
  };

  // TEMP DIAGNOSTIC LOGGING -- to be removed after root cause is found.
  console.log('[TEMP][createShelterVisitSession] request', { requestUrl, requestBody });

  // Create a visit session when the user starts route navigation.
  let response: Response;

  try {
    response = await fetch(requestUrl, {
      method: 'POST',
      headers: buildAuthHeaders(token),
      body: JSON.stringify(requestBody),
    });
  } catch (networkError) {
    // TEMP DIAGNOSTIC LOGGING -- this branch means fetch() itself rejected
    // (never reached the server at all) -- a true network-layer failure,
    // not an HTTP error response.
    console.log('[TEMP][createShelterVisitSession] fetch() THREW (network-layer failure, no response at all)', {
      networkError,
      networkErrorName: networkError instanceof Error ? networkError.name : typeof networkError,
      networkErrorMessage:
        networkError instanceof Error ? networkError.message : String(networkError),
      requestUrl,
    });
    throw networkError;
  }

  // TEMP DIAGNOSTIC LOGGING -- to be removed after root cause is found.
  console.log('[TEMP][createShelterVisitSession] response received', {
    status: response.status,
    ok: response.ok,
    statusText: response.statusText,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.log('[TEMP][createShelterVisitSession] non-ok response body', {
      status: response.status,
      errorText,
    });
    throw new Error(errorText || 'Failed to create shelter visit session');
  }

  const parsed = await response.json();
  console.log('[TEMP][createShelterVisitSession] parsed success body', parsed);

  return parsed;
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
