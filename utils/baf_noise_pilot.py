"""Offline exploratory allele-count audit; never writes to source data."""

from __future__ import annotations

import argparse
import bisect
import csv
import gzip
import hashlib
import json
import math
import platform
import statistics
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

import pysam


def merge_intervals(intervals: Iterable[tuple[int, int]]) -> list[tuple[int, int]]:
    merged: list[tuple[int, int]] = []
    for start, end in sorted(intervals):
        if start < 0 or end <= start:
            raise ValueError("Invalid zero-based half-open interval")
        if merged and start <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(end, merged[-1][1]))
        else:
            merged.append((start, end))
    return merged


def is_masked(position: int, intervals: list[tuple[int, int]]) -> bool:
    offset = position - 1
    index = bisect.bisect_right(intervals, (offset, math.inf)) - 1
    return index >= 0 and offset < intervals[index][1]


def count_observations(
    observations: Iterable[tuple[str, str, int, int, bool]],
    reference: str,
    alternate: str,
    minimum_mapq: int,
    minimum_baseq: int,
) -> dict[str, int]:
    fragments: dict[str, tuple[str | None, int, bool]] = {}
    counts: Counter[str] = Counter()
    for fragment, base, quality, mapq, reverse in observations:
        if mapq == 255 or mapq < minimum_mapq or quality < minimum_baseq:
            continue
        allele = "ref" if base == reference else "alt" if base == alternate else "other"
        counts[f"reads_{allele}"] += 1
        previous = fragments.get(fragment)
        if previous is None or quality > previous[1]:
            fragments[fragment] = (base, quality, reverse)
        elif quality == previous[1] and base != previous[0]:
            fragments[fragment] = (None, quality, reverse)
    for chosen_base, _quality, reverse in fragments.values():
        if chosen_base is None:
            counts["conflicts"] += 1
            continue
        allele = (
            "ref"
            if chosen_base == reference
            else "alt" if chosen_base == alternate else "other"
        )
        counts[allele] += 1
        if allele != "other":
            counts[f"{allele}_{'reverse' if reverse else 'forward'}"] += 1
    keys = (
        "ref",
        "alt",
        "other",
        "reads_ref",
        "reads_alt",
        "reads_other",
        "conflicts",
        "ref_forward",
        "ref_reverse",
        "alt_forward",
        "alt_reverse",
    )
    return {key: counts[key] for key in keys}


def load_masks(
    config: dict[str, Any],
) -> tuple[dict[str, list[tuple[int, int]]], dict[str, int]]:
    chromosomes = {window["chrom"] for window in config["windows"]}
    masks: dict[str, list[tuple[int, int]]] = {chrom: [] for chrom in chromosomes}
    sources: dict[str, int] = {}
    padding = config["sv_padding"]
    for path in config["sv_vcfs"]:
        count = 0
        with pysam.VariantFile(path) as variants:
            for record in variants:
                if record.chrom not in chromosomes:
                    continue
                length = record.info.get("SVLEN", 0)
                lengths = length if isinstance(length, tuple) else (length,)
                span = max(
                    [abs(int(value)) for value in lengths if value is not None] or [0]
                )
                masks[record.chrom].append(
                    (
                        max(0, record.start - padding),
                        max(record.stop, record.start + span) + padding,
                    )
                )
                count += 1
        if count == 0:
            raise ValueError(f"No masking SV records on planned chromosomes in {path}")
        sources[path] = count
    return {chrom: merge_intervals(spans) for chrom, spans in masks.items()}, sources


