from __future__ import annotations

import torch
from torch import nn
from torchvision.models import MobileNet_V3_Small_Weights, mobilenet_v3_small


class SignRecognizer(nn.Module):
    def __init__(
        self,
        num_classes: int,
        hidden_size: int = 256,
        num_layers: int = 2,
        dropout: float = 0.3,
        pretrained: bool = True,
    ) -> None:
        super().__init__()

        weights = MobileNet_V3_Small_Weights.DEFAULT if pretrained else None
        backbone = mobilenet_v3_small(weights=weights)
        self.backbone = backbone.features
        self.avgpool = backbone.avgpool
        feature_dim = backbone.classifier[0].in_features

        self.temporal = nn.GRU(
            input_size=feature_dim,
            hidden_size=hidden_size,
            num_layers=num_layers,
            batch_first=True,
            bidirectional=True,
            dropout=dropout if num_layers > 1 else 0.0,
        )
        self.attention = nn.Linear(hidden_size * 2, 1)
        self.classifier = nn.Sequential(
            nn.LayerNorm(hidden_size * 2),
            nn.Dropout(dropout),
            nn.Linear(hidden_size * 2, num_classes),
        )

    def forward(self, video: torch.Tensor) -> torch.Tensor:
        batch_size, time_steps, channels, height, width = video.shape
        features = video.view(batch_size * time_steps, channels, height, width)
        features = self.backbone(features)
        features = self.avgpool(features).flatten(1)
        features = features.view(batch_size, time_steps, -1)

        temporal_features, _ = self.temporal(features)
        attention_scores = self.attention(temporal_features).squeeze(-1)
        attention_weights = torch.softmax(attention_scores, dim=1).unsqueeze(-1)
        pooled = (temporal_features * attention_weights).sum(dim=1)
        return self.classifier(pooled)

    def set_trainable_backbone_blocks(self, num_blocks: int) -> None:
        blocks = list(self.backbone.children())
        for parameter in self.backbone.parameters():
            parameter.requires_grad = False

        if num_blocks <= 0:
            return

        for block in blocks[-num_blocks:]:
            for parameter in block.parameters():
                parameter.requires_grad = True

