(function () {
  const dataCache = {};

  const qs = (selector, root = document) => root.querySelector(selector);
  const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  async function loadJson(path) {
    if (dataCache[path]) return dataCache[path];
    const response = await fetch(path);
    if (!response.ok) throw new Error(`Cannot load ${path}`);
    dataCache[path] = await response.json();
    return dataCache[path];
  }

  function formatDate(value) {
    if (!value) return "Đang cập nhật";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString("vi-VN");
  }

  function categoryLabel(categories, id) {
    return (categories.find((item) => item.id === id) || {}).label || "Thông tin";
  }

  function docActions(doc) {
    if (!doc.file) return '<p class="meta">Tệp chính thức sẽ được cập nhật sau.</p>';
    return `
      <div class="button-row">
        <a class="btn" href="${doc.file}" target="_blank" rel="noopener">Xem PDF</a>
        <a class="btn secondary" href="${doc.file}" download>Tải về</a>
      </div>
    `;
  }

  function renderDocument(doc, categories) {
    return `
      <article class="document-card ${doc.pinned ? "featured" : ""}" data-category="${doc.categoryId}">
        <span class="tag ${doc.pinned ? "amber" : ""}">${doc.pinned ? "Văn bản quan trọng" : categoryLabel(categories, doc.categoryId)}</span>
        <h3>${doc.title}</h3>
        <p>${doc.description}</p>
        <div class="document-meta">
          <span><strong>Số hiệu</strong><br>${doc.decisionNumber || "Đang cập nhật"}</span>
          <span><strong>Cơ quan ban hành</strong><br>${doc.issuedBy || "Đang cập nhật"}</span>
          <span><strong>Thời gian</strong><br>${doc.issuedAt || "Đang cập nhật"}</span>
        </div>
        ${docActions(doc)}
      </article>
    `;
  }

  function renderArticle(article, categories) {
    const thumb = article.image
      ? `<img class="news-thumb" src="${article.image}" alt="${article.title}" loading="lazy">`
      : "";
    return `
      <article class="news-card" data-category="${article.categoryId}">
        ${thumb}
        <div class="news-body">
          <span class="tag">${categoryLabel(categories, article.categoryId)}</span>
          <h3>${article.title}</h3>
          <span class="meta">${formatDate(article.publishedAt)}</span>
          <p>${article.excerpt}</p>
          <details>
            <summary>Đọc nội dung</summary>
            <div class="content-prose">${article.contentHtml || ""}</div>
          </details>
        </div>
      </article>
    `;
  }

  function renderAlbum(album, index) {
    const labels = ["Lớp học", "Hoạt động", "Cộng đồng"];
    const image = album.coverImage || (album.images && album.images[0] && album.images[0].src);
    return `
      <article class="album-card">
        ${image
          ? `<img class="album-image" src="${image}" alt="${album.title}" loading="lazy">`
          : `<div class="album-visual">${labels[index % labels.length]}</div>`}
        <h3>${album.title}</h3>
        <p>${album.description}</p>
        <p class="meta">${image ? "Ảnh đã lưu cục bộ từ nguồn dữ liệu của nhà trường." : "Ảnh thực tế sẽ được bổ sung khi nhà trường duyệt bộ ảnh công khai."}</p>
      </article>
    `;
  }

  async function hydrateHeader() {
    try {
      const [config, nav] = await Promise.all([
        loadJson("assets/data/site-config.json"),
        loadJson("assets/data/navigation.json")
      ]);
      qsa("[data-school-name]").forEach((el) => { el.textContent = config.school.name; });
      qsa("[data-school-short]").forEach((el) => { el.textContent = config.school.shortName; });
      qsa("[data-school-address]").forEach((el) => { el.textContent = config.contact.address; });
      qsa("[data-school-year]").forEach((el) => { el.textContent = config.school.schoolYear; });
      qsa("[data-working-hours]").forEach((el) => { el.textContent = config.contact.workingHours; });
      qsa("[data-school-department]").forEach((el) => { el.textContent = config.school.department; });
      const branding = config.branding || {};
      const banner = branding.bannerImage || branding.heroImage;
      if (banner) {
        document.documentElement.style.setProperty("--hero-image", `url("${banner}")`);
      }
      qsa("[data-school-emblem]").forEach((el) => {
        if (branding.emblem) { el.setAttribute("src", branding.emblem); }
      });

      const navRoot = qs("[data-nav]");
      if (navRoot) {
        const current = location.pathname.split("/").pop() || "index.html";
        navRoot.innerHTML = nav.items
          .filter((item) => item.visible)
          .sort((a, b) => a.order - b.order)
          .map((item) => `<li><a href="${item.href}" ${item.href === current ? 'aria-current="page"' : ""}>${item.label}</a></li>`)
          .join("");
      }
    } catch (error) {
      document.documentElement.classList.add("json-unavailable");
    }
  }

  async function hydrateDocuments() {
    const targets = qsa("[data-documents]");
    if (!targets.length) return;
    try {
      const data = await loadJson("assets/data/documents.json");
      targets.forEach((target) => {
        const mode = target.dataset.documents;
        const items = data.items.filter((doc) => {
          if (mode === "featured") return doc.pinned || doc.showOnHome;
          if (mode === "public") return doc.categoryId === "cong-khai";
          return true;
        });
        target.innerHTML = items.map((doc) => renderDocument(doc, data.categories)).join("");
      });
    } catch (error) {}
  }

  async function hydrateArticles() {
    const targets = qsa("[data-articles]");
    if (!targets.length) return;
    try {
      const data = await loadJson("assets/data/articles.json");
      targets.forEach((target) => {
        const limit = Number(target.dataset.limit || data.items.length);
        const items = data.items
          .filter((article) => article.status === "published")
          .slice(0, limit);
        target.innerHTML = items.map((article) => renderArticle(article, data.categories)).join("");
      });
      setupFilters("[data-article-filter]", ".news-card");
    } catch (error) {}
  }

  async function hydrateGallery() {
    const target = qs("[data-gallery]");
    if (!target) return;
    try {
      const data = await loadJson("assets/data/gallery.json");
      target.innerHTML = data.albums.map(renderAlbum).join("");
    } catch (error) {}
  }

  function setupFilters(buttonSelector, cardSelector) {
    const buttons = qsa(buttonSelector);
    if (!buttons.length) return;
    buttons.forEach((button) => {
      button.addEventListener("click", () => {
        const category = button.dataset.category;
        buttons.forEach((item) => item.classList.toggle("active", item === button));
        qsa(cardSelector).forEach((card) => {
          const visible = category === "all" || card.dataset.category === category;
          card.hidden = !visible;
        });
      });
    });
  }

  function setupMenu() {
    const button = qs("[data-menu-toggle]");
    const list = qs(".main-nav ul") || qs("[data-nav]");
    if (!button || !list) return;
    button.addEventListener("click", () => {
      const open = list.classList.toggle("open");
      button.setAttribute("aria-expanded", String(open));
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    setupMenu();
    hydrateHeader();
    hydrateDocuments();
    hydrateArticles();
    hydrateGallery();
  });
})();