def choose_sites(
    variants: pysam.VariantFile,
    config: dict[str, Any],
    window: dict[str, Any],
    masks: list[tuple[int, int]],
    cap: int,
) -> tuple[list[dict[str, Any]], dict[str, int]]:
    counts: Counter[str] = Counter()
    candidates = []
    positions: set[int] = set()
    for record in variants.fetch(window["chrom"], window["start"] - 1, window["end"]):
        if not window["start"] <= record.pos <= window["end"]:
            continue
        counts["vcf_records"] += 1
        if (
            not record.alts
            or len(record.alts) != 1
            or record.ref not in {"A", "C", "G", "T"}
            or record.alts[0] not in {"A", "C", "G", "T"}
        ):
            counts["not_biallelic_snp"] += 1
            continue
        if "PASS" not in record.filter:
            counts["not_pass"] += 1
            continue
        call = record.samples[config["sample"]]
        if call.get("GT") not in ((0, 1), (1, 0)):
            counts["not_heterozygous"] += 1
            continue
        quality = call.get("GQ")
        if quality is None or quality < config["minimum_gq"]:
            counts["low_or_missing_gq"] += 1
            continue
        depths = call.get("AD")
        depth = call.get("DP")
        if (
            depths is None
            or len(depths) != 2
            or any(value is None or value < 0 for value in depths)
            or depth is None
            or depth <= 0
        ):
            counts["invalid_ad_or_dp"] += 1
            continue
        if sum(depths) < config["minimum_informative_depth"]:
            counts["low_informative_ad_depth"] += 1
            continue
        if is_masked(record.pos, masks):
            counts["sv_masked"] += 1
            continue
        if record.pos in positions:
            raise ValueError(
                f"Duplicate selected SNP position: {record.chrom}:{record.pos}"
            )
        positions.add(record.pos)
        identifier = f"{record.chrom}:{record.pos}:{record.ref}:{record.alts[0]}"
        candidates.append(
            {
                "chrom": record.chrom,
                "pos": record.pos,
                "ref": record.ref,
                "alt": record.alts[0],
                "ad_ref": depths[0],
                "ad_alt": depths[1],
                "dp": depth,
                "gq": quality,
                "vcf_alt_dp": depths[1] / depth,
                "vcf_alt_adsum": depths[1] / sum(depths),
                "selection_hash": hashlib.sha256(identifier.encode()).hexdigest(),
                "window": f"{window['chrom']}:{window['start']}-{window['end']}",
            }
        )
    counts["eligible"] = len(candidates)
    selected = sorted(candidates, key=lambda row: row["selection_hash"])[:cap]
    selected.sort(key=lambda row: row["pos"])
    counts["selected"] = len(selected)
    return selected, dict(counts)


def join_gens(
    baf: pysam.TabixFile, rows: list[dict[str, Any]], window: dict[str, Any]
) -> dict[str, int]:
    by_position = {row["pos"]: row for row in rows}
    for row in rows:
        row["gens_stored"] = None
    contig = "d_" + window["chrom"].removeprefix("chr")
    counts: Counter[str] = Counter()
    if contig not in baf.contigs:
        raise ValueError(f"Missing full-resolution BAF contig {contig}")
    observed: dict[int, list[float]] = {}
    for line in baf.fetch(contig, window["start"] - 1, window["end"]):
        fields = line.split("\t")
        if len(fields) < 4 or int(fields[2]) - int(fields[1]) != 1:
            counts["non_point_records"] += 1
            continue
        position = int(fields[2])
        if position not in by_position:
            continue
        value = float(fields[3])
        observed.setdefault(position, []).append(value)
        if not math.isfinite(value):
            counts["nonfinite_stored_values"] += 1
    for position, values in observed.items():
        counts["duplicate_records"] += len(values) - 1
        if not all(math.isfinite(value) for value in values) or len(set(values)) != 1:
            counts["ambiguous_sites"] += 1
            continue
        if len(values) > 1:
            counts["identical_duplicate_sites"] += 1
        by_position[position]["gens_stored"] = values[0]
        counts["matched"] += 1
    counts["missing"] = len(rows) - counts["matched"]
    return dict(counts)


