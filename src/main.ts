console.log('The Wandering Dungeon initialized.');

const appContainer = document.getElementById('app');
if (appContainer) {
  appContainer.innerHTML = `
    <div style="display: flex; flex-direction: column; height: 100%; align-items: center; justify-content: center; text-align: center; padding: 20px;">
      <h1 style="color: var(--accent-cyan); margin-bottom: 12px; text-shadow: 0 0 10px var(--accent-cyan-glow);">The Wandering Dungeon</h1>
      <p style="color: var(--text-muted); max-width: 400px; line-height: 1.5;">Reality is shifting... Prepare to descend into the unstable depths.</p>
    </div>
  `;
}
