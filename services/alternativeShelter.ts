import { API_BASE_URL } from '../constants/api';

// Thrown for genuine failures: network errors, unexpected server errors, or
// a journey that can't be found/isn't active. Never thrown for the normal
// "no alternative available" domain outcome — that is a return value, not
// an exception.
export class AlternativeShelterServiceError extends Error {
  cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'AlternativeShelterServiceError';
    this.cause = cause;
  }
}

export type CurrentShelterPreview = {
  id: number;
  source: string;
  name: string;
  // Estimates only: straight-line (Haversine) distance and the existing
  // 80m/min walking heuristic used throughout the backend — not a routed
  // walking distance or exact travel time.
  estimatedDistanceMeters: number;
  estimatedWalkMinutes: number;
};

export type RecommendedAlternativeShelter = {
  id: number;
  source: string;
  name: string;
  latitude: number;
  longitude: number;
  estimatedDistanceMeters: number;
  estimatedWalkMinutes: number;
};

export type AlternativeComparison = {
  additionalEstimatedDistanceMeters: number;
  additionalEstimatedWalkMinutes: number;
};

export type AlternativePreviewResult =
  | {
      status: 'available';
      journeyId: number;
      currentVisitSessionId: number;
      currentShelter: CurrentShelterPreview;
      recommendedAlternative: RecommendedAlternativeShelter;
      comparison: AlternativeComparison;
    }
  | {
      status: 'unavailable';
      journeyId: number;
      currentVisitSessionId: number;
      currentShelter: CurrentShelterPreview;
    };

export type AcceptedShelterNavigationData = {
  id: number;
  source: string;
  name: string;
  city: string;
  address: string | null;
  latitude: number;
  longitude: number;
};

export type AcceptAlternativeResult =
  | {
      status: 'accepted';
      journeyId: number;
      visitSessionId: number;
      // Extension point for a future explicit Journey action such as
      // "חזור ליעד קודם" (revert to previous destination) — the backend
      // already tracks and returns this, but nothing acts on it yet beyond
      // display. A future revert action belongs on the Journey itself (a
      // new endpoint), not as router.back()/browser Back behavior.
      previousVisitSessionId: number | null;
      shelter: AcceptedShelterNavigationData;
    }
  // The previewed shelter no longer matches the backend's freshly
  // recomputed recommendation (e.g. time passed, user moved).
  | { status: 'stale_preview' }
  // The requested shelter was already attempted in this journey.
  | { status: 'already_attempted' }
  // Nothing eligible remained by the time accept was processed.
  | { status: 'no_alternative_available' }
  // Current coordinates could not be confidently placed at accept time
  // (missing or uncertain) — the backend refuses to authorize a
  // location-dependent operation on unreliable location data.
  | { status: 'location_unavailable' };

export type ActiveJourneyOutcome = 'applicable' | 'location_unavailable' | 'no_active_journey';

export type ActiveJourneyCapabilities = {
  canContinueCurrentNavigation: boolean;
  canRequestAlternative: boolean;
  canExposeCommunity: boolean;
};

export type ActiveJourneyShelter = {
  id: number;
  source: string;
  name: string;
  city: string;
  address: string | null;
  latitude: number;
  longitude: number;
  // Null when the request had no usable coordinates to compute a distance
  // from — never a misleading 0. Still populated under "location_unavailable"
  // when raw coordinates were present but area inference was merely
  // uncertain, since Haversine distance doesn't need a confident city match.
  estimatedDistanceMeters: number | null;
  estimatedWalkMinutes: number | null;
};

export type ActiveJourneyResult =
  | {
      outcome: 'applicable';
      hasActiveJourney: true;
      journeyId: number;
      visitSessionId: number;
      shelter: ActiveJourneyShelter;
      capabilities: ActiveJourneyCapabilities;
    }
  | {
      // The Journey and its current shelter still exist and must keep being
      // displayed/used as-is — only new location-dependent operations
      // (Alternative, Community) are unavailable right now.
      outcome: 'location_unavailable';
      hasActiveJourney: true;
      journeyId: number;
      visitSessionId: number;
      shelter: ActiveJourneyShelter;
      capabilities: ActiveJourneyCapabilities;
    }
  | {
      outcome: 'no_active_journey';
      hasActiveJourney: false;
      capabilities: ActiveJourneyCapabilities;
    };

function buildAuthHeaders(token: string) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

// Reads the `detail` field FastAPI puts on every HTTPException response.
// It is either a plain string (e.g. "Journey not active") or a structured
// object (e.g. { error: "stale_preview", ... }) depending on which backend
// validation failed.
async function readErrorDetail(response: Response): Promise<unknown> {
  try {
    const body = await response.json();
    return body && typeof body === 'object' && 'detail' in body ? body.detail : null;
  } catch {
    return null;
  }
}