def recount_window(
    alignment: pysam.AlignmentFile,
    rows: list[dict[str, Any]],
    window: dict[str, Any],
    settings: list[dict[str, Any]],
    maximum_depth: int,
) -> None:
    by_position = {row["pos"]: row for row in rows}
    for row in rows:
        row["pileup_capped"] = False
        row["pileup_records"] = 0
        for setting in settings:
            for name, value in count_observations(
                [], row["ref"], row["alt"], setting["mapq"], setting["baseq"]
            ).items():
                row[f"{setting['name']}_{name}"] = value
    if not rows:
        return
    for column in alignment.pileup(
        window["chrom"],
        window["start"] - 1,
        window["end"],
        truncate=True,
        stepper="nofilter",
        min_base_quality=0,
        min_mapping_quality=0,
        ignore_overlaps=False,
        ignore_orphans=False,
        compute_baq=False,
        max_depth=maximum_depth,
    ):
        position = column.reference_pos + 1
        if position not in by_position:
            continue
        row = by_position[position]
        row["pileup_records"] = column.nsegments
        row["pileup_capped"] = column.nsegments >= maximum_depth
        observations = []
        for entry in column.pileups:
            read = entry.alignment
            offset = entry.query_position
            if (
                read.is_unmapped
                or read.is_secondary
                or read.is_supplementary
                or read.is_qcfail
                or read.is_duplicate
                or not read.query_name
            ):
                continue
            if (
                offset is None
                or read.query_sequence is None
                or read.query_qualities is None
            ):
                continue
            group = read.get_tag("RG") if read.has_tag("RG") else ""
            observations.append(
                (
                    f"{group}\0{read.query_name}",
                    read.query_sequence[offset].upper(),
                    read.query_qualities[offset],
                    read.mapping_quality,
                    read.is_reverse,
                )
            )
        for setting in settings:
            counts = count_observations(
                observations, row["ref"], row["alt"], setting["mapq"], setting["baseq"]
            )
            for name, value in counts.items():
                row[f"{setting['name']}_{name}"] = value


def quantile(values: list[float], fraction: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    position = (len(ordered) - 1) * fraction
    lower = math.floor(position)
    upper = math.ceil(position)
    return ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower)


def describe(values: list[float], depths: list[int] | None = None) -> dict[str, Any]:
    if not values:
        return {"sites": 0}
    variance = statistics.pvariance(values)
    result = {
        "sites": len(values),
        "mean": statistics.mean(values),
        "bias": statistics.mean(values) - 0.5,
        "sd": math.sqrt(variance),
        "rmse": math.sqrt(statistics.mean((value - 0.5) ** 2 for value in values)),
        "q025": quantile(values, 0.025),
        "median": statistics.median(values),
        "q975": quantile(values, 0.975),
        "outside_03_07_fraction": sum(value < 0.3 or value > 0.7 for value in values)
        / len(values),
    }
    if depths is not None:
        if len(depths) != len(values) or any(depth <= 0 for depth in depths):
            raise ValueError(
                "One positive informative depth per allele fraction is required"
            )
        expected_variance = statistics.mean(0.25 / depth for depth in depths)
        result.update(
            {
                "median_depth": statistics.median(depths),
                "binomial_sd": math.sqrt(expected_variance),
                "variance_ratio": variance / expected_variance,
            }
        )
    return result


def method_values(
    rows: list[dict[str, Any]], method: str, minimum_depth: int
) -> tuple[list[float], list[int] | None]:
    values: list[float] = []
    depths: list[int] | None = (
        [] if method != "vcf_alt_dp" and method != "gens_stored" else None
    )
    for row in rows:
        if row["pileup_capped"]:
            continue
        if method.startswith("bam_"):
            depth = row[method + "_ref"] + row[method + "_alt"]
            if depth < minimum_depth:
                continue
            value = row[method + "_alt"] / depth
        else:
            value = row[method]
            depth = row["ad_ref"] + row["ad_alt"]
        if value is None or not math.isfinite(value):
            continue
        values.append(value)
        if depths is not None:
            depths.append(depth)
    return values, depths


