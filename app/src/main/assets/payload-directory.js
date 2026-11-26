
"use strict";
const isAndroidApp = location.origin === "https://appassets.androidplatform.net";
document.documentElement.classList.toggle("android-app", isAndroidApp);
let seed = JSON.parse(document.querySelector("#seed").textContent);
const storageKey = "payload-defense-tracker-v1";
const $ = id => document.getElementById(id);
const names = new Intl.DisplayNames(["en"], {type:"region"});
const categories = ["Drones", "Counter-Drones", "Ground Robotics", "Airspace Management",
  "Navigation & Communications", "Command & Control", "Weapons & Fire Control",
  "Satellite Platforms & Payloads", "Launch & Space Logistics",
  "Satellite Connectivity & Ground Systems", "Earth Observation & Space Intelligence"];
for (const picker of [$("category"), $("form").elements.namedItem("category")]) {
  for (const category of categories) {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    picker.append(option);
  }
}
// ISO 3166-1 alpha-2 country and territory codes.
const countryCodes = [
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI",
  "BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN",
  "CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK",
  "FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM",
  "HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN",
  "KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK",
  "ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP",
  "NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW",
  "SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF",
  "TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI",
  "VN VU WF WS YE YT ZA ZM ZW",
].join(" ").split(" ");
const countries = countryCodes.map(code => ({code, name:names.of(code)}))
  .sort((a,b) => a.name.localeCompare(b.name, "en"));
const normalizeCountry = value => String(value || "").normalize("NFD")
  .replace(/\p{Diacritic}/gu, "").trim().toLowerCase();
const countryLookup = new Map(countries.flatMap(({code,name}) => [
  [code.toLowerCase(),code], [normalizeCountry(name),code]
]));
const countryCode = value => countryLookup.get(normalizeCountry(value)) || "";
for (const {code,name} of countries) {
  const option = document.createElement("option");
  option.value = name;
  option.label = code;
  $("countries").append(option);
}
let added = [];
try {
  const saved = JSON.parse(localStorage.getItem(storageKey) || "[]");
  if (Array.isArray(saved)) {
    added = saved.filter(item => item && typeof item.name === "string" && typeof item.id === "string")
      .map(item => item.category === "Other Defense Tech"
        ? {...item, category:inferCategory(item.summary || "")} : item);
  }
} catch {}
const companies = () => [...seed, ...added.filter(c => !seed.some(s => s.id === c.id))];
const html = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
function safeUrl(value) {
  try {
    const url = new URL(value);
    return /^(https?):$/.test(url.protocol) && !url.username && !url.password ? url.href : "";
  }
  catch { return ""; }
}
function flag(code) {
  if (!/^[A-Z]{2}$/.test(code || "")) return "";
  return String.fromCodePoint(...[...code].map(c => 127397 + c.charCodeAt(0)));
}
function place(code, label) {
  return code ? `<span class="flag" aria-hidden="true">${flag(code)}</span> ${html(label || names.of(code))}` : html(label);
}
let companySearch = {countryCode: "", countryName: "", category: "", words: []};

function matches(company) {
  const companyCountry = company.country && names.of(company.country);
  const haystack = [company.name, company.origin, company.summary, company.country && names.of(company.country), ...(company.offices || []).map(o => o[2]), ...productsFor(company).flatMap(product => [product.name, product.description, product.category])].join(" ").toLowerCase();
  const originMatches = companySearch.countryCode ? company.country === companySearch.countryCode :
    normalizeCountry(companyCountry).includes(companySearch.countryName);
  return originMatches &&
    (!companySearch.category || company.category === companySearch.category) &&
    companySearch.words.every(word => haystack.includes(word));
}
function sortValue(company, key) {
  if (key === "usd" || key === "eur") {
    const amounts = [...(company.funding || "").matchAll(/(US\$|€)\s*(\d+(?:\.\d+)?)\s*([MB])\b/gi)]
      .filter(match => match[1] === (key === "usd" ? "US$" : "€"));
    return amounts.length ? amounts.reduce((total,match) =>
      total + Number(match[2]) * (match[3].toUpperCase() === "B" ? 1e9 : 1e6), 0) : null;
  }
  if (key === "employees") {
    const reported = company.employees || "";
    const count = !/current count unverified/i.test(reported) && reported.match(/^(?:About )?([\d,]+)/i);
    return count ? Number(count[1].replaceAll(",", "")) : null;
  }
  return company[key]?.length || null;
}

function renderDirectory() {
  const results = companies().filter(matches);
  const sort = $("company-sort").value;
  const note = $("sort-note");
  note.hidden = !sort || sort === "name";
  if (sort === "name") results.sort((a,b) => a.name.localeCompare(b.name));
  else if (sort) {
    results.sort((a,b) => (sortValue(b,sort) ?? -1) - (sortValue(a,sort) ?? -1) || a.name.localeCompare(b.name));
    note.textContent = sort === "employees" ? "Highest first, using the lower bound of headcount ranges. Unknowns appear last."
      : sort === "usd" || sort === "eur" ? "Highest first. Reported rounds and totals can cover different periods. Unknowns appear last."
      : "Highest first, counting names listed in each profile. Unknowns appear last.";
  }
  $("count").textContent = `${results.length} of ${companies().length} companies`;
  $("cards").innerHTML = results.length ? results.map(c => `
    <button class="card" type="button" data-company="${html(c.id)}">
      <span class="card-top"><span class="card-name">${html(c.name)}</span><span class="arrow" aria-hidden="true">↗</span></span>
      <span class="tagrow"><span class="tag accent">${place(c.country, c.country ? "" : "Origin unverified")}</span><span class="tag">${html(c.category || "Category unverified")}</span></span>
      <span class="summary">${html(c.summary || "Description unavailable")}</span>
    </button>`).join("") : '<div class="empty">No companies match those filters.</div>';
}
const unknown = "No verified public figure";
const statList = items => Array.isArray(items) && items.length
  ? `<ol class="stat-list">${items.map(item => `<li>${html(item)}</li>`).join("")}</ol>`
  : "No named entries verified";
