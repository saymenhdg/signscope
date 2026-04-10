from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
import torch

from signlang.model import SignRecognizer
from signlang.transforms import VideoTransform
from signlang.utils import resolve_device


def load_checkpoint(
    checkpoint_path: str | Path,
    device_arg: str | None = None,
) -> tuple[SignRecognizer, list[str], dict[str, Any], torch.device]:
    device = resolve_device(device_arg)
    checkpoint = torch.load(checkpoint_path, map_location=device)

    model = SignRecognizer(
        num_classes=len(checkpoint["labels"]),
        hidden_size=checkpoint["model_config"]["hidden_size"],
        num_layers=checkpoint["model_config"]["num_layers"],
        dropout=checkpoint["model_config"]["dropout"],
        pretrained=False,
    )
    model.load_state_dict(checkpoint["model_state"])
    model.to(device)
    model.eval()
    return model, checkpoint["labels"], checkpoint["model_config"], device


def sample_clip_frames(frame_count: int, num_frames: int) -> np.ndarray:
    if frame_count <= 0:
        raise ValueError("frame_count must be positive")
    return np.linspace(0, frame_count - 1, num_frames).round().astype(np.int64)


def prepare_clip(
    frames_bgr: list[np.ndarray],
    num_frames: int,
    image_size: int,
) -> torch.Tensor:
    if not frames_bgr:
        raise ValueError("No frames provided for inference")

    indices = sample_clip_frames(len(frames_bgr), num_frames)
    rgb_frames = [frames_bgr[int(index)][:, :, ::-1].copy() for index in indices]
    video = torch.from_numpy(np.stack(rgb_frames, axis=0)).permute(0, 3, 1, 2).contiguous()
    transform = VideoTransform(image_size=image_size, training=False)
    return transform(video).unsqueeze(0)


@torch.inference_mode()
def predict_clip(
    model: SignRecognizer,
    frames_bgr: list[np.ndarray],
    labels: list[str],
    model_config: dict[str, Any],
    device: torch.device,
) -> tuple[str, float, dict[str, float]]:
    clip = prepare_clip(
        frames_bgr=frames_bgr,
        num_frames=model_config["num_frames"],
        image_size=model_config["image_size"],
    )
    logits = model(clip.to(device))
    probabilities = torch.softmax(logits, dim=-1)[0].detach().cpu()
    predicted_index = int(probabilities.argmax().item())
    label = labels[predicted_index]
    confidence = float(probabilities[predicted_index].item())
    distribution = {labels[index]: float(value) for index, value in enumerate(probabilities.tolist())}
    return label, confidence, distribution