def summarize(rows: list[dict[str, Any]], config: dict[str, Any]) -> dict[str, Any]:
    minimum_depth = config["minimum_informative_depth"]
    bam_methods = [setting["name"] for setting in config["bam_settings"]]
    methods = ["vcf_alt_dp", "vcf_alt_adsum", "gens_stored", *bam_methods]
    uncapped = [row for row in rows if not row["pileup_capped"]]
    common = [
        row
        for row in uncapped
        if all(
            row[name + "_ref"] + row[name + "_alt"] >= minimum_depth
            for name in bam_methods
        )
    ]
    groups = {"all_selected": rows, "common_bam_sites": common}
    by_window = {
        window: [row for row in rows if row["window"] == window]
        for window in sorted({row["window"] for row in rows})
    }
    result: dict[str, Any] = {
        "selected_sites": len(rows),
        "capped_sites": len(rows) - len(uncapped),
        "common_bam_sites": len(common),
        "groups": {
            name: {
                method: describe(*method_values(selected, method, minimum_depth))
                for method in methods
            }
            for name, selected in groups.items()
        },
        "windows": {
            name: {
                method: describe(*method_values(selected, method, minimum_depth))
                for method in methods
            }
            for name, selected in by_window.items()
        },
    }
    differences = [row["vcf_alt_dp"] - row["vcf_alt_adsum"] for row in uncapped]
    result["denominators"] = {
        "sites": len(uncapped),
        "ad_sum_differs_from_dp": sum(
            row["ad_ref"] + row["ad_alt"] != row["dp"] for row in uncapped
        ),
        "ad_sum_above_dp": sum(
            row["ad_ref"] + row["ad_alt"] > row["dp"] for row in uncapped
        ),
        "median_adsum_over_dp": (
            statistics.median(
                (row["ad_ref"] + row["ad_alt"]) / row["dp"] for row in uncapped
            )
            if uncapped
            else None
        ),
        "mean_baf_difference": statistics.mean(differences) if differences else None,
        "maximum_absolute_baf_difference": max(map(abs, differences), default=None),
        "absolute_baf_difference_above_005": sum(
            abs(value) > 0.05 for value in differences
        ),
    }
    gens_rows = [row for row in uncapped if row["gens_stored"] is not None]
    result["stored_gens_comparison"] = {
        "sites": len(gens_rows),
        "matching_tolerance": 1e-6,
        **{
            method: {
                "matches": sum(
                    abs(row["gens_stored"] - row[method]) <= 1e-6 for row in gens_rows
                ),
                "mean_absolute_difference": (
                    statistics.mean(
                        abs(row["gens_stored"] - row[method]) for row in gens_rows
                    )
                    if gens_rows
                    else None
                ),
            }
            for method in ("vcf_alt_dp", "vcf_alt_adsum")
        },
    }
    result["depth_strata"] = {}
    result["overlap_diagnostics"] = {}
    for method in bam_methods:
        result["depth_strata"][method] = {}
        for lower, upper in ((10, 20), (20, 40), (40, 80), (80, math.inf)):
            subset = [
                row
                for row in uncapped
                if lower <= row[method + "_ref"] + row[method + "_alt"] < upper
            ]
            label = f"{lower}-{int(upper) - 1}" if math.isfinite(upper) else "80+"
            result["depth_strata"][method][label] = describe(
                *method_values(subset, method, minimum_depth)
            )
        differences = []
        eligible = []
        for row in uncapped:
            depth = row[method + "_ref"] + row[method + "_alt"]
            read_depth = row[method + "_reads_ref"] + row[method + "_reads_alt"]
            if depth >= minimum_depth and read_depth >= minimum_depth:
                eligible.append(row)
                differences.append(
                    abs(
                        row[method + "_alt"] / depth
                        - row[method + "_reads_alt"] / read_depth
                    )
                )
        result["overlap_diagnostics"][method] = {
            "sites": len(eligible),
            "sites_with_repeated_qualifying_observations": sum(
                sum(
                    row[method + "_reads_" + allele]
                    for allele in ("ref", "alt", "other")
                )
                > sum(
                    row[method + "_" + allele]
                    for allele in ("ref", "alt", "other", "conflicts")
                )
                for row in eligible
            ),
            "mean_absolute_read_vs_fragment_baf_difference": (
                statistics.mean(differences) if differences else None
            ),
            "maximum_absolute_read_vs_fragment_baf_difference": max(
                differences, default=None
            ),
            "tied_conflicts": sum(row[method + "_conflicts"] for row in uncapped),
            "other_base_observations": sum(row[method + "_other"] for row in uncapped),
        }
    return result