const external = (url, label) => `<a href="${html(safeUrl(url))}" target="_blank" rel="noopener noreferrer">${html(label)} ↗</a>`;
function mappableOffices(companies) {
  return companies.flatMap(company => (company.offices || [])
    .filter(([,code,city]) => code && city && city !== names.of(code))
    .map(office => ({company,office})));
}
function mapPanel(companies) {
  const offices = mappableOffices(companies);
  if (!offices.length) return '<div class="tile small">Office locale obscured. A city-level office location could not be verified.</div>';
  const home = offices.findIndex(({company,office}) => company.id === companies[0].id && office[1] === company.country);
  return `<details id="location-map"><summary>Open Location Map</summary>
    <div class="map-controls">
    <label>Office location<select id="map-office" class="control">${offices.map(({company,office:[role,code,city]}, i) => `<option value="${i}" ${i === Math.max(0,home) ? "selected" : ""}>${flag(code)} ${companies.length > 1 ? html(company.name) + " · " : ""}${html(role)} · ${html(city)}</option>`).join("")}</select></label>
    <p class="small map-label" id="map-label"></p>
    <iframe id="map-frame" class="map-frame" title="Company office location map" loading="lazy" sandbox="allow-scripts allow-same-origin" referrerpolicy="no-referrer"></iframe>
    <p class="small map-label"><a id="map-link" target="_blank" rel="noopener noreferrer">Open in Google Maps ↗</a></p>
    </div></details>`;
}
function activateMap(companies) {
  const panel = $("location-map");
  if (!panel) return;
  const offices = mappableOffices(companies);
  function loadMap() {
    if (!panel.open) return;
    const {office:[,,city,address]} = offices[Number($("map-office").value)];
    const location = [address,city].filter(Boolean).join(", ");
    const query = encodeURIComponent(location);
    $("map-label").textContent = address ? `Public office address: ${location}` : `Office locale obscured. Pin shows ${city} at city level.`;
    const src = `https://maps.google.com/maps?q=${query}&z=${address ? 16 : 11}&output=embed`;
    if ($("map-frame").getAttribute("src") !== src) $("map-frame").src = src;
    $("map-link").href = `https://www.google.com/maps/search/?api=1&query=${query}`;
  }
  panel.addEventListener("toggle",loadMap);
  $("map-office").addEventListener("change",loadMap);
}
const stat = (label, value) => `<div class="tile"><dt>${html(label)}</dt><dd>${value}</dd></div>`;
function renderProfile(c) {
  const site = safeUrl(c.website);
  const initials = c.name.split(/[\s-]+/).slice(0,2).map(part => part[0]).join("").toUpperCase();
  const sources = (c.sources || []).filter(s => safeUrl(s[1]));
  const logo = safeUrl(c.logo);
  const originFlag = flag(c.country);
  const originLabel = `Origin · ${c.origin || (c.country ? names.of(c.country) : "Unverified")}`;
  const group = companies();
  const parent = c.parentCompanyId ? group.find(item => item.id === c.parentCompanyId) : null;
  const subsidiaries = group.filter(item => item.parentCompanyId === c.id).sort((a,b) => a.name.localeCompare(b.name));
  const companyLink = item => `<a href="#${encodeURIComponent(item.id)}">${html(item.name)}</a>`;
  const relationshipPanel = `
    <section aria-label="Corporate relationships">
      <h2 class="section-label">Corporate Relationships</h2>
      <div class="detail-grid">
        ${stat("Parent Company", parent ? companyLink(parent) : "No parent verified")}
        ${stat("Subsidiaries / Operating Companies", subsidiaries.length ? subsidiaries.map(companyLink).join("<br>") : "None documented")}
      </div>
      ${c.id === "ondas-autonomous-systems" ? '<p class="small">Operating group, not necessarily the immediate legal owner of every company. See Ondas SEC filings.</p>' : ""}
    </section>`;
  $("profile").innerHTML = `
  <button class="back" type="button">← Directory</button>
  <article class="profile-card">
    <div class="identity">
      <span class="monogram" aria-hidden="true">${logo ? `<img src="${html(logo)}" alt="">` : html(initials)}</span>
      <div>
        <div class="profile-title">
          <h1 tabindex="-1">${html(c.name)}</h1>
          ${site ? `<a class="website-link" href="${html(site)}" target="_blank" rel="noopener noreferrer" aria-label="${html(c.name)} website (opens externally)" title="Company website">↗</a>` : ""}
        </div>
        <div class="tagrow"><span class="tag accent">${html(c.category || "Category unverified")}</span><span class="tag">${html(c.ownership || "Ownership unverified")}</span></div>
      </div>
      ${originFlag ? `<span class="flag origin-flag" role="img" aria-label="${html(originLabel)}" title="${html(originLabel)}">${originFlag}</span>` : ""}
    </div>
    <p class="overview">${html(c.summary || "Description unavailable")}</p>
    <section aria-label="Locations"><h2 class="section-label">Location</h2>
      <ul class="tagrow office-tags">
        ${c.offices?.length ? c.offices.map(([role, code, label]) => `
          <li class="tag office-tag">
            <strong>${code === c.country ? html(label) : place(code, label)}</strong>
            <span class="office-role">${html(role)}</span>
          </li>
        `).join("") : '<li class="tag office-tag">Headquarters unverified</li>'}
      </ul>${mapPanel([c])}</section>
    ${relationshipPanel}
    <section aria-label="Products and services">
      <div class="product-actions"><h2 class="section-label">Products &amp; Services</h2>
        <button type="button" data-add-product="${html(c.id)}">+ Add Offering</button>
      </div>
      <div class="stack" id="company-product-cards"></div>
      <div class="product-actions">
        <a href="#products/${html(c.id)}">Browse in product catalog</a>
        <button type="button" data-compare-products>Compare products</button>
      </div>
      <p id="profile-product-status" class="small" role="status"></p>
    </section>
    <section aria-label="Company statistics"><h2 class="section-label">Company Stats</h2><dl class="detail-grid company-stats">
      ${stat("Money Raised", html(c.funding || unknown))}
      ${stat("Employees", html(c.employees || unknown))}
      ${stat("Known Investors", statList(c.investors))}
      ${stat("Founders", statList(c.founders))}
      ${stat("Named Customers / Users", statList(c.customers))}
    </dl></section>
    <details><summary>Sources &amp; Coverage</summary><p>${html(c.coverage || "Added by you")}</p>
      ${sources.length ? `<ul>${sources.map(([label, url]) => `<li><a href="${html(safeUrl(url))}" target="_blank" rel="noopener noreferrer">${html(label)} ↗</a></li>`).join("")}</ul>` : ""}
    </details>
    <button class="primary compare-trigger" type="button">COMPARE</button>
  </article>`;
  renderCompanyProducts(c);
  activateMap([c]);
  const img = $("profile").querySelector("img");
  if (img) img.addEventListener("error", () => { img.parentElement.textContent = initials; }, {once:true});
}
const dfPair = ["d-fend","parazero"];
const productComparison = [
  ["Product","EnforceAir PLUS","TillOnAIR (DefendAir family)"],
  ["Buyer need","Detect, track and mitigate unauthorized drones at protected sites","Detect, track and mitigate unauthorized drones at protected sites"],
  ["Detection","RF sensing and integrated radar","Proprietary detection and target tracking"],
  ["Mitigation","RF cyber takeover on supported drones, with optional jamming","Reusable interceptor drones with net capture"],
  ["Proof to request","Supported drone models and a site-specific controlled landing demonstration","Site-specific evidence of successful net interception and recovery"]
];
function renderComparison(left,right) {
  const options = selected => companies().map(c => `<option value="${html(c.id)}" ${c.id === selected ? "selected" : ""}>${html(c.name)}</option>`).join("");
  const curated = [left.id,right.id].every(id => dfPair.includes(id));
  const base = [
    ["Origin",left.origin && `${flag(left.country)} ${left.origin}`,right.origin && `${flag(right.country)} ${right.origin}`],
    ["Ownership",left.ownership,right.ownership],
    ["Office locations",left.offices?.map(o => `${flag(o[1])} ${o[0]}: ${o[2]}`).join(" · "),right.offices?.map(o => `${flag(o[1])} ${o[0]}: ${o[2]}`).join(" · ")]
  ];
  const products = curated ? productComparison.map(([label,a,b]) => left.id === dfPair[0] ? [label,a,b] : [label,b,a])
    : [["What it builds",left.summary,right.summary],["Products",productsFor(left).map(p=>p.name).join(", "),productsFor(right).map(p=>p.name).join(", ")]];
  $("comparison").innerHTML = `
  <button class="back" type="button" data-back="${html(left.id)}">← ${html(left.name)}</button>
  <article class="profile-card"><div class="eyebrow">Company Comparison</div><h1 tabindex="-1">Compare Companies</h1>
    <div class="detail-grid">
      <label>First company<select class="control" id="compare-left">${options(left.id)}</select></label>
      <label>Second company<select class="control" id="compare-right">${options(right.id)}</select></label>
    </div>
    ${curated ? '<p>Both products compete for the same detect-to-mitigate counter-drone use case. Their mitigation methods differ. This comparison uses published specifications.</p>' : ''}
    <table class="compare-table"><caption class="sr">Side-by-side company comparison</caption><thead><tr><th scope="col">Field</th><th scope="col"><a href="#${html(left.id)}">${html(left.name)}</a></th><th scope="col"><a href="#${html(right.id)}">${html(right.name)}</a></th></tr></thead>
    <tbody>${[...products,...base,["Money raised",left.funding,right.funding],["Employees",left.employees,right.employees],["Known investors",left.investors?.join(" · "),right.investors?.join(" · ")],["Founders",left.founders?.join(" · "),right.founders?.join(" · ")],["Named customers / users",left.customers?.join(" · "),right.customers?.join(" · ")]].map(([label,a,b])=>`<tr><th scope="row">${html(label)}</th><td>${html(a || "Unverified")}</td><td>${html(b || "Unverified")}</td></tr>`).join("")}</tbody></table>
    ${curated ? `<div class="small">${external("https://d-fendsolutions.com/enforceair/","EnforceAir specifications")} · ${external("https://parazero.com/2026/10/26/parazero-launches-tillonair-an-autonomous-detect-to-defeat-c-uas-system-with-reusable-interceptors/","TillOnAIR launch")} · ${external("https://www.sec.gov/Archives/edgar/data/1916241/000121390026034376/ea0282637-20f_parazero.htm","ParaZero SEC filing")}</div>` : ""}
    <section aria-label="Comparison location map"><h2 class="section-label">Location Map</h2>${mapPanel([left,right])}</section>
  </article>`;
  activateMap([left,right]);
}
let activeId = "";
function route() {
  const [first,second,third] = location.hash.slice(1).split("/");
  const left = first === "compare" && companies().find(c => c.id === second);
  const right = first === "compare" && companies().find(c => c.id === third);
  const comparing = Boolean(left && right && left.id !== right.id);
  const next = companies().find(c => c.id === first);
  const browsingProducts = first === "products";
  const comparingProducts = first === "compare-products";
  $("nav-companies").toggleAttribute("aria-current", !browsingProducts && !comparingProducts);
  $("nav-products").toggleAttribute("aria-current", browsingProducts || comparingProducts);
  $("product-catalog").hidden = !browsingProducts;
  $("product-comparison").hidden = !comparingProducts;
  $("directory").hidden = Boolean(next || comparing || browsingProducts || comparingProducts);
  $("profile").hidden = !next;
  $("comparison").hidden = !comparing;
  if (!next) $("profile").innerHTML = "";
  if (!comparing) $("comparison").innerHTML = "";
  if (browsingProducts || comparingProducts) {
    if (browsingProducts) {
      renderProductCompanies(second);
      renderProducts();
    } else {
      renderProductComparison();
    }
    $(browsingProducts ? "product-catalog" : "product-comparison").querySelector("h1").focus();
    window.scrollTo(0,0);
    return;
  }
  if (comparing) {
    renderComparison(left,right);
    $("comparison").querySelector("h1").focus();
    window.scrollTo(0,0);
    return;
  }
  if (next) {
    renderProfile(next);
    $("profile").querySelector("h1").focus();
    window.scrollTo(0,0);
  } else if (activeId) {
    [...$("cards").querySelectorAll("[data-company]")].find(el => el.dataset.company === activeId)?.focus();
  }
  activeId = next?.id || "";
}
$("cards").addEventListener("click", event => {
  const button = event.target.closest("[data-company]");
  if (button) location.hash = button.dataset.company;
});
$("profile").addEventListener("click", event => {
  if (event.target.closest(".back")) location.hash = "";
  if (event.target.closest(".compare-trigger") && activeId) location.hash = `compare/${activeId}/${activeId === "d-fend" ? "parazero" : "d-fend"}`;
});
$("comparison").addEventListener("click",event => {
  const back = event.target.closest("[data-back]");
  if (back) location.hash = back.dataset.back;
});
$("comparison").addEventListener("change", event => {
  if (!event.target.matches("#compare-left, #compare-right")) return;
  const left = $("compare-left").value;
  const right = $("compare-right").value;
  if (left !== right) location.hash = `compare/${left}/${right}`;
  else event.target.value = location.hash.slice(1).split("/")[event.target.id === "compare-left" ? 1 : 2];
});
$("company-search").addEventListener("submit", event => {
  event.preventDefault();
  const country = $("country").value;
  companySearch = {
    countryCode: countryCode(country),
    countryName: normalizeCountry(country),
    category: $("category").value,
    words: $("search").value.trim().toLowerCase().split(/\s+/).filter(Boolean)
  };
  renderDirectory();
});
$("company-sort").addEventListener("change",renderDirectory);
const importHint = "Review the suggested details before saving.";
let sharedText = "";
let sourceUrl = "";
let importRequest = 0;

