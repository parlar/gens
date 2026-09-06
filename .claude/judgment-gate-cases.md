# Judgment Gate Cases

Concrete ways work in this repository has fooled its author. Keep these specific
and named; the specificity is the value. See also the sibling file in
`cnv_validation/.claude/judgment-gate-cases.md`, whose APR-001 cases apply
whenever this repo's research uses that cohort.

## BAF-001 distinct SV loci were counted by record ID

- **Claimed:** 189 distinct heterozygous deletion loci >= 10 kb in the cohort,
  and 17 of them carried by exactly one sample.
- **Actually rested on:** Counting unique values of the truth VCF `ID` field.
  This callset splits one physical event across many records whose IDs differ
  only by a `_1`..`_11` suffix, so one locus counted as up to eleven. The
  singleton extraction compounded it by using `grep -F -f`, where the
  suffix-free ID is a substring of every suffixed one and matched them all.
- **Correct values:** 106 distinct loci by merged coordinates, 7 singletons.
- **Would have caught it:** Gate D1. Define a locus by merged coordinates, never
  by an identifier, and require the per-locus carrier counts to sum back to the
  total sample-event rows. Use exact field equality, never substring matching,
  when filtering by identifier.

## BAF-002 a separation threshold was referenced to the parameter boundary

- **Claimed:** "f-hat at least 3 null SD below 0.5" is a roughly 0.1 percent
  test, so any noncarrier firing it indicates bias.
- **Actually rested on:** The unphased minor-fraction estimator is constrained to
  f <= 0.5. Under true balance it can only err downward, 54 percent of the null
  mass sits exactly on the boundary, and an SD does not summarise a spike plus a
  one-sided tail. The measured false-positive rate was 2.2 percent per test,
  about a 18 percent chance of voiding the run across nine noncarrier tests.
- **Would have caught it:** Gate D2, which it did. Simulate the null of the
  actual estimator at realistic depths and measure the decision rule's
  false-positive rate before trusting the rule's nominal name. Replaced by the
  null's own 1st percentile; measured 1.4 percent against nominal 1 percent.

## BAF-003 a control that passed because the gate could not fire

- **Claimed:** The label-shuffle control passed, firing 0 of 20,000 shuffles.
- **Actually rested on:** The endpoint required a locus to separate in **all**
  its carriers, but the maximum number of separating samples at any locus was 2
  while every locus had at least 3 carriers. The endpoint was unreachable under
  every possible label assignment, true or shuffled.
- **Would have caught it:** Gate D2. A control that cannot fire cannot be
  distinguished from a dead one; check that the endpoint is achievable given the
  observed statistic before reading a null result as reassurance.

## BAF-004 positive controls were selected by span alone

- **Claimed:** Seven singleton deletion loci >= 10 kb would test the
  heterozygote-density channel.
- **Actually rested on:** Span from the truth record, with no callability
  requirement. Six of the seven carried near-zero callable heterozygous sites in
  **every** sample, carrier and noncarrier alike, against a pilot expectation of
  0.38-0.72 het/kb; three were zero in all six samples, degenerating the ratio
  to 0/0. Only one locus could test anything.
- **Would have caught it:** Gate A5. Verify that each candidate control interval
  contains usable observations, in the noncarriers, before fixing it as a
  control. Apply a pre-declared callability filter rather than discovering
  emptiness afterwards.
