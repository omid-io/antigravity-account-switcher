import fs from 'fs';
import path from 'path';
import http from 'http';

async function capture() {
  const portFile = path.join(process.env.APPDATA || '', 'Antigravity', 'DevToolsActivePort');
  if (!fs.existsSync(portFile)) throw new Error('DevToolsActivePort not found');

  const [portStr] = fs.readFileSync(portFile, 'utf8').trim().split('\n');
  const port = parseInt(portStr, 10);

  const targets = await new Promise((resolve) => {
    http.get(`http://127.0.0.1:${port}/json`, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch { resolve([]); }
      });
    }).on('error', () => resolve([]));
  });

  const page = targets.find(t => t.type === 'page' || (t.url && t.url.includes('workbench.html')));
  if (!page || !page.webSocketDebuggerUrl) throw new Error('Antigravity workbench page not found');

  const ws = new globalThis.WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);

  let reqId = 1;
  function send(method, params = {}) {
    return new Promise((resolve) => {
      const id = reqId++;
      const handler = (evt) => {
        const msg = JSON.parse(evt.data);
        if (msg.id === id) {
          ws.removeEventListener('message', handler);
          resolve(msg.result);
        }
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  // Open popover
  await send('Runtime.evaluate', { expression: `window.__AGY_SWITCHER__.openPopover();` });
  await new Promise(r => setTimeout(r, 1200));

  // Get bounding rect of the popover
  const rectRes = await send('Runtime.evaluate', {
    expression: `(() => {
      const el = document.getElementById('agy-account-switcher-popover');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.left - 10), y: Math.round(r.top - 10), width: Math.round(r.width + 20), height: Math.round(r.height + 20), scale: 1 };
    })()`,
    returnByValue: true
  });

  const clip = rectRes?.value || rectRes?.result?.value;
  console.log('Popover rect:', clip);

  if (clip) {
    const screenshotRes = await send('Page.captureScreenshot', {
      format: 'png',
      clip: {
        x: Math.max(0, clip.x),
        y: Math.max(0, clip.y),
        width: clip.width,
        height: clip.height,
        scale: 1
      }
    });

    const outDir = path.join(process.cwd(), '.test-artifacts', 'screenshots');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const outPath = path.join(outDir, 'popover-overhaul.png');
    fs.writeFileSync(outPath, Buffer.from(screenshotRes.data, 'base64'));
    console.log(`✅ Default screenshot saved successfully to ${outPath}`);

    // Now test opening the tooltip popover
    await send('Runtime.evaluate', {
      expression: `(() => {
        const info = document.querySelector('.agy-info-wrapper');
        const pop = document.querySelector('.agy-info-popover');
        if (pop) {
          pop.style.opacity = '1';
          pop.style.visibility = 'visible';
          pop.style.transform = 'translateY(0)';
          pop.style.pointerEvents = 'auto';
        }
      })()`
    });
    await new Promise(r => setTimeout(r, 400));

    const tooltipScreenRes = await send('Page.captureScreenshot', {
      format: 'png',
      clip: {
        x: Math.max(0, clip.x),
        y: Math.max(0, clip.y),
        width: clip.width,
        height: clip.height,
        scale: 1
      }
    });
    const tooltipOutPath = path.join(outDir, 'popover-tooltip-open.png');
    fs.writeFileSync(tooltipOutPath, Buffer.from(tooltipScreenRes.data, 'base64'));
    console.log(`✅ Tooltip open screenshot saved successfully to ${tooltipOutPath}`);
  }

  ws.close();
}

capture().catch(console.error);