def write_plots(
    rows: list[dict[str, Any]],
    summary: dict[str, Any],
    output: Path,
    config: dict[str, Any],
) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    figure, axes = plt.subplots(2, 2, figsize=(12, 9), constrained_layout=True)
    minimum_depth = config["minimum_informative_depth"]
    methods = [
        "vcf_alt_dp",
        "vcf_alt_adsum",
        *[setting["name"] for setting in config["bam_settings"]],
    ]
    labels = [
        "VCF ALT/DP",
        "VCF ALT/(REF+ALT)",
        "BAM fragments Q20",
        "BAM fragments Q30",
    ]
    common = [
        row
        for row in rows
        if not row["pileup_capped"]
        and all(
            row[name + "_ref"] + row[name + "_alt"] >= minimum_depth
            for name in methods[2:]
        )
    ]
    for method, label in zip(methods, labels):
        values, _depths = method_values(common, method, minimum_depth)
        axes[0, 0].hist(
            values,
            bins=[index / 50 for index in range(51)],
            density=True,
            histtype="step",
            label=label,
        )
    axes[0, 0].set(
        xlabel="Allele fraction",
        ylabel="Density",
        title="Same sites: descriptive BAF distributions",
    )
    axes[0, 0].legend(fontsize=8)
    axes[0, 1].scatter(
        [row["dp"] for row in rows],
        [row["ad_ref"] + row["ad_alt"] for row in rows],
        s=5,
        alpha=0.35,
    )
    limit = max(
        [row["dp"] for row in rows] + [row["ad_ref"] + row["ad_alt"] for row in rows]
    )
    axes[0, 1].plot([0, limit], [0, limit], color="black", linewidth=1)
    axes[0, 1].set(
        xlabel="VCF DP", ylabel="VCF REF + ALT AD", title="Denominator consistency"
    )
    values, depths = method_values(rows, methods[2], minimum_depth)
    axes[1, 0].scatter(depths, values, s=4, alpha=0.25, color="#008080")
    axes[1, 0].axhline(0.5, color="black", linewidth=1)
    axes[1, 0].set(
        xlabel="Informative fragments (Q20)",
        ylabel="ALT / (REF + ALT)",
        title="Retained sites by effective depth",
    )
    labels_depth = list(summary["depth_strata"][methods[2]])
    for method, label in zip(methods[2:], labels[2:]):
        records = summary["depth_strata"][method]
        axes[1, 1].plot(
            labels_depth,
            [records[group].get("sd", math.nan) for group in labels_depth],
            marker="o",
            label=label,
        )
        axes[1, 1].plot(
            labels_depth,
            [records[group].get("binomial_sd", math.nan) for group in labels_depth],
            linestyle="--",
            label=f"Binomial at {label} depths",
        )
    axes[1, 1].set(
        xlabel="Informative depth group",
        ylabel="BAF standard deviation",
        title="Observed spread versus ideal count sampling",
    )
    axes[1, 1].legend(fontsize=8)
    figure.suptitle(
        f"{config['sample']}: exploratory presumed-neutral pilot\nGenotype-ascertained sites; no denoising or clinical validation",
        fontsize=13,
    )
    figure.savefig(output / "diagnostics.png", dpi=160)
    plt.close(figure)


