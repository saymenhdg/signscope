from __future__ import annotations

import torch
from torch import nn


class TemporalAttention(nn.Module):
    """Additive attention over the time dimension.

    Given encoder outputs ``H`` of shape ``(B, T, D)``, produces a weighted
    pooled context ``(B, D)``. We learn a scalar score per timestep via a
    small MLP and softmax across T.
    """

    def __init__(self, hidden_dim: int, attention_dim: int = 128) -> None:
        super().__init__()
        self.projection = nn.Linear(hidden_dim, attention_dim)
        self.score = nn.Linear(attention_dim, 1)

    def forward(self, encoded: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        projected = torch.tanh(self.projection(encoded))
        scores = self.score(projected).squeeze(-1)
        weights = torch.softmax(scores, dim=1)
        context = torch.bmm(weights.unsqueeze(1), encoded).squeeze(1)
        return context, weights


class WordLandmarkRecognizer(nn.Module):
    """BiLSTM encoder with additive attention and an MLP classifier head.

    Input:  (B, T, F) — sequence of per-frame landmark features.
    Output: (B, num_classes) logits.
    """

    def __init__(
        self,
        input_dim: int,
        num_classes: int,
        hidden_dim: int = 256,
        num_layers: int = 2,
        dropout: float = 0.3,
        attention_dim: int = 128,
    ) -> None:
        super().__init__()
        self.input_norm = nn.LayerNorm(input_dim)
        self.input_projection = nn.Linear(input_dim, hidden_dim)
        self.encoder = nn.LSTM(
            input_size=hidden_dim,
            hidden_size=hidden_dim,
            num_layers=num_layers,
            batch_first=True,
            bidirectional=True,
            dropout=dropout if num_layers > 1 else 0.0,
        )
        encoder_output_dim = hidden_dim * 2
        self.attention = TemporalAttention(encoder_output_dim, attention_dim=attention_dim)
        self.classifier = nn.Sequential(
            nn.LayerNorm(encoder_output_dim),
            nn.Dropout(dropout),
            nn.Linear(encoder_output_dim, hidden_dim),
            nn.ReLU(inplace=True),
            nn.Dropout(dropout),
            nn.Linear(hidden_dim, num_classes),
        )

    def forward(self, sequences: torch.Tensor) -> torch.Tensor:
        normalized = self.input_norm(sequences)
        projected = self.input_projection(normalized)
        encoded, _ = self.encoder(projected)
        pooled, _ = self.attention(encoded)
        return self.classifier(pooled)
