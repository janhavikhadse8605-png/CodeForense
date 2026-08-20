"""
CodeAuth ML Model — Architecture reconstruction and loading.

Reconstructs the HybridAuthorshipModel from the trained checkpoint.
Architecture derived from inspecting state_dict keys:

- codebert: RobertaModel (microsoft/codebert-base), 768-dim output
- 6 Feature MLPs: naming(8→32→16), structure(10→32→16), comments(6→32→16),
                   repetition(5→32→16), complexity(6→32→16), formatting(6→32→16)
- fusion: Linear(864→256) → ReLU → Dropout → Linear(256→64)
           where 864 = 768 (CodeBERT) + 6×16 (feature MLPs)
- classifier: Linear(64→2)
"""
import json
import logging
from pathlib import Path
from typing import Optional

import joblib
import numpy as np
import torch
import torch.nn as nn
from transformers import AutoModel, AutoTokenizer, AutoConfig, RobertaConfig

logger = logging.getLogger(__name__)


class FeatureMLP(nn.Module):
    """MLP branch for a single feature group."""

    def __init__(self, input_dim: int, hidden_dim: int = 32, output_dim: int = 16):
        super().__init__()
        self.network = nn.Sequential(
            nn.Linear(input_dim, hidden_dim),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(hidden_dim, output_dim),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.network(x)


class HybridAuthorshipModel(nn.Module):
    """
    Hybrid CodeBERT + Feature MLP Fusion model for code authorship detection.

    Architecture:
        CodeBERT (768-dim CLS embedding)
        + 6 Feature MLP branches (each 16-dim output)
        → Fusion (864 → 256 → 64)
        → Classifier (64 → 2)
    """

    def __init__(
        self,
        model_name: str = "microsoft/codebert-base",
        feature_dims: Optional[dict] = None,
        num_classes: int = 2,
    ):
        super().__init__()

        if feature_dims is None:
            feature_dims = {
                "naming": 8,
                "structure": 10,
                "comments": 6,
                "repetition": 5,
                "complexity": 6,
                "formatting": 6,
            }

        self.feature_dims = feature_dims
        self.num_classes = num_classes

        # CodeBERT transformer encoder architecture
        try:
            config = AutoConfig.from_pretrained(model_name)
            self.codebert = AutoModel.from_config(config)
        except Exception:
            config = RobertaConfig(
                vocab_size=50265,
                hidden_size=768,
                num_hidden_layers=12,
                num_attention_heads=12,
                intermediate_size=3072,
                max_position_embeddings=514,
                type_vocab_size=1,
            )
            self.codebert = AutoModel.from_config(config)
        codebert_dim = 768

        # Feature MLP branches
        self.naming_mlp = FeatureMLP(feature_dims["naming"])
        self.structure_mlp = FeatureMLP(feature_dims["structure"])
        self.comments_mlp = FeatureMLP(feature_dims["comments"])
        self.repetition_mlp = FeatureMLP(feature_dims["repetition"])
        self.complexity_mlp = FeatureMLP(feature_dims["complexity"])
        self.formatting_mlp = FeatureMLP(feature_dims["formatting"])

        # Fusion dimension: CodeBERT (768) + 6 MLPs × 16 = 864
        mlp_output_dim = 16
        fusion_input_dim = codebert_dim + len(feature_dims) * mlp_output_dim

        # Fusion layers
        self.fusion = nn.Sequential(
            nn.Linear(fusion_input_dim, 256),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(256, 64),
        )

        # Classifier head
        self.classifier = nn.Linear(64, num_classes)

    def forward(
        self,
        input_ids: torch.Tensor,
        attention_mask: torch.Tensor,
        features: dict[str, torch.Tensor],
    ) -> torch.Tensor:
        """
        Forward pass.

        Args:
            input_ids: Tokenized code input IDs [batch, seq_len]
            attention_mask: Attention mask [batch, seq_len]
            features: Dict of feature group tensors, each [batch, feature_dim]

        Returns:
            Logits [batch, num_classes]
        """
        # CodeBERT encoding — extract <s> / CLS token representation from last hidden state
        codebert_output = self.codebert(
            input_ids=input_ids, attention_mask=attention_mask
        )
        if hasattr(codebert_output, "last_hidden_state") and codebert_output.last_hidden_state is not None:
            cls_embedding = codebert_output.last_hidden_state[:, 0, :]  # [batch, 768]
        else:
            cls_embedding = codebert_output.pooler_output  # [batch, 768]

        # Feature MLP branches
        naming_emb = self.naming_mlp(features["naming"])
        structure_emb = self.structure_mlp(features["structure"])
        comments_emb = self.comments_mlp(features["comments"])
        repetition_emb = self.repetition_mlp(features["repetition"])
        complexity_emb = self.complexity_mlp(features["complexity"])
        formatting_emb = self.formatting_mlp(features["formatting"])

        # Concatenate all embeddings
        fused = torch.cat(
            [
                cls_embedding,
                naming_emb,
                structure_emb,
                comments_emb,
                repetition_emb,
                complexity_emb,
                formatting_emb,
            ],
            dim=1,
        )

        # Fusion + classification
        fused = self.fusion(fused)
        logits = self.classifier(fused)
        return logits

    def get_fusion_embedding(
        self,
        input_ids: torch.Tensor,
        attention_mask: torch.Tensor,
        features: dict[str, torch.Tensor],
    ) -> torch.Tensor:
        """Get the 64-dim fusion embedding (before classifier)."""
        codebert_output = self.codebert(
            input_ids=input_ids, attention_mask=attention_mask
        )
        cls_embedding = codebert_output.pooler_output

        naming_emb = self.naming_mlp(features["naming"])
        structure_emb = self.structure_mlp(features["structure"])
        comments_emb = self.comments_mlp(features["comments"])
        repetition_emb = self.repetition_mlp(features["repetition"])
        complexity_emb = self.complexity_mlp(features["complexity"])
        formatting_emb = self.formatting_mlp(features["formatting"])

        fused = torch.cat(
            [
                cls_embedding,
                naming_emb,
                structure_emb,
                comments_emb,
                repetition_emb,
                complexity_emb,
                formatting_emb,
            ],
            dim=1,
        )

        return self.fusion(fused)


class ModelManager:
    """Manages model loading, validation, and inference."""

    def __init__(self):
        self.model: Optional[HybridAuthorshipModel] = None
        self.tokenizer = None
        self.scaler = None
        self.metadata: dict = {}
        self.device: torch.device = torch.device("cpu")
        self.is_ready: bool = False
        self.load_error: Optional[str] = None
        self.validation_steps: list[dict] = []

    def load(self, model_dir: str, device: str = "auto") -> bool:
        """
        Load all model artifacts and validate.

        Returns True if model is ready for inference.
        """
        model_path = Path(model_dir)
        self.validation_steps = []

        try:
            # Step 1: Check files exist
            checkpoint_path = model_path / "authorship_hybrid_model.pt"
            scaler_path = model_path / "feature_scaler.pkl"
            metadata_path = model_path / "metadata.json"
            tokenizer_path = model_path

            if not checkpoint_path.exists():
                self._fail("Checkpoint file not found", checkpoint_path)
                return False
            self._pass("Checkpoint found", str(checkpoint_path))

            if not scaler_path.exists():
                self._fail("Scaler file not found", scaler_path)
                return False
            self._pass("Scaler found", str(scaler_path))

            # Step 2: Load metadata & label mapping
            label_mapping_path = model_path / "label_mapping.json"
            if metadata_path.exists():
                with open(metadata_path) as f:
                    self.metadata = json.load(f)
            else:
                self.metadata = {}

            # Load separate label_mapping.json if present
            if label_mapping_path.exists():
                with open(label_mapping_path) as f:
                    self.metadata["label_mapping"] = json.load(f)

            # Ensure default metadata fields are always set
            if "model_name" not in self.metadata and "base_model" in self.metadata:
                self.metadata["model_name"] = self.metadata["base_model"]
            self.metadata.setdefault("model_name", "microsoft/codebert-base")
            self.metadata.setdefault("max_length", 256)
            self.metadata.setdefault("label_mapping", {"0": "HUMAN", "1": "AI"})
            self.metadata.setdefault("feature_groups", ["naming", "structure", "comments", "repetition", "complexity", "formatting"])
            self.metadata.setdefault("feature_dimensions", {"naming": 8, "structure": 10, "comments": 6, "repetition": 5, "complexity": 6, "formatting": 6})
            self._pass("Metadata loaded", json.dumps(self.metadata, indent=2)[:200])

            # Step 3: Determine device
            if device == "auto":
                if torch.cuda.is_available():
                    self.device = torch.device("cuda")
                elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
                    self.device = torch.device("mps")
                else:
                    self.device = torch.device("cpu")
            else:
                self.device = torch.device(device)
            self._pass("Device selected", str(self.device))

            # Step 4: Load tokenizer
            try:
                # Check current dir or tokenizer/ subfolder
                sub_tokenizer = model_path / "tokenizer"
                if (sub_tokenizer / "tokenizer.json").exists():
                    self.tokenizer = AutoTokenizer.from_pretrained(
                        str(sub_tokenizer), local_files_only=True
                    )
                    self._pass("Tokenizer loaded from local tokenizer/ subfolder", "")
                elif (model_path / "tokenizer.json").exists():
                    self.tokenizer = AutoTokenizer.from_pretrained(
                        str(model_path), local_files_only=True
                    )
                    self._pass("Tokenizer loaded from local files", "")
                else:
                    self.tokenizer = AutoTokenizer.from_pretrained(
                        self.metadata.get("model_name", "microsoft/codebert-base")
                    )
                    self._pass("Tokenizer loaded from HuggingFace", "")
            except Exception as e:
                self._fail("Tokenizer loading failed", str(e))
                return False

            # Step 5: Reconstruct model architecture
            try:
                feature_dims = self.metadata.get("feature_dimensions", {
                    "naming": 8, "structure": 10, "comments": 6,
                    "repetition": 5, "complexity": 6, "formatting": 6,
                })
                self.model = HybridAuthorshipModel(
                    model_name=self.metadata.get("model_name", "microsoft/codebert-base"),
                    feature_dims=feature_dims,
                    num_classes=len(self.metadata.get("label_mapping", {"0": "HUMAN", "1": "AI"})),
                )
                self._pass("Architecture reconstructed", "HybridAuthorshipModel")
            except Exception as e:
                self._fail("Architecture reconstruction failed", str(e))
                return False

            # Step 6: Load checkpoint weights
            try:
                checkpoint = torch.load(
                    checkpoint_path, map_location=self.device, weights_only=False
                )
                if isinstance(checkpoint, dict) and "state_dict" in checkpoint:
                    state_dict = checkpoint["state_dict"]
                elif isinstance(checkpoint, dict) and "model_state_dict" in checkpoint:
                    state_dict = checkpoint["model_state_dict"]
                else:
                    state_dict = checkpoint

                self.model.load_state_dict(state_dict, strict=True)
                self._pass("Weights loaded", f"{len(state_dict)} parameters")
            except Exception as e:
                self._fail("Weight loading failed", str(e))
                return False

            # Step 7: Move model to device and set eval mode
            self.model.to(self.device)
            self.model.eval()
            self._pass("Model moved to device and set to eval", str(self.device))

            # Step 8: Load scaler
            try:
                self.scaler = joblib.load(scaler_path)
                self._pass("Feature scaler loaded", f"{self.scaler.n_features_in_} features")
            except Exception as e:
                self._fail("Scaler loading failed", str(e))
                return False

            # Step 9: Run inference validation test
            try:
                self._run_validation_inference()
                self._pass("Inference test passed", "Model produces valid output")
            except Exception as e:
                self._fail("Inference test failed", str(e))
                return False

            self.is_ready = True
            logger.info("Model loaded successfully and ready for inference")
            return True

        except Exception as e:
            self._fail("Unexpected error during model loading", str(e))
            return False

    def _run_validation_inference(self):
        """Run a quick inference test to validate the model works end-to-end."""
        with torch.no_grad():
            # Create dummy inputs
            dummy_input_ids = torch.zeros(1, 32, dtype=torch.long, device=self.device)
            dummy_attention_mask = torch.ones(1, 32, dtype=torch.long, device=self.device)

            dummy_features = {}
            for group, dim in self.metadata.get("feature_dimensions", {}).items():
                dummy_features[group] = torch.zeros(1, dim, dtype=torch.float32, device=self.device)

            logits = self.model(dummy_input_ids, dummy_attention_mask, dummy_features)
            probs = torch.softmax(logits, dim=1)

            assert logits.shape == (1, 2), f"Unexpected logits shape: {logits.shape}"
            assert torch.allclose(probs.sum(), torch.tensor(1.0), atol=1e-4), "Probabilities don't sum to 1"

    def _pass(self, step: str, detail: str):
        self.validation_steps.append({"step": step, "status": "passed", "detail": detail})
        logger.info(f"✓ {step}: {detail}")

    def _fail(self, step: str, detail: str):
        self.validation_steps.append({"step": step, "status": "failed", "detail": detail})
        self.load_error = f"{step}: {detail}"
        logger.error(f"✗ {step}: {detail}")

    def get_status(self) -> dict:
        return {
            "is_ready": self.is_ready,
            "error": self.load_error,
            "device": str(self.device),
            "validation_steps": self.validation_steps,
            "metadata": self.metadata,
        }


# Global model manager singleton
model_manager = ModelManager()
