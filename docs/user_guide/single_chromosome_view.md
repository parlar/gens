# Single-chromosome view

* [Tracks](#tracks)
* [Opening a case](#opening-a-case)
* [Expand / collapse tracks](#expand--collapse-tracks)
* [Open the context menu](#open-the-context-menu)
* [Annotation tracks](#annotation-tracks)
* [Highlights](#highlights)
* [BAF histogram](#baf-histogram)
* [Read connections](#read-connections)

## Tracks

The default tracks are:

* B allele frequency (BAF).
* Log2 coverage ratio (cov). Dots outside the Y-range are rendered in red at the min/max y-value.
* Gene track showing MANE transcripts.
* Chromosome ideogram (top). You can navigate the chromosome by clicking on any band.
* The overview track (bottom) displaying BAF and cov for all chromosomes. You can navigate to any chromosome by clicking in this track.

Optionally, more tracks can be shown:

* Structural variants. These are retrieved from external software (currently hard-coded to use Scout).
* Global annotation tracks, loaded from bed, tsv or aed. One or more can be selected in the settings menu.
* Sample specific tracks. Below, a track showing UPD and ROH ranges is shown.

<img src="../img/single.PNG" width="800">

## Navigation

You can zoom using the buttons or the up/down arrow keys.

<img src="../img/controls_zoom.PNG" width="400">

You can also zoom into any area by pressing shift and dragging with the mouse.

You can pan using the buttons or the left/right arrow keys. You can also press space and drag the mouse to pan.

<img src="../img/controls_arrows.PNG" width="400">

You can at any point reset the zoom to the current chromosome by clicking the reset button (top bar, between right pan and the search field) or "R" key.

<img src="https://raw.githubusercontent.com/SMD-Bioinformatics-Lund/Documentation-resources/refs/heads/master/gens/navigation.gif" width="800">

You can navigate between chromosomes by clicking the overview plot at the bottom of the screen, or pressing control + arrows.

You can also navigate directly to a position by typing out a chromosome + range in the search field and pressing search.

<img src="../img/controls_search_field.PNG" width="400">

## Opening multiple samples

When opening a full case, the view is similar, but will display BAF and coverage tracks for all included samples. Variant tracks for non-proband (i.e. mother / father) are available but hidden by default. Then can be shown in the settings menu.

<img src="../img/trio.PNG" width="800">

Additional samples can be included through the settings menu.

## Expand / collapse tracks

Tracks can be expanded by right-clicking on them. For dot-tracks this simply expands the screen size. For band tracks, it expands such that there are no overlaps among the bands.

<img src="../img/before_expansion.PNG" width="800">

<img src="../img/after_expansion.PNG" width="800">

Tracks can be expanded by right clicking. For dot-tracks, this simply increases the height of the track. For band tracks,
it expands to show all overlapping bands.

<img src="https://raw.githubusercontent.com/SMD-Bioinformatics-Lund/Documentation-resources/refs/heads/master/gens/expanding.gif" width="800">

The collapsed / expanded heights of tracks can be configured in the settings menu.

## Open the context menu

Clicking any bands in the band tracks opens additional information. Here, a band in the annotation track is clicked.

<img src="../img/annotations.PNG" width="800">

## BAF histogram

Open **BAF histogram** using the chart icon in the top toolbar. Choose a sample
and an interval: the **Visible interval**, an existing highlight, or **Region I
type**, which accepts coordinates written as `1:100000-200000`. Thousands
separators and a `chr` prefix are accepted, so coordinates can be pasted from
elsewhere. The visible-interval histogram follows navigation; a highlight or a
typed region stays put. Nothing is measured while a typed region is unusable,
and the panel says what is wrong with it.

The vertical axis is BAF and the horizontal axis is the number of retained sites
in each bin. Hover over a bar for its BAF limits and site count. Adjust **Bins**
or **BAF min/max** to inspect the distribution; these controls reuse the loaded
sites without another request. The uppermost bin includes its upper limit;
other bins include their lower limit and exclude their upper limit.

Histograms always request resolution **d**, independently of the scatter plot's
zoom level. Counts include both genomic interval endpoints. Non-finite fractions
and fractions outside the chosen BAF range are excluded and counted separately.
The default range includes BAF 0 and 1. No-data intervals and failed requests
are shown explicitly; use the reload icon to retry. The download icon exports
the displayed bins, counts, genomic interval, genome build, and resolution as CSV.

This is a descriptive distribution, not a duplication call or confidence score.
Resolution d contains the sites retained by the input pipeline, not every SNP or
read. The current BAF files do not retain per-site allele depth or quality, so
counts are not depth-weighted and the panel cannot distinguish missing-depth
values stored as zero from measured zeros. Interpret band splitting alongside
coverage, site selection, and available quality information.

## Read connections

Open **Read connections** using the branch icon in the top toolbar. Select a
sample and the visible interval or a saved highlight. This panel requires a
[registered compact BEDPE source](../admin_guide/read_connections.md), not BAM/CRAM.

The arcs and connection table distinguish split alignments, read pairs, SV calls,
and unspecified links. Select an arc or connection name to see both endpoint
intervals and orientations, the source file label, and reported fragment counts
and minimum MAPQ. Missing support is shown as **Not reported**, not zero.

Endpoints outside the window or on another chromosome have hollow markers;
interchromosomal connections use the separate **Off-view** endpoint. Interval
bars preserve the supplied endpoint ranges. Arc midpoints are layout anchors,
not refined breakpoints. Use either endpoint's arrow button to inspect that
location in the main viewer with BAF and coverage. Navigation switches back to
the visible interval. Contigs unavailable in the loaded genome cannot be opened.

Filter by evidence type or reported minimum support/MAPQ. Positive numeric
filters exclude records with unknown values. Page through connections when
there are more than fit in one view. Query limits show a **Partial results**
warning; narrow the interval to inspect more evidence.

These are imported connections, not automatic SV calls. No read sequences or
base-level alignment detail are available in the compact files.

## Annotation tracks

You can select annotation tracks to display in the settings menu.

<img src="https://raw.githubusercontent.com/SMD-Bioinformatics-Lund/Documentation-resources/refs/heads/master/gens/multiple_annotation_tracks.gif" width="800">

You can select one annotation track to color the backgrounds of other tracks.

<img src="https://raw.githubusercontent.com/SMD-Bioinformatics-Lund/Documentation-resources/refs/heads/master/gens/mimisbrunnr.gif" width="800">

## Rearrange tracks

Tracks can be rearranged by dragging the Y-axis (gray box at the left). 

<img src="https://raw.githubusercontent.com/SMD-Bioinformatics-Lund/Documentation-resources/refs/heads/master/gens/dragging.gif" width="800">

They can also be rearranged in the settings menu.

## Adjust track heights

Track heights (both collapsed and expanded) can be adjusted in the settings menu.

<img src="https://raw.githubusercontent.com/SMD-Bioinformatics-Lund/Documentation-resources/refs/heads/master/gens/changing_height.gif" width="800">

#### Highlights

Highlights lets you mark a region, see it across all tracks and later quickly navigate back to it.

These highlights can be placed in several way.

1. Enter highlight mode (shortcut M or the pencil button)
2. Click and drag

<img src="https://raw.githubusercontent.com/SMD-Bioinformatics-Lund/Documentation-resources/refs/heads/master/gens/add_highlights.gif" width="800">

Highlights can be removed by hovering over and pressing the "X", or by the settings menu.

<img src="https://raw.githubusercontent.com/SMD-Bioinformatics-Lund/Documentation-resources/refs/heads/master/gens/remove_highlights.gif" width="800">

You can quickly navigate to any highlight through the settings menu.

<img src="https://raw.githubusercontent.com/SMD-Bioinformatics-Lund/Documentation-resources/refs/heads/master/gens/navigate_highlights.gif" width="800">

You can hide tracks though the track menu or the settings page.

You can unhide tracks through the settings page.

<img src="https://raw.githubusercontent.com/SMD-Bioinformatics-Lund/Documentation-resources/refs/heads/master/gens/hide_unhide.gif" width="800">


