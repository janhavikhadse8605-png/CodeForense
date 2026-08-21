"""
Stylometric classifier — the reproducible half of CodeAuth's ML stack.

Trained by ml_training/train_stylometric.py on the 41 features produced by
app.ml.features, so the representation here is byte-for-byte the one the model
saw during training. Loads in milliseconds and scores on CPU, which is what
makes repository-scale scans practical.

Explainability is honest leave-one-group-out ablation: zero a feature group,
re-score, and report how far the AI probability moved. No proxy, no stand-in.
"""
import logging
from pathlib import Path
from typing import Optional

import joblib
import numpy as np

logger = logging.getLogger(__name__)

GROUP_ORDER = ["naming", "structure", "comments", "repetition", "complexity", "formatting"]


class StylometricModel:
    """Wraps the trained sklearn pipeline plus the metadata saved alongside it."""

    def __init__(self) -> None:
        self.pipeline = None
        self.feature_names: list[str] = []
        self.feature_groups: dict[str, list[str]] = {}
        self.group_slices: dict[str, slice] = {}
        self.model_name: str = ""
        self.test_metrics: dict = {}
        self.group_importance_share: dict = {}
        self.trained_at: str = ""
        self.is_ready: bool = False
        self.load_error: Optional[str] = None

    def load(self, path: Path) -> bool:
        if not path.exists():
            self.load_error = f"stylometric model not found at {path}"
            logger.warning(self.load_error)
            return False
        try:
            bundle = joblib.load(path)
            self.pipeline = bundle["pipeline"]
            self.feature_names = bundle["feature_names"]
            self.feature_groups = bundle["feature_groups"]
            self.model_name = bundle.get("model_name", "unknown")
            self.test_metrics = bundle.get("test_metrics", {})
            self.group_importance_share = bundle.get("group_importance_share", {})
            self.trained_at = bundle.get("trained_at", "")

            cursor = 0
            for group in bundle.get("group_order", GROUP_ORDER):
                size = len(self.feature_groups[group])
                self.group_slices[group] = slice(cursor, cursor + size)
                cursor += size

            if cursor != len(self.feature_names):
                raise ValueError(
                    f"group sizes sum to {cursor} but there are {len(self.feature_names)} features"
                )

            self.is_ready = True
            self.load_error = None
            logger.info(
                "Stylometric model ready (%s, test acc=%s)",
                self.model_name, self.test_metrics.get("accuracy"),
            )
            return True
        except Exception as exc:
            self.load_error = f"stylometric model failed to load: {exc}"
            logger.error(self.load_error)
            return False

    def predict(self, vector: list[float]) -> tuple[float, float]:
        """Return (human_probability, ai_probability) in the 0-1 range."""
        if not self.is_ready:
            raise RuntimeError("stylometric model is not loaded")
        probs = self.pipeline.predict_proba(np.asarray(vector, dtype=np.float64).reshape(1, -1))[0]
        return float(probs[0]), float(probs[1])

    def group_evidence(self, vector: list[float]) -> dict[str, float]:
        """
        Leave-one-group-out ablation.

        Zero each feature group in turn, re-score, and take the absolute shift in
        AI probability. Values are normalised to percentages of the total shift,
        so they express relative contribution and not probability.
        """
        if not self.is_ready:
            return {}

        arr = np.asarray(vector, dtype=np.float64).reshape(1, -1)
        baseline = float(self.pipeline.predict_proba(arr)[0][1])

        raw: dict[str, float] = {}
        for group, sl in self.group_slices.items():
            ablated = arr.copy()
            ablated[0, sl] = 0.0
            raw[group] = abs(baseline - float(self.pipeline.predict_proba(ablated)[0][1]))

        total = sum(raw.values())
        if total <= 0:
            # Nothing moved the prediction; fall back to the importances measured
            # at training time rather than inventing a flat split.
            return dict(self.group_importance_share) or {
                g: round(100 / len(self.group_slices), 1) for g in self.group_slices
            }
        return {g: round(v / total * 100, 1) for g, v in raw.items()}

    def status(self) -> dict:
        return {
            "is_ready": self.is_ready,
            "error": self.load_error,
            "model_name": self.model_name,
            "feature_count": len(self.feature_names),
            "test_metrics": self.test_metrics,
            "group_importance_share": self.group_importance_share,
            "trained_at": self.trained_at,
        }


stylometric_model = StylometricModel()
