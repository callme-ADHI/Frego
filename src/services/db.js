/**
 * db.js — IndexedDB Service
 *
 * ══════════════════════════════════════════════════════════════════════
 *  WHAT IS STORED
 * ══════════════════════════════════════════════════════════════════════
 *  ✓ Model metadata (name, dates, trained flag)
 *  ✓ meanEmbedding — 128D centroid (for fallback + export)
 *  ✓ allEmbeddings — all N×128D training descriptors (for NN matching)
 *      → These are 128 float32 numbers per embedding, NOT images.
 *      → 120 embeddings = 120×128×4 = ~61 KB. Fine for IndexedDB.
 *      → Cannot be reverse-engineered to produce face images. Privacy safe.
 *  ✓ threshold — Euclidean distance threshold
 *
 *  ✗ Raw images — NEVER stored (memory only during processing)
 * ══════════════════════════════════════════════════════════════════════
 *
 * DB Version history:
 *   v1: models + embeddings object stores
 *   v2: removed embeddings store (moved to RAM-only)
 *   v3: added allEmbeddings to model record; migration marks old cosine models for retrain
 */

import { openDB } from 'idb';

const DB_NAME = 'frego_db';
const DB_VERSION = 3;
const STORE_MODELS = 'models';

let dbPromise = null;

function getDB() {
    if (!dbPromise) {
        dbPromise = openDB(DB_NAME, DB_VERSION, {
            upgrade(db, oldVersion) {
                // v1 → v2: drop old embeddings store
                if (oldVersion < 2 && db.objectStoreNames.contains('embeddings')) {
                    db.deleteObjectStore('embeddings');
                }
                // Ensure models store exists (handles fresh install)
                if (!db.objectStoreNames.contains(STORE_MODELS)) {
                    const store = db.createObjectStore(STORE_MODELS, {
                        keyPath: 'id',
                        autoIncrement: true,
                    });
                    store.createIndex('name', 'name', { unique: true });
                }
            },
        });
    }
    return dbPromise;
}

// ─── Model CRUD ───────────────────────────────────────────────────────────────

/** Creates a new model record. */
export async function createModel(name) {
    const db = await getDB();
    return db.add(STORE_MODELS, {
        name,
        createdAt: Date.now(),
        trained: false,
        imageCount: 0,
        threshold: 0.42,
        meanEmbedding: null,
        allEmbeddings: null,    // stored after training for NN matching
        trainedAt: null,
        metricVersion: 'euclidean_v1',
    });
}

/**
 * Returns all stored models.
 * Automatically detects and invalidates models trained with old cosine algorithm
 * (those without metricVersion = 'euclidean_v1').
 */
export async function getAllModels() {
    const db = await getDB();
    const all = await db.getAll(STORE_MODELS);
    const out = [];

    for (const m of all) {
        if (m.trained && m.metricVersion !== 'euclidean_v1') {
            // Old cosine-trained model — mark for re-train
            const updated = {
                ...m,
                trained: false,
                meanEmbedding: null,
                allEmbeddings: null,
                threshold: 0.42,
                metricVersion: 'needs_retrain',
            };
            await db.put(STORE_MODELS, updated);
            out.push(updated);
        } else {
            out.push(m);
        }
    }
    return out;
}

/** Returns a single model by ID. */
export async function getModel(id) {
    const db = await getDB();
    return db.get(STORE_MODELS, id);
}

/** Checks if a model name already exists. */
export async function modelNameExists(name) {
    const db = await getDB();
    const match = await db.getFromIndex(STORE_MODELS, 'name', name);
    return !!match;
}

/**
 * Updates model fields (merges with existing record).
 * Stamps metricVersion when training.
 */
export async function updateModel(id, updates) {
    const db = await getDB();
    const model = await db.get(STORE_MODELS, id);
    if (!model) throw new Error(`Model ${id} not found`);
    const updated = {
        ...model,
        ...updates,
        ...(updates.trained ? { metricVersion: 'euclidean_v1' } : {}),
    };
    await db.put(STORE_MODELS, updated);
    return updated;
}

/** Deletes a model entirely. */
export async function deleteModel(id) {
    const db = await getDB();
    await db.delete(STORE_MODELS, id);
}