def run(
    config_path: Path, output: Path, smoke_sites: int | None = None, plots: bool = False
) -> dict[str, Any]:
    config = json.loads(config_path.read_text())
    if output.exists():
        raise ValueError(
            "Choose a new output directory; existing results are never overwritten"
        )
    output.mkdir(parents=True)
    protocol = config_path.parent / "protocol.md"
    manifest: dict[str, Any] = {
        "started_at": datetime.now(timezone.utc).isoformat(),
        "mode": "smoke" if smoke_sites is not None else "fixed_exploratory_pilot",
        "smoke_sites_per_window": smoke_sites,
        "config": config,
        "config_sha256": hashlib.sha256(config_path.read_bytes()).hexdigest(),
        "protocol_sha256": hashlib.sha256(protocol.read_bytes()).hexdigest(),
        "script_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "versions": {
            "python": platform.python_version(),
            "pysam": pysam.__version__,
            "samtools": pysam.__samtools_version__,
        },
        "inputs": {},
    }
    for path_string in [
        config["bam"],
        config["vcf"],
        config["baf"],
        *config["sv_vcfs"],
    ]:
        path = Path(path_string)
        suffix = ".bai" if path.suffix == ".bam" else ".tbi"
        index = Path(str(path) + suffix)
        info = path.stat()
        manifest["inputs"][path_string] = {
            "size": info.st_size,
            "mtime_ns": info.st_mtime_ns,
            "index_sha256": hashlib.sha256(index.read_bytes()).hexdigest(),
        }
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    masks, mask_counts = load_masks(config)
    rows = []
    selection = {}
    gens_joins = {}
    with (
        pysam.AlignmentFile(config["bam"], "rb") as alignment,
        pysam.VariantFile(config["vcf"]) as variants,
        pysam.TabixFile(config["baf"]) as baf,
    ):
        if list(variants.header.samples) != [config["sample"]]:
            raise ValueError("VCF sample identity mismatch")
        groups = alignment.header.to_dict().get("RG", [])
        if not groups or any(group.get("SM") != config["sample"] for group in groups):
            raise ValueError("BAM sample identity mismatch")
        for window in config["windows"]:
            if alignment.get_reference_length(window["chrom"]) < window["end"]:
                raise ValueError("Window exceeds BAM contig length")
            cap = (
                smoke_sites
                if smoke_sites is not None
                else config["maximum_sites_per_window"]
            )
            selected, counts = choose_sites(
                variants, config, window, masks[window["chrom"]], cap
            )
            key = f"{window['chrom']}:{window['start']}-{window['end']}"
            selection[key] = counts
            print(f"Selected {len(selected)} sites in {key}", flush=True)
            gens_joins[key] = join_gens(baf, selected, window)
            recount_window(
                alignment,
                selected,
                window,
                config["bam_settings"],
                config["maximum_pileup_depth"],
            )
            rows.extend(selected)
            print(f"Recounted {key}", flush=True)
    if not rows:
        raise ValueError(
            "No eligible SNPs; an empty result is not evidence of low noise"
        )
    with gzip.open(output / "sites.tsv.gz", "wt", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]), delimiter="\t")
        writer.writeheader()
        writer.writerows(rows)
    summary = summarize(rows, config)
    summary.update(
        {
            "selection": selection,
            "sv_mask_record_counts": mask_counts,
            "gens_join": gens_joins,
        }
    )
    (output / "summary.json").write_text(
        json.dumps(summary, indent=2, allow_nan=False) + "\n"
    )
    if plots:
        write_plots(rows, summary, output, config)
    manifest["completed_at"] = datetime.now(timezone.utc).isoformat()
    manifest["selected_sites"] = len(rows)
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(
        json.dumps(
            {
                "output": str(output),
                "selected_sites": len(rows),
                "denominators": summary["denominators"],
                "common_bam_sites": summary["groups"]["common_bam_sites"],
            },
            indent=2,
        )
    )
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--smoke-sites", type=int)
    parser.add_argument("--plots", action="store_true")
    args = parser.parse_args()
    if args.smoke_sites is not None and args.smoke_sites < 1:
        parser.error("--smoke-sites must be positive")
    run(args.config, args.output, args.smoke_sites, args.plots)


if __name__ == "__main__":
    main()