function companyUrl(value) {
  const match = value.match(/https?:\/\/[^\s<>"']+/i)?.[0];
  const bareDomain = /^(?:[\w-]+\.)+[a-z]{2,}(?:[/:?#]\S*)?$/i.test(value);
  const url = safeUrl(match?.replace(/[),.;!?]+$/, "") || (bareDomain ? "https://" + value : ""));
  if (!url) return null;
  const parsed = new URL(url);
  return parsed.username || parsed.password || parsed.href.length > 2048 ? null : parsed;
}

function isLinkedIn(url) {
  return /(^|\.)(linkedin\.com|lnkd\.in)\.?$/i.test(url.hostname);
}

function titleFromSlug(slug) {
  try { slug = decodeURIComponent(slug); } catch {}
  return slug.replace(/[-_]+/g, " ").replace(/\b[a-z]/g, letter => letter.toUpperCase());
}

function inferCategory(summary) {
  if (/earth observation|satellite (?:imagery|imagery analytics)|satellite-based analytics/i.test(summary)) return "Earth Observation & Space Intelligence";
  if (/orbital launch|satellite launch|space logistics|in-space transportation/i.test(summary)) return "Launch & Space Logistics";
  if (/satellite connectivity|ground station|satellite broadband/i.test(summary)) return "Satellite Connectivity & Ground Systems";
  if (/satellite platform|spacecraft bus|onboard spacecraft|spacecraft payload/i.test(summary)) return "Satellite Platforms & Payloads";
  if (/counter[- ]?(?:drone|uas|uav)|\bc-uas\b|anti[- ]drone/i.test(summary)) return "Counter-Drones";
  if (/fire[- ]control|weapons systems/i.test(summary)) return "Weapons & Fire Control";
  if (/ground robot|(?:uncrewed|unmanned) ground vehicl|\bugvs?\b/i.test(summary)) return "Ground Robotics";
  if (/airspace management|air traffic management|unmanned traffic management/i.test(summary)) return "Airspace Management";
  if (/\b(?:gnss|satcom)\b|resilient navigation|drone communications/i.test(summary)) return "Navigation & Communications";
  if (/command[- ]and[- ]control|command & control/i.test(summary)) return "Command & Control";
  if (/\b(?:drones?|uavs?|uas|uncrewed aerial)\b/i.test(summary)) return "Drones";
  return "";
}

function linkedinDraft(url, text) {
  const slug = url.pathname.match(/^\/(?:company|school)\/([^/]+)/i)?.[1];
  const lines = text.split(/\r?\n/).map(line => line.trim())
    .filter(line => line && !/^https?:\/\//i.test(line));
  const title = lines.find(line => /\|\s*LinkedIn$/i.test(line))?.replace(/\s*\|\s*LinkedIn$/i, "");
  if (slug) {
    const summary = lines.find(line => line.length >= 32 && inferCategory(line) &&
      !/\|\s*LinkedIn$|^check out\b/i.test(line)) || "";
    return {name:title || titleFromSlug(slug), summary, category:inferCategory(summary)};
  }

  // A shared member profile can include a headline such as "Engineer at Example Co".
  const employer = lines.map(line => line.match(/\b(?:works at|at)\s+([^|\n]+?)(?:\s+\|.*)?$/i)?.[1]).find(Boolean);
  return {name:employer || ""};
}

function websiteDraft(markup) {
  // Template contents are inert. No page scripts or embedded content are loaded.
  const template = document.createElement("template");
  template.innerHTML = markup;
  const page = template.content;
  const meta = selector => page.querySelector(selector)?.getAttribute("content") || "";
  const entities = page.querySelectorAll('script[type="application/ld+json"]');
  const organizations = [];
  for (const entity of entities) {
    try {
      const roots = [JSON.parse(entity.textContent)].flat();
      for (const root of roots) {
        for (const item of [root, root?.publisher, root?.mainEntity, ...[root?.["@graph"]].flat()]) {
          if ([item?.["@type"]].flat().some(type => /(?:Organization|Corporation|LocalBusiness)$/i.test(type || ""))) {
            organizations.push(item);
          }
        }
      }
    } catch {}
  }
  const org = organizations.find(item => typeof item.name === "string") || {};
  const headline = meta('meta[property="og:title"]') || page.querySelector("title")?.textContent || "";
  const summary = (typeof org.description === "string" && org.description) ||
    meta('meta[name="description"]') || meta('meta[property="og:description"]');
  const address = org.foundingLocation?.address || org.foundingLocation;
  const country = address?.addressCountry?.name || address?.addressCountry;
  const code = countryCode(country);
  const city = address?.addressLocality || org.foundingLocation?.name;
  const year = typeof org.foundingDate === "string" ? org.foundingDate.match(/^\d{4}\b/)?.[0] : "";
  return {
    name:org.name || meta('meta[property="og:site_name"]') || headline.split(/\s*[|–—]\s*|\s+-\s+/)[0],
    summary, category:inferCategory(summary), country:code ? names.of(code) : "",
    origin:[city, year].filter(value => typeof value === "string" && value).join(" · ")
  };
}

async function readCompanyMetadata(url) {
  if (url.protocol !== "https:" || !isAndroidApp) return {};
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch("/company-import?url=" + encodeURIComponent(url.href), {
      credentials:"omit", referrerPolicy:"no-referrer", signal:controller.signal,
      headers:{"X-Payload-Import":"1"}
    });
    if (response.ok) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let markup = "";
      while (markup.length < 512 * 1024) {
        const {done, value} = await reader.read();
        if (done) break;
        markup += decoder.decode(value, {stream:true});
      }
      reader.cancel().catch(() => {});
      return websiteDraft(markup);
    }
  } catch {}
  finally { clearTimeout(timer); }
  return {};
}

async function inferCompany() {
  const url = companyUrl($("import-url").value.trim());
  if (!url) {
    $("import-status").textContent = "Enter a company website or LinkedIn URL.";
    return;
  }
  url.hash = "";
  const linkedIn = isLinkedIn(url);
  if (linkedIn) url.search = "";
  const request = ++importRequest;
  $("infer").disabled = true;
  $("import-status").textContent = "Reading link…";
  const suggested = linkedIn ? linkedinDraft(url, sharedText) : await readCompanyMetadata(url);
  if (request !== importRequest || !$("editor").open) return;

  sourceUrl = url.href;
  const hasMetadata = Boolean(suggested.name || suggested.summary);
  if (!linkedIn) {
    suggested.website = url.href;
    suggested.name ||= titleFromSlug(url.hostname.replace(/^www\./i, "").split(".")[0]);
  }
  const fields = $("form").elements;
  for (const [key, value] of Object.entries(suggested)) {
    const field = fields.namedItem(key);
    if (field && !field.value && typeof value === "string") {
      field.value = value.replace(/\s+/g, " ").trim().slice(0, field.maxLength > 0 ? field.maxLength : undefined);
    }
  }
  $("infer").disabled = false;
  $("import-status").textContent = hasMetadata ? importHint : linkedIn
    ? "Link attached. Enter the company name and any details you know."
    : "Website attached. Review the suggested name and fill in any details you know.";
}

function openCompanyImport(text = "") {
  const editor = $("editor");
  const wasOpen = editor.open;
  if (!wasOpen) {
    sourceUrl = "";
    sharedText = "";
    $("form").reset();
    $("form-message").textContent = "";
    $("import-status").textContent = importHint;
    editor.showModal();
  }
  if (!text) return;
  ++importRequest;
  sourceUrl = "";
  $("infer").disabled = false;
  sharedText = text;
  const url = companyUrl(text);
  $("import-url").value = url?.href || "";
  if (!url) $("import-status").textContent = "No web link was included in the share.";
  else if (wasOpen || !isLinkedIn(url)) $("import-status").textContent = "Shared link received. Select Infer Details to review it.";
  else inferCompany();
}

window.openCompanyImport = openCompanyImport;
$("infer").addEventListener("click",inferCompany);
$("import-url").addEventListener("input",() => {
  ++importRequest;
  sourceUrl = "";
  sharedText = "";
  $("infer").disabled = false;
  $("import-status").textContent = importHint;
});
$("import-url").addEventListener("keydown", event => {
  if (event.key === "Enter") {
    event.preventDefault();
    if (!$("infer").disabled) inferCompany();
  }
});
$("editor").addEventListener("close",() => {
  ++importRequest;
  sourceUrl = "";
  sharedText = "";
  $("infer").disabled = false;
});
$("cancel").addEventListener("click",() => $("editor").close());
$("form").addEventListener("submit",event => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  const name = data.name.trim();
  const summary = data.summary.trim();
  const website = safeUrl(data.website);
  const country = countryCode(data.country);
  if (data.country.trim() && !country) {
    $("form-message").textContent = "Choose a country from the suggestions or enter its two-letter code.";
    $("form").elements.namedItem("country").focus();
    return;
  }
  if (!name || (data.website && !website) || (!sourceUrl && (!summary || !website))) {
    $("form-message").textContent = sourceUrl ? "Enter a name and check the website URL." :
      "Enter a name, description, and valid website, or import details from a link.";
    return;
  }
  if (companies().some(c => c.name.toLowerCase() === name.toLowerCase() &&
      (!c.country || !country || c.country === country))) {
    $("form-message").textContent = "A company with that name and origin already exists.";
    return;
  }
  const id = "local-" + (globalThis.crypto?.randomUUID?.() || Date.now().toString(36));
  const origin = [country && names.of(country),data.origin.trim()].filter(Boolean).join(" · ");
  const entry = {id,name,country,ownership:data.ownership,category:data.category,origin,summary,website};
  if (sourceUrl) entry.sources = [[isLinkedIn(new URL(sourceUrl)) ? "LinkedIn source" : "Imported website", sourceUrl]];
  try { localStorage.setItem(storageKey, JSON.stringify([...added,entry])); }
  catch { $("form-message").textContent = "This browser blocked local storage. The entry could not be saved."; return; }
  added.push(entry);
  event.currentTarget.reset();
  $("form-message").textContent = "";
  $("editor").close();
  renderDirectory();
  location.hash = id;
});
const productCategories = [
  "Air Vehicles", "Counter-Drone Systems", "Ground & Maritime Vehicles", "Airspace & Fleet Management",
  "Navigation & Communications", "Command & Intelligence Software", "Fire Control & Payloads",
  "Spacecraft & Onboard Hardware", "Launch & Orbital Services", "Satellite Networks & Ground Services",
  "Earth Observation Data & Analytics", "Uncategorized"
];
const productKinds = ["Hardware", "Software", "Service"];
const productKey = "payload-offerings-v1";
const selectedProducts = new Set();
const maxProducts = 3;
let productCompanyId = "";
let localProducts = [];
try {
  const stored = JSON.parse(localStorage.getItem(productKey) || "[]");
  if (Array.isArray(stored)) {
    localProducts = stored.filter(p => p && typeof p.id === "string" && typeof p.companyId === "string"
      && typeof p.name === "string" && typeof p.description === "string"
      && productCategories.includes(p.category) && productKinds.includes(p.kind));
  }
} catch {}

for (const select of [$("product-category"), $("product-form").elements.namedItem("category")]) {
  for (const category of productCategories) select.add(new Option(category, category));
}

function productsFor(company) {
  const bundled = (company.products || []).map(([name,description,category,kind,url],i) => ({
    id:company.id + ":" + i, name, description, category:category || "Uncategorized",
    kind:kind || "", url
  }));
  return [...bundled, ...localProducts.filter(p => p.companyId === company.id)].map(p => ({...p, company}));
}

function productTile(product, showCompany) {
  const source = safeUrl(product.url);
  return `<article class="tile product-card">
    <strong>${html(product.name)}</strong>
    ${showCompany ? `<div><a href="#${html(product.company.id)}">${html(product.company.name)}</a></div>` : ""}
    <div class="tagrow"><span class="tag accent">${html(product.category)}</span>
      ${product.kind ? `<span class="tag">${html(product.kind)}</span>` : ""}</div>
    <div class="small">${html(product.description || "Description unavailable")}</div>
    ${source ? `<div class="small">${external(source, "Product source")}</div>` : ""}
    <label class="product-select"><input type="checkbox" data-product-id="${html(product.id)}"
      aria-label="Compare ${html(product.name)}" ${selectedProducts.has(product.id) ? "checked" : ""}> Add to comparison</label>
  </article>`;
}

function renderCompanyProducts(company) {
  const products = productsFor(company);
  $("company-product-cards").innerHTML = products.length ? products.map(p => productTile(p,false)).join("")
    : '<div class="tile small">No named products verified</div>';
  updateProductButtons();
}

function renderProductCompanies(companyId) {
  const select = $("product-company");
  select.length = 1;
  for (const company of companies().sort((a,b) => a.name.localeCompare(b.name))) {
    select.add(new Option(company.name,company.id));
  }
  select.value = [...select.options].some(option => option.value === companyId) ? companyId : "";
}

function renderProducts() {
  const products = companies().flatMap(productsFor);
  const query = $("product-search").value.trim().toLowerCase();
  const category = $("product-category").value;
  const company = $("product-company").value;
  const matches = products.filter(p => (!category || p.category === category) && (!company || p.company.id === company)
    && [p.name,p.description,p.company.name,p.kind,p.category].join(" ").toLowerCase().includes(query));
  $("product-count").textContent = matches.length + " of " + products.length + " offerings";
  $("product-cards").innerHTML = matches.length ? matches.map(p => productTile(p,true)).join("")
    : '<div class="empty">No offerings match those filters.</div>';
  updateProductButtons();
}

function updateProductButtons() {
  for (const button of document.querySelectorAll("[data-compare-products]")) {
    button.disabled = selectedProducts.size < 2;
    button.textContent = selectedProducts.size ? "Compare products (" + selectedProducts.size + ")" : "Compare products";
  }
}

function renderProductComparison() {
  const offerings = new Map(companies().flatMap(productsFor).map(p => [p.id,p]));
  const picks = [...selectedProducts].map(id => offerings.get(id)).filter(Boolean);
  const back = '<a href="#products" class="back">← Product catalog</a>';
  if (picks.length < 2) {
    $("product-comparison").innerHTML = back + '<div class="profile-card"><h1 tabindex="-1">Compare Products</h1><p>Select two or three offerings in the catalog or a company profile.</p></div>';
    return;
  }
  const rows = [
    ["Company", p => `<a href="#${html(p.company.id)}">${html(p.company.name)}</a>`],
    ["Product category", p => html(p.category)],
    ["Offering type", p => html(p.kind || "Unverified")],
    ["Description", p => html(p.description || "Unavailable")],
    ["Source", p => safeUrl(p.url) ? external(p.url,"Product source")
      : safeUrl(p.company.website) ? external(p.company.website,"Company site") : "Unavailable"]
  ];
  $("product-comparison").innerHTML = `${back}
    <article class="profile-card">
      <div class="eyebrow">Product Comparison</div><h1 tabindex="-1">Compare Products</h1>
      <div class="product-table-wrap" tabindex="0" role="region" aria-label="Side-by-side comparison">
        <table class="compare-table"><caption class="sr">Selected offerings</caption>
          <thead><tr><th scope="col">Field</th>${picks.map(p => `<th scope="col">${html(p.name)}</th>`).join("")}</tr></thead>
          <tbody>${rows.map(([label,value]) => `<tr><th scope="row">${label}</th>${picks.map(p => `<td>${value(p)}</td>`).join("")}</tr>`).join("")}</tbody>
        </table>
      </div>
      <button type="button" id="clear-products">Clear selection</button>
    </article>`;
}

document.addEventListener("change", event => {
  const input = event.target.closest("[data-product-id]");
  if (!input) return;
  const status = input.closest("#profile") ? $("profile-product-status") : $("product-status");
  const id = input.dataset.productId;
  if (input.checked && selectedProducts.size >= maxProducts) {
    input.checked = false;
    status.textContent = "Select up to three offerings. Uncheck one to add another.";
    return;
  }
  if (input.checked) selectedProducts.add(id);
  else selectedProducts.delete(id);
  status.textContent = "";
  updateProductButtons();
});
document.addEventListener("click", event => {
  if (event.target.closest("[data-compare-products]")) location.hash = "compare-products";
  if (event.target.closest("#clear-products")) {
    selectedProducts.clear();
    location.hash = "products";
  }
  const add = event.target.closest("[data-add-product]");
  if (!add) return;
  const company = companies().find(c => c.id === add.dataset.addProduct);
  if (!company) return;
  productCompanyId = company.id;
  $("product-form").reset();
  $("product-editor-company").textContent = company.name + " · Saved on this device";
  $("product-form-status").textContent = "";
  $("product-editor").showModal();
});
$("product-search").addEventListener("input",renderProducts);
for (const id of ["product-category","product-company"]) $(id).addEventListener("change",renderProducts);
$("product-cancel").addEventListener("click",() => $("product-editor").close());
$("product-form").addEventListener("submit",event => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const company = companies().find(c => c.id === productCompanyId);
  const name = data.get("name").trim();
  const description = data.get("description").trim();
  const category = data.get("category");
  const kind = data.get("kind");
  const rawUrl = data.get("url").trim();
  const url = safeUrl(rawUrl);
  const status = $("product-form-status");
  if (!company || !name || !description || !productCategories.includes(category)
      || !productKinds.includes(kind) || (rawUrl && !url)) {
    status.textContent = "Check the offering name, category, description, and source link.";
    return;
  }
  if (productsFor(company).some(p => p.name.toLowerCase() === name.toLowerCase())) {
    status.textContent = "This company already has an offering with that name.";
    return;
  }
  const id = "offering-" + (globalThis.crypto?.randomUUID?.() || Date.now().toString(36));
  const next = [...localProducts,{id,companyId:company.id,name,description,category,kind,url}];
  try { localStorage.setItem(productKey,JSON.stringify(next)); }
  catch {
    status.textContent = "This browser blocked local storage. The offering could not be saved.";
    return;
  }
  localProducts = next;
  $("product-editor").close();
  renderCompanyProducts(company);
  renderDirectory();
});

