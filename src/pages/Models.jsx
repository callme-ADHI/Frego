import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAllModels } from '../services/db';
import ModelCard from '../components/ModelCard';

export default function Models() {
    const [models, setModels] = useState([]);
    const [loading, setLoading] = useState(true);

    const load = async () => {
        setLoading(true);
        try {
            const all = await getAllModels();
            setModels(all.sort((a, b) => b.createdAt - a.createdAt));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    return (
        <main className="page">
            <div className="container">
                <div className="page-header">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
                        <div>
                            <div className="badge">Models</div>
                            <h1>Your Models</h1>
                            <p>All locally-stored face recognition models.</p>
                        </div>
                        <Link to="/create" className="btn btn-primary">+ New Model</Link>
                    </div>
                </div>

                {loading ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '60px 0', justifyContent: 'center' }}>
                        <span className="spinner" />
                        <span className="text-secondary">Loading models…</span>
                    </div>
                ) : models.length === 0 ? (
                    <EmptyState />
                ) : (
                    <>
                        {/* Stats row */}
                        <div className="stats-row mb-6" style={{ marginBottom: 28 }}>
                            <div className="stat-card">
                                <div className="stat-value">{models.length}</div>
                                <div className="stat-label">Total Models</div>
                            </div>
                            <div className="stat-card">
                                <div className="stat-value">{models.filter(m => m.trained).length}</div>
                                <div className="stat-label">Trained</div>
                            </div>
                            <div className="stat-card">
                                <div className="stat-value">{models.reduce((s, m) => s + (m.imageCount || 0), 0)}</div>
                                <div className="stat-label">Total Images</div>
                            </div>
                        </div>

                        <div className="model-grid animate-stagger">
                            {models.map(m => (
                                <ModelCard key={m.id} model={m} onDeleted={load} />
                            ))}
                        </div>
                    </>
                )}
            </div>
        </main>
    );
}

function EmptyState() {
    return (
        <div style={{ textAlign: 'center', padding: '80px 0' }} className="animate-fade-up">
            <div style={{ fontSize: '3.5rem', marginBottom: 20 }}>🧠</div>
            <h3 style={{ marginBottom: 10 }}>No models yet</h3>
            <p style={{ marginBottom: 28 }}>Create your first face recognition model to get started.</p>
            <Link to="/create" className="btn btn-primary">Create First Model →</Link>
        </div>
    );
}
