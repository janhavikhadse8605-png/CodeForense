"""
CodeAuth Evidence Engine — Ablation-based explainability.

Computes feature group contributions by measuring prediction change
when each feature group is zeroed out.

These are labeled as "AI-associated evidence" or "Feature contribution",
NOT as probabilities.
"""
import logging
from copy import deepcopy

import torch
import numpy as np

logger = logging.getLogger(__name__)


def compute_evidence(
    model,
    input_ids: torch.Tensor,
    attention_mask: torch.Tensor,
    feature_tensors: dict[str, torch.Tensor],
    device: torch.device,
    ai_index: int = 1,
) -> dict[str, float]:
    """
    Compute feature group contributions via ablation.

    For each feature group:
    1. Run model with all features → baseline AI probability
    2. Run model with that feature group zeroed → ablated AI probability
    3. Contribution = baseline - ablated (clamped to [0, 1])

    Normalize contributions to sum to 100 for display.

    Returns:
        Dict mapping feature group name to contribution percentage (0-100).
    """
    feature_groups = list(feature_tensors.keys())

    with torch.no_grad():
        # Baseline prediction with all features
        baseline_logits = model(input_ids, attention_mask, feature_tensors)
        baseline_probs = torch.softmax(baseline_logits, dim=1).cpu().numpy()[0]
        baseline_ai_prob = float(baseline_probs[ai_index])

        contributions = {}

        for group in feature_groups:
            # Create ablated feature dict with this group zeroed
            ablated_features = {}
            for g, tensor in feature_tensors.items():
                if g == group:
                    ablated_features[g] = torch.zeros_like(tensor)
                else:
                    ablated_features[g] = tensor

            # Run model with ablated features
            ablated_logits = model(input_ids, attention_mask, ablated_features)
            ablated_probs = torch.softmax(ablated_logits, dim=1).cpu().numpy()[0]
            ablated_ai_prob = float(ablated_probs[ai_index])

            # Contribution = how much removing this group changes the prediction
            raw_contribution = abs(baseline_ai_prob - ablated_ai_prob)
            contributions[group] = raw_contribution

    # Normalize contributions to percentage scale
    total = sum(contributions.values())
    if total > 0:
        normalized = {
            group: round((val / total) * 100, 1)
            for group, val in contributions.items()
        }
    else:
        # If all contributions are 0, distribute evenly
        even = round(100 / len(feature_groups), 1)
        normalized = {group: even for group in feature_groups}

    return normalized


def compute_detailed_evidence(
    model,
    input_ids: torch.Tensor,
    attention_mask: torch.Tensor,
    feature_tensors: dict[str, torch.Tensor],
    device: torch.device,
) -> dict:
    """
    Compute detailed evidence including direction of contribution.

    Returns both the normalized display values and raw contribution data.
    """
    feature_groups = list(feature_tensors.keys())

    with torch.no_grad():
        baseline_logits = model(input_ids, attention_mask, feature_tensors)
        baseline_probs = torch.softmax(baseline_logits, dim=1).cpu().numpy()[0]
        baseline_ai_prob = float(baseline_probs[1])

        raw_contributions = {}
        directions = {}

        for group in feature_groups:
            ablated_features = {}
            for g, tensor in feature_tensors.items():
                if g == group:
                    ablated_features[g] = torch.zeros_like(tensor)
                else:
                    ablated_features[g] = tensor

            ablated_logits = model(input_ids, attention_mask, ablated_features)
            ablated_probs = torch.softmax(ablated_logits, dim=1).cpu().numpy()[0]
            ablated_ai_prob = float(ablated_probs[1])

            diff = baseline_ai_prob - ablated_ai_prob
            raw_contributions[group] = abs(diff)
            # Positive diff = this group pushes toward AI
            # Negative diff = this group pushes toward Human
            directions[group] = "ai" if diff > 0 else "human"

    total = sum(raw_contributions.values())
    if total > 0:
        normalized = {
            group: round((val / total) * 100, 1)
            for group, val in raw_contributions.items()
        }
    else:
        even = round(100 / len(feature_groups), 1)
        normalized = {group: even for group in feature_groups}

    return {
        "evidence": normalized,
        "directions": directions,
        "baseline_ai_probability": round(baseline_ai_prob * 100, 1),
        "raw_contributions": {g: round(v, 4) for g, v in raw_contributions.items()},
    }
