/**
 * 将章节 HTML 与样式打包为 EPUB 3（zip，使用 JSZip）。
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const JSZip = require("jszip");

function escapeXml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * 按卷（子文件夹）生成分层目录：根目录下的 md 为平铺；子文件夹内为「卷名 → 章节」嵌套。
 * @param {{ title: string, volume?: string }[]} chapters
 */
function buildNavTocInnerOl(chapters) {
  const topLevelLis = [];
  let i = 0;
  while (i < chapters.length) {
    const vol = String(chapters[i].volume || "").trim();
    let j = i + 1;
    while (j < chapters.length && String(chapters[j].volume || "").trim() === vol) {
      j += 1;
    }

    if (!vol) {
      for (let k = i; k < j; k++) {
        const num = String(k + 1).padStart(3, "0");
        topLevelLis.push(
          `      <li><a href="chapter-${num}.xhtml">${escapeXml(chapters[k].title)}</a></li>`
        );
      }
    } else {
      const inner = [];
      for (let k = i; k < j; k++) {
        const num = String(k + 1).padStart(3, "0");
        inner.push(
          `        <li><a href="chapter-${num}.xhtml">${escapeXml(chapters[k].title)}</a></li>`
        );
      }
      topLevelLis.push(
        `      <li>\n        <span class="epub-toc-vol">${escapeXml(vol)}</span>\n        <ol>\n${inner.join("\n")}\n        </ol>\n      </li>`
      );
    }
    i = j;
  }
  return topLevelLis.join("\n");
}

/**
 * @param {object} options
 * @param {string} options.title
 * @param {string} options.author
 * @param {string} [options.language]
 * @param {string|null} [options.coverPath]
 * @param {{ title: string, htmlBody: string, volume?: string }[]} options.chapters — volume 为相对根目录的第一级子文件夹名（卷）
 * @param {string} options.combinedCss
 */
async function buildEpubZipBuffer(options) {
  const {
    title,
    author,
    language = "zh-CN",
    coverPath,
    chapters,
    combinedCss,
  } = options;

  if (!chapters || chapters.length === 0) {
    throw new Error("没有可导出的章节");
  }

  const bookUuid = `urn:uuid:${crypto.randomUUID()}`;
  const modified = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

  const zip = new JSZip();

  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });

  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
  );

  zip.file("OEBPS/style.css", combinedCss);

  let coverMeta = "";
  let coverRef = "";
  const manifestItems = [];
  const spineItems = [];

  manifestItems.push(
    `    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`
  );
  manifestItems.push(
    `    <item id="css" href="style.css" media-type="text/css"/>`
  );

  if (coverPath && fs.existsSync(coverPath)) {
    const ext = path.extname(coverPath).toLowerCase();
    let fileName = "cover.jpg";
    let media = "image/jpeg";
    if (ext === ".png") {
      fileName = "cover.png";
      media = "image/png";
    } else if (ext === ".webp") {
      fileName = "cover.webp";
      media = "image/webp";
    } else if (ext === ".gif") {
      fileName = "cover.gif";
      media = "image/gif";
    }
    const buf = fs.readFileSync(coverPath);
    zip.file(`OEBPS/images/${fileName}`, buf);
    manifestItems.push(
      `    <item id="cover-image" href="images/${fileName}" media-type="${media}" properties="cover-image"/>`
    );
    coverMeta = `    <meta name="cover" content="cover-image"/>\n`;
    manifestItems.push(
      `    <item id="cover-page" href="cover.xhtml" media-type="application/xhtml+xml"/>`
    );
    coverRef = `    <itemref idref="cover-page"/>\n`;
    const coverPage = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${escapeXml(language)}">
<head>
  <title>封面</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <section epub:type="cover" class="epub-cover">
    <img src="images/${fileName}" alt="封面"/>
  </section>
</body>
</html>`;
    zip.file("OEBPS/cover.xhtml", coverPage);
  }

  chapters.forEach((ch, idx) => {
    const num = String(idx + 1).padStart(3, "0");
    const fname = `chapter-${num}.xhtml`;
    const id = `ch${num}`;
    const xhtml = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${escapeXml(language)}">
<head>
  <title>${escapeXml(ch.title)}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <section class="markdown-body epub-chapter" epub:type="chapter">
${ch.htmlBody}
  </section>
</body>
</html>`;
    zip.file(`OEBPS/${fname}`, xhtml);
    manifestItems.push(
      `    <item id="${id}" href="${fname}" media-type="application/xhtml+xml"/>`
    );
    spineItems.push(`    <itemref idref="${id}"/>`);
  });

  const navOl = buildNavTocInnerOl(chapters);

  const nav = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${escapeXml(language)}">
<head>
  <title>目录</title>
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>目录</h1>
    <ol>
${navOl}
    </ol>
  </nav>
</html>`;
  zip.file("OEBPS/nav.xhtml", nav);

  const contentOpf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="pub-id" version="3.0" xml:lang="${escapeXml(language)}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="pub-id">${escapeXml(bookUuid)}</dc:identifier>
    <dc:title>${escapeXml(title)}</dc:title>
    <dc:creator>${escapeXml(author)}</dc:creator>
    <dc:language>${escapeXml(language)}</dc:language>
${coverMeta}    <meta property="dcterms:modified">${modified}</meta>
  </metadata>
  <manifest>
${manifestItems.join("\n")}
  </manifest>
  <spine>
${coverRef}${spineItems.join("\n")}
  </spine>
</package>`;
  zip.file("OEBPS/content.opf", contentOpf);

  return zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  });
}

module.exports = { buildEpubZipBuffer };
