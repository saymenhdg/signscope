from __future__ import annotations

import random

import torch
import torch.nn.functional as F
from torchvision.transforms.functional import hflip
from torchvision.transforms.functional import InterpolationMode, rotate


IMAGENET_MEAN = torch.tensor([0.485, 0.456, 0.406], dtype=torch.float32).view(1, 3, 1, 1)
IMAGENET_STD = torch.tensor([0.229, 0.224, 0.225], dtype=torch.float32).view(1, 3, 1, 1)


class VideoTransform:
    def __init__(self, image_size: int, training: bool) -> None:
        self.image_size = image_size
        self.training = training

    def __call__(self, video: torch.Tensor) -> torch.Tensor:
        if video.ndim != 4:
            raise ValueError(f"Expected video tensor [T, C, H, W], got {tuple(video.shape)}")

        video = video.float() / 255.0

        if self.training:
            enlarged_size = int(round(self.image_size * 1.15))
            video = F.interpolate(
                video,
                size=(enlarged_size, enlarged_size),
                mode="bilinear",
                align_corners=False,
            )
            max_offset = max(0, enlarged_size - self.image_size)
            top = random.randint(0, max_offset) if max_offset else 0
            left = random.randint(0, max_offset) if max_offset else 0
            video = video[:, :, top : top + self.image_size, left : left + self.image_size]

            if random.random() < 0.5:
                video = torch.stack([hflip(frame) for frame in video], dim=0)

            if random.random() < 0.45:
                angle = random.uniform(-8.0, 8.0)
                video = torch.stack(
                    [
                        rotate(
                            frame,
                            angle=angle,
                            interpolation=InterpolationMode.BILINEAR,
                            fill=0.0,
                        )
                        for frame in video
                    ],
                    dim=0,
                )

            brightness = random.uniform(0.9, 1.1)
            contrast = random.uniform(0.9, 1.1)
            mean = video.mean(dim=(2, 3), keepdim=True)
            video = torch.clamp((video - mean) * contrast + mean, 0.0, 1.0)
            video = torch.clamp(video * brightness, 0.0, 1.0)
        else:
            video = F.interpolate(
                video,
                size=(self.image_size, self.image_size),
                mode="bilinear",
                align_corners=False,
            )

        mean = IMAGENET_MEAN.to(video.device, dtype=video.dtype)
        std = IMAGENET_STD.to(video.device, dtype=video.dtype)
        return (video - mean) / std
