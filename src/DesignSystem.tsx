import { ArrowLeft, ArrowUp, AudioLines, Check, Mic, Plus, Search } from "lucide-react";

const colors = [
  { label: "Main surface", token: "--main-surface-primary", value: "#000000" },
  { label: "Secondary surface", token: "--main-surface-secondary", value: "#212121" },
  { label: "Composer", token: "--composer-surface-primary", value: "#212121" },
  { label: "Control", token: "--main-surface-tertiary", value: "#2f2f2f" },
  { label: "Primary text", token: "--text-primary", value: "#ffffff" },
  { label: "Secondary text", token: "--text-secondary", value: "#cdcdcd" },
  { label: "Tertiary text", token: "--text-tertiary", value: "#afafaf" },
  { label: "Default border", token: "--border-default", value: "#ffffff26" },
];

const spacing = ["--space-1", "--space-2", "--space-3", "--space-4", "--space-6", "--space-8", "--space-12"];

export default function DesignSystem() {
  return (
    <div className="system-page">
      <header className="system-header">
        <a href="/" className="back-link"><ArrowLeft size={18} /> Back to product</a>
        <div>
          <span className="system-kicker">Playwright computed-style capture · 2026-07-18</span>
          <h1>ChatGPT design system</h1>
        </div>
      </header>

      <main className="system-main">
        <section className="system-section">
          <div className="section-heading">
            <span>01</span>
            <div><h2>Color</h2><p>Neutral surfaces carry the hierarchy; color is reserved for status, links, and focus.</p></div>
          </div>
          <div className="swatch-grid">
            {colors.map(({ label, token, value }) => (
              <article className="swatch" key={token}>
                <div className="swatch-color" style={{ background: `var(${token})` }} />
                <strong>{label}</strong>
                <code>{token}</code>
                <code>{value}</code>
              </article>
            ))}
          </div>
        </section>

        <section className="system-section">
          <div className="section-heading">
            <span>02</span>
            <div><h2>Typography</h2><p>System sans-serif keeps interface text compact, legible, and native to the platform.</p></div>
          </div>
          <div className="type-specimens">
            <div><span>Heading 2 · 24/28 · 400</span><p className="type-display">Where should we begin?</p></div>
            <div><span>Model label · 18/28 · 600</span><p className="type-title">ChatGPT</p></div>
            <div><span>Composer · 16/26 · 400</span><p className="type-body">Anything you type remains compact and vertically centered.</p></div>
            <div><span>Label · 14/20</span><p className="type-label">Search chats</p></div>
            <div><span>Caption · 12/16</span><p className="type-caption">ChatGPT can make mistakes.</p></div>
          </div>
        </section>

        <section className="system-section">
          <div className="section-heading">
            <span>03</span>
            <div><h2>Spacing and shape</h2><p>A four-pixel base grid supports dense navigation and relaxed conversation layouts.</p></div>
          </div>
          <div className="spacing-list">
            {spacing.map((token) => (
              <div key={token}><code>{token}</code><span style={{ width: `var(${token})` }} /></div>
            ))}
          </div>
          <div className="radius-row">
            <div className="radius-sample radius-sm">6</div>
            <div className="radius-sample radius-md">8</div>
            <div className="radius-sample radius-menu">10</div>
            <div className="radius-sample radius-composer">28</div>
          </div>
        </section>

        <section className="system-section">
          <div className="section-heading">
            <span>04</span>
            <div><h2>Controls</h2><p>Icon controls use stable square hit areas; text appears only for explicit commands.</p></div>
          </div>
          <div className="control-row">
            <button className="system-primary" type="button">Log in</button>
            <button className="system-secondary" type="button"><Search size={17} /> Search</button>
            <button className="icon-button" type="button" aria-label="Attach"><Plus size={20} /></button>
            <button className="system-send" type="button" aria-label="Send"><ArrowUp size={18} /></button>
            <span className="system-status"><Check size={15} /> Connected</span>
          </div>
        </section>

        <section className="system-section">
          <div className="section-heading">
            <span>05</span>
            <div><h2>Composer anatomy</h2><p>Desktop uses one 52px row. At 767px and below, controls move to a second row and the shell becomes 86px tall.</p></div>
          </div>
          <div className="composer-anatomy">
            <button type="button" aria-label="Add"><Plus size={20} /></button>
            <span>무엇이든 물어보세요</span>
            <div><Mic size={19} /><button type="button" aria-label="Voice"><AudioLines className="voice-wave" size={17} /><ArrowUp className="voice-arrow" size={18} /><span>음성</span></button></div>
          </div>
          <dl className="anatomy-notes">
            <div><dt>Maximum width</dt><dd>768px</dd></div>
            <div><dt>Height</dt><dd>52px / 86px</dd></div>
            <div><dt>Outer radius</dt><dd>28px</dd></div>
            <div><dt>Padding</dt><dd>5px 8px</dd></div>
          </dl>
        </section>

        <section className="system-section system-principles">
          <div className="section-heading">
            <span>06</span>
            <div><h2>Measured layout</h2><p>Rendered geometry from the desktop and mobile Playwright snapshots.</p></div>
          </div>
          <dl className="metric-grid">
            <div><dt>Desktop sidebar</dt><dd>260px</dd></div>
            <div><dt>Collapsed rail</dt><dd>52px</dd></div>
            <div><dt>Header</dt><dd>52px</dd></div>
            <div><dt>Menu row</dt><dd>36px · radius 10px</dd></div>
            <div><dt>Icon target</dt><dd>36 × 36px · radius 8px</dd></div>
            <div><dt>Desktop composer</dt><dd>768 × 52px</dd></div>
            <div><dt>Mobile composer</dt><dd>366 × 86px at 390px</dd></div>
            <div><dt>Breakpoint</dt><dd>max-width: 767px</dd></div>
          </dl>
        </section>
      </main>
    </div>
  );
}
