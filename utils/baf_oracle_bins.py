"""Oracle-bin regional minor-fraction comparison for the BAF noise study.

Implements the estimator and controls fixed in
docs/research/baf_noise/protocol-oracle.md before any result was produced.
Reads allele depths from the existing SNV VCFs; no BAM access is required.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass, field

import numpy as np
import pysam

SAMPLES = ["NA12877", "NA12879", "NA12881", "NA12882", "NA12885", "NA12886"]

CASE = {
    "NA12877": ("Seq25-16020", "oceanic_swamp"),
    "NA12879": ("Seq25-16022", "graceful_junk"),
    "NA12881": ("Seq25-16025", "likeable_sled"),
    "NA12882": ("Seq25-16028", "wild_ceiling"),
    "NA12885": ("Seq25-16030", "perfect_tapioca"),
    "NA12886": ("Seq25-16032", "overwrought_rainy"),
}

ROOT = (
    "/home/parlar_ai/dev/cnv_validation/from_rv/storage/userdata/cnv_validation/"
    "wgs-cnv-validation/raredisease/{seq}/raredisease_results/call_snv/genome/{case}_snv.vcf.gz"
)

# Intervals fixed in the protocol before measurement.
DUP_LOCI = [
    ("chr22:15940451-15954054", "chr22", 15940451, 15954054,
     ["NA12879", "NA12882", "NA12886"], "pggb (primary)"),
    ("chr10:39366825-39377254", "chr10", 39366825, 39377254,
     ["NA12879", "NA12881", "NA12886"], "insertion-derived"),
    ("chr5:141179991-141189272", "chr5", 141179991, 141189272,
     ["NA12877", "NA12879", "NA12881", "NA12882"], "insertion-derived"),
]

DEL_SINGLETONS = [
    ("chr1:152583066-152615262", "chr1", 152583066, 152615262, "NA12881"),
    ("chr1:189735377-189814226", "chr1", 189735377, 189814226, "NA12879"),
    ("chr2:203316939-203327010", "chr2", 203316939, 203327010, "NA12885"),
    ("chr7:143587137-143662142", "chr7", 143587137, 143662142, "NA12882"),
    ("chr9:23362803-23377686", "chr9", 23362803, 23377686, "NA12881"),
    ("chr9:38863133-38874497", "chr9", 38863133, 38874497, "NA12877"),
    ("chr13:113672463-113721711", "chr13", 113672463, 113721711, "NA12881"),
]

MIN_GQ = 20
MIN_DEPTH = 10
BASES = {"A", "C", "G", "T"}
GRID = np.arange(0.001, 0.5001, 0.001)
N_BOOT = 2000


@dataclass
class Sites:
    """Qualifying heterozygous sites in one interval for one sample."""

    positions: list[int] = field(default_factory=list)
    alt: list[int] = field(default_factory=list)
    total: list[int] = field(default_factory=list)

    def arrays(self) -> tuple[np.ndarray, np.ndarray]:
        return np.asarray(self.alt, dtype=float), np.asarray(self.total, dtype=float)

    def __len__(self) -> int:
        return len(self.positions)


def collect_sites(sample: str, chrom: str, start: int, end: int) -> Sites:
    """Select heterozygous sites by the protocol's fixed rules.

    FILTER is deliberately never consulted: these VCFs carry no FILTER values,
    and pysam reports "PASS" in an empty filter, so such a condition is a no-op.
    """
    seq, case = CASE[sample]
    sites = Sites()
    # These SNV VCFs are keyed by sequencing ID, not by the NA pedigree ID.
    with pysam.VariantFile(ROOT.format(seq=seq, case=case)) as handle:
        for record in handle.fetch(chrom, start - 1, end):
            if not record.alts or len(record.alts) != 1:
                continue
            if record.ref not in BASES or record.alts[0] not in BASES:
                continue
            call = record.samples[seq]
            if call.get("GT") not in ((0, 1), (1, 0)):
                continue
            quality = call.get("GQ")
            if quality is None or quality < MIN_GQ:
                continue
            depths = call.get("AD")
            if depths is None or len(depths) < 2:
                continue
            ref_d, alt_d = depths[0], depths[1]
            if ref_d is None or alt_d is None or ref_d < 0 or alt_d < 0:
                continue
            if ref_d + alt_d < MIN_DEPTH:
                continue
            sites.positions.append(record.pos)
            sites.alt.append(int(alt_d))
            sites.total.append(int(ref_d + alt_d))
    return sites


def loglik_grid(alt: np.ndarray, total: np.ndarray) -> np.ndarray:
    """Symmetric unphased minor-fraction log likelihood over the fixed grid."""
    ref = total - alt
    log_f = np.log(GRID)
    log_1mf = np.log1p(-GRID)
    # (sites, grid) for each orientation, combined by logaddexp so that either
    # allele may belong to the minor haplotype.
    first = np.outer(alt, log_f) + np.outer(ref, log_1mf)
    second = np.outer(ref, log_f) + np.outer(alt, log_1mf)
    return np.logaddexp(first, second).sum(axis=0)


def fit(alt: np.ndarray, total: np.ndarray) -> float:
    if alt.size == 0:
        return float("nan")
    return float(GRID[int(np.argmax(loglik_grid(alt, total)))])


def null_distribution(total: np.ndarray, seed: int, n_boot: int = N_BOOT) -> np.ndarray:
    """Parametric bootstrap of f-hat under balance at the observed depths."""
    if total.size == 0:
        return np.array([])
    rng = np.random.default_rng(seed)
    draws = rng.binomial(total.astype(int)[None, :], 0.5, size=(n_boot, total.size))
    ref = total[None, :] - draws
    best = np.full(n_boot, -np.inf)
    arg = np.zeros(n_boot, dtype=int)
    for index, value in enumerate(GRID):
        # Accumulate one grid column at a time to bound memory.
        column = np.logaddexp(
            draws * np.log(value) + ref * np.log1p(-value),
            ref * np.log(value) + draws * np.log1p(-value),
        ).sum(axis=1)
        better = column > best
        best[better] = column[better]
        arg[better] = index
    return GRID[arg]


def simulate_fits(total: np.ndarray, true_f: float, n_rep: int, seed: int) -> np.ndarray:
    """Fit f-hat on `n_rep` datasets simulated at a known true minor fraction."""
    rng = np.random.default_rng(seed)
    # Each site independently carries the minor allele as ALT or as REF, which is
    # the orientation symmetry the estimator is built to tolerate.
    orient = rng.random((n_rep, total.size)) < 0.5
    probs = np.where(orient, true_f, 1.0 - true_f)
    draws = rng.binomial(np.broadcast_to(total.astype(int), probs.shape), probs)
    ref = total[None, :] - draws
    best = np.full(n_rep, -np.inf)
    arg = np.zeros(n_rep, dtype=int)
    for index, value in enumerate(GRID):
        column = np.logaddexp(
            draws * np.log(value) + ref * np.log1p(-value),
            ref * np.log(value) + draws * np.log1p(-value),
        ).sum(axis=1)
        better = column > best
        best[better] = column[better]
        arg[better] = index
    return GRID[arg]


def bootstrap_p(f_hat: float, null: np.ndarray) -> float:
    """Fraction of the balanced null at or below the observed f-hat.

    The estimator is constrained to f <= 0.5, so under true balance it can only
    err downward and its null piles up on the boundary. Referencing a threshold
    to 0.5, or summarising this null by an SD, understates the false-positive
    rate; the null's own lower tail is the calibrated reference.
    """
    if null.size == 0 or f_hat != f_hat:
        return float("nan")
    return float(np.mean(null <= f_hat))


def proximity(positions: list[int], window: int = 500) -> float:
    """Fraction of sites within `window` bp of another selected site."""
    if len(positions) < 2:
        return 0.0
    ordered = np.sort(np.asarray(positions))
    gap_prev = np.diff(ordered, prepend=-10**9)
    gap_next = np.diff(ordered, append=10**9)
    return float(np.mean((gap_prev <= window) | (gap_next <= window)))


def summarise(sample: str, chrom: str, start: int, end: int, seed: int) -> dict:
    sites = collect_sites(sample, chrom, start, end)
    alt, total = sites.arrays()
    result = {
        "sample": sample,
        "n_sites": len(sites),
        "median_depth": float(np.median(total)) if len(sites) else None,
        "prox_500bp": proximity(sites.positions),
    }
    if len(sites) == 0:
        result.update(f_hat=None, null_mean=None, null_sd=None, null_p01=None,
                      sd_below=None, boot_p=None, separates=False,
                      raw_mean_abs_dev=None, raw_sd=None)
        return result
    f_hat = fit(alt, total)
    null = null_distribution(total, seed)
    null_sd = float(np.std(null, ddof=1))
    baf = alt / total
    result.update(
        f_hat=f_hat,
        null_mean=float(np.mean(null)),
        null_sd=null_sd,
        null_p01=float(np.percentile(null, 1)),
        sd_below=float((0.5 - f_hat) / null_sd) if null_sd > 0 else None,
        boot_p=bootstrap_p(f_hat, null),
        separates=bool(bootstrap_p(f_hat, null) <= 0.01),
        raw_mean_abs_dev=float(np.mean(np.abs(baf - 0.5))),
        raw_sd=float(np.std(baf, ddof=1)) if len(sites) > 1 else None,
    )
    return result


def run_controls(seed: int = 20260906) -> dict:
    """Controls that must pass before any real result is read.

    Each is designed to avoid the f <= 0.5 boundary, where the estimator is
    biased downward by construction and an SD is not a meaningful summary.
    """
    rng = np.random.default_rng(seed)
    depths = rng.integers(20, 40, size=40).astype(float)
    out: dict = {}

    # 1. Interior recovery: a planted 1/3 must be recovered, or the test cannot
    #    detect the pattern it exists to detect.
    interior = simulate_fits(depths, 1.0 / 3.0, 400, seed)
    bias = float(np.mean(interior) - 1.0 / 3.0)
    out["interior_recovery_f=1/3"] = {
        "true_f": 1.0 / 3.0,
        "mean_recovered": float(np.mean(interior)),
        "bias": bias,
        "passes": abs(bias) <= 0.02,
    }

    # 2. Decision-rule calibration: two independent balanced nulls at the same
    #    depths. The share of one falling below the other's 1st percentile is the
    #    measured false-positive rate of the locked rule.
    reference = null_distribution(depths, seed, n_boot=4000)
    replicate = null_distribution(depths, seed + 991, n_boot=4000)
    threshold = float(np.percentile(reference, 1))
    observed_fpr = float(np.mean(replicate <= threshold))
    out["rule_calibration"] = {
        "threshold_f": threshold,
        "nominal_fpr": 0.01,
        "measured_fpr": observed_fpr,
        "null_mean": float(np.mean(reference)),
        "null_at_boundary": float(np.mean(reference >= 0.4995)),
        "passes": observed_fpr <= 0.02,
    }

    # 3. Deliberate double counting, measured at an interior f so that the
    #    boundary does not truncate the spread. Independent sites give sqrt(2);
    #    a shortfall means reused fragments would inflate confidence.
    single = simulate_fits(depths, 1.0 / 3.0, 800, seed + 5)
    doubled = simulate_fits(np.concatenate([depths, depths]), 1.0 / 3.0, 800, seed + 5)
    ratio = float(np.std(single, ddof=1) / np.std(doubled, ddof=1))
    out["double_counting"] = {
        "sd_single": float(np.std(single, ddof=1)),
        "sd_doubled": float(np.std(doubled, ddof=1)),
        "ratio": ratio,
        "expected": float(np.sqrt(2)),
        "passes": 1.30 <= ratio <= 1.55,
    }

    out["all_pass"] = all(v["passes"] for k, v in out.items() if isinstance(v, dict))
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", required=True)
    parser.add_argument("--seed", type=int, default=20260906)
    args = parser.parse_args()

    report: dict = {"controls": run_controls(args.seed), "dup": [], "del": []}

    for label, chrom, start, end, carriers, origin in DUP_LOCI:
        entry = {"locus": label, "origin": origin, "carriers": carriers, "samples": []}
        for offset, sample in enumerate(SAMPLES):
            row = summarise(sample, chrom, start, end, args.seed + offset)
            row["is_carrier"] = sample in carriers
            entry["samples"].append(row)
        report["dup"].append(entry)

    for label, chrom, start, end, carrier in DEL_SINGLETONS:
        entry = {"locus": label, "carrier": carrier, "counts": {}}
        for sample in SAMPLES:
            entry["counts"][sample] = len(collect_sites(sample, chrom, start, end))
        entry["is_carrier"] = {s: s == carrier for s in SAMPLES}
        report["del"].append(entry)

    with open(args.out, "w") as handle:
        json.dump(report, handle, indent=2)
    print(f"wrote {args.out}")


if __name__ == "__main__":
    main()
