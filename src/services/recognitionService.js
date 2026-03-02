/**
 * recognitionService.js — Browser Face Recognition Engine
 *
 * ══════════════════════════════════════════════════════════════════════════════
 *  HOW face-api.js faceRecognitionNet WORKS
 * ══════════════════════════════════════════════════════════════════════════════
 *
 *  The model output is a 128D Float32Array.
 *  The correct comparison metric is EUCLIDEAN DISTANCE — this is what
 *  face-api.js's own FaceMatcher uses internally.
 *
 *  face-api.js FaceMatcher algorithm (what we replicate here):
 *    1. For each candidate embedding in the reference set, compute:
 *         dist = euclidean_distance(query, candidate)
 *    2. Best match = candidate with the MINIMUM distance
 *    3. If min_dist < threshold → RECOGNIZED, else → UNKNOWN
 *
 *  Why nearest-neighbor beats mean-only comparison:
 *    - The centroid (mean) of face embeddings loses intra-class variance
 *    - Two different males X and Y have centroid ~0.3 from each other
 *    - The centroid of X's training set is also ~0.3 from Y's face → FALSE POSITIVE
 *    - But X's individual embeddings are 0.15–0.35 from each other
 *    - Y's face is 0.5–0.7 from EACH of X's individual embeddings → CORRECTLY REJECTED
 *
 *  Threshold guidelines for face-api.js faceRecognitionNet (128D, Euclidean):
 *    0.4  — Very strict (very few false positives, but may reject own face at angles)
 *    0.45 — Recommended for individual recognition (our default cap)
 *    0.5  — Liberal (may pass similar-looking family members)
 *    0.6  — face-api.js FaceMatcher default (designed for multi-person lookup)
 * ══════════════════════════════════════════════════════════════════════════════
 */

// ─── Core Math ───────────────────────────────────────────────────────────────

/**
 * Euclidean L2 distance between two 128D face descriptors.
 * Lower = more similar. 0 = identical.
 */
export function euclideanDistance(a, b) {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
        const d = a[i] - b[i];
        sum += d * d;
    }
    return Math.sqrt(sum);
}

/**
 * Computes the raw centroid (mean) of an array of descriptors.
 * NOT L2-normalized (L2-norm is for cosine space, not Euclidean).
 */
export function computeMeanEmbedding(embeddings) {
    if (embeddings.length === 0) return [];
    const dim = embeddings[0].length;
    const mean = new Array(dim).fill(0);
    for (const emb of embeddings) {
        for (let i = 0; i < dim; i++) mean[i] += emb[i];
    }
    for (let i = 0; i < dim; i++) mean[i] /= embeddings.length;
    return mean;
}

/**
 * Computes the adaptive Euclidean threshold for a trained model.
 *
 * Method: Leave-one-out nearest-neighbor distance
 *   For each training embedding eᵢ, find its nearest neighbor eⱼ (j≠i)
 *   within the training set. Record that min distance.
 *   max_nn_dist = max of all these min distances
 *   threshold = min(DIST_CAP, max_nn_dist × SLACK)
 *
 * This ensures all training faces pass their own threshold (plus slack),
 * while being as tight as possible to reject impostors.
 *
 * Cap at 0.45 for individual face recognition (stricter than FaceMatcher's 0.6).
 *
 * @param {number[][]} embeddings
 * @returns {{ threshold, maxNNDist, meanDist, stdDist }}
 */
export function computeThreshold(embeddings) {
    const DIST_CAP = 0.45;    // Maximum allowed — stricter than face-api.js 0.6
    const DIST_MIN = 0.30;    // Don't be tighter than this (too many false negatives)
    const SLACK = 1.25;    // Allow 25% slack beyond max intra-class NN distance

    if (embeddings.length < 2) {
        return { threshold: 0.42, maxNNDist: 0, meanDist: 0, stdDist: 0 };
    }

    const mean = computeMeanEmbedding(embeddings);
    const dists = embeddings.map((e) => euclideanDistance(e, mean));
    const meanDist = dists.reduce((a, b) => a + b, 0) / dists.length;
    const stdDist = Math.sqrt(
        dists.reduce((s, x) => s + (x - meanDist) ** 2, 0) / dists.length
    );

    // Leave-one-out nearest-neighbor distances within training set
    let maxNNDist = 0;
    if (embeddings.length >= 3) {
        for (let i = 0; i < embeddings.length; i++) {
            let minDist = Infinity;
            for (let j = 0; j < embeddings.length; j++) {
                if (i === j) continue;
                const d = euclideanDistance(embeddings[i], embeddings[j]);
                if (d < minDist) minDist = d;
            }
            if (minDist > maxNNDist) maxNNDist = minDist;
        }
    } else {
        maxNNDist = dists[0] || 0.35;
    }

    const raw = maxNNDist * SLACK;
    const threshold = Math.max(DIST_MIN, Math.min(DIST_CAP, raw));

    return {
        threshold: parseFloat(threshold.toFixed(4)),
        maxNNDist: parseFloat(maxNNDist.toFixed(4)),
        meanDist: parseFloat(meanDist.toFixed(4)),
        stdDist: parseFloat(stdDist.toFixed(4)),
    };
}

