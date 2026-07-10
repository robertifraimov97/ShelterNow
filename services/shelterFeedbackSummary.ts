import { API_BASE_URL } from '../constants/api';

export type ShelterFeedbackSummary = {
  shelter_id: number;
  shelter_source: string;
  total_feedback_count: number;

  open_yes_count: number;
  open_partial_count: number;
  open_no_count: number;

  accessible_yes_count: number;
  accessible_partial_count: number;
  accessible_no_count: number;
  accessible_unknown_count: number;

  condition_good_count: number;
  condition_okay_count: number;
  condition_poor_count: number;

  reliability_score: number;
  summary_label: string;
};

export async function getShelterFeedbackSummary(
  shelterSource: string,
  shelterId: number
): Promise<ShelterFeedbackSummary> {
  // Load the aggregated feedback summary for a shelter.
  const response = await fetch(
    `${API_BASE_URL}/shelter-feedback/summary/${shelterSource.toLowerCase()}/${shelterId}`
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Failed to load shelter feedback summary');
  }

  return response.json();
}
