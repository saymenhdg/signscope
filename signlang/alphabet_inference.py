from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
import torch

from signlang.alphabet_model import AlphabetRecognizer
from signlang.alphabet_transforms import AlphabetImageTransform
from signlang.utils import resolve_device


def load_alphabet_checkpoint(
    checkpoint_path: str | Path,
    device_arg: str | None = None,
) -> tuple[AlphabetRecognizer, list[str], dict[str, Any], torch.device]:
    device = resolve_device(device_arg)
    checkpoint = torch.load(checkpoint_path, map_location=device)

    model = AlphabetRecognizer(
        num_classes=len(checkpoint["labels"]),
        dropout=checkpoint["model_config"]["dropout"],
        pretrained=False,
    )
    model.load_state_dict(checkpoint["model_state"])
    model.to(device)
    model.eval()
    return model, checkpoint["labels"], checkpoint["model_config"], device


def prepare_image(
    frame_bgr: np.ndarray,
    image_size: int,
) -> torch.Tensor:
    if frame_bgr.ndim != 3:
        raise ValueError(f"Expected image array [H, W, C], got {tuple(frame_bgr.shape)}")

    rgb = frame_bgr[:, :, ::-1].copy()
    image = torch.from_numpy(np.ascontiguousarray(rgb)).permute(2, 0, 1).contiguous()
    transform = AlphabetImageTransform(image_size=image_size, training=False)
    return transform(image).unsqueeze(0)


@torch.inference_mode()
def predict_image(
    model: AlphabetRecognizer,
    frame_bgr: np.ndarray,
    labels: list[str],
    model_config: dict[str, Any],
    device: torch.device,
) -> tuple[str, float, dict[str, float]]:
    image = prepare_image(
        frame_bgr=frame_bgr,
        image_size=model_config["image_size"],
    )
    logits = model(image.to(device))
    probabilities = torch.softmax(logits, dim=-1)[0].detach().cpu()
    predicted_index = int(probabilities.argmax().item())
    label = labels[predicted_index]
    confidence = float(probabilities[predicted_index].item())
    distribution = {labels[index]: float(value) for index, value in enumerate(probabilities.tolist())}
    return label, confidence, distribution
