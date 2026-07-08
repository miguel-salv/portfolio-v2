/**
 * Fake CV confidence model: eases toward a target confidence with small
 * random jitter, mirroring the "Detected 0.91"-style readout used on the
 * homepage project card.
 */
export function createDetector({ settleRate = 0.12, jitter = 0.04, ceiling = 0.97 } = {}) {
  let confidence = 0;

  return {
    reset() {
      confidence = 0;
    },
    tick(targetConfidence) {
      const noise = (Math.random() - 0.5) * jitter;
      confidence += (targetConfidence - confidence) * settleRate + noise;
      confidence = Math.max(0, Math.min(ceiling, confidence));
      return confidence;
    },
    get value() {
      return confidence;
    },
  };
}
