// Physical pixel scale for crisp retina output
const SCALE = 2;
const PAD = 20 * SCALE;
const GAP = 8 * SCALE;
const GAP_SVG = 14 * SCALE;
const TITLE_PX = 18 * SCALE;
const SUBTITLE_PX = 14 * SCALE;
const CAPTION_PX = 12 * SCALE;
const LH = 1.3; // line-height multiplier

/**
 * Downloads a chart (with its title/subtitle/caption) as a PNG.
 * Observable Plot charts expose their title in `figure > h2`, subtitle in `figure > h3`,
 * and caption in `figure > figcaption`. D3 charts can supply a title via the
 * `data-download-title` attribute on the wrapper container.
 */
async function downloadChartAsPng(containerEl, filename) {
  const svgEl = containerEl.querySelector("svg");
  if (!svgEl) return;

  // Observable Plot outputs a <figure>; look inside containerEl for one
  const figure = containerEl.querySelector("figure") ||
    (containerEl.tagName === "FIGURE" ? containerEl : null);

  const title =
    containerEl.dataset.downloadTitle ||
    figure?.querySelector(":scope > h2")?.textContent?.trim() ||
    "";
  const subtitle = figure?.querySelector(":scope > h3")?.textContent?.trim() || "";
  const caption = figure?.querySelector(":scope > figcaption")?.textContent?.trim() || "";

  // Clone SVG and inline the most visually critical computed styles so they
  // survive serialisation (Plot uses a <style> block, D3 uses inline attrs,
  // but both benefit from having font/fill properties locked in).
  const clone = svgEl.cloneNode(true);
  const srcEls = svgEl.querySelectorAll("*");
  const dstEls = clone.querySelectorAll("*");
  const PROPS = [
    "fill", "stroke", "stroke-width", "stroke-dasharray", "stroke-linecap",
    "font-family", "font-size", "font-weight", "font-style",
    "text-anchor", "dominant-baseline", "opacity",
  ];
  for (let i = 0; i < srcEls.length; i++) {
    const cs = window.getComputedStyle(srcEls[i]);
    for (const p of PROPS) {
      const v = cs.getPropertyValue(p);
      if (v) dstEls[i].style[p] = v;
    }
  }

  // White background rect inside the SVG itself
  const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  bg.setAttribute("width", "100%");
  bg.setAttribute("height", "100%");
  bg.setAttribute("fill", "white");
  clone.insertBefore(bg, clone.firstChild);

  // Resolve SVG logical dimensions
  const vb = clone.getAttribute("viewBox");
  let svgW, svgH;
  if (vb) {
    const p = vb.split(/[\s,]+/);
    svgW = parseFloat(p[2]);
    svgH = parseFloat(p[3]);
  } else {
    svgW = parseFloat(clone.getAttribute("width")) || svgEl.clientWidth || 800;
    svgH = parseFloat(clone.getAttribute("height")) || svgEl.clientHeight || 400;
  }

  clone.setAttribute("width", svgW * SCALE);
  clone.setAttribute("height", svgH * SCALE);

  // Pre-compute vertical layout (in physical pixels)
  const titleH = title ? Math.ceil(TITLE_PX * LH) : 0;
  const gapTitle = (title && subtitle) ? GAP : 0;
  const subtitleH = subtitle ? Math.ceil(SUBTITLE_PX * LH) : 0;
  const topArea = titleH + gapTitle + subtitleH;
  const gapBeforeSvg = topArea > 0 ? GAP_SVG : 0;
  const captionH = caption ? Math.ceil(CAPTION_PX * LH) : 0;
  const gapAfterSvg = captionH > 0 ? GAP_SVG : 0;

  const canvasW = svgW * SCALE;
  const canvasH = PAD + topArea + gapBeforeSvg + svgH * SCALE + gapAfterSvg + captionH + PAD;

  // Rasterise SVG via an offscreen Image
  const svgString = new XMLSerializer().serializeToString(clone);
  const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl = URL.createObjectURL(svgBlob);

  await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = canvasW;
      canvas.height = canvasH;
      const ctx = canvas.getContext("2d");

      // White canvas background
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvasW, canvasH);

      let y = PAD;

      if (title) {
        ctx.font = `bold ${TITLE_PX}px sans-serif`;
        ctx.fillStyle = "#1a1a1a";
        ctx.textBaseline = "top";
        ctx.fillText(title, PAD, y);
        y += titleH + gapTitle;
      }
      if (subtitle) {
        ctx.font = `${SUBTITLE_PX}px sans-serif`;
        ctx.fillStyle = "#555555";
        ctx.textBaseline = "top";
        ctx.fillText(subtitle, PAD, y);
        y += subtitleH;
      }
      y += gapBeforeSvg;

      ctx.drawImage(img, 0, y);
      URL.revokeObjectURL(svgUrl);
      y += svgH * SCALE;

      if (caption) {
        y += gapAfterSvg;
        ctx.font = `italic ${CAPTION_PX}px sans-serif`;
        ctx.fillStyle = "#777777";
        ctx.textBaseline = "top";
        ctx.fillText(caption, PAD, y);
      }

      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        resolve();
      }, "image/png");
    };
    img.onerror = reject;
    img.src = svgUrl;
  });
}

/**
 * Wraps a chart DOM element with a container div and a PNG download button.
 * @param {Element} chartEl - The chart element (Plot figure or D3 SVG).
 * @param {string} filename - Filename for the downloaded PNG.
 * @param {object} [opts]
 * @param {string} [opts.title] - Title to show above the chart in the PNG.
 *   For Plot charts this is auto-detected from `figure > h2`; pass this only
 *   for D3 charts whose title lives in the surrounding page markup.
 */
export function withDownload(chartEl, filename, { title } = {}) {
  const container = document.createElement("div");
  container.style.cssText = "position:relative;display:inline-block;width:100%";

  if (title) container.dataset.downloadTitle = title;

  const btn = document.createElement("button");
  btn.textContent = "↓ PNG";
  btn.title = "Download as PNG";
  btn.style.cssText = [
    "position:absolute",
    "top:6px",
    "right:6px",
    "z-index:10",
    "padding:3px 8px",
    "font-size:11px",
    "line-height:1.4",
    "background:rgba(255,255,255,0.85)",
    "border:1px solid #ccc",
    "border-radius:4px",
    "cursor:pointer",
    "opacity:0.5",
    "transition:opacity 0.15s",
  ].join(";");

  btn.onmouseenter = () => (btn.style.opacity = "1");
  btn.onmouseleave = () => (btn.style.opacity = "0.5");

  btn.onclick = async () => {
    btn.textContent = "…";
    btn.disabled = true;
    try {
      await downloadChartAsPng(container, filename);
    } finally {
      btn.textContent = "↓ PNG";
      btn.disabled = false;
    }
  };

  container.appendChild(chartEl);
  container.appendChild(btn);
  return container;
}