window.setPayloadAccount = state => {
  $("account").hidden = false;
  const hideSignIn = !state.configured || state.busy || Boolean(state.name);
  $("account-email").hidden = hideSignIn;
  $("sign-in").hidden = hideSignIn;
  $("sign-out").hidden = !state.name;
  $("account-status").textContent = state.name ? "Signed in as " + state.name
    : state.message || (state.configured ? "" : "Account access requires setup");
};

window.addEventListener("hashchange",route);
renderDirectory();
route();

const directoryCacheKey = "payload-directory-cache-v1";
const directoryFeed = "https://raw.githubusercontent.com/gedalyahreback/thepayloadapp/main/directory.json";
let directoryRevision = 1, directoryChecked = "", directoryBusy = false;
function validDirectory(feed) {
  if (!feed || feed.schemaVersion !== 1 || !Number.isSafeInteger(feed.revision) || feed.revision < 1 ||
      !Array.isArray(feed.companies) || !feed.companies.length || feed.companies.length > 20000) return false;
  const ids = new Set();
  const strings = a => Array.isArray(a) && a.every(v => typeof v === "string");
  const tuples = (a,min,max) => Array.isArray(a) && a.every(v => strings(v) && v.length >= min && v.length <= max);
  return feed.companies.every(c => {
    if (!c || typeof c.id !== "string" || !/^[a-zA-Z0-9_-]+$/.test(c.id) || ids.has(c.id) ||
        typeof c.name !== "string" || !c.name.trim() || !countryCodes.includes(c.country) ||
        !categories.includes(c.category) ||
        !["origin","summary","ownership","website","coverage"].every(k => typeof c[k] === "string") ||
        !["funding","employees"].every(k => c[k] === null || typeof c[k] === "string") ||
        !["investors","founders","customers"].every(k => strings(c[k])) ||
        !tuples(c.offices,3,4) || !tuples(c.products,4,5) || !tuples(c.sources,2,2)) return false;
    ids.add(c.id); return true;
  });
}
function directoryStatus(message) {
  $("directory-sync-status").textContent = message + " · Revision " + directoryRevision +
    (directoryChecked ? " · Last checked " + new Date(directoryChecked).toLocaleString() : "");
}
function applyDirectory(feed) {
  seed = feed.companies;
  directoryRevision = feed.revision;
  renderDirectory();
  if (!$("product-catalog").hidden) {
    renderProductCompanies($("product-company").value);
    renderProducts();
  }
}
try {
  const cached = JSON.parse(localStorage.getItem(directoryCacheKey) || "null");
  if (cached && validDirectory(cached.feed) && cached.feed.revision >= directoryRevision) {
    directoryChecked = cached.checked;
    applyDirectory(cached.feed);
  }
} catch {}
directoryStatus("Directory ready");
async function refreshDirectory() {
  if (directoryBusy) return;
  directoryBusy = true;
  $("directory-refresh").disabled = true;
  directoryStatus("Checking for updates");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(directoryFeed, {cache:"no-store", credentials:"omit", signal:controller.signal});
    if (!response.ok) throw new Error("HTTP " + response.status);
    const raw = await response.text();
    if (raw.length > 12000000) throw new Error("Feed too large");
    const feed = JSON.parse(raw);
    if (!validDirectory(feed) || feed.revision < directoryRevision) throw new Error("Invalid or older directory");
    const checked = new Date().toISOString();
    localStorage.setItem(directoryCacheKey, JSON.stringify({feed,checked}));
    if (feed.revision > directoryRevision) applyDirectory(feed);
    directoryChecked = checked;
    directoryStatus("Directory up to date");
  } catch {
    directoryStatus("Update unavailable; using saved directory");
  } finally {
    clearTimeout(timeout);
    directoryBusy = false;
    $("directory-refresh").disabled = false;
  }
}
window.refreshPayloadDirectory = refreshDirectory;
$("directory-refresh").addEventListener("click",refreshDirectory);
document.addEventListener("visibilitychange",() => { if (!document.hidden) refreshDirectory(); });
window.addEventListener("online",refreshDirectory);
setInterval(() => { if (!document.hidden) refreshDirectory(); }, 300000);
refreshDirectory();
