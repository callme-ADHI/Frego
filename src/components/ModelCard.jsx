import { Link } from 'react-router-dom';
import { deleteModel, updateModel } from '../services/db';
import { useState } from 'react';

/**
 * ModelCard — Displays model metadata with action buttons.
 * Shows re-train warning if model was trained with old algorithm (cosine).
 */
export default function ModelCard({ model, onDeleted }) {
    const [deleting, setDeleting] = useState(false);

    const handleDelete = async () => {
        if (!confirm(`Delete model "${model.name}"? This cannot be undone.`)) return;
        setDeleting(true);
        await deleteModel(model.id);
        onDeleted?.();
    };

    const trained = model.trained && model.meanEmbedding;
    const needsRetrain = model.metricVersion === 'needs_retrain';

    return (
        <div className="card animate-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                            width: 8, height: 8, borderRadius: '50%',
                            background: trained ? 'var(--success)' : needsRetrain ? 'var(--warning)' : 'rgba(156,163,175,0.5)',
                            boxShadow: trained ? '0 0 8px var(--success-glow)' : '',
                        }} />
                        <h4 style={{ fontSize: '1rem', fontFamily: "'JetBrains Mono', monospace" }}>
                            {model.name}
                        </h4>
                    </div>
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: 2 }}>
                        {new Date(model.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                </div>
                <span className={`badge-status ${trained ? 'trained' : 'untrained'}`}>
                    {trained ? '✓ Trained' : needsRetrain ? '⚠ Re-train' : '◦ Untrained'}
                </span>
            </div>

            {/* Re-train notice */}
            {needsRetrain && (
                <div style={{
                    background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.25)',
                    borderRadius: 8, padding: '10px 12px',
                    fontSize: '0.78rem', color: 'var(--warning)', lineHeight: 1.6,
                }}>
                    ⚠ Algorithm updated to Euclidean distance.
                    Please re-upload images and re-train to restore recognition.
                </div>
            )}

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <StatMini label="Images" value={model.imageCount || 0} />
                <StatMini label="Threshold" value={trained ? model.threshold?.toFixed(3) : '—'} />
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Link to={`/upload/${model.id}`} className="btn btn-ghost btn-sm" style={{ flex: 1 }}>
                    Upload
                </Link>
                <Link to={`/train/${model.id}`} className="btn btn-ghost btn-sm" style={{ flex: 1 }}>
                    Train
                </Link>
                {trained && !needsRetrain && (
                    <Link to="/test" className="btn btn-ghost btn-sm" style={{ flex: 1 }}>
                        Test
                    </Link>
                )}
                <button
                    className="btn btn-icon btn-danger btn-sm"
                    onClick={handleDelete}
                    disabled={deleting}
                    title="Delete model"
                >
                    {deleting ? <span className="spinner" style={{ width: 14, height: 14 }} /> : '✕'}
                </button>
            </div>
        </div>
    );
}

function StatMini({ label, value }) {
    return (
        <div style={{
            background: 'var(--bg-panel)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 8, padding: '10px 12px',
        }}>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--accent-light)', fontVariantNumeric: 'tabular-nums' }}>
                {value}
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>
                {label}
            </div>
        </div>
    );
}
