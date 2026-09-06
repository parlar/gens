import {
  CHROMOSOMES,
  COLORS,
  NO_SAMPLE_TYPE_DEFAULT,
  SIZES,
  TRACK_HEIGHTS,
} from "../../constants";
import { GensSession } from "../../state/gens_session";
import { div } from "../../util/utils";
import { DataTrack } from "../tracks/base_tracks/data_track";
import { ShadowBaseElement } from "../util/shadowbaseelement";
import { createDataTrackWrapper } from "./utils";
import { getBandTrack, getDotTrack } from "./utils/create_tracks";

const template = document.createElement("template");
template.innerHTML = String.raw`
  <style>
    #chromosome-tracks-container {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
      box-sizing: border-box;
      border-right: ${SIZES.one}px solid ${COLORS.lightGray};
    }
    #sample-label {
      margin-top: ${SIZES.m}px;
      margin-bottom: ${SIZES.m}px;
      margin-left: ${SIZES.m}px;
    }
  </style>
  <div id="sample-label"></div>
  <div id="chromosome-tracks-container"></div>
`;

interface ChromosomeGroup {
  samples: HTMLDivElement;
  annotations: HTMLDivElement;
}

interface ChromViewTrackInfo {
  track: DataTrack;
  container: HTMLDivElement;
  chromosome: string;
  sourceId: string | null;
  sampleId: string | null;
  type: "sample-annotation" | "dot-cov";
}

export class ChromosomeView extends ShadowBaseElement {
  private chromosomeTracksContainer: HTMLDivElement;
  private sampleLabel: HTMLDivElement;
  private session: GensSession;
  private dataSource: RenderDataSource;
  private tracks: ChromViewTrackInfo[] = [];
  private chromosomeGroups: Record<string, ChromosomeGroup> = {};

  constructor() {
    super(template);
  }

  connectedCallback(): void {
    super.connectedCallback();

    this.chromosomeTracksContainer = this.root.querySelector(
      "#chromosome-tracks-container",
    );
    this.sampleLabel = this.root.querySelector("#sample-label");
  }

  async initialize(session: GensSession, dataSource: RenderDataSource) {
    this.session = session;
    this.dataSource = dataSource;

    for (const chrom of CHROMOSOMES) {
      const {
        container: chromContainer,
        sampleGroup,
        annotGroup,
      } = getGroupElement(chrom);

      this.chromosomeTracksContainer.appendChild(chromContainer);
      this.chromosomeGroups[chrom] = {
        samples: sampleGroup,
        annotations: annotGroup,
      };
    }

    await this.buildTracks();
  }

  /** The sample the current tracks were built for. */
  private builtForSample: Sample | null = null;

  private async buildTracks() {
    const session = this.session;
    const dataSource = this.dataSource;

    // The sample these tracks describe. The heading above them names the main
    // sample, so the data has to come from the same one: this used to take
    // whichever sample happened to be first, and after switching to another
    // the view showed one patient's coverage under another patient's name.
    const settingSample = this.session.getMainSample();
    this.builtForSample = settingSample;
    const sampleAnnots = await dataSource.getSampleAnnotSources(settingSample);

    for (const chrom of CHROMOSOMES) {
      const dataTrackSetting: DataTrackSettings = {
        trackId: `chr-cov-${chrom}`,
        trackLabel: `Log2 cov`,
        trackType: "dot-cov",
        height: {
          collapsedHeight: TRACK_HEIGHTS.m,
          expandedHeight: TRACK_HEIGHTS.xl,
        },
        showLabelWhenCollapsed: false,
        isExpanded: false,
        isHidden: false,
        yAxis: {
          range: session.profile.getCoverageRange(),
          label: "Log2 ratio",
          hideLabelOnCollapse: true,
          highlightedYs: [0],
        },
        chromosome: chrom,
        sample: settingSample,
      };

      const annotTrackSettings = [];
      for (const sampleAnnot of sampleAnnots) {
        const setting: DataTrackSettings = {
          trackId: `${sampleAnnot.id}-${chrom}`,
          trackLabel: `Annot. track ${chrom}`,
          trackType: "sample-annotation",
          height: {
            collapsedHeight: TRACK_HEIGHTS.xs,
          },
          showLabelWhenCollapsed: false,
          isExpanded: false,
          isHidden: false,
          chromosome: chrom,
          sample: settingSample,
          sourceId: sampleAnnot.id,
        };
        annotTrackSettings.push(setting);
      }

      for (const track of [dataTrackSetting, ...annotTrackSettings]) {
        this.session.chromTracks.addTrack(track);
      }
    }

    const getCovData = (sample: Sample, chrom: string) =>
      this.dataSource.getCovData(sample, chrom, [
        1,
        this.session.pos.getChromSize(chrom),
      ]);

    for (const trackSetting of this.session.chromTracks.getTracks()) {
      const chromGroup = this.chromosomeGroups[trackSetting.chromosome];

      const getColorBandsPlaceholder = () => [];

      let track: DataTrack;
      if (trackSetting.trackType == "dot-cov") {
        track = getDotTrack(
          session,
          () => this.session.chromTracks.get(trackSetting.trackId),
          () => getCovData(trackSetting.sample, trackSetting.chromosome),
          (_track: DataTrack) => {
            console.warn("No context menu for chromosome view tracks");
          },
          (trackId: string, isExpanded: boolean) => {
            this.session.chromTracks.setIsExpanded(trackId, isExpanded);
            this.render({});
          },
          getColorBandsPlaceholder,
          () => [1, session.pos.getChromSize("1")],
        );
      } else if (trackSetting.trackType == "sample-annotation") {
        track = getBandTrack(
          session,
          this.dataSource,
          this.session.chromTracks.get(trackSetting.trackId),
          () =>
            this.dataSource.getSampleAnnotationBands(
              trackSetting.sourceId,
              trackSetting.chromosome,
            ),
          (_track: DataTrack) => {
            console.warn("No context menu available in chromosome view");
          },
          (trackId: string, isExpanded: boolean) => {
            this.session.chromTracks.setIsExpanded(trackId, isExpanded);
            this.render({});
          },
          (trackId: string, expandedHeight: number) => {
            this.session.chromTracks.setExpandedHeight(trackId, expandedHeight);
          },
          getColorBandsPlaceholder,
          () => [1, session.pos.getChromSize("1")],
        );
      } else {
        console.warn(
          `Unsupported track setting type: ${trackSetting.trackType}`,
        );
        continue;
      }

      const wrapper = createDataTrackWrapper(track);
      const info: ChromViewTrackInfo = {
        track,
        container: wrapper,
        chromosome: trackSetting.chromosome,
        sampleId: trackSetting.sample.sampleId,
        sourceId: trackSetting.sourceId,
        type: trackSetting.trackType,
      };
      this.onAddTrack(chromGroup.samples, info);
    }
  }

