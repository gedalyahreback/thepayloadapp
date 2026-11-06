/* Public-market research panel for The Payload. Quotes/charts are supplied by TradingView,
   not fabricated or stored in the company directory. The user may need an internet connection. */
"use strict";
(() => {
  const WATCH = [
    {ticker:"NASDAQ:AVAV",name:"AeroVironment",sector:"Military UAVs"},
    {ticker:"NASDAQ:RCAT",name:"Red Cat Holdings",sector:"Military UAVs"},
    {ticker:"NASDAQ:UMAC",name:"Unusual Machines",sector:"Drone components"},
    {ticker:"NASDAQ:ONDS",name:"Ondas Holdings",sector:"Autonomous systems"},
    {ticker:"NASDAQ:PRZO",name:"ParaZero Technologies",sector:"Counter-UAV / Safety",companyId:"parazero"},
    {ticker:"NASDAQ:DPRO",name:"Draganfly",sector:"UAV platforms"},
    {ticker:"NASDAQ:AVAV",name:"AeroVironment",sector:"Military UAVs"},
    {ticker:"NYSE:RTX",name:"RTX",sector:"Defense prime"},
    {ticker:"NYSE:LMT",name:"Lockheed Martin",sector:"Defense prime"},
    {ticker:"NYSE:NOC",name:"Northrop Grumman",sector:"Defense prime"},
    {ticker:"NASDAQ:CRWD",name:"CrowdStrike",sector:"Cybersecurity"},
    {ticker:"NASDAQ:PANW",name:"Palo Alto Networks",sector:"Cybersecurity"}
  ].filter((item,index,arr) => arr.findIndex(x => x.ticker===item.ticker)===index);
  const byId = id => document.getElementById(id);
  const cleanTicker = value => /^(NASDAQ|NYSE|AMEX|TASE|ASX|LSE|OTC):[A-Z0-9.-]{1,12}$/.test(value || "") ? value : "";
  const watchlistKey = "payload-market-watch-v1";
  let extras = [];
  try { const saved=JSON.parse(localStorage.getItem(watchlistKey)||"[]");
    if(Array.isArray(saved)) extras=saved.filter(x=>x&&cleanTicker(x.ticker)&&typeof x.name==="string").slice(0,50);
  } catch {}
  const allStocks = () => [...WATCH, ...extras.filter(x=>!WATCH.some(y=>y.ticker===x.ticker))];
  const marketUrl = ticker => "https://www.tradingview.com/symbols/" + encodeURIComponent(ticker.replace(":","-")) + "/";
  function widget(ticker) {
    // An externally-hosted chart. This is never presented as internally verified live data.
    const params = new URLSearchParams({symbol:ticker,interval:"D",theme:"dark",style:"1",
      locale:"en",toolbarbg:"#0a2339",hide_top_toolbar:"0",saveimage:"0",
      symboledit:"0",withdateranges:"1",allow_symbol_change:"0"});
    return "https://s.tradingview.com/widgetembed/?" + params.toString();
  }
  const esc = value => String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  const selectedFromHash = () => {
    const hash=location.hash.slice(1);
    if(!hash.startsWith("markets")) return "";
    return decodeURIComponent(hash.slice(8) || "");
  };
  function card(stock) {
    return '<button type="button" class="market-pick" data-market-ticker="'+esc(stock.ticker)+'">'+
      '<strong>'+esc(stock.name)+'</strong><span>'+esc(stock.ticker)+'</span><small>'+esc(stock.sector||"Defense technology")+'</small></button>';
  }
  function renderMarket(ticker) {
    const stocks=allStocks();
    let chosen=stocks.find(x=>x.ticker===ticker)||stocks[0];
    byId("market-cards").innerHTML=stocks.map(card).join("");
    for(const el of byId("market-cards").querySelectorAll(".market-pick"))
      el.classList.toggle("selected",el.dataset.marketTicker===chosen.ticker);
    byId("market-selected").textContent=chosen.name+" · "+chosen.ticker;
    byId("market-external").href=marketUrl(chosen.ticker);
    byId("market-frame").src=widget(chosen.ticker);
    byId("market-frame").title=chosen.name+" market chart from TradingView";
  }
  const nav=document.querySelector(".tracker-nav");
  if(!nav || !byId("directory")) return;
  const link=document.createElement("a");
  link.href="#markets";link.id="nav-markets";link.textContent="Stocks & Markets";
  nav.insertBefore(link, byId("account"));
  const section=document.createElement("section");
  section.id="market-panel";section.className="profile";section.hidden=true;
  section.innerHTML='<div class="hero"><div class="eyebrow">Market Intelligence / Listed Comparables</div>'+
    '<h1 tabindex="-1">Stocks & Markets</h1><p>Track listed UAV, counter-UAV, defense and cybersecurity companies. These are public-market comparables, not an assertion that every company is part of the directory.</p></div>'+
    '<div class="market-layout"><div class="market-list"><h2 class="section-label">Watchlist</h2><div id="market-cards"></div>'+
    '<form id="market-add"><label for="market-add-ticker">Add a verified listed ticker (EXCHANGE:SYMBOL)</label>'+
    '<input class="control" id="market-add-ticker" placeholder="NASDAQ:AVAV" autocomplete="off" required>'+
    '<label for="market-add-name">Company name</label><input class="control" id="market-add-name" maxlength="100" required>'+
    '<button type="submit">Add to this device</button><p id="market-status" class="small" role="status"></p></form></div>'+
    '<div class="market-chart"><h2 id="market-selected" class="section-label"></h2>'+
    '<iframe id="market-frame" title="External stock chart" loading="lazy" referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>'+
    '<p class="small">Chart and market figures are supplied by TradingView. Prices may be delayed, and charts require internet access. Verify exchange and ticker before relying on a quote. <a id="market-external" href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer">Open market chart ↗</a></p></div></div>';
  byId("directory").after(section);
  // Wrap the existing router without changing its current company or product behavior.
  const oldRoute=window.route;
  window.route=function() {
    const market=location.hash==="#markets"||location.hash.startsWith("#markets/");
    if(!market){section.hidden=true;link.removeAttribute("aria-current");return oldRoute();}
    byId("directory").hidden=true;
    for(const id of ["profile","comparison","product-catalog","product-comparison"])byId(id).hidden=true;
    section.hidden=false;link.setAttribute("aria-current","page");
    byId("nav-companies").removeAttribute("aria-current");
    byId("nav-products").removeAttribute("aria-current");
    renderMarket(selectedFromHash());section.querySelector("h1").focus();
  };
  // Existing hashchange handler is attached to the original router; run the wrapper after it.
  window.addEventListener("hashchange",()=>window.route());
  byId("market-cards").addEventListener("click",event=>{
    const button=event.target.closest("[data-market-ticker]");
    if(button)location.hash="markets/"+encodeURIComponent(button.dataset.marketTicker);
  });
  byId("market-add").addEventListener("submit",event=>{
    event.preventDefault();
    const ticker=cleanTicker(byId("market-add-ticker").value.trim().toUpperCase());
    const name=byId("market-add-name").value.trim();
    const status=byId("market-status");
    if(!ticker||!name){status.textContent="Use a verified exchange-qualified ticker, for example NASDAQ:AVAV.";return;}
    if(allStocks().some(s=>s.ticker===ticker)){status.textContent="Already in your watchlist.";return;}
    const entry={ticker,name,sector:"Custom watchlist (ticker not independently verified)"};
    const next=[...extras,entry];
    try{localStorage.setItem(watchlistKey,JSON.stringify(next));extras=next;status.textContent="Added locally. Confirm this ticker belongs to the company before use.";renderMarket(ticker);}
    catch{status.textContent="This browser could not save your watchlist.";}
  });
  // A verified equity receives a profile shortcut, without assigning a price to private companies.
  const previousProfile=window.renderProfile;
  window.renderProfile=function(company){
    previousProfile(company);
    const equity=allStocks().find(x=>x.companyId===company.id);
    if(!equity)return;
    const block=document.createElement("section");
    block.className="market-profile-cta";
    block.innerHTML='<h2 class="section-label">Public Market</h2><p><strong>'+esc(equity.ticker)+'</strong> · '+esc(equity.name)+'</p>'+
      '<a href="#markets/'+encodeURIComponent(equity.ticker)+'">View stock chart and watchlist →</a>';
    byId("profile").querySelector("article.profile-card").appendChild(block);
  };
  if(location.hash.startsWith("#markets"))window.route();
})();
