# Frego — Browser-Based Face Recognition Platform

> Train. Test. Export. All in your browser. No server. No storage. No compromise.

![Frego](https://img.shields.io/badge/ML-face--api.js-blue?style=flat-square)
![Stack](https://img.shields.io/badge/Stack-React%20%2B%20Vite-61dafb?style=flat-square)
![Privacy](https://img.shields.io/badge/Data-Client--Side%20Only-22c55e?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-purple?style=flat-square)

---

## What is Frego?

Frego is a fully browser-based face recognition training and inference platform.
Upload photos → generate face embeddings → train a model → test live via webcam →
download the trained model. Everything runs in the browser using WebGL-accelerated
TensorFlow.js. No data ever leaves your device.

---

## Features

- **Model Training** — Upload face photos, extract 128D embeddings, compute a trained identity model
- **Nearest-Neighbor Recognition** — Compares webcam faces against all training descriptors (not just the mean) for accurate individual identification
- **Live Webcam Testing** — Real-time inference with temporal smoothing (5-frame rolling window, 60% majority)
- **Model Export** — Download trained artifacts as NumPy `.npy` + JSON (compatible with Python/NumPy)
- **Zero Persistence** — Face images are never stored. Only 128D embedding vectors are persisted in IndexedDB (cannot reconstruct faces)
- **Privacy First** — No backend, no uploads, no tracking. Runs entirely in your browser tab

---

## How It Works

### Recognition Algorithm
Uses `faceRecognitionNet` from [`@vladmandic/face-api`](https://github.com/vladmandic/face-api) to generate
128-dimensional face descriptors, then applies nearest-neighbor Euclidean distance matching:

```text
dist = √Σ(query[i] − training[i])²

For each stored training descriptor:
  compute dist to query face
  track minimum

if min_dist < threshold → RECOGNIZED ✓
else                    → REJECTED   ✗
```

### Threshold Formula (adaptive)
```text
threshold = min(0.45,  max_NN_dist × 1.25)
```
Uses leave-one-out nearest-neighbor distances within the training set.
Capped at **0.45** for strict individual recognition (tighter than face-api.js FaceMatcher's 0.6 default).

### Training Pipeline
1. Upload face photos (JPG/PNG/JPEG)
2. Face detected with SSD MobileNet → landmarks with faceLandmark68Net
3. 128D descriptor extracted with faceRecognitionNet
4. Centroid (mean embedding) computed
5. Leave-one-out NN threshold calculated
6. All descriptors + centroid + threshold saved to IndexedDB

---

## Tech Stack

| Layer           | Technology                          |
|-----------------|-------------------------------------|
| UI Framework    | React 19 + Vite                     |
| ML Models       | `@vladmandic/face-api` (TensorFlow.js) |
| Accelerator     | WebGL backend (falls back to CPU)   |
| Storage         | IndexedDB via `idb` (embeddings only) |
| Session Memory  | JS heap (`memoryStore.js`)          |
| Export Format   | NumPy `.npy` (float32) + JSON       |
| Styling         | Vanilla CSS (dark mode)             |

Full details in [TECH_STACK.md](./TECH_STACK.md) and [ALGORITHM.txt](./ALGORITHM.txt).

---

## Getting Started

```bash
git clone https://github.com/callme-ADHI/Frego.git
cd Frego/Frego
npm install
npm run dev
```

Open `http://localhost:5173`

---

## Usage Flow

```text
+ New Model → Upload Images → Train → Test Live → Download Model
```

1. **Create Model** — give your model a name (e.g. `john_doe`)
2. **Upload** — drop ≥10 face photos (JPG/PNG). Images stay in RAM, never written to disk
3. **Train** — click Train. Threshold computed automatically (~2 seconds)
4. **Test** — open webcam, point it at your face. Green box = recognized
5. **Export** — download `name_mean_embedding.npy`, `name_all_embeddings.npy`, `name_metadata.json`

---

## Export Format

Compatible with Python/NumPy for use in other projects:

```python
import numpy as np, json

all_embs = np.load("name_all_embeddings.npy")   # (N, 128) float32
mean_emb = np.load("name_mean_embedding.npy")   # (128,)   float32
meta     = json.load(open("name_metadata.json"))

threshold = meta["threshold"]   # Euclidean distance threshold
```

---

## Privacy

| Data          | Stored Where   | When Cleared         |
|---------------|----------------|----------------------|
| Face images   | Nowhere        | Immediately after processing |
| 128D vectors  | IndexedDB      | When model is deleted |
| Webcam stream | Browser RAM    | When camera stopped |
| Exported files| Your disk only | Your choice          |

No server requests. No analytics. No cookies. Works offline after first load.

---

## License

MIT © 2026