  /** Whether the tracks describe a different sample than the heading names. */
  public showsAnotherSampleThanItsLabel(): boolean {
    if (this.builtForSample == null) {
      return false;
    }
    const main = this.session.getMainSample();
    return (
      this.builtForSample.sampleId !== main.sampleId ||
      this.builtForSample.caseId !== main.caseId ||
      this.builtForSample.genomeBuild !== main.genomeBuild
    );
  }

  public render(settings: RenderSettings) {
    const mainSample = this.session.getMainSample();
    const sampleLabel = this.session.getDisplaySampleLabel(mainSample);
    const caseLabel = this.session.getDisplayCaseLabel(
      mainSample.caseId,
      mainSample.displayCaseId,
    );
    this.sampleLabel.textContent = `${sampleLabel} (${mainSample.sampleType || NO_SAMPLE_TYPE_DEFAULT}, case: ${caseLabel})`;

    // The tracks are built once, against the sample that was main at the time,
    // and their sample annotation sources belong to that sample specifically.
    // Rather than draw one patient's data under another's name, clear them and
    // rebuild for the sample now named above.
    if (this.showsAnotherSampleThanItsLabel()) {
      void this.rebuildForMainSample();
      return;
    }

    for (const track of this.tracks) {
      track.track.render(settings);
    }
  }

  private async rebuildForMainSample() {
    for (const track of this.tracks) {
      track.container.remove();
    }
    this.tracks = [];
    this.session.chromTracks.setTracks([]);
    await this.buildTracks();
    this.render({ reloadData: true });
  }

  // FIXME: This goes counter to having data track settings drive the visualization
  // It would be better for the y axis to come through the data source
  public setCovYRange(covRange: Rng) {
    for (const track of this.tracks) {
      if (track.type == "dot-cov") {
        track.track.setYAxis(covRange);
      }
    }
  }

  private onAddTrack(subgroup: HTMLDivElement, trackInfo: ChromViewTrackInfo) {
    this.tracks.push(trackInfo);
    subgroup.appendChild(trackInfo.container);
    trackInfo.track.initialize();
  }
}

function getGroupElement(chrom: string): {
  container: HTMLDivElement;
  annotGroup: HTMLDivElement;
  sampleGroup: HTMLDivElement;
} {
  const chromosomeGroup = div();
  chromosomeGroup.style.display = "flex";
  chromosomeGroup.style.flexDirection = "row";
  chromosomeGroup.style.paddingBottom = `${SIZES.xxs}px`;

  const labelGroup = div();
  labelGroup.style.display = "flex";
  labelGroup.style.justifyContent = "center";
  labelGroup.style.alignItems = "center";
  labelGroup.style.flex = "0 0 20px";
  chromosomeGroup.appendChild(labelGroup);
  const label = document.createTextNode(chrom);
  labelGroup.appendChild(label);

  const trackGroup = div();
  trackGroup.style.flex = "1 1 auto";
  chromosomeGroup.appendChild(trackGroup);

  const sampleGroup = div();
  const annotGroup = div();

  trackGroup.appendChild(sampleGroup);
  trackGroup.appendChild(annotGroup);
  return {
    container: chromosomeGroup,
    sampleGroup,
    annotGroup,
  };
}

customElements.define("chromosome-view", ChromosomeView);
