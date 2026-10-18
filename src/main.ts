/**
 * CyberHUD - Catppuccin Mocha Live Desktop Wallpaper Engine
 * Non-interactive, pure automated 60fps rendering:
 * - Animated drifting ASCII mountain range with twinkling stars
 * - Hero Digital Clock exclusively centered
 * - Tactical Radar positioned on the left
 * - Global World Map on the right with real timezone location beacon
 */

// Catppuccin Mocha Palette Constant
const CTP = {
  rosewater: '#f5e0dc',
  flamingo: '#f2cdcd',
  pink: '#f5c2e7',
  mauve: '#cba6f7',
  red: '#f38ba8',
  maroon: '#eba0ac',
  peach: '#fab387',
  yellow: '#f9e2af',
  green: '#a6e3a1',
  teal: '#94e2d5',
  sky: '#89dceb',
  sapphire: '#74c7ec',
  blue: '#89b4fa',
  lavender: '#b4befe',
  text: '#cdd6f4',
  subtext1: '#bac2de',
  subtext0: '#a6adc8',
  overlay2: '#9399b2',
  overlay1: '#7f849c',
  overlay0: '#6c7086',
  surface2: '#585b70',
  surface1: '#45475a',
  surface0: '#313244',
  base: '#1e1e2e',
  mantle: '#181825',
  crust: '#11111b'
};

