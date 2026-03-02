import { useEffect, useState } from 'react';
import { getAllModels } from '../services/db';
import { exportModelZip, exportIndividualFiles } from '../services/exportService';

/**
 * Download Page — Export trained model artifacts.
 *
 * Now that allEmbeddings is stored in IndexedDB (as part of the model record),
 * all three files are ALWAYS available — no session-memory dependency.
 *
 *   ✓ {name}_mean_embedding.npy  — 128D centroid (from IndexedDB)
 *   ✓ {name}_all_embeddings.npy  — N×128D training descriptors (from IndexedDB)
 *   ✓ {name}_metadata.json       — threshold, counts, metric version
 */
export default function Download() {
    const [models, setModels] = useState([]);
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(null);
    const [done, setDone] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        getAllModels()
            .then((all) => setModels(all.filter((m) => m.trained && m.meanEmbedding?.length > 0)))
            .finally(() => setLoading(false));
    }, []);

    const handleExportZip = async (model) => {
        setExporting(model.id);
        setDone(null);
        setError(null);
        try {
            // allEmbeddings is now in IndexedDB — always pass it directly
            const embRecords = model.allEmbeddings
                ? model.allEmbeddings.map((emb, i) => ({ id: i, embedding: emb }))
                : null;
            await exportModelZip(model, embRecords);
            setDone(model.id);
        } catch (e) {
            setError(model.id + ':' + e.message);
        } finally {
            setExporting(null);
        }
    };

    const handleExportIndividual = async (model) => {
        setExporting(model.id);
        setError(null);
        try {
            const embRecords = model.allEmbeddings
                ? model.allEmbeddings.map((emb, i) => ({ id: i, embedding: emb }))
                : null;
            await exportIndividualFiles(model, embRecords);
        } catch (e) {
            setError(model.id + ':' + e.message);
        } finally {
            setExporting(null);
        }
    };

    return (
        <main className="page">
            <div className="container">

                <div className="page-header animate-fade-up">
                    <div className="badge">Export</div>
                    <h1>Download Models</h1>
                    <p>Export trained model artifacts as NumPy (.npy) and JSON files.</p>
                </div>

                {/* Format reference */}
                <div className="card animate-fade-up" style={{ marginBottom: 28 }}>
                    <h3 style={{ marginBottom: 16 }}>Export Format</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                        {[
                            {
                                file: '{name}_mean_embedding.npy',
                                shape: 'Shape: (128,) · float32',
                                desc: 'Centroid of all training descriptors. For fallback matching.',
                                always: true,
                            },
                            {
                                file: '{name}_all_embeddings.npy',
                                shape: 'Shape: (N, 128) · float32',
                                desc: 'All training descriptors. Used for nearest-neighbor recognition.',
                                always: true,
                            },
                            {
                                file: '{name}_metadata.json',
                                shape: 'JSON',
                                desc: 'Threshold, image count, metric version, training date.',
                                always: true,
                            },
                        ].map((f) => (
                            <div key={f.file} style={{
                                background: 'var(--bg-panel)',
                                border: '1px solid var(--border-subtle)',
                                borderRadius: 'var(--radius-sm)',
                                padding: '16px',
                            }}>
                                <code style={{ color: 'var(--accent-light)', fontSize: '0.77rem', display: 'block', marginBottom: 6 }}>
                                    {f.file}
                                </code>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginBottom: 6 }}>{f.shape}</div>
                                <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', lineHeight: 1.6 }}>{f.desc}</p>
                                <div style={{ marginTop: 8, fontSize: '0.72rem', fontWeight: 600, color: 'var(--success)' }}>
                                    ✓ Always available
                                </div>
                            </div>
                        ))}
                    </div>

                    <div style={{ marginTop: 16, padding: '10px 14px', borderRadius: 8, background: 'var(--accent-dim)', border: '1px solid rgba(99,102,241,0.2)', fontSize: '0.78rem', color: 'var(--accent-light)' }}>
                        <strong>Python:</strong>{' '}
                        <code style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                            all_embs = np.load('name_all_embeddings.npy') &nbsp;·&nbsp; meta = json.load(open('name_metadata.json'))
                        </code>
                    </div>
                </div>

                {/* Model list */}
                {loading ? (
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '40px 0', justifyContent: 'center' }}>
                        <span className="spinner" /><span className="text-secondary">Loading…</span>
                    </div>
                ) : models.length === 0 ? (
                    <div className="card animate-fade-up" style={{ textAlign: 'center', padding: '60px 24px' }}>
                        <div style={{ fontSize: '2.5rem', marginBottom: 16 }}>📦</div>
                        <h3 style={{ marginBottom: 8 }}>No trained models</h3>
                        <p>Train a model first before exporting.</p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        {models.map((model, i) => {
                            const hasAllEmbs = model.allEmbeddings && model.allEmbeddings.length > 0;
                            return (
                                <div key={model.id} className="card animate-fade-up" style={{
                                    animationDelay: `${i * 60}ms`,
                                    display: 'flex', alignItems: 'center',
                                    justifyContent: 'space-between', gap: 20, flexWrap: 'wrap',
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1 }}>
                                        <div style={{
                                            width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                                            background: 'var(--accent-dim)', border: '1px solid rgba(99,102,241,0.2)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem',
                                        }}>🧠</div>
                                        <div>
                                            <div style={{ fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", marginBottom: 2 }}>
                                                {model.name}
                                            </div>
                                            <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', lineHeight: 1.9 }}>
                                                {model.imageCount} images · {model.meanEmbedding?.length}D · threshold {model.threshold?.toFixed(4)}
                                            </div>
                                            <div style={{ fontSize: '0.72rem', fontWeight: 600, marginTop: 2, color: hasAllEmbs ? 'var(--success)' : 'var(--warning)' }}>
                                                {hasAllEmbs
                                                    ? `✓ ${model.allEmbeddings.length} descriptors stored — nearest-neighbor matching`
                                                    : '⚠ No individual embeddings — re-train to enable NN matching'}
                                            </div>
                                        </div>

                                        {done === model.id && (
                                            <span style={{
                                                fontSize: '0.78rem', fontWeight: 600, color: 'var(--success)',
                                                background: 'var(--success-dim)', border: '1px solid rgba(34,197,94,0.25)',
                                                padding: '3px 10px', borderRadius: 999, flexShrink: 0,
                                            }}>✓ Downloaded</span>
                                        )}
                                    </div>

                                    {error?.startsWith(String(model.id)) && (
                                        <p style={{ fontSize: '0.78rem', color: 'var(--danger)', width: '100%', marginTop: -8 }}>
                                            ✕ {error.split(':').slice(1).join(':')}
                                        </p>
                                    )}

                                    <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
                                        <button
                                            className="btn btn-ghost btn-sm"
                                            onClick={() => handleExportIndividual(model)}
                                            disabled={exporting === model.id}
                                            title="Download as separate files"
                                        >
                                            {exporting === model.id
                                                ? <span className="spinner" style={{ width: 14, height: 14 }} />
                                                : '↓ Files'}
                                        </button>
                                        <button
                                            className="btn btn-primary btn-sm"
                                            onClick={() => handleExportZip(model)}
                                            disabled={exporting === model.id}
                                        >
                                            {exporting === model.id
                                                ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Exporting…</>
                                                : '↓ Download ZIP'}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Privacy strip */}
                <div style={{
                    marginTop: 40, padding: '14px 18px', borderRadius: 10,
                    background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)',
                    fontSize: '0.8rem', color: 'var(--text-dim)',
                    display: 'flex', gap: 10, alignItems: 'flex-start',
                }}>
                    <span style={{ fontSize: '1rem', flexShrink: 0 }}>🔒</span>
                    <span>
                        All export files are generated in your browser and downloaded directly to your device.
                        No face images are ever stored — only 128D embedding vectors (cannot be used to reconstruct faces).
                        All processing is 100% client-side.
                    </span>
                </div>
            </div>
        </main>
    );
}
