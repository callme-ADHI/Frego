import { Link } from 'react-router-dom';

const FEATURES = [
    {
        icon: '🧠',
        title: 'Browser-Native ML',
        desc: 'TensorFlow.js with WebGL acceleration. No cloud, no server—everything runs on your device.',
    },
    {
        icon: '🔒',
        title: 'Zero Data Egress',
        desc: 'Your face data never leaves the browser. Complete privacy by architectural design.',
    },
    {
        icon: '⚡',
        title: 'Real-Time Inference',
        desc: 'Sub-100ms recognition on live webcam feeds with smooth bounding box overlays.',
    },
    {
        icon: '📦',
        title: 'Export .npy Artifacts',
        desc: 'Download embeddings in NumPy format for use in Python pipelines or future models.',
    },
];

const STEPS = [
    { n: '01', label: 'Create', desc: 'Name your identity model' },
    { n: '02', label: 'Upload', desc: 'Add 10+ face images' },
    { n: '03', label: 'Train', desc: 'Compute embeddings' },
    { n: '04', label: 'Test', desc: 'Live webcam recognition' },
];

export default function Landing() {
    return (
        <main className="page">
            <div className="container">

                {/* ── Hero ─────────────────────────────────────────────── */}
                <section style={{ textAlign: 'center', padding: '60px 0 80px', position: 'relative' }}>
                    {/* Glow orb */}
                    <div style={{
                        position: 'absolute',
                        top: '20%', left: '50%',
                        transform: 'translate(-50%, -50%)',
                        width: 500, height: 300,
                        background: 'radial-gradient(ellipse, rgba(99,102,241,0.12) 0%, transparent 70%)',
                        pointerEvents: 'none',
                    }} />

                    <div className="animate-fade-up">
                        <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 8,
                            fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.1em',
                            textTransform: 'uppercase', color: 'var(--accent-light)',
                            background: 'var(--accent-dim)', border: '1px solid rgba(99,102,241,0.3)',
                            padding: '5px 14px', borderRadius: 999, marginBottom: 24,
                        }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block' }} />
                            Privacy-First Face Recognition
                        </span>

                        <h1 style={{ marginBottom: 20 }}>
                            Train & Deploy<br />
                            <span style={{ background: 'linear-gradient(135deg, var(--accent-light), #c084fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                                Face Recognition
                            </span><br />
                            in the Browser
                        </h1>
                    </div>

                    <p className="animate-fade-up" style={{
                        maxWidth: 520, margin: '0 auto 36px', fontSize: '1.1rem',
                        color: 'var(--text-secondary)', animationDelay: '80ms',
                    }}>
                        Frego runs entirely client-side. Upload images, generate embeddings,
                        and recognize faces live—no backend, no privacy risk.
                    </p>

                    <div className="animate-fade-up" style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', animationDelay: '160ms' }}>
                        <Link to="/create" className="btn btn-primary btn-lg animate-pulse-glow">
                            Start Building →
                        </Link>
                        <Link to="/models" className="btn btn-ghost btn-lg">
                            View Models
                        </Link>
                    </div>

                    {/* Privacy pill */}
                    <div className="animate-fade-in" style={{ marginTop: 32, animationDelay: '400ms' }}>
                        <span style={{
                            fontSize: '0.78rem', color: 'var(--text-dim)',
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                        }}>
                            <span>🔒</span>
                            100% local · No server · No tracking · Open source
                        </span>
                    </div>
                </section>

                {/* ── How it works ─────────────────────────────────────── */}
                <section style={{ marginBottom: 80 }}>
                    <div style={{ textAlign: 'center', marginBottom: 40 }}>
                        <p style={{ fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent-light)', marginBottom: 8 }}>
                            Workflow
                        </p>
                        <h2>Four steps to recognition</h2>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 2, position: 'relative' }}>
                        {STEPS.map((step, i) => (
                            <div
                                key={step.n}
                                className="animate-fade-up"
                                style={{
                                    background: 'var(--bg-panel)',
                                    border: '1px solid var(--border-subtle)',
                                    borderRight: i < STEPS.length - 1 ? 'none' : '1px solid var(--border-subtle)',
                                    padding: '28px 24px',
                                    animationDelay: `${i * 60}ms`,
                                    position: 'relative',
                                    overflow: 'hidden',
                                    borderRadius: i === 0 ? 'var(--radius-lg) 0 0 var(--radius-lg)' : i === STEPS.length - 1 ? '0 var(--radius-lg) var(--radius-lg) 0' : 0,
                                }}
                            >
                                <div style={{
                                    fontSize: '2.5rem', fontWeight: 900,
                                    color: 'rgba(99,102,241,0.08)',
                                    position: 'absolute', top: -4, right: 12,
                                    fontVariantNumeric: 'tabular-nums',
                                    lineHeight: 1,
                                }}>
                                    {step.n}
                                </div>
                                <div style={{
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                    width: 34, height: 34, borderRadius: 8,
                                    background: 'var(--accent-dim)', border: '1px solid rgba(99,102,241,0.25)',
                                    color: 'var(--accent-light)', fontWeight: 700, fontSize: '0.85rem',
                                    marginBottom: 12,
                                }}>
                                    {step.n}
                                </div>
                                <h4 style={{ marginBottom: 6 }}>{step.label}</h4>
                                <p style={{ fontSize: '0.83rem', color: 'var(--text-dim)' }}>{step.desc}</p>
                            </div>
                        ))}
                    </div>
                </section>

                {/* ── Features ─────────────────────────────────────────── */}
                <section style={{ marginBottom: 80 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
                        {FEATURES.map((f, i) => (
                            <div
                                key={f.title}
                                className="card animate-fade-up"
                                style={{ animationDelay: `${i * 60}ms` }}
                            >
                                <span style={{ fontSize: '1.8rem', display: 'block', marginBottom: 14 }}>{f.icon}</span>
                                <h4 style={{ marginBottom: 8 }}>{f.title}</h4>
                                <p style={{ fontSize: '0.85rem', lineHeight: 1.65 }}>{f.desc}</p>
                            </div>
                        ))}
                    </div>
                </section>

                {/* ── CTA strip ────────────────────────────────────────── */}
                <section>
                    <div style={{
                        background: 'linear-gradient(135deg, rgba(99,102,241,0.1) 0%, rgba(167,139,250,0.06) 100%)',
                        border: '1px solid rgba(99,102,241,0.2)',
                        borderRadius: 'var(--radius-xl)',
                        padding: '48px 40px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 24,
                        flexWrap: 'wrap',
                    }}>
                        <div>
                            <h2 style={{ marginBottom: 8 }}>Ready to build your model?</h2>
                            <p style={{ fontSize: '0.95rem' }}>
                                Takes less than 60 seconds. No account required.
                            </p>
                        </div>
                        <Link to="/create" className="btn btn-primary btn-lg">
                            Create Model →
                        </Link>
                    </div>
                </section>

            </div>
        </main>
    );
}