// -----------------------------------------------------------------------------
// 1. ANIMATED ASCII MOUNTAINS & TWINKLING STARS
// -----------------------------------------------------------------------------
function initAnimatedAsciiMountains() {
  const canvas = document.getElementById('ascii-mountain-canvas') as HTMLCanvasElement | null;
  if (!canvas) return;
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false });
  if (!gl) {
    console.warn('Mountains: WebGL is not available.');
    return;
  }
  const g: WebGLRenderingContext = gl;

  const CHAR_W = 9;
  const CHAR_H = 15;
  const CELL = 16;
  const FONT = `13px 'JetBrains Mono', 'Share Tech Mono', monospace`;
  // Index of each glyph in the atlas. The shader refers to glyphs by these indices.
  const GLYPHS = ['^', '/', '\\', '_', ':', '.', '#', '%', '|', '~', '=', '-', '·', '*', '+', '✦', '°'];

  // Converts a Catppuccin hex colour to a GLSL vec3 literal.
  const rgb = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    return `vec3(${((n >> 16) & 255) / 255}, ${((n >> 8) & 255) / 255}, ${(n & 255) / 255})`;
  };

  const VERT = `
    attribute vec2 a_pos;
    void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
  `;

  const FRAG = `
    precision highp float;

    uniform vec2 u_res;
    uniform float u_cols;
    uniform float u_rows;
    uniform float u_time;
    uniform float u_atlasW;
    uniform sampler2D u_atlas;

    const float PI = 3.14159265;
    const float CW = ${CHAR_W}.0;
    const float CH = ${CHAR_H}.0;
    const float CELL = ${CELL}.0;

    const vec3 C_LAV = ${rgb(CTP.lavender)};
    const vec3 C_ROSE = ${rgb(CTP.rosewater)};
    const vec3 C_SKY = ${rgb(CTP.sky)};
    const vec3 C_TEXT = ${rgb(CTP.text)};
    const vec3 C_SUB = ${rgb(CTP.subtext0)};
    const vec3 C_SAPPHIRE = ${rgb(CTP.sapphire)};
    const vec3 C_BLUE = ${rgb(CTP.blue)};
    const vec3 C_TEAL = ${rgb(CTP.teal)};
    const vec3 C_GREEN = ${rgb(CTP.green)};
    const vec3 C_SURF0 = ${rgb(CTP.surface0)};
    const vec3 C_SURF1 = ${rgb(CTP.surface1)};

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    // Terrain heights in rows. These match the original 2D formulas.
    float farH(float c, float off) {
      float nx = (c + off) / u_cols;
      float n = 0.44 - (sin(nx * PI * 4.2 + 0.5) * 0.16
                      + sin(nx * PI * 8.6 + 1.2) * 0.08
                      + cos(nx * PI * 16.4) * 0.035
                      + sin(nx * PI * 2.0) * 0.05);
      return floor(n * u_rows);
    }
    float midH(float c, float off) {
      float nx = (c + off) / u_cols;
      float n = 0.58 - (cos(nx * PI * 5.4 + 2.1) * 0.14
                      + sin(nx * PI * 11.2 + 0.8) * 0.06
                      + sin(nx * PI * 22.0) * 0.025);
      return floor(n * u_rows);
    }
    float nearH(float c, float off) {
      float nx = (c + off) / u_cols;
      float n = 0.74 - (sin(nx * PI * 3.2 + 1.4) * 0.09 + cos(nx * PI * 7.5) * 0.04);
      return floor(n * u_rows);
    }

    // Each layer returns a glyph index (see GLYPHS in the script), or -1 for empty.
    float farGlyph(float c, float r, out vec3 col) {
      float off = u_time * 1.05;
      float pk = farH(c, off);
      float pv = farH(c - 1.0, off);
      float nx = farH(c + 1.0, off);
      col = C_SURF0;
      if (r < pk) return -1.0;
      float d = r - pk;
      if (d < 0.5) {
        col = C_LAV;
        if (pv > pk && nx > pk) return 0.0;
        if (pv > pk) return 1.0;
        if (nx > pk) return 2.0;
        return 3.0;
      }
      if (d <= 2.5) {
        col = C_TEXT;
        return mod(c + r, 2.0) < 0.5 ? 4.0 : 5.0;
      }
      if (d <= 6.5) {
        col = C_SURF1;
        if (mod(c * 3.0 + r, 4.0) < 0.5) return 6.0;
        if (mod(c + r, 3.0) < 0.5) return 1.0;
        return 4.0;
      }
      col = C_SURF0;
      return mod(c + r, 5.0) < 0.5 ? 5.0 : -1.0;
    }

    float midGlyph(float c, float r, out vec3 col) {
      float off = u_time * 2.55;
      float pk = midH(c, off);
      float pv = midH(c - 1.0, off);
      float nx = midH(c + 1.0, off);
      col = C_SAPPHIRE;
      if (r < pk) return -1.0;
      float d = r - pk;
      if (d < 0.5) {
        if (pv > pk && nx > pk) { col = C_SAPPHIRE; return 0.0; }
        if (pv > pk) { col = C_SKY; return 1.0; }
        if (nx > pk) { col = C_BLUE; return 2.0; }
        col = C_SAPPHIRE;
        return 0.0;
      }
      if (d < 1.5) {
        col = C_BLUE;
        return mod(c, 2.0) < 0.5 ? 1.0 : 4.0;
      }
      if (d <= 4.5) {
        col = C_BLUE;
        float m = mod(c * 2.0 + r, 6.0);
        if (m < 0.5) return 6.0;
        if (m < 1.5) return 7.0;
        if (m < 2.5) return 1.0;
        return 4.0;
      }
      if (d <= 9.5) {
        col = C_SURF1;
        if (mod(c + r, 3.0) < 0.5) return 8.0;
        if (mod(c * 2.0 + r, 4.0) < 0.5) return 4.0;
        return 5.0;
      }
      col = C_SURF0;
      return mod(c + r, 7.0) < 0.5 ? 5.0 : -1.0;
    }

    float nearGlyph(float c, float r, out vec3 col) {
      float off = u_time * 4.8;
      float pk = nearH(c, off);
      float pv = nearH(c - 1.0, off);
      float nx = nearH(c + 1.0, off);
      col = C_GREEN;
      if (r < pk) return -1.0;
      float d = r - pk;
      if (d < 0.5) {
        if (pv > pk) return 1.0;
        if (nx > pk) return 2.0;
        return 3.0;
      }
      if (d <= 3.5) {
        col = C_TEAL;
        float m = mod(c + r * 2.0, 5.0);
        if (m < 0.5) return 1.0;
        if (m < 1.5) return 2.0;
        if (m < 2.5) return 9.0;
        return 10.0;
      }
      col = C_SURF1;
      if (mod(c + r, 4.0) < 0.5) return 11.0;
      if (mod(c * 3.0 + r, 5.0) < 0.5) return 9.0;
      return 5.0;
    }

    // Twinkling stars: at most one per cell, in the top 42% of the screen.
    float starGlyph(float c, float r, out vec3 col, out float alpha) {
      alpha = 0.0;
      col = C_TEXT;
      if (r >= 0.42 * u_rows) return -1.0;
      float density = 1.6 / (0.42 * u_rows);
      if (hash(vec2(c, r)) > density) return -1.0;
      float speed = 1.5 + 3.5 * hash(vec2(c + 11.0, r + 3.0));
      float phase = 6.2831853 * hash(vec2(c + 5.0, r + 17.0));
      alpha = clamp((sin(u_time * speed + phase) + 1.0) * 0.5, 0.12, 0.98);
      float hc = hash(vec2(c + 23.0, r + 7.0));
      col = hc < 0.2 ? C_LAV : hc < 0.4 ? C_ROSE : hc < 0.6 ? C_SKY : hc < 0.8 ? C_TEXT : C_SUB;
      if (alpha > 0.82) return 15.0;
      if (alpha > 0.5) {
        float k = floor(hash(vec2(c + 31.0, r + 13.0)) * 7.0);
        return k < 2.0 ? 12.0 : k < 3.0 ? 13.0 : k < 4.0 ? 14.0 : k < 5.0 ? 15.0 : k < 6.0 ? 16.0 : 5.0;
      }
      return 12.0;
    }

    vec4 glyphSrc(float g, vec3 col, float alpha, vec2 local) {
      vec2 uv = vec2((g * CELL + local.x + 0.5) / u_atlasW, (local.y + 0.5) / CELL);
      float cov = texture2D(u_atlas, uv).a * alpha;
      return vec4(col * cov, cov);
    }

    // Premultiplied "over" compositing: src drawn on top of dst.
    vec4 over(vec4 src, vec4 dst) {
      return src + dst * (1.0 - src.a);
    }

    void main() {
      vec2 p = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y);
      float c = floor(p.x / CW);
      float r = floor(p.y / CH);
      vec2 local = vec2(mod(p.x, CW), mod(p.y, CH));

      vec4 acc = vec4(0.0);
      vec3 col;
      float alpha;

      float g = starGlyph(c, r, col, alpha);
      if (g >= 0.0) acc = over(glyphSrc(g, col, alpha, local), acc);

      g = farGlyph(c, r, col);
      if (g >= 0.0) acc = over(glyphSrc(g, col, 0.65, local), acc);

      g = midGlyph(c, r, col);
      if (g >= 0.0) acc = over(glyphSrc(g, col, 0.85, local), acc);

      g = nearGlyph(c, r, col);
      if (g >= 0.0) acc = over(glyphSrc(g, col, 0.95, local), acc);

      gl_FragColor = acc;
    }
  `;

  function compile(type: number, src: string): WebGLShader {
    const shader = g.createShader(type);
    if (!shader) throw new Error('createShader failed');
    g.shaderSource(shader, src);
    g.compileShader(shader);
    if (!g.getShaderParameter(shader, g.COMPILE_STATUS)) {
      throw new Error(g.getShaderInfoLog(shader) || 'shader compile failed');
    }
    return shader;
  }

  async function start() {
    // Wait for the font so the glyph atlas uses it.
    await document.fonts.load(FONT).catch(() => undefined);

    // Draw each glyph once into a strip of atlas cells.
    const atlas = document.createElement('canvas');
    atlas.width = CELL * GLYPHS.length;
    atlas.height = CELL;
    const actx = atlas.getContext('2d');
    if (!actx) throw new Error('2D context unavailable for the glyph atlas');
    actx.font = FONT;
    actx.textBaseline = 'top';
    actx.fillStyle = '#ffffff';
    GLYPHS.forEach((ch, i) => actx.fillText(ch, i * CELL, 0));

    const program = g.createProgram();
    if (!program) throw new Error('createProgram failed');
    g.attachShader(program, compile(g.VERTEX_SHADER, VERT));
    g.attachShader(program, compile(g.FRAGMENT_SHADER, FRAG));
    g.linkProgram(program);
    if (!g.getProgramParameter(program, g.LINK_STATUS)) {
      throw new Error(g.getProgramInfoLog(program) || 'program link failed');
    }
    g.useProgram(program);

    // One full-screen quad.
    const buffer = g.createBuffer();
    g.bindBuffer(g.ARRAY_BUFFER, buffer);
    g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), g.STATIC_DRAW);
    const aPos = g.getAttribLocation(program, 'a_pos');
    g.enableVertexAttribArray(aPos);
    g.vertexAttribPointer(aPos, 2, g.FLOAT, false, 0, 0);

    const texture = g.createTexture();
    g.bindTexture(g.TEXTURE_2D, texture);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
    g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, g.RGBA, g.UNSIGNED_BYTE, atlas);

    const uRes = g.getUniformLocation(program, 'u_res');
    const uCols = g.getUniformLocation(program, 'u_cols');
    const uRows = g.getUniformLocation(program, 'u_rows');
    const uTime = g.getUniformLocation(program, 'u_time');
    const uAtlasW = g.getUniformLocation(program, 'u_atlasW');
    const uAtlas = g.getUniformLocation(program, 'u_atlas');
    g.uniform1i(uAtlas, 0);
    g.uniform1f(uAtlasW, atlas.width);

    let cols = 0;
    let rows = 0;
    function resize() {
      canvas!.width = window.innerWidth;
      canvas!.height = window.innerHeight;
      g.viewport(0, 0, canvas!.width, canvas!.height);
      cols = Math.ceil(canvas!.width / CHAR_W) + 2;
      rows = Math.ceil(canvas!.height / CHAR_H) + 2;
    }
    window.addEventListener('resize', resize);
    resize();

    const t0 = performance.now();
    // Redraws 30 times a second. The GPU does the per-pixel work.
    function draw() {
      setTimeout(draw, 33);
      g.uniform2f(uRes, canvas!.width, canvas!.height);
      g.uniform1f(uCols, cols);
      g.uniform1f(uRows, rows);
      g.uniform1f(uTime, (performance.now() - t0) / 1000);
      g.clear(g.COLOR_BUFFER_BIT);
      g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
    }
    draw();
  }

  start().catch((err) => console.error('Mountains failed to start:', err));
}

