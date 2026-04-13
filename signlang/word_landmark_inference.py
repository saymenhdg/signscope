from __future__ import annotations

from pathlib import Path
from typing import Any, Sequence

import numpy as np
import torch

from signlang.utils import resolve_device
from signlang.word_landmark_data import (
    PER_FRAME_FEATURE_DIM,
    resample_sequence,
)
from signlang.word_landmark_model import WordLandmarkRecognizer


def load_word_checkpoint(
    checkpoint_path: str | Path,
    device_arg: str | None = None,
) -> tuple[WordLandmarkRecognizer, list[str], dict[str, Any], torch.device]:
    device = resolve_device(device_arg)
    checkpoint = torch.load(checkpoint_path, map_location=device)
    config = checkpoint["model_config"]
    model = WordLandmarkRecognizer(
        input_dim=config["input_dim"],
        num_classes=len(checkpoint["labels"]),
        hidden_dim=config["hidden_dim"],
        num_layers=config["num_layers"],
        dropout=config["dropout"],
        attention_dim=config["attention_dim"],
    )
    model.load_state_dict(checkpoint["model_state"])
    model.to(device)
    model.eval()
    return model, checkpoint["labels"], config, device


@torch.inference_mode()
def predict_word_sequence(
    model: WordLandmarkRecognizer,
    frames: Sequence[Sequence[float]],
    labels: list[str],
    device: torch.device,
    sequence_length: int,
    top_k: int = 5,
) -> tuple[str, float, list[tuple[str, float]]]:
    """Run a forward pass over a single ``(T, F)`` landmark sequence.

    The incoming ``frames`` can be any length — they are resampled to the
    checkpoint's expected sequence length. The returned top-k is sorted by
    descending confidence.
    """

    if not frames:
        raise ValueError("frames is empty")

    sequence = np.asarray(frames, dtype=np.float32)
    if sequence.ndim != 2:
        raise ValueError(f"Expected a (T, F) matrix, got shape {sequence.shape}")
    if sequence.shape[1] != PER_FRAME_FEATURE_DIM:
        raise ValueError(
            f"Feature dim mismatch: expected {PER_FRAME_FEATURE_DIM}, got {sequence.shape[1]}"
        )

    sequence = resample_sequence(sequence, sequence_length)
    tensor = torch.from_numpy(sequence).unsqueeze(0).to(device)
    logits = model(tensor)
    probabilities = torch.softmax(logits, dim=-1)[0].detach().cpu()
    ranked_indices = torch.argsort(probabilities, descending=True).tolist()

    top = [(labels[index], float(probabilities[index].item())) for index in ranked_indices[:top_k]]
    best_label, best_score = top[0]
    return best_label, best_score, top
