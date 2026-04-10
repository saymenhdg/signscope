from __future__ import annotations

from pathlib import Path
from typing import Any

import torch

from signlang.alphabet_landmark_data import normalize_landmarks
from signlang.alphabet_landmark_model import AlphabetLandmarkRecognizer
from signlang.utils import resolve_device


def load_landmark_checkpoint(
    checkpoint_path: str | Path,
    device_arg: str | None = None,
) -> tuple[AlphabetLandmarkRecognizer, list[str], dict[str, Any], torch.device]:
    device = resolve_device(device_arg)
    checkpoint = torch.load(checkpoint_path, map_location=device)
    model = AlphabetLandmarkRecognizer(
        input_dim=checkpoint["model_config"]["input_dim"],
        num_classes=len(checkpoint["labels"]),
        hidden_dim=checkpoint["model_config"]["hidden_dim"],
        dropout=checkpoint["model_config"]["dropout"],
    )
    model.load_state_dict(checkpoint["model_state"])
    model.to(device)
    model.eval()
    return model, checkpoint["labels"], checkpoint["model_config"], device


def prepare_landmark_tensor(
    landmarks: list[tuple[float, ...]],
    bbox: tuple[int, int, int, int] | None = None,
    handedness: str | None = None,
) -> torch.Tensor:
    features = torch.tensor(
        normalize_landmarks(landmarks, bbox=bbox, handedness=handedness),
        dtype=torch.float32,
    )
    return features.unsqueeze(0)


@torch.inference_mode()
def predict_landmarks(
    model: AlphabetLandmarkRecognizer,
    landmarks: list[tuple[float, ...]],
    bbox: tuple[int, int, int, int] | None,
    handedness: str | None,
    labels: list[str],
    device: torch.device,
) -> tuple[str, float, dict[str, float]]:
    features = prepare_landmark_tensor(
        landmarks=landmarks,
        bbox=bbox,
        handedness=handedness,
    ).to(device)
    logits = model(features)
    probabilities = torch.softmax(logits, dim=-1)[0].detach().cpu()
    predicted_index = int(probabilities.argmax().item())
    label = labels[predicted_index]
    confidence = float(probabilities[predicted_index].item())
    distribution = {labels[index]: float(value) for index, value in enumerate(probabilities.tolist())}
    return label, confidence, distribution
