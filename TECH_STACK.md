# Frego — Tech Stack & Architecture

This document outlines the detailed technology stack, library versions, and architectural decisions used to build the Frego browser-based face recognition platform.

---

## 1. Core Platform & Framework

* **Framework:** React
* **Version:** `19.2.0`
* **Routing:** `react-router-dom` (`^7.13.1`)
* **Build Tool:** Vite (`^7.3.1`)
* **Environment:** Node.js / Browser (Client-side only)

**Why this stack?**
React provides a robust component-based architecture for managing the complex state of the ML pipeline (uploading, processing, training). Vite ensures extremely fast HMR (Hot Module Replacement) during development and optimized bundling for production.

---

## 2. Machine Learning & Computer Vision

* **Library:** `@vladmandic/face-api`
* **Version:** `^1.7.15`
* **Underlying Engine:** TensorFlow.js (`@tensorflow/tfjs-core`)
* **Hardware Acceleration:** WebGL (via browser)

### Models Used (Pre-trained)
1. **Face Detection:** `SSD-MobileNetV1` (Single Shot MultiBox Detector)
   * Chosen for its high accuracy in detecting faces under various lighting conditions compared to lighter models like Tiny-YOLO.
2. **Face Landmarking:** `faceLandmark68Net`
   * Detects 68 facial landmark points (eyes, nose, mouth contour). Used internally to align the face before descriptor extraction.
3. **Face Recognition:** `faceRecognitionNet`
   * A ResNet-34 like architecture.
   * **Output:** 128-dimensional continuous feature vector (Float32Array).
   * **Metric:** Euclidean Distance.

**Why face-api.js?**
It provides highly optimized, browser-ready wrappers around proven TensorFlow.js face models. By executing entirely client-side via WebGL, it ensures zero user data is ever sent to a server, guaranteeing complete privacy.

---

## 3. Data Storage & Persistence

Frego adheres to a strict "Zero Persistence of PII" architecture. 

* **Local Storage Layer:** IndexedDB
* **Library:** `idb` (IndexedDB Promise Wrapper)
* **Version:** `^8.0.3`

### Storage Strategy:
* **Session Memory (JS Heap):** Raw uploaded images and initial 128D embeddings are kept strictly in standard variables (RAM) during a session. If the user refreshes, this data is wiped.
* **Persistent Storage (IndexedDB):** Only the *trained artifacts* are saved to the browser's IndexedDB. This includes:
  * `meanEmbedding` (128D Float32Array)
  * `allEmbeddings` (Array of 128D Float32Arrays for Nearest-Neighbor matching)
  * `threshold` (Float)
  * Metadata (Name, Date, Framework Version)
* *Crucially, 128D embedding vectors cannot be reversed to reconstruct the original human face.*

---

## 4. Export & Artifact Generation

To allow users to use their locally trained models in Python or server environments later, Frego performs client-side file generation.

* **Library:** `jszip`
* **Version:** `^3.10.1`

### Export Implementation:
* **NumPy (`.npy`) Encoder:** A custom JavaScript implementation of the NumPy v1.0 binary format specification is used to encode Float32Arrays directly into `.npy` blobs entirely in the browser.
* **ZIP Generation:** `jszip` bundles the `.npy` arrays and `.json` metadata into a single downloadable archive.

---

## 5. Styling & UI

* **Language:** Vanilla CSS (`index.css`)
* **Design System:** Custom CSS Utility Classes
* **Features:** CSS Variables (Custom Properties) for easy theming (Dark Mode by default), CSS Grid/Flexbox for responsive layouts, and CSS keyframe animations for polished micro-interactions.

**Why Vanilla CSS?**
To keep the bundle size minimal and dependencies low, avoiding heavy CSS-in-JS runtimes while maintaining a highly professional, bespoke aesthetic.

---

## 6. Project Directory Structure

```text
Frego/
├── public/                 # Static assets and face-api model weights (*.weights, *.json)
├── src/
│   ├── components/         # Reusable React components (ModelCard, etc.)
│   ├── pages/              # Route components (Upload, Train, Test, Models, Download)
│   ├── services/           
│   │   ├── db.js                 # IndexedDB interactions (idb wrapper)
│   │   ├── exportService.js      # NumPy encoding and JSZip logic
│   │   ├── faceService.js        # face-api.js model loading and inference wrappers
│   │   ├── memoryStore.js        # Ephemeral RAM storage for active session embeddings
│   │   └── recognitionService.js # Core ML algorithms (Euclidean distance, Nearest-Neighbor, Thresholding)
│   ├── App.jsx             # Main application layout and routing
│   ├── index.css           # Global design system, tokens, and utility classes
│   └── main.jsx            # React entry point
├── package.json            # Dependencies and scripts
└── vite.config.js          # Build configuration
```