// ─── Recognition ─────────────────────────────────────────────────────────────

/**
 * Finds the closest match for a query descriptor against a model.
 *
 * Priority:
 *   1. If allEmbeddings is available (stored from training): use nearest-neighbor
 *      → compare to EACH stored embedding, return MINIMUM distance
 *   2. Fallback to mean embedding comparison (less accurate)
 *
 * This mirrors face-api.js FaceMatcher.findBestMatch() behavior.
 *
 * @param {Float32Array|number[]} queryDescriptor
 * @param {{ allEmbeddings?: number[][], meanEmbedding: number[], threshold: number }} modelData
 * @returns {{ distance: number, recognized: boolean, method: string }}
 */
export function matchAgainstModel(queryDescriptor, modelData) {
    const { allEmbeddings, meanEmbedding, threshold } = modelData;

    // ── Nearest-neighbor against all training embeddings ──
    if (allEmbeddings && allEmbeddings.length > 0) {
        let minDist = Infinity;
        let closestIdx = -1;
        for (let i = 0; i < allEmbeddings.length; i++) {
            const d = euclideanDistance(queryDescriptor, allEmbeddings[i]);
            if (d < minDist) {
                minDist = d;
                closestIdx = i;
            }
        }
        return {
            distance: minDist,
            recognized: minDist < threshold,
            method: 'nearest_neighbor',
        };
    }

    // ── Fallback: compare to mean embedding ──
    if (!meanEmbedding || meanEmbedding.length === 0) {
        return { distance: Infinity, recognized: false, method: 'no_data' };
    }
    // Apply stricter threshold for mean-based comparison
    // (mean-based has higher false positive rate, compensate)
    const meanThreshold = threshold * 0.85;
    const dist = euclideanDistance(queryDescriptor, meanEmbedding);
    return {
        distance: dist,
        recognized: dist < meanThreshold,
        method: 'mean_embedding',
    };
}

// ─── Temporal Smoothing ───────────────────────────────────────────────────────

const HISTORY_LEN = 5;    // 5-frame rolling window
const HISTORY_MIN_RATIO = 0.60; // 60% of frames must match

/**
 * TemporalSmoother — rolling 5-frame window over Euclidean distances.
 * Requires ≥60% of frames to be below threshold for a confirmed match.
 * Reduces flicker from single-frame noise.
 */
export class TemporalSmoother {
    constructor() {
        this._dists = [];
        this._names = [];
    }

    /**
     * @param {number} distance  — Euclidean distance for this frame
     * @param {string} name      — Identity name this frame guessed
     * @param {number} threshold — Recognition threshold
     * @returns {{ recognized, avgDist, dominantName, framesBelow, historyLength }}
     */
    update(distance, name, threshold) {
        this._dists.push(distance);
        this._names.push(name);
        if (this._dists.length > HISTORY_LEN) this._dists.shift();
        if (this._names.length > HISTORY_LEN) this._names.shift();

        const avgDist = this._dists.reduce((a, b) => a + b, 0) / this._dists.length;
        const framesBelow = this._dists.filter((d) => d < threshold).length;

        // Require BOTH average below threshold AND majority frames below threshold
        const recognized = avgDist < threshold && framesBelow >= this._dists.length * HISTORY_MIN_RATIO;

        // Most frequent name in history window
        const freq = {};
        for (const n of this._names) freq[n] = (freq[n] || 0) + 1;
        const dominantName = Object.keys(freq).reduce((a, b) => freq[a] >= freq[b] ? a : b);

        return {
            recognized,
            avgDist: parseFloat(avgDist.toFixed(4)),
            dominantName,
            framesBelow,
            historyLength: this._dists.length,
        };
    }

    reset() {
        this._dists = [];
        this._names = [];
    }
}
