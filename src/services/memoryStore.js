/**
 * memoryStore.js — In-Memory Session Store for Face Embeddings
 *
 * This is the ONLY place raw embeddings are held during a session.
 * Data lives in the JavaScript heap.
 * It is NEVER written to IndexedDB, localStorage, sessionStorage,
 * or any persistent medium. It is automatically cleared when:
 *   - The browser tab is closed
 *   - The page is refreshed
 *   - clearEmbeddings() is called explicitly
 *
 * This design makes Frego safe to host as a multi-user service:
 * one user's face data cannot persist to another user's session.
 */

// Map<modelId (number), Array<{ embedding: number[], fileName: string }>>
const _store = new Map();

/**
 * Add an embedding to the in-memory store for a model.
 * @param {number} modelId
 * @param {Float32Array|number[]} embedding
 * @param {string} fileName - Original filename (for reference only)
 */
export function storeEmbedding(modelId, embedding, fileName = '') {
    if (!_store.has(modelId)) _store.set(modelId, []);
    _store.get(modelId).push({
        embedding: Array.from(embedding), // ensure plain array (serializable)
        fileName,
    });
}

/**
 * Returns all in-memory embeddings for a model.
 * @param {number} modelId
 * @returns {Array<{ embedding: number[], fileName: string }>}
 */
export function getEmbeddings(modelId) {
    return _store.get(modelId) || [];
}

/**
 * Returns the count of embeddings currently in memory for a model.
 * @param {number} modelId
 * @returns {number}
 */
export function getEmbeddingCount(modelId) {
    return (_store.get(modelId) || []).length;
}

/**
 * Returns true if there are any embeddings in memory for this model.
 * @param {number} modelId
 * @returns {boolean}
 */
export function hasEmbeddings(modelId) {
    const arr = _store.get(modelId);
    return !!(arr && arr.length > 0);
}

/**
 * Clears all embeddings from memory for a model.
 * Called after training is complete (embeddings no longer needed).
 * @param {number} modelId
 */
export function clearEmbeddings(modelId) {
    _store.delete(modelId);
}

/**
 * Returns total number of models currently holding embeddings in memory.
 * (Useful for debugging.)
 */
export function getSessionStats() {
    let total = 0;
    for (const arr of _store.values()) total += arr.length;
    return { models: _store.size, totalEmbeddings: total };
}
