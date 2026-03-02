/**
 * exportService.js — Model Export Utilities
 * Generates downloadable .npy (NumPy binary format) and metadata JSON.
 * Uses JSZip for packaging all artifacts into a single archive.
 *
 * Privacy design:
 *   - mean_embedding.npy and metadata.json: always available (from IndexedDB)
 *   - all_embeddings.npy: included only if individual embeddings are still in
 *     session memory (same tab, not refreshed). Passing null skips this file.
 */

import JSZip from 'jszip';

// ─── NumPy .npy encoder ───────────────────────────────────────────────────────

/**
 * Encodes a numeric array as a NumPy .npy v1.0 binary file (float32, C-order).
 *
 * NPY v1.0 format:
 *   Bytes 0–5   : Magic "\x93NUMPY"
 *   Byte  6–7   : Version 1.0
 *   Bytes 8–9   : Header length (uint16 LE)
 *   Bytes 10+   : ASCII header, padded to multiple of 64, terminated with '\n'
 *   Rest        : Raw float32 data (little-endian)
 *
 * @param {number[]|number[][]} data
 * @returns {Uint8Array}
 */
export function encodeNpy(data) {
    const is2D = Array.isArray(data[0]);
    let shape, flat;

    if (is2D) {
        const rows = data.length;
        const cols = data[0].length;
        shape = `(${rows}, ${cols})`;
        flat = new Float32Array(rows * cols);
        let idx = 0;
        for (const row of data) for (const v of row) flat[idx++] = v;
    } else {
        shape = `(${data.length},)`;
        flat = new Float32Array(data);
    }

    const PREFIX_LEN = 10; // magic(6) + version(2) + hdrlen(2)
    const headerBase = `{'descr': '<f4', 'fortran_order': False, 'shape': ${shape}, }`;
    let headerLen = headerBase.length + 1; // +1 for '\n'
    const remainder = (PREFIX_LEN + headerLen) % 64;
    const padCount = remainder === 0 ? 0 : 64 - remainder;
    const header = headerBase + ' '.repeat(padCount) + '\n';

    const headerBytes = new TextEncoder().encode(header);
    const dataBytes = new Uint8Array(flat.buffer, flat.byteOffset, flat.byteLength);
    const totalSize = PREFIX_LEN + headerBytes.length + dataBytes.length;

    const out = new Uint8Array(totalSize);
    const view = new DataView(out.buffer);

    // Magic: \x93NUMPY
    [0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59].forEach((b, i) => view.setUint8(i, b));
    view.setUint8(6, 1);
    view.setUint8(7, 0);
    view.setUint16(8, headerBytes.length, true);
    out.set(headerBytes, PREFIX_LEN);
    out.set(dataBytes, PREFIX_LEN + headerBytes.length);

    return out;
}

// ─── File download helper ─────────────────────────────────────────────────────

/**
 * Triggers a browser file download.
 */
export function downloadFile(content, filename, mimeType = 'application/octet-stream') {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ─── ZIP export ───────────────────────────────────────────────────────────────

/**
 * Exports model artifacts as a ZIP and triggers download.
 *
 * Always included:
 *   {name}_mean_embedding.npy   — from model.meanEmbedding (IndexedDB)
 *   {name}_metadata.json
 *
 * Optionally included (if embRecords is non-null and non-empty):
 *   {name}_all_embeddings.npy   — individual embeddings (from session memory)
 *
 * @param {object}       model      - Model record from IndexedDB
 * @param {object[]|null} embRecords - In-memory embedding records, or null
 */
export async function exportModelZip(model, embRecords) {
    const zip = new JSZip();
    const prefix = model.name;
    const mean = model.meanEmbedding ? Array.from(model.meanEmbedding) : [];

    if (mean.length === 0) {
        throw new Error('No mean embedding found. Train the model first.');
    }

    // mean_embedding.npy — always
    zip.file(`${prefix}_mean_embedding.npy`, encodeNpy(mean));

    // all_embeddings.npy — only if individual embeddings are in session memory
    if (embRecords && embRecords.length > 0) {
        const embeddings = embRecords.map((r) => Array.from(r.embedding));
        zip.file(`${prefix}_all_embeddings.npy`, encodeNpy(embeddings));
    }

    // metadata.json — always
    const metadata = {
        identity: model.name,
        total_images: model.imageCount || (embRecords?.length ?? 0),
        valid_faces: embRecords?.length ?? model.imageCount ?? 0,
        embedding_dimension: mean.length,
        threshold: model.threshold,
        all_embeddings_included: !!(embRecords && embRecords.length > 0),
        framework: 'Frego Browser ML v1.0',
        model_backbone: 'faceRecognitionNet (vladmandic/face-api)',
        backend: 'WebGL / TensorFlow.js',
        created_at: new Date(model.createdAt).toISOString(),
        trained_at: model.trainedAt ? new Date(model.trainedAt).toISOString() : null,
    };
    zip.file(`${prefix}_metadata.json`, JSON.stringify(metadata, null, 2));

    const zipBuffer = await zip.generateAsync({
        type: 'uint8array',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
    });

    downloadFile(zipBuffer, `${prefix}_frego_model.zip`);
}

// ─── Individual file exports ──────────────────────────────────────────────────

/**
 * Downloads model files individually (not zipped).
 * @param {object}       model
 * @param {object[]|null} embRecords - null if not in session memory
 */
export async function exportIndividualFiles(model, embRecords) {
    const prefix = model.name;
    const mean = model.meanEmbedding ? Array.from(model.meanEmbedding) : [];

    if (mean.length === 0) throw new Error('No mean embedding. Train the model first.');

    // all_embeddings.npy — only if in session memory
    if (embRecords && embRecords.length > 0) {
        const embeddings = embRecords.map((r) => Array.from(r.embedding));
        downloadFile(encodeNpy(embeddings), `${prefix}_all_embeddings.npy`);
        await delay(400);
    }

    // mean_embedding.npy — always
    downloadFile(encodeNpy(mean), `${prefix}_mean_embedding.npy`);
    await delay(400);

    // metadata.json — always
    const metadata = {
        identity: model.name,
        total_images: model.imageCount || (embRecords?.length ?? 0),
        valid_faces: embRecords?.length ?? model.imageCount ?? 0,
        embedding_dimension: mean.length,
        threshold: model.threshold,
        all_embeddings_included: !!(embRecords && embRecords.length > 0),
        framework: 'Frego Browser ML v1.0',
        model_backbone: 'faceRecognitionNet (vladmandic/face-api)',
        backend: 'WebGL / TensorFlow.js',
        created_at: new Date(model.createdAt).toISOString(),
        trained_at: model.trainedAt ? new Date(model.trainedAt).toISOString() : null,
    };
    downloadFile(JSON.stringify(metadata, null, 2), `${prefix}_metadata.json`, 'application/json');
}

function delay(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
