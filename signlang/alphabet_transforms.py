from __future__ import annotations

import random

import torch
import torch.nn.functional as F
from torchvision.transforms.functional import hflip
from torchvision.transforms.functional import InterpolationMode, rotate


IMAGENET_MEAN = torch.tensor([0.485, 0.456, 0.406], dtype=torch.float32).view(3, 1, 1)
IMAGENET_STD = torch.tensor([0.229, 0.224, 0.225], dtype=torch.float32).view(3, 1, 1)


class AlphabetImageTransform:
    def __init__(self, image_size: int, training: bool) -> None:
        self.image_size = image_size
        self.training = training

    def __call__(self, image: torch.Tensor) -> torch.Tensor:
        if image.ndim != 3:
            raise ValueError(f"Expected image tensor [C, H, W], got {tuple(image.shape)}")

        image = image.float() / 255.0
        image = image.unsqueeze(0)

        if self.training:
            enlarged_size = int(round(self.image_size * 1.12))
            image = F.interpolate(
                image,
                size=(enlarged_size, enlarged_size),
                mode="bilinear",
                align_corners=False,
            )
            max_offset = max(0, enlarged_size - self.image_size)
            top = random.randint(0, max_offset) if max_offset else 0
            left = random.randint(0, max_offset) if max_offset else 0
            image = image[:, :, top : top + self.image_size, left : left + self.image_size]

            if random.random() < 0.5:
                image = torch.stack([hflip(frame) for frame in image], dim=0)

            if random.random() < 0.35:
                angle = random.uniform(-7.0, 7.0)
                image = torch.stack(
                    [
                        rotate(
                            frame,
                            angle=angle,
                            interpolation=InterpolationMode.BILINEAR,
                            fill=0.0,
                        )
                        for frame in image
                    ],
                    dim=0,
                )

            brightness = random.uniform(0.92, 1.08)
            contrast = random.uniform(0.92, 1.08)
            mean = image.mean(dim=(2, 3), keepdim=True)
            image = torch.clamp((image - mean) * contrast + mean, 0.0, 1.0)
            image = torch.clamp(image * brightness, 0.0, 1.0)
        else:
            image = F.interpolate(
                image,
                size=(self.image_size, self.image_size),
                mode="bilinear",
                align_corners=False,
            )

        image = image.squeeze(0)
        mean = IMAGENET_MEAN.to(image.device, dtype=image.dtype)
        std = IMAGENET_STD.to(image.device, dtype=image.dtype)
        return (image - mean) / std