// -----------------------------------------------------------------------------
// 2. TACTICAL RADAR (IN LEFT COLUMN)
// -----------------------------------------------------------------------------
function initTacticalRadar() {
  const canvas = document.getElementById('radar-canvas') as HTMLCanvasElement | null;
  const elBearing = document.getElementById('radar-bearing');
  const elContacts = document.getElementById('radar-contacts-count');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const size = 108;
  canvas.width = size;
  canvas.height = size;
  const center = size / 2;
  const radius = size / 2 - 4;

  const contacts = [
    { r: 0.35, angle: 0.8, intensity: 0.2 },
    { r: 0.62, angle: 2.3, intensity: 0.2 },
    { r: 0.80, angle: 4.1, intensity: 0.2 },
    { r: 0.48, angle: 5.4, intensity: 0.2 }
  ];

  let sweepAngle = 0;

  function renderRadar() {
    if (!ctx) return;
    ctx.clearRect(0, 0, size, size);

    // Outer border
    ctx.strokeStyle = 'rgba(148, 226, 213, 0.45)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Range rings
    [0.35, 0.70].forEach(factor => {
      ctx.strokeStyle = 'rgba(116, 199, 236, 0.22)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.arc(center, center, radius * factor, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    });

    // Crosshairs
    ctx.strokeStyle = 'rgba(116, 199, 236, 0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(center - radius, center);
    ctx.lineTo(center + radius, center);
    ctx.moveTo(center, center - radius);
    ctx.lineTo(center, center + radius);
    ctx.stroke();

    // Rotate sweep
    sweepAngle = (sweepAngle + 0.038) % (Math.PI * 2);
    const degrees = Math.round((sweepAngle * 180) / Math.PI);
    if (elBearing) elBearing.textContent = `${String(degrees).padStart(3, '0')}°`;

    ctx.save();
    ctx.translate(center, center);
    ctx.rotate(sweepAngle);

    const fanSegments = 16;
    for (let i = 0; i < fanSegments; i++) {
      const a = -(i / fanSegments) * 0.45;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, radius, a - 0.03, a, false);
      ctx.closePath();
      const alpha = (1 - i / fanSegments) * 0.22;
      ctx.fillStyle = `rgba(148, 226, 213, ${alpha})`;
      ctx.fill();
    }

    ctx.strokeStyle = CTP.teal;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(radius, 0);
    ctx.stroke();
    ctx.restore();

    // Contacts
    contacts.forEach(blip => {
      const angleDiff = (sweepAngle - blip.angle + Math.PI * 2) % (Math.PI * 2);
      if (angleDiff < 0.12) {
        blip.intensity = 1.0;
      } else {
        blip.intensity = Math.max(0.18, blip.intensity - 0.009);
      }

      const bx = center + Math.cos(blip.angle) * (radius * blip.r);
      const by = center + Math.sin(blip.angle) * (radius * blip.r);

      ctx.fillStyle = `rgba(166, 227, 161, ${blip.intensity})`;
      ctx.shadowColor = CTP.green;
      ctx.shadowBlur = blip.intensity * 6;
      ctx.beginPath();
      ctx.arc(bx, by, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    if (elContacts) elContacts.textContent = `${contacts.length} ACTIVE`;

    setTimeout(renderRadar, 33);
  }

  renderRadar();
}

// -----------------------------------------------------------------------------
// 3. WORLD MAP GEO-LOCATOR WITH TIMEZONE BEACON (IN RIGHT COLUMN)
// -----------------------------------------------------------------------------
const TIMEZONE_COORDS: Record<string, { lat: number; lon: number; city: string }> = {
  // North America
  'America/New_York': { lat: 40.71, lon: -74.00, city: 'New York, USA' },
  'America/Detroit': { lat: 42.33, lon: -83.04, city: 'Detroit, USA' },
  'America/Chicago': { lat: 41.87, lon: -87.62, city: 'Chicago, USA' },
  'America/Denver': { lat: 39.73, lon: -104.99, city: 'Denver, USA' },
  'America/Los_Angeles': { lat: 34.05, lon: -118.25, city: 'Los Angeles, USA' },
  'America/San_Francisco': { lat: 37.77, lon: -122.41, city: 'San Francisco, USA' },
  'America/Seattle': { lat: 47.60, lon: -122.33, city: 'Seattle, USA' },
  'America/Phoenix': { lat: 33.44, lon: -112.07, city: 'Phoenix, USA' },
  'America/Anchorage': { lat: 61.21, lon: -149.90, city: 'Anchorage, USA' },
  'Pacific/Honolulu': { lat: 21.30, lon: -157.85, city: 'Honolulu, USA' },
  'America/Toronto': { lat: 43.65, lon: -79.38, city: 'Toronto, Canada' },
  'America/Vancouver': { lat: 49.28, lon: -123.12, city: 'Vancouver, Canada' },
  'America/Montreal': { lat: 45.50, lon: -73.56, city: 'Montreal, Canada' },
  'America/Mexico_City': { lat: 19.43, lon: -99.13, city: 'Mexico City, Mexico' },
  // South America
  'America/Sao_Paulo': { lat: -23.55, lon: -46.63, city: 'São Paulo, Brazil' },
  'America/Buenos_Aires': { lat: -34.60, lon: -58.38, city: 'Buenos Aires, Argentina' },
  'America/Bogota': { lat: 4.71, lon: -74.07, city: 'Bogotá, Colombia' },
  'America/Santiago': { lat: -33.44, lon: -70.66, city: 'Santiago, Chile' },
  'America/Lima': { lat: -12.04, lon: -77.04, city: 'Lima, Peru' },
  // Europe
  'Europe/London': { lat: 51.50, lon: -0.12, city: 'London, UK' },
  'Europe/Dublin': { lat: 53.34, lon: -6.26, city: 'Dublin, Ireland' },
  'Europe/Paris': { lat: 48.85, lon: 2.35, city: 'Paris, France' },
  'Europe/Berlin': { lat: 52.52, lon: 13.40, city: 'Berlin, Germany' },
  'Europe/Amsterdam': { lat: 52.36, lon: 4.90, city: 'Amsterdam, Netherlands' },
  'Europe/Rome': { lat: 41.90, lon: 12.49, city: 'Rome, Italy' },
  'Europe/Madrid': { lat: 40.41, lon: -3.70, city: 'Madrid, Spain' },
  'Europe/Stockholm': { lat: 59.32, lon: 18.06, city: 'Stockholm, Sweden' },
  'Europe/Oslo': { lat: 59.91, lon: 10.75, city: 'Oslo, Norway' },
  'Europe/Warsaw': { lat: 52.22, lon: 21.01, city: 'Warsaw, Poland' },
  'Europe/Athens': { lat: 37.98, lon: 23.72, city: 'Athens, Greece' },
  'Europe/Kyiv': { lat: 50.45, lon: 30.52, city: 'Kyiv, Ukraine' },
  'Europe/Moscow': { lat: 55.75, lon: 37.61, city: 'Moscow, Russia' },
  'Europe/Istanbul': { lat: 41.00, lon: 28.97, city: 'Istanbul, Turkey' },
  // Asia
  'Asia/Kolkata': { lat: 28.61, lon: 77.20, city: 'New Delhi, India' },
  'Asia/Calcutta': { lat: 22.57, lon: 88.36, city: 'Kolkata, India' },
  'Asia/Dubai': { lat: 25.20, lon: 55.27, city: 'Dubai, UAE' },
  'Asia/Riyadh': { lat: 24.71, lon: 46.67, city: 'Riyadh, Saudi Arabia' },
  'Asia/Singapore': { lat: 1.35, lon: 103.81, city: 'Singapore' },
  'Asia/Bangkok': { lat: 13.75, lon: 100.50, city: 'Bangkok, Thailand' },
  'Asia/Jakarta': { lat: -6.20, lon: 106.84, city: 'Jakarta, Indonesia' },
  'Asia/Hong_Kong': { lat: 22.31, lon: 114.16, city: 'Hong Kong' },
  'Asia/Shanghai': { lat: 31.23, lon: 121.47, city: 'Shanghai, China' },
  'Asia/Tokyo': { lat: 35.67, lon: 139.65, city: 'Tokyo, Japan' },
  'Asia/Seoul': { lat: 37.56, lon: 126.97, city: 'Seoul, South Korea' },
  'Asia/Taipei': { lat: 25.03, lon: 121.56, city: 'Taipei, Taiwan' },
  'Asia/Manila': { lat: 14.59, lon: 120.98, city: 'Manila, Philippines' },
  // Australia & Pacific
  'Australia/Sydney': { lat: -33.86, lon: 151.20, city: 'Sydney, Australia' },
  'Australia/Melbourne': { lat: -37.81, lon: 144.96, city: 'Melbourne, Australia' },
  'Australia/Brisbane': { lat: -27.47, lon: 153.02, city: 'Brisbane, Australia' },
  'Australia/Perth': { lat: -31.95, lon: 115.86, city: 'Perth, Australia' },
  'Pacific/Auckland': { lat: -36.84, lon: 174.76, city: 'Auckland, New Zealand' },
  // Africa
  'Africa/Cairo': { lat: 30.04, lon: 31.23, city: 'Cairo, Egypt' },
  'Africa/Johannesburg': { lat: -26.20, lon: 28.04, city: 'Johannesburg, South Africa' },
  'Africa/Lagos': { lat: 6.52, lon: 3.37, city: 'Lagos, Nigeria' },
  'Africa/Nairobi': { lat: -1.29, lon: 36.82, city: 'Nairobi, Kenya' }
};

function initWorldMap() {
  const canvas = document.getElementById('world-map-canvas') as HTMLCanvasElement | null;
  const elLocationLabel = document.getElementById('user-location-label');
  const elCoordsDisplay = document.getElementById('geo-coords-display');
  const elTzDisplay = document.getElementById('geo-tz-display');
  const elTzBadge = document.getElementById('tz-name-badge');

  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Resolve user timezone
  let userTz = 'UTC';
  try {
    userTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    userTz = 'UTC';
  }

  // Lookup or estimate coordinates from timezone
  let targetLocation = TIMEZONE_COORDS[userTz];
  if (!targetLocation) {
    // Look for partial match
    const matchingKey = Object.keys(TIMEZONE_COORDS).find(k => k.includes(userTz.split('/')[1] || ''));
    if (matchingKey) {
      targetLocation = TIMEZONE_COORDS[matchingKey];
    } else {
      // Calculate longitude from UTC offset
      const offsetMinutes = new Date().getTimezoneOffset();
      const lonEstimate = - (offsetMinutes / 60) * 15;
      targetLocation = {
        lat: 32.0,
        lon: lonEstimate,
        city: userTz.replace('_', ' ')
      };
    }
  }

  // Format UI tags
  const latStr = `${Math.abs(targetLocation.lat).toFixed(1)}°${targetLocation.lat >= 0 ? 'N' : 'S'}`;
  const lonStr = `${Math.abs(targetLocation.lon).toFixed(1)}°${targetLocation.lon >= 0 ? 'E' : 'W'}`;
  if (elCoordsDisplay) elCoordsDisplay.textContent = `${latStr}, ${lonStr}`;
  if (elTzDisplay) elTzDisplay.textContent = userTz;
  if (elTzBadge) elTzBadge.textContent = userTz.split('/')[1]?.replace('_', ' ') || userTz;
  if (elLocationLabel) elLocationLabel.textContent = targetLocation.city;

  // Vectorized Simplified Continents Polygons (lon, lat) pairs
  const continents: [number, number][][] = [
    // North America
    [[-168, 68], [-140, 70], [-120, 72], [-85, 75], [-65, 60], [-55, 48], [-68, 44], [-75, 36], [-81, 25], [-97, 20], [-105, 23], [-117, 32], [-124, 48], [-136, 56], [-162, 58], [-168, 68]],
    // South America
    [[-78, 10], [-60, 5], [-35, -5], [-38, -15], [-50, -30], [-65, -45], [-72, -54], [-76, -42], [-81, -5], [-78, 10]],
    // Europe & Asia
    [[-10, 36], [0, 44], [10, 54], [15, 62], [28, 70], [60, 72], [100, 75], [140, 72], [170, 66], [160, 52], [142, 50], [130, 42], [120, 32], [108, 22], [100, 14], [80, 16], [70, 24], [55, 26], [45, 12], [36, 32], [28, 41], [15, 38], [-5, 36], [-10, 36]],
    // Africa
    [[-17, 15], [-5, 35], [10, 37], [25, 32], [35, 30], [50, 12], [42, -10], [32, -28], [18, -34], [12, -18], [9, 4], [-17, 15]],
    // Australia
    [[115, -22], [130, -12], [142, -10], [152, -24], [150, -36], [136, -35], [115, -34], [115, -22]],
    // Greenland
    [[-52, 60], [-20, 70], [-25, 82], [-55, 83], [-52, 60]]
  ];

  let beaconPulse = 0;

  function renderMap() {
    if (!ctx || !canvas) return;
    const w = canvas.parentElement?.clientWidth || 280;
    const h = 125;
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;

    ctx.clearRect(0, 0, w, h);

    // Coordinate conversion: Equirectangular projection
    function projX(lon: number): number {
      return ((lon + 180) / 360) * w;
    }
    function projY(lat: number): number {
      return ((90 - lat) / 180) * h;
    }

    // 1. Draw Lat/Lon grid lines
    ctx.strokeStyle = 'rgba(69, 71, 90, 0.35)';
    ctx.lineWidth = 0.8;

    // Equator & Prime Meridian
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w / 2, h);
    ctx.stroke();

    // Subtle meridian lines
    [-120, -60, 60, 120].forEach(lon => {
      const x = projX(lon);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    });

    [-45, 45].forEach(lat => {
      const y = projY(lat);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    });

    // 2. Draw Continent landmasses
    ctx.fillStyle = 'rgba(69, 71, 90, 0.48)';
    ctx.strokeStyle = CTP.surface1;
    ctx.lineWidth = 1;

    continents.forEach(poly => {
      ctx.beginPath();
      poly.forEach(([lon, lat], i) => {
        const x = projX(lon);
        const y = projY(lat);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    });

    // 3. Draw Pulsing Location Beacon at Target Location
    const beaconX = projX(targetLocation.lon);
    const beaconY = projY(targetLocation.lat);

    beaconPulse = (beaconPulse + 0.04) % (Math.PI * 2);
    const waveRadius = 4 + (Math.sin(beaconPulse) + 1) * 6;
    const waveAlpha = Math.max(0.1, 1 - (waveRadius / 16));

    // Outer ripple ring
    ctx.strokeStyle = `rgba(250, 179, 135, ${waveAlpha})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(beaconX, beaconY, waveRadius, 0, Math.PI * 2);
    ctx.stroke();

    // Crosshair ticks
    ctx.strokeStyle = CTP.peach;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(beaconX - 7, beaconY);
    ctx.lineTo(beaconX + 7, beaconY);
    ctx.moveTo(beaconX, beaconY - 7);
    ctx.lineTo(beaconX, beaconY + 7);
    ctx.stroke();

    // Center illuminated node
    ctx.fillStyle = CTP.green;
    ctx.shadowColor = CTP.peach;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(beaconX, beaconY, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    setTimeout(renderMap, 33);
  }

  renderMap();
}

// -----------------------------------------------------------------------------
// 4. DIGITAL CLOCK & PRECISION CHRONOMETER (CENTER EXCLUSIVE)
// -----------------------------------------------------------------------------
function initChronometer() {
  const elHours = document.getElementById('clock-hours');
  const elMinutes = document.getElementById('clock-minutes');
  const elSeconds = document.getElementById('clock-seconds');
  const elWeekday = document.getElementById('clock-weekday');
  const elDate = document.getElementById('clock-date');
  const elUtc = document.getElementById('utc-time-display');
  const elDayOfYear = document.getElementById('day-of-year');

  const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  const months = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];

  let lastSecond = -1;
  function updateClock() {
    setTimeout(updateClock, 250);
    const now = new Date();
    if (now.getSeconds() === lastSecond) return;
    lastSecond = now.getSeconds();

    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    if (elHours) elHours.textContent = hours;
    if (elMinutes) elMinutes.textContent = minutes;
    if (elSeconds) elSeconds.textContent = seconds;

    if (elWeekday) elWeekday.textContent = days[now.getDay()];
    if (elDate) elDate.textContent = `${months[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;

    const utcHours = String(now.getUTCHours()).padStart(2, '0');
    const utcMins = String(now.getUTCMinutes()).padStart(2, '0');
    const utcSecs = String(now.getUTCSeconds()).padStart(2, '0');
    if (elUtc) elUtc.textContent = `UTC ${utcHours}:${utcMins}:${utcSecs}Z`;

    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const diff = now.getTime() - startOfYear.getTime();
    const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24)) + 1;
    if (elDayOfYear) elDayOfYear.textContent = String(dayOfYear);

  }

  // Dynamic Auto-fit safeguard ensuring the clock strictly stays on a single line
  function fitClockToSingleLine() {
    const clockStage = document.querySelector('.hud-clock-stage') as HTMLElement | null;
    const clockDisplay = document.getElementById('clock-time-display');
    const clockCard = document.querySelector('.hud-hero-clock-card') as HTMLElement | null;
    if (!clockStage || !clockDisplay || !clockCard) return;

    // Reset inline overrides so CSS clamp(..., ...vw, ...) calculates naturally
    clockDisplay.style.fontSize = '';

    const maxAllowedWidth = clockCard.clientWidth - 32;
    const currentWidth = clockStage.scrollWidth;

    if (currentWidth > maxAllowedWidth && maxAllowedWidth > 120) {
      const ratio = maxAllowedWidth / currentWidth;
      const currentFontSize = parseFloat(window.getComputedStyle(clockDisplay).fontSize);
      const safeSize = Math.floor(currentFontSize * ratio * 0.95);
      clockDisplay.style.fontSize = `${safeSize}px`;
    }
  }

  window.addEventListener('resize', fitClockToSingleLine);
  if ('fonts' in document) {
    document.fonts.ready.then(fitClockToSingleLine);
  }
  setTimeout(fitClockToSingleLine, 100);
  setTimeout(fitClockToSingleLine, 500);

  updateClock();
}

// -----------------------------------------------------------------------------
// 5. SYSTEM TELEMETRY (live data from the local stats helper)
// -----------------------------------------------------------------------------
interface SysStats {
  cpu: { percent: number | null; cores: number[]; freqGHz: number | null; tempC: number | null; fanRpm: number | null };
  gpu: { tempC: number | null };
  ram: { usedGB: number; totalGB: number } | null;
  disk: { usedGB: number; totalGB: number; readMBps: number; writeMBps: number } | null;
  net: { rxMBps: number; txMBps: number; latencyMs: number | null; gateway: string | null; online: boolean };
  battery: { percent: number | null; charging: boolean | null; acConnected: boolean | null };
  uptimeSec: number | null;
}

const NA = 'N/A';
const fmt = (v: number | null | undefined, digits = 1, suffix = '') =>
  v == null ? NA : `${v.toFixed(digits)}${suffix}`;
const setText = (id: string, text: string) => {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
};
const setWidth = (el: HTMLElement | null, pct: number | null) => {
  if (el) el.style.width = `${Math.min(100, Math.max(0, pct ?? 0))}%`;
};
const fmtUptime = (sec: number) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
};

function initSystemTelemetry() {
  const coresContainer = document.getElementById('cpu-cores-container');
  if (coresContainer) {
    coresContainer.innerHTML = '';
    for (let i = 0; i < 8; i++) {
      coresContainer.insertAdjacentHTML('beforeend', `
        <div class="core-mini-item">
          <div class="core-mini-bar"><div id="core-fill-${i}" class="core-mini-fill" style="height: 0%"></div></div>
          <span class="core-mini-lbl font-mono">C${i + 1}</span>
        </div>`);
    }
  }

  const cpuHistory: number[] = new Array(36).fill(0);
  const netRxHistory: number[] = new Array(36).fill(0);
  const cpuSpark = document.getElementById('cpu-history-canvas') as HTMLCanvasElement | null;
  const netSpark = document.getElementById('network-wave-canvas') as HTMLCanvasElement | null;
  const diskFill = document.querySelector('.bar-peach') as HTMLElement | null;
  const netBadge = document.getElementById('net-status-badge');

  function render(s: SysStats) {
    // CPU
    setText('cpu-total-percent', s.cpu.percent == null ? NA : String(s.cpu.percent));
    setText('cpu-freq-display', fmt(s.cpu.freqGHz, 2));
    setText('cpu-temp-display', fmt(s.cpu.tempC, 1, '°C'));
    setText('cpu-volt-display', NA);
    setText('thermal-cpu', s.cpu.tempC == null ? NA : `${s.cpu.tempC.toFixed(1)}°`);
    setText('thermal-gpu', fmt(s.gpu.tempC, 1, '°'));
    setText('thermal-ssd', NA);
    setText('fan-rpm-display', s.cpu.fanRpm == null ? NA : s.cpu.fanRpm.toLocaleString());
    s.cpu.cores.slice(0, 8).forEach((load, i) => {
      const el = document.getElementById(`core-fill-${i}`);
      if (el) el.style.height = `${load}%`;
    });
    if (s.cpu.percent != null) {
      cpuHistory.shift();
      cpuHistory.push(s.cpu.percent);
    }
    const avg = Math.round(cpuHistory.reduce((a, b) => a + b, 0) / cpuHistory.length);
    setText('cpu-sparkline-peek', `AVG ${avg}%`);
    drawSparkline(cpuSpark, cpuHistory, CTP.green);

    // Memory
    if (s.ram) {
      const pct = (s.ram.usedGB / s.ram.totalGB) * 100;
      setText('ram-amount-display', `${s.ram.usedGB.toFixed(1)} / ${s.ram.totalGB.toFixed(1)} GB`);
      setText('ram-percent-display', `${pct.toFixed(1)}% RAM`);
      setWidth(document.getElementById('ram-progress-fill'), pct);
    }

    // Disk
    if (s.disk) {
      const pct = (s.disk.usedGB / s.disk.totalGB) * 100;
      setText('storage-used', s.disk.usedGB.toFixed(0));
      setText('storage-total', s.disk.totalGB.toFixed(0));
      setWidth(diskFill, pct);
      setText('io-read-speed', s.disk.readMBps.toFixed(0));
      setText('io-write-speed', s.disk.writeMBps.toFixed(0));
    }

    // Network
    setText('net-rx-rate', s.net.rxMBps.toFixed(1));
    setText('net-rx-display', s.net.rxMBps.toFixed(1));
    setText('net-tx-display', s.net.txMBps.toFixed(1));
    netRxHistory.shift();
    netRxHistory.push(Math.min(100, s.net.rxMBps));
    drawSparkline(netSpark, netRxHistory, CTP.sapphire);
    if (netBadge) {
      netBadge.textContent = s.net.online ? `ONLINE (${Math.round(s.net.latencyMs ?? 0)}ms)` : 'OFFLINE';
      netBadge.style.color = s.net.online ? CTP.teal : CTP.red;
    }
    setText('radar-gateway', s.net.gateway ?? NA);
    setText('radar-latency', fmt(s.net.latencyMs, 0, 'ms'));

    // Battery (desktops have none). Charger presence decides AC vs battery;
    // "charging" alone is false when a battery is full or held at a charge limit.
    const b = s.battery;
    if (b.percent == null) {
      setText('battery-level', NA);
      setText('battery-state', 'NO BATTERY');
      setText('battery-status-tag', 'AC POWER');
    } else if (!b.acConnected) {
      setText('battery-level', `${b.percent}%`);
      setText('battery-state', 'ON BATTERY');
      setText('battery-status-tag', 'DISCHARGING');
      setText('battery-icon', '🔋');
      setWidth(document.getElementById('battery-progress-fill'), b.percent);
    } else {
      setText('battery-level', `${b.percent}%`);
      setText('battery-state', b.charging ? 'CHARGING' : 'PLUGGED IN');
      setText('battery-status-tag', 'AC POWER');
      setText('battery-icon', '⚡');
      setWidth(document.getElementById('battery-progress-fill'), b.percent);
    }

    // System uptime
    setText('uptime-display', s.uptimeSec == null ? NA : fmtUptime(s.uptimeSec));
  }

  let failures = 0;
  async function poll() {
    try {
      const res = await fetch('/stats', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      render((await res.json()) as SysStats);
      failures = 0;
    } catch {
      failures++;
      if (failures >= 3) {
        setText('net-status-badge', 'HELPER OFFLINE');
        if (netBadge) netBadge.style.color = CTP.red;
      }
    }
  }

  poll();
  setInterval(poll, 2000);
}

function drawSparkline(canvas: HTMLCanvasElement | null, data: number[], strokeColor: string) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Assigning canvas.width reallocates the backing store, so only do it on change.
  const width = canvas.parentElement?.clientWidth || 280;
  const height = 30;
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  ctx.clearRect(0, 0, width, height);

  ctx.beginPath();
  const step = width / (data.length - 1);
  const maxVal = 100;
  data.forEach((val, i) => {
    const x = i * step;
    const y = height - (Math.min(val, maxVal) / maxVal) * (height - 6) - 3;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });

  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.lineTo(width, height);
  ctx.lineTo(0, height);
  ctx.closePath();
  ctx.fillStyle = strokeColor === CTP.green ? 'rgba(166, 227, 161, 0.08)' : 'rgba(116, 199, 236, 0.08)';
  ctx.fill();
}

// -----------------------------------------------------------------------------
// 6. HARDWARE DEVICE TELEMETRY (BATTERY, VIEWPORT, ONLINE)
// -----------------------------------------------------------------------------
function initDeviceTelemetry() {
  const resDisplay = document.getElementById('screen-resolution-display');

  function updateResolution() {
    if (resDisplay) {
      resDisplay.textContent = `${window.innerWidth}×${window.innerHeight}`;
    }
  }
  window.addEventListener('resize', updateResolution);
  updateResolution();

  const netStatusBadge = document.getElementById('net-status-badge');
  function updateNet() {
    if (netStatusBadge) {
      netStatusBadge.textContent = navigator.onLine ? 'ONLINE' : 'OFFLINE';
      netStatusBadge.style.color = navigator.onLine ? CTP.teal : CTP.red;
    }
  }
  window.addEventListener('online', updateNet);
  window.addEventListener('offline', updateNet);
  updateNet();

  window.addEventListener('keydown', (e) => {
    if (e.key === 'f' || e.key === 'F') {
      e.preventDefault();
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
      }
    }
  });
}


// -----------------------------------------------------------------------------
// 7. AUDIO SPECTRUM (track info + bars from the local helper)
// -----------------------------------------------------------------------------
interface MusicState {
  status: string; // 'Playing' | 'Paused' | 'Stopped' | 'NO PLAYER' | 'MISSING' | 'ERROR'
  artist: string;
  title: string;
  album: string;
  bands: number[];
}

const MUSIC_STATUS_LABEL: Record<string, string> = {
  Playing: 'PLAYING',
  Paused: 'PAUSED',
  Stopped: 'STOPPED',
  'NO PLAYER': 'NO MEDIA',
  MISSING: 'NOT INSTALLED',
  ERROR: 'ERROR',
};

function initMusic() {
  const canvas = document.getElementById('music-canvas') as HTMLCanvasElement | null;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const g: CanvasRenderingContext2D = ctx;

  let target: number[] = [];
  let shown: number[] = [];
  let lastLabel = '';

  function resize() {
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    canvas!.width = Math.round(canvas!.clientWidth * dpr);
    canvas!.height = Math.round(canvas!.clientHeight * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  // Track text changes rarely, so only touch the DOM when it changes.
  function updateText(s: MusicState) {
    const label = `${s.status}|${s.title}|${s.artist}`;
    if (label === lastLabel) return;
    lastLabel = label;
    setText('music-status', MUSIC_STATUS_LABEL[s.status] ?? s.status.toUpperCase());
    setText(
      'music-title',
      s.title || 'Unknown track'
    );
    setText('music-artist', s.artist || '—');
  }

  // The helper pushes state about 20 times a second.
  const source = new EventSource('/music');
  source.onmessage = (e: MessageEvent<string>) => {
    const s = JSON.parse(e.data) as MusicState;
    target = s.bands;
    updateText(s);
  };

  // Draw at display rate and ease each bar toward its target for smoother motion.
  function draw() {
    setTimeout(draw, 33);
    const w = canvas!.clientWidth;
    const h = canvas!.clientHeight;
    g.clearRect(0, 0, w, h);

    const n = target.length;
    if (n === 0) return;
    if (shown.length !== n) shown = new Array(n).fill(0);

    const gap = 3;
    const barW = (w - gap * (n - 1)) / n;
    for (let i = 0; i < n; i++) {
      shown[i] += (target[i] - shown[i]) * 0.35;
      const v = Math.max(0, Math.min(1, shown[i]));
      const bh = v * h;
      if (bh < 1) continue;
      g.fillStyle = v > 0.75 ? CTP.peach : v > 0.4 ? CTP.green : CTP.teal;
      g.fillRect(i * (barW + gap), h - bh, barW, bh);
    }
  }
  draw();
}

// -----------------------------------------------------------------------------
// BOOTSTRAP ENGINE
// -----------------------------------------------------------------------------
// Diagnostics: open the page with ?skip=mountains,radar,map,clock,telemetry,device,music (or ?skip=all)
// to turn modules off one at a time and find what drives memory use.
const skipped = new Set(
  (new URLSearchParams(window.location.search).get('skip') ?? '').split(',').filter(Boolean)
);
const runModule = (name: string, init: () => void) => {
  if (!skipped.has(name) && !skipped.has('all')) init();
};

window.addEventListener('DOMContentLoaded', () => {
  runModule('mountains', initAnimatedAsciiMountains);
  runModule('radar', initTacticalRadar);
  runModule('map', initWorldMap);
  runModule('clock', initChronometer);
  runModule('telemetry', initSystemTelemetry);
  runModule('device', initDeviceTelemetry);
  runModule('music', initMusic);
});
