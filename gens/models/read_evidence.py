"""Compact connections for manual structural-variant inspection."""

from pathlib import Path
from typing import Literal

from pydantic import Field

from .base import RWModel


class EvidenceSource(RWModel):
    path: Path
    label: str


class ReadEndpoint(RWModel):
    chromosome: str
    start: int = Field(ge=1)
    end: int = Field(ge=1)
    strand: Literal["+", "-", "."]


class ReadConnection(RWModel):
    id: str
    kind: Literal["split", "pair", "call", "unknown"] = "unknown"
    first: ReadEndpoint
    second: ReadEndpoint
    fragments: int | None = Field(default=None, ge=0)
    minimum_observed_mapq: int | None = Field(default=None, ge=0, le=254)


class ReadEvidence(RWModel):
    chromosome: str
    start: int
    end: int
    genome_build: int
    source_label: str = ""
    records_examined: int = 0
    truncated: bool = False
    connections: list[ReadConnection] = Field(default_factory=list)
