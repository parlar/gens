/**
 * Fields a track only has because of the kind of track it is.
 *
 * DataTrackSettings is one shape covering every kind, so the fields that belong
 * to only some of them -- a sample, an annotation source, a chromosome -- are
 * marked optional. Inside a branch that has already tested the kind, they are
 * always there, and the code reads them that way.
 *
 * These say that out loud. A miss is a wiring mistake: a track built without the
 * field its kind requires. Naming the track and the field beats reading a
 * property of undefined several frames away.
 */

export function trackSample(settings: DataTrackSettings): Sample {
  if (settings.sample == null) {
    throw Error(
      `${settings.trackType} track '${settings.trackId}' was built without a sample`,
    );
  }
  return settings.sample;
}

export function trackSourceId(settings: DataTrackSettings): string {
  if (settings.sourceId == null) {
    throw Error(
      `${settings.trackType} track '${settings.trackId}' was built without a source id`,
    );
  }
  return settings.sourceId;
}

export function trackChromosome(settings: DataTrackSettings): string {
  if (settings.chromosome == null) {
    throw Error(
      `${settings.trackType} track '${settings.trackId}' was built without a chromosome`,
    );
  }
  return settings.chromosome;
}
