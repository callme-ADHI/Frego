import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createModel, modelNameExists } from '../services/db';

const NAME_REGEX = /^[a-zA-Z0-9_]{1,30}$/;

export default function CreateModel() {
    const navigate = useNavigate();
    const [name, setName] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const validate = (val) => {
        if (!val.trim()) return 'Model name is required.';
        if (!NAME_REGEX.test(val)) return 'Only letters, numbers, and underscores. No spaces or special characters.';
        if (val.length > 30) return 'Maximum 30 characters.';
        return '';
    };

    const handleChange = (e) => {
        const val = e.target.value;
        setName(val);
        setError(validate(val));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const err = validate(name);
        if (err) { setError(err); return; }

        setLoading(true);
        try {
            const exists = await modelNameExists(name.trim());
            if (exists) {
                setError('A model with this name already exists. Choose another name.');
                setLoading(false);
                return;
            }
            const id = await createModel(name.trim());
            navigate(`/upload/${id}`);
        } catch (e) {
            setError('Failed to create model: ' + e.message);
            setLoading(false);
        }
    };

    return (
        <main className="page">
            <div className="container">
                <div className="page-header animate-fade-up">
                    <div className="badge">Step 1 of 4</div>
                    <h1>Create Model</h1>
                    <p>Name your face recognition model. The name becomes the identity label.</p>
                </div>

                <div style={{ maxWidth: 520, animationDelay: '80ms' }} className="animate-fade-up">
                    <div className="card">
                        <form onSubmit={handleSubmit}>
                            <div className="input-group" style={{ marginBottom: 20 }}>
                                <label className="input-label" htmlFor="model-name">Model Name</label>
                                <input
                                    id="model-name"
                                    type="text"
                                    className={`input ${error ? 'input-error' : ''}`}
                                    placeholder="e.g. john_doe or boss_auth"
                                    value={name}
                                    onChange={handleChange}
                                    autoFocus
                                />
                                {error && <span className="input-error-msg">{error}</span>}
                                {!error && name && (
                                    <span style={{ fontSize: '0.78rem', color: 'var(--success)' }}>
                                        ✓ Looks good
                                    </span>
                                )}
                            </div>

                            {/* Rules */}
                            <div style={{
                                background: 'var(--bg-panel)',
                                border: '1px solid var(--border-subtle)',
                                borderRadius: 'var(--radius-sm)',
                                padding: '14px 16px',
                                marginBottom: 24,
                                fontSize: '0.8rem',
                                color: 'var(--text-dim)',
                                lineHeight: 2,
                            }}>
                                <div>· Letters, numbers and underscore only</div>
                                <div>· Max 30 characters</div>
                                <div>· Must be unique (no duplicates)</div>
                                <div>· Stored entirely in your browser</div>
                            </div>

                            {/* Preview */}
                            {name && !error && (
                                <div style={{
                                    background: 'var(--accent-dim)',
                                    border: '1px solid rgba(99,102,241,0.2)',
                                    borderRadius: 'var(--radius-sm)',
                                    padding: '12px 16px',
                                    marginBottom: 20,
                                    fontSize: '0.82rem',
                                    color: 'var(--accent-light)',
                                }}>
                                    <span style={{ color: 'var(--text-dim)' }}>Output files will be:</span>{' '}
                                    <code>{name}_all_embeddings.npy</code>,{' '}
                                    <code>{name}_mean_embedding.npy</code>,{' '}
                                    <code>{name}_metadata.json</code>
                                </div>
                            )}

                            <button
                                type="submit"
                                className="btn btn-primary"
                                style={{ width: '100%' }}
                                disabled={loading || !!error || !name}
                            >
                                {loading
                                    ? <><span className="spinner" /> Creating…</>
                                    : 'Create & Upload Images →'}
                            </button>
                        </form>
                    </div>

                    {/* Info strip */}
                    <div style={{ marginTop: 20, fontSize: '0.8rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>🔒</span>
                        <span>Stored in your browser's IndexedDB. No data is sent anywhere.</span>
                    </div>
                </div>
            </div>
        </main>
    );
}
