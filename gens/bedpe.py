"""Import compact BEDPE connections and index both ends with Tabix."""

import csv
import gzip
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Iterator

import pysam

from gens.models.genomic import GenomeBuild
from gens.models.read_evidence import ReadConnection, ReadEndpoint, ReadEvidence

MAX_EVIDENCE_WINDOW = 1_000_000
MAX_EVIDENCE_RECORDS = 50_000
MAX_EVIDENCE_CONNECTIONS = 1_000
MAX_IMPORT_CONNECTIONS = 1_000_000
HEADER = "#gens-read-evidence-v1"


def normalize_contig(contig: str) -> str:
    name = contig[3:] if contig.startswith("chr") else contig
    if not name or name == "." or any(char.isspace() for char in name):
        raise ValueError("Each endpoint must have a chromosome")
    return "MT" if name == "M" else name


def _endpoint(chromosome: str, start: str, end: str, strand: str) -> ReadEndpoint:
    start_position, end_position = int(start), int(end)
    if start_position < 0 or end_position <= start_position:
        raise ValueError("BEDPE intervals must have 0 <= start < end")
    return ReadEndpoint.model_validate(
        {
            "chromosome": normalize_contig(chromosome),
            "start": start_position + 1,
            "end": end_position,
            "strand": strand,
        }
    )


def parse_bedpe(path: Path) -> Iterator[ReadConnection]:
    """Read BEDPE10 or BEDPE10 plus kind, fragments and minimum MAPQ."""
    opener = gzip.open if path.suffix.lower() == ".gz" else open
    identifiers: set[str] = set()
    with opener(path, "rt", encoding="utf-8") as handle:
        for line_number, fields in enumerate(csv.reader(handle, delimiter="\t"), 1):
            if not fields or fields[0].startswith("#"):
                continue
            try:
                if len(fields) not in {10, 13}:
                    raise ValueError(
                        "Expected 10 BEDPE columns or 13 columns including kind, fragments, minimum_mapq"
                    )
                identifier = fields[6] if fields[6] != "." else f"row-{line_number}"
                if not identifier or identifier in identifiers:
                    raise ValueError("Connection names must be unique and nonempty")
                identifiers.add(identifier)
                first = _endpoint(fields[0], fields[1], fields[2], fields[8])
                second = _endpoint(fields[3], fields[4], fields[5], fields[9])
                metadata = {}
                if len(fields) == 13:
                    metadata = {
                        "kind": fields[10],
                        "fragments": None if fields[11] == "." else int(fields[11]),
                        "minimum_observed_mapq": (
                            None if fields[12] in {".", "255"} else int(fields[12])
                        ),
                    }
                yield ReadConnection.model_validate(
                    {
                        "id": identifier,
                        "first": first,
                        "second": second,
                        **metadata,
                    }
                )
            except (ValueError, TypeError) as error:
                raise ValueError(f"BEDPE line {line_number}: {error}") from error


def prepare_read_evidence(source: Path, output: Path, genome_build: GenomeBuild) -> int:
    """Create a new compressed dual-anchor index without modifying the input."""
    index_path = Path(str(output) + ".tbi")
    if source.resolve() == output.resolve() or output.exists() or index_path.exists():
        raise ValueError(
            "Choose a new output path; existing input/output files are never overwritten"
        )
    if output.suffix != ".gz":
        raise ValueError("Output must end in .gz")
    records: list[tuple[str, int, int, str]] = []
    count = 0
    for connection in parse_bedpe(source):
        count += 1
        if count > MAX_IMPORT_CONNECTIONS:
            raise ValueError(
                "Too many input connections; prefilter or aggregate evidence before importing"
            )
        payload = connection.model_dump_json()
        anchors = {
            (endpoint.chromosome, endpoint.start - 1, endpoint.end)
            for endpoint in (connection.first, connection.second)
        }
        records.extend((*anchor, payload) for anchor in anchors)
    if not records:
        raise ValueError("No connections found in the BEDPE file")
    records.sort()
    output.parent.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(dir=output.parent) as temporary:
        bed = Path(temporary) / "connections.bed"
        compressed = Path(str(bed) + ".gz")
        with bed.open("w", encoding="utf-8") as handle:
            handle.write(f"{HEADER}\t{int(genome_build)}\n")
            for chromosome, start, end, payload in records:
                handle.write(f"{chromosome}\t{start}\t{end}\t{payload}\n")
        pysam.tabix_compress(str(bed), str(compressed), force=False)
        pysam.tabix_index(str(compressed), preset="bed", force=False)
        compressed.rename(output)
        Path(str(compressed) + ".tbi").rename(index_path)
    return count


def validate_evidence_file(path: Path, genome_build: GenomeBuild) -> None:
    with pysam.TabixFile(str(path)) as indexed:
        if list(indexed.header) != [f"{HEADER}\t{int(genome_build)}"]:
            raise ValueError(
                "Evidence file format or genome build does not match this sample"
            )


def get_read_evidence(
    path: Path,
    chromosome: str,
    start: int,
    end: int,
    genome_build: GenomeBuild,
    minimum_mapq: int = 0,
    minimum_fragments: int = 0,
    kind: str = "all",
    max_records: int = MAX_EVIDENCE_RECORDS,
    max_connections: int = MAX_EVIDENCE_CONNECTIONS,
) -> ReadEvidence:
    if start < 1 or end < start or end - start + 1 > MAX_EVIDENCE_WINDOW:
        raise ValueError(f"Select an interval of at most {MAX_EVIDENCE_WINDOW:,} bases")
    if not 0 <= minimum_mapq <= 254 or minimum_fragments < 0:
        raise ValueError("Invalid evidence filters")
    if kind not in {"all", "split", "pair", "call", "unknown"}:
        raise ValueError("Invalid connection kind")
    chromosome = normalize_contig(chromosome)
    result = ReadEvidence(
        chromosome=chromosome, start=start, end=end, genome_build=int(genome_build)
    )
    seen: set[str] = set()
    with pysam.TabixFile(str(path)) as indexed:
        if list(indexed.header) != [f"{HEADER}\t{int(genome_build)}"]:
            raise ValueError(
                "Evidence file format or genome build does not match this sample"
            )
        if chromosome not in indexed.contigs:
            return result
        for record in indexed.fetch(chromosome, start - 1, end):
            if result.records_examined >= max_records:
                result.truncated = True
                break
            result.records_examined += 1
            connection = ReadConnection.model_validate_json(record.split("\t", 3)[3])
            if connection.id in seen:
                continue
            seen.add(connection.id)
            if kind != "all" and connection.kind != kind:
                continue
            if minimum_mapq > 0 and (
                connection.minimum_observed_mapq is None
                or connection.minimum_observed_mapq < minimum_mapq
            ):
                continue
            if minimum_fragments > 0 and (
                connection.fragments is None or connection.fragments < minimum_fragments
            ):
                continue
            if len(result.connections) >= max_connections:
                result.truncated = True
                break
            result.connections.append(connection)
    result.connections.sort(
        key=lambda connection: (-(connection.fragments or 0), connection.id)
    )
    return result
