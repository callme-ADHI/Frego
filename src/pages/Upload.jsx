import { useState, useRef, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getModel, updateModel } from '../services/db';
import { loadModels, getEmbeddingFromImage, fileToImageElement, areModelsLoaded } from '../services/faceService';
import { storeEmbedding, getEmbeddingCount } from '../services/memoryStore';

const MIN_RECOMMENDED = 10;
const ACCEPTED = 'image/jpeg,image/jpg,image/png';

/**
 * Upload Page — Image upload, face detection, embedding generation.
 *
 * Privacy architecture:
 *   - Images are loaded into browser RAM as HTMLImageElements (Object URLs)
 *   - Object URLs are revoked immediately after embedding extraction
 *   - Embeddings are stored in memoryStore.js (JS heap, not IndexedDB)
 *   - No image pixel data or individual embeddings touch disk storage
 *   - Only the image count is saved to IndexedDB (for display purposes)
 */
export default function Upload() {
    const { modelId } = useParams();
    const navigate = useNavigate();
    const mid = parseInt(modelId, 10);

    const [model, setModel] = useState(null);
    const [files, setFiles] = useState([]);     // { file, preview, status, error, id }
    const [mlLoading, setMlLoading] = useState(false);
    const [mlLoadPct, setMlLoadPct] = useState(0);
    const [mlLoadStep, setMlLoadStep] = useState('');
    const [processing, setProcessing] = useState(false);
    const [processedCount, setProcessedCount] = useState(0);
    const [dragging, setDragging] = useState(false);
    const [logs, setLogs] = useState([]);
    const [inMemCount, setInMemCount] = useState(0); // live count from memoryStore
    const fileInputRef = useRef(null);

    const addLog = (msg, type = 'info') =>
        setLogs((prev) => [...prev.slice(-60), { msg, type, id: Date.now() + Math.random() }]);

    // Load model metadata from DB
    useEffect(() => {
        getModel(mid).then(setModel).catch(() => navigate('/models'));
        setInMemCount(getEmbeddingCount(mid)); // show any already-queued embeddings
    }, [mid]);

    // Lazy-load face-api models (from CDN, cached by browser after first load)
    useEffect(() => {
        if (areModelsLoaded()) return;
        setMlLoading(true);
        loadModels(({ step, pct }) => {
            setMlLoadStep(step);
            setMlLoadPct(pct);
        })
            .then(() => setMlLoading(false))
            .catch((e) => {
                addLog('Failed to load ML models: ' + e.message, 'error');
                setMlLoading(false);
            });
    }, []);

    const addFiles = (newFiles) => {
        const accepted = Array.from(newFiles).filter((f) =>
            ['image/jpeg', 'image/jpg', 'image/png'].includes(f.type)
        );
        const entries = accepted.map((file) => ({
            file,
            preview: URL.createObjectURL(file), // temporary blob URL for thumbnail
            status: 'pending',
            error: null,
            id: crypto.randomUUID(),
        }));
        setFiles((prev) => [...prev, ...entries]);
    };

    const handleDrop = useCallback((e) => {
        e.preventDefault();
        setDragging(false);
        addFiles(e.dataTransfer.files);
    }, []);

    const handleDragOver = (e) => { e.preventDefault(); setDragging(true); };
    const handleDragLeave = () => setDragging(false);

    /**
     * Process all pending images:
     * 1. Load image into memory as HTMLImageElement
     * 2. Run face detection + embedding (GPU/WebGL)
     * 3. Store embedding in memoryStore (RAM only)
     * 4. Revoke the Object URL immediately (free memory)
     * 5. NEVER write pixels or embeddings to disk
     */
    const processImages = async () => {
        if (processing || mlLoading) return;
        setProcessing(true);
        setProcessedCount(0);

        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < files.length; i++) {
            const entry = files[i];
            if (entry.status !== 'pending') continue;

            addLog(`Processing ${entry.file.name}…`, 'info');
            setFiles((prev) =>
                prev.map((f) => f.id === entry.id ? { ...f, status: 'processing' } : f)
            );

            try {
                // Load image into RAM
                const imgEl = await fileToImageElement(entry.file);
                // Generate 128D L2-normalized embedding via face-api (WebGL)
                const embedding = await getEmbeddingFromImage(imgEl);
                // imgEl and blob URL are now eligible for GC (no strong references held)

                if (!embedding) {
                    setFiles((prev) =>
                        prev.map((f) => f.id === entry.id
                            ? { ...f, status: 'error', error: 'No face detected' } : f)
                    );
                    addLog(`✗ ${entry.file.name} — no face detected`, 'error');
                    failCount++;
                } else {
                    // ── Store embedding in JavaScript heap (NOT IndexedDB) ──
                    storeEmbedding(mid, embedding, entry.file.name);

                    setFiles((prev) =>
                        prev.map((f) => f.id === entry.id ? { ...f, status: 'success' } : f)
                    );
                    addLog(`✓ ${entry.file.name} — ${embedding.length}D embedding in memory`, 'success');
                    successCount++;
                }
            } catch (err) {
                setFiles((prev) =>
                    prev.map((f) => f.id === entry.id
                        ? { ...f, status: 'error', error: err.message } : f)
                );
                addLog(`✗ ${entry.file.name} — ${err.message}`, 'error');
                failCount++;
            }

            setProcessedCount(i + 1);
        }

        // Update image count in IndexedDB (number only — not the embeddings themselves)
        const m = await getModel(mid);
        const newCount = (m.imageCount || 0) + successCount;
        await updateModel(mid, { imageCount: newCount, trained: false });

        const total = getEmbeddingCount(mid);
        setInMemCount(total);

        addLog(
            `Done. ${successCount} embeddings in memory · ${failCount} failed · ` +
            `Total in session: ${total}`,
            'accent'
        );
        setProcessing(false);
    };

    const pendingCount = files.filter((f) => f.status === 'pending').length;
    const successCount = files.filter((f) => f.status === 'success').length;
    const processPct = files.length > 0 ? Math.round((processedCount / files.length) * 100) : 0;

    return (
        <main className="page">
            <div className="container">

                {/* Header */}
                <div className="page-header animate-fade-up">
                    <div className="badge">Step 2 of 4</div>
                    <h1>Upload Images</h1>
                    <p>
                        Upload face photos for{' '}
                        <strong style={{ color: 'var(--text-primary)' }}>{model?.name || '…'}</strong>.
                        {' '}Minimum {MIN_RECOMMENDED} recommended.
                    </p>
                </div>

                {/* Privacy notice — always visible */}
                <div className="animate-fade-up" style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    background: 'rgba(34,197,94,0.06)',
                    border: '1px solid rgba(34,197,94,0.18)',
                    borderRadius: 10, padding: '12px 16px',
                    marginBottom: 24, fontSize: '0.82rem', color: 'var(--text-secondary)',
                }}>
                    <span style={{ fontSize: '1rem', flexShrink: 0 }}>🔒</span>
                    <span>
                        <strong style={{ color: 'var(--success)' }}>Zero persistence.</strong>{' '}
                        Images are processed entirely in browser RAM. Only the 128D embedding vectors
                        remain in memory — never written to disk, database, or any server.
                        They are cleared automatically when this tab is closed or the page is refreshed.
                    </span>
                </div>

                {/* ML model loading */}
                {mlLoading && (
                    <div className="card animate-fade-up" style={{ marginBottom: 24 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                            <span className="spinner" />
                            <span style={{ fontWeight: 600 }}>Loading ML Models</span>
                        </div>
                        <div className="progress-wrap">
                            <div className="progress-bar" style={{ width: `${mlLoadPct}%` }} />
                        </div>
                        <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: 8 }}>
                            {mlLoadStep}
                        </p>
                    </div>
                )}

                {/* In-memory session counter */}
                {inMemCount > 0 && (
                    <div className="animate-fade-in" style={{
                        display: 'inline-flex', alignItems: 'center', gap: 8,
                        background: 'var(--accent-dim)', border: '1px solid rgba(99,102,241,0.25)',
                        borderRadius: 8, padding: '8px 14px', marginBottom: 20,
                        fontSize: '0.82rem', color: 'var(--accent-light)',
                    }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block' }} />
                        {inMemCount} embeddings in session memory &nbsp;·&nbsp; ready to train
                    </div>
                )}

                {/* Drop zone */}
                <div
                    className={`dropzone animate-fade-up ${dragging ? 'drag-active' : ''}`}
                    onClick={() => fileInputRef.current?.click()}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    style={{ marginBottom: 24 }}
                >
                    <span className="dropzone-icon">📁</span>
                    <h3 style={{ marginBottom: 8 }}>Drop face images here</h3>
                    <p style={{ fontSize: '0.85rem' }}>
                        or <strong style={{ color: 'var(--accent-light)' }}>click to browse</strong>
                    </p>
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: 8 }}>
                        JPG, JPEG, PNG · Select multiple · Min {MIN_RECOMMENDED} for good accuracy
                    </p>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept={ACCEPTED}
                        multiple
                        hidden
                        onChange={(e) => addFiles(e.target.files)}
                    />
                </div>

                {/* Stats row */}
                {files.length > 0 && (
                    <div className="stats-row animate-fade-up" style={{ marginBottom: 20 }}>
                        <div className="stat-card">
                            <div className="stat-value">{files.length}</div>
                            <div className="stat-label">Selected</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-value" style={{ color: 'var(--success)' }}>{successCount}</div>
                            <div className="stat-label">In Memory</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-value" style={{ color: 'var(--danger)' }}>
                                {files.filter((f) => f.status === 'error').length}
                            </div>
                            <div className="stat-label">No Face</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-value">{pendingCount}</div>
                            <div className="stat-label">Pending</div>
                        </div>
                    </div>
                )}

                {/* Processing progress bar */}
                {processing && (
                    <div className="animate-fade-up" style={{ marginBottom: 20 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                Detecting faces & computing embeddings…
                            </span>
                            <span style={{ fontSize: '0.85rem', color: 'var(--accent-light)', fontVariantNumeric: 'tabular-nums' }}>
                                {processedCount} / {files.length}
                            </span>
                        </div>
                        <div className="progress-wrap">
                            <div className="progress-bar" style={{ width: `${processPct}%` }} />
                        </div>
                    </div>
                )}

                {/* Image thumbnail grid */}
                {files.length > 0 && (
                    <div className="image-grid animate-fade-up">
                        {files.map((entry) => (
                            <div
                                key={entry.id}
                                className={`image-tile ${entry.status}`}
                                title={entry.error || entry.file.name}
                            >
                                <img src={entry.preview} alt={entry.file.name} loading="lazy" />
                                <div className="status-overlay">
                                    {entry.status === 'success' && '✓'}
                                    {entry.status === 'error' && '✕'}
                                    {entry.status === 'processing' && <span className="spinner" />}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Log terminal */}
                {logs.length > 0 && (
                    <div className="log-terminal animate-fade-up" style={{ marginTop: 24 }}>
                        {logs.map((l) => (
                            <div key={l.id} className={`log-line ${l.type}`}>{l.msg}</div>
                        ))}
                    </div>
                )}

                {/* Action buttons */}
                <div style={{ marginTop: 28, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    {pendingCount > 0 && !processing && !mlLoading && (
                        <button className="btn btn-primary" onClick={processImages}>
                            Process {pendingCount} Image{pendingCount !== 1 ? 's' : ''} →
                        </button>
                    )}
                    {processing && (
                        <button className="btn btn-ghost" disabled>
                            <span className="spinner" /> Processing…
                        </button>
                    )}
                    {inMemCount >= 1 && !processing && (
                        <button
                            className="btn btn-success"
                            onClick={() => navigate(`/train/${mid}`)}
                        >
                            Proceed to Training ({inMemCount} embeddings) →
                        </button>
                    )}
                    {inMemCount > 0 && inMemCount < MIN_RECOMMENDED && !processing && (
                        <span style={{ fontSize: '0.82rem', color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: 4 }}>
                            ⚠ {MIN_RECOMMENDED - inMemCount} more recommended for accuracy
                        </span>
                    )}
                </div>

                {/* Session warning */}
                <div style={{ marginTop: 24, fontSize: '0.78rem', color: 'var(--text-dim)', lineHeight: 1.8 }}>
                    ⓘ Embeddings are kept in memory for this session only.
                    Train immediately after uploading — they will be cleared if you refresh the page.
                </div>

            </div>
        </main>
    );
}