function isStructuredErrorDetail(
  detail: unknown
): detail is { error: string; [key: string]: unknown } {
  return Boolean(detail) && typeof detail === 'object' && 'error' in (detail as object);
}

// Fetches a read-only preview comparing the journey's current shelter
// against the best remaining eligible alternative. Never creates a Visit
// Session, never changes the Journey, never navigates.
//
// GET /shelter-journeys/{journey_id}/alternative-preview?latitude=..&longitude=..
export async function getAlternativePreview(
  token: string,
  journeyId: number,
  latitude: number,
  longitude: number
): Promise<AlternativePreviewResult> {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
  });

  let response: Response;

  try {
    response = await fetch(
      `${API_BASE_URL}/shelter-journeys/${journeyId}/alternative-preview?${params.toString()}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
  } catch (networkError) {
    throw new AlternativeShelterServiceError(
      'Network error while requesting the alternative preview',
      networkError
    );
  }

  if (!response.ok) {
    const detail = await readErrorDetail(response);
    throw new AlternativeShelterServiceError(
      typeof detail === 'string' ? detail : 'Failed to load the alternative preview',
      detail
    );
  }

  // Matches AlternativePreviewResponse in backend/app/schemas/shelter_journey.py.
  const data = await response.json();

  const currentShelter: CurrentShelterPreview = {
    id: data.current_shelter.id,
    source: data.current_shelter.source,
    name: data.current_shelter.name,
    estimatedDistanceMeters: data.current_shelter.estimated_distance_meters,
    estimatedWalkMinutes: data.current_shelter.estimated_walk_minutes,
  };

  if (!data.alternative_available || !data.recommended_alternative || !data.comparison) {
    return {
      status: 'unavailable',
      journeyId: data.journey_id,
      currentVisitSessionId: data.current_visit_session_id,
      currentShelter,
    };
  }

  return {
    status: 'available',
    journeyId: data.journey_id,
    currentVisitSessionId: data.current_visit_session_id,
    currentShelter,
    recommendedAlternative: {
      id: data.recommended_alternative.id,
      source: data.recommended_alternative.source,
      name: data.recommended_alternative.name,
      latitude: data.recommended_alternative.latitude,
      longitude: data.recommended_alternative.longitude,
      estimatedDistanceMeters: data.recommended_alternative.estimated_distance_meters,
      estimatedWalkMinutes: data.recommended_alternative.estimated_walk_minutes,
    },
    comparison: {
      additionalEstimatedDistanceMeters: data.comparison.additional_estimated_distance_meters,
      additionalEstimatedWalkMinutes: data.comparison.additional_estimated_walk_minutes,
    },
  };
}

// Accepts a previously previewed alternative: creates its Visit Session on
// the backend and moves the Journey's active destination to it. This is the
// only function in this file that mutates anything, and it never navigates
// on its own — callers decide what to do with the result.
//
// POST /shelter-journeys/{journey_id}/accept-alternative
export async function acceptAlternative(
  token: string,
  journeyId: number,
  shelterId: number,
  shelterSource: string,
  latitude: number,
  longitude: number
): Promise<AcceptAlternativeResult> {
  let response: Response;

  try {
    response = await fetch(
      `${API_BASE_URL}/shelter-journeys/${journeyId}/accept-alternative`,
      {
        method: 'POST',
        headers: buildAuthHeaders(token),
        body: JSON.stringify({
          shelter_id: shelterId,
          shelter_source: shelterSource,
          latitude,
          longitude,
        }),
      }
    );
  } catch (networkError) {
    throw new AlternativeShelterServiceError(
      'Network error while accepting the alternative shelter',
      networkError
    );
  }

  if (!response.ok) {
    const detail = await readErrorDetail(response);

    if (isStructuredErrorDetail(detail)) {
      if (detail.error === 'stale_preview') {
        return { status: 'stale_preview' };
      }

      if (detail.error === 'already_attempted') {
        return { status: 'already_attempted' };
      }

      if (detail.error === 'no_alternative_available') {
        return { status: 'no_alternative_available' };
      }

      if (detail.error === 'location_unavailable') {
        return { status: 'location_unavailable' };
      }
    }

    throw new AlternativeShelterServiceError(
      typeof detail === 'string' ? detail : 'Failed to accept the alternative shelter',
      detail
    );
  }

  // Matches AcceptAlternativeResponse in backend/app/schemas/shelter_journey.py.
  const data = await response.json();

  return {
    status: 'accepted',
    journeyId: data.journey_id,
    visitSessionId: data.visit_session_id,
    previousVisitSessionId: data.previous_visit_session_id ?? null,
    shelter: {
      id: data.shelter.id,
      source: data.shelter.source,
      name: data.shelter.name,
      city: data.shelter.city,
      address: data.shelter.address ?? null,
      latitude: data.shelter.latitude,
      longitude: data.shelter.longitude,
    },
  };
}

// Checks whether the current user already has an active Journey, and if so,
// returns its current destination plus what the caller may currently do
// with it. The Journey is the source of truth for "what am I navigating to
// right now" — screens like Home must check this before recomputing a
// fresh recommendation, so an accepted alternative elsewhere in the app is
// reflected everywhere instead of being silently overwritten by stale,
// freshly-recomputed frontend state.
//
// latitude/longitude are optional: a missing/failed GPS fix must never
// cause this check to be skipped — it only limits which capabilities the
// backend can currently authorize (see ActiveJourneyResult's
// "location_unavailable" outcome). Passing null omits the query params
// entirely rather than sending literal "null" strings.
//
// GET /shelter-journeys/active?latitude=..&longitude=..
export async function getActiveJourney(
  token: string,
  latitude: number | null,
  longitude: number | null
): Promise<ActiveJourneyResult> {
  const params = new URLSearchParams();

  if (latitude !== null) {
    params.append('latitude', String(latitude));
  }

  if (longitude !== null) {
    params.append('longitude', String(longitude));
  }

  const queryString = params.toString();
  const url = queryString
    ? `${API_BASE_URL}/shelter-journeys/active?${queryString}`
    : `${API_BASE_URL}/shelter-journeys/active`;

  let response: Response;

  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  } catch (networkError) {
    throw new AlternativeShelterServiceError(
      'Network error while checking for an active journey',
      networkError
    );
  }

  if (!response.ok) {
    const detail = await readErrorDetail(response);
    throw new AlternativeShelterServiceError(
      typeof detail === 'string' ? detail : 'Failed to check for an active journey',
      detail
    );
  }

  // Matches ActiveJourneyResponse in backend/app/schemas/shelter_journey.py.
  const data = await response.json();

  const capabilities: ActiveJourneyCapabilities = {
    canContinueCurrentNavigation: Boolean(data.capabilities?.can_continue_current_navigation),
    canRequestAlternative: Boolean(data.capabilities?.can_request_alternative),
    canExposeCommunity: Boolean(data.capabilities?.can_expose_community),
  };

  const outcome: ActiveJourneyOutcome = data.outcome;

  if ((outcome === 'applicable' || outcome === 'location_unavailable') && data.shelter) {
    const shelter: ActiveJourneyShelter = {
      id: data.shelter.id,
      source: data.shelter.source,
      name: data.shelter.name,
      city: data.shelter.city,
      address: data.shelter.address ?? null,
      latitude: data.shelter.latitude,
      longitude: data.shelter.longitude,
      estimatedDistanceMeters: data.shelter.estimated_distance_meters ?? null,
      estimatedWalkMinutes: data.shelter.estimated_walk_minutes ?? null,
    };

    return {
      outcome,
      hasActiveJourney: true,
      journeyId: data.journey_id,
      visitSessionId: data.visit_session_id,
      shelter,
      capabilities,
    };
  }

  return { outcome: 'no_active_journey', hasActiveJourney: false, capabilities };
}

export type JourneyStatusResult = {
  journeyId: number;
  status: string;
  endedAt: string | null;
};

async function postJourneyLifecycleAction(
  token: string,
  journeyId: number,
  action: 'complete' | 'abandon'
): Promise<JourneyStatusResult> {
  let response: Response;

  try {
    response = await fetch(
      `${API_BASE_URL}/shelter-journeys/${journeyId}/${action}`,
      {
        method: 'POST',
        headers: buildAuthHeaders(token),
      }
    );
  } catch (networkError) {
    throw new AlternativeShelterServiceError(
      `Network error while marking the journey as ${action}d`,
      networkError
    );
  }

  if (!response.ok) {
    const detail = await readErrorDetail(response);
    throw new AlternativeShelterServiceError(
      typeof detail === 'string' ? detail : `Failed to mark the journey as ${action}d`,
      detail
    );
  }

  const data = await response.json();

  return {
    journeyId: data.journey_id,
    status: data.status,
    endedAt: data.ended_at ?? null,
  };
}

// Marks the journey as successfully resolved: the user confirmed they
// entered the shelter. Terminal, one-way.
//
// POST /shelter-journeys/{journey_id}/complete
export async function completeJourney(
  token: string,
  journeyId: number
): Promise<JourneyStatusResult> {
  return postJourneyLifecycleAction(token, journeyId, 'complete');
}

// Marks the journey as explicitly abandoned by the user. No screen calls
// this yet — extension point for a future explicit "leave journey" action.
//
// POST /shelter-journeys/{journey_id}/abandon
export async function abandonJourney(
  token: string,
  journeyId: number
): Promise<JourneyStatusResult> {
  return postJourneyLifecycleAction(token, journeyId, 'abandon');
}
