/**
 * faceService.js — Face Detection & Embedding Service
 * Uses @vladmandic/face-api for face detection, alignment, and 128D embedding generation.
 * Models are loaded lazily from the vladmandic CDN on first use.
 */

import * as faceapi from '@vladmandic/face-api';

// CDN base URL for model weights
const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@latest/model/';

let modelsLoaded = false;
let loadingPromise = null;

/**
 * Loads all required face-api.js models from CDN.
 * Uses a singleton promise to avoid duplicate loading.
 */
export async function loadModels(onProgress) {
    if (modelsLoaded) return;

    if (loadingPromise) {
        return loadingPromise;
    }

    loadingPromise = (async () => {
        onProgress?.({ step: 'Initializing TensorFlow.js backend…', pct: 5 });

        // Use WebGL for hardware acceleration, fall back to CPU
        try {
            await faceapi.tf.setBackend('webgl');
            await faceapi.tf.ready();
        } catch {
            await faceapi.tf.setBackend('cpu');
            await faceapi.tf.ready();
        }

        onProgress?.({ step: 'Loading face detector…', pct: 20 });
        await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);

        onProgress?.({ step: 'Loading landmark model…', pct: 50 });
        await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);

        onProgress?.({ step: 'Loading recognition model…', pct: 75 });
        await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);

        onProgress?.({ step: 'Models ready.', pct: 100 });
        modelsLoaded = true;
    })();

    return loadingPromise;
}

export function areModelsLoaded() {
    return modelsLoaded;
}

/**
 * Detects a face in an HTMLImageElement and returns its L2-normalized 128D embedding.
 * Returns null if no face was detected.
 *
 * Pipeline:
 * 1. SSD MobileNet face detection
 * 2. 68-point landmark detection (for alignment context)
 * 3. FaceRecognitionNet → 128D descriptor
 *
 * @param {HTMLImageElement|HTMLCanvasElement} imgEl
 * @returns {Float32Array|null} 128D embedding or null
 */
export async function getEmbeddingFromImage(imgEl) {
    if (!modelsLoaded) throw new Error('Models not loaded. Call loadModels() first.');

    const detection = await faceapi
        .detectSingleFace(imgEl, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
        .withFaceLandmarks()
        .withFaceDescriptor();

    if (!detection) return null;

    // descriptor is already L2-normalized by faceRecognitionNet
    return detection.descriptor; // Float32Array of length 128
}

/**
 * Runs face detection + embedding on a video frame (for real-time inference).
 * Returns detection result with bounding box + embedding.
 *
 * @param {HTMLVideoElement} videoEl
 * @returns {{ box, descriptor, landmarks }|null}
 */
export async function detectFromVideo(videoEl) {
    if (!modelsLoaded) return null;

    const result = await faceapi
        .detectSingleFace(
            videoEl,
            new faceapi.SsdMobilenetv1Options({ minConfidence: 0.45, maxResults: 1 })
        )
        .withFaceLandmarks()
        .withFaceDescriptor();

    if (!result) return null;

    return {
        box: result.detection.box,         // { x, y, width, height }
        descriptor: result.descriptor,     // Float32Array 128D
        landmarks: result.landmarks,
        score: result.detection.score,
    };
}

/**
 * Loads a Blob/File as an HTMLImageElement (browser helper).
 */
export function fileToImageElement(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(url);
            resolve(img);
        };
        img.onerror = reject;
        img.src = url;
    });
}
