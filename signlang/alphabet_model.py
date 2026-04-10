from __future__ import annotations

from torch import nn
from torchvision.models import MobileNet_V3_Small_Weights, mobilenet_v3_small


class AlphabetRecognizer(nn.Module):
    def __init__(
        self,
        num_classes: int,
        dropout: float = 0.25,
        pretrained: bool = True,
    ) -> None:
        super().__init__()

        weights = MobileNet_V3_Small_Weights.DEFAULT if pretrained else None
        backbone = mobilenet_v3_small(weights=weights)
        if dropout is not None:
            backbone.classifier[2] = nn.Dropout(p=dropout, inplace=True)
        backbone.classifier[3] = nn.Linear(backbone.classifier[3].in_features, num_classes)
        self.model = backbone

    def forward(self, image):
        return self.model(image)

    def set_trainable_backbone_blocks(self, num_blocks: int) -> None:
        blocks = list(self.model.features.children())
        for parameter in self.model.features.parameters():
            parameter.requires_grad = False

        if num_blocks > 0:
            for block in blocks[-num_blocks:]:
                for parameter in block.parameters():
                    parameter.requires_grad = True

        for parameter in self.model.classifier.parameters():
            parameter.requires_grad = True
